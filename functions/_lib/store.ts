import { getStore } from '@edgeone/pages-blob';
import {
  CORE_TOPICS,
  PackIndexEntry,
  SpeakPack,
  TEMPLATE_LABELS,
  TemplateType,
  toIndexEntry
} from '../../shared/schema';
import { STARTER_PACKS } from '../../shared/templates';
import { validatePack } from '../../shared/validator';

// In-memory fallback cache
const memoryPacks = new Map<string, SpeakPack>();
let memoryIndex: PackIndexEntry[] = [];
let initialized = false;

function ensureMemorySeeded() {
  if (initialized) return;
  for (const p of STARTER_PACKS) {
    memoryPacks.set(p.id, p);
  }
  memoryIndex = Array.from(memoryPacks.values()).map(toIndexEntry);
  initialized = true;
}

// ---------------------------------------------------------------------------
// Tier 2: EdgeOne Pages Blob Storage Adapter
// ---------------------------------------------------------------------------
let cachedBlobStore: any = null;

function getBlobStore(context: any = {}) {
  if (cachedBlobStore) return cachedBlobStore;
  try {
    const env = context?.env || (typeof globalThis !== 'undefined' ? (globalThis as any) : {});
    const storeName = env.EDGEONE_BLOB_STORE || env.BLOB_STORE || 'speakstack';
    const projectId = env.EDGEONE_PROJECT_ID || env.PROJECT_ID || '';
    const token = env.EDGEONE_BLOB_TOKEN || env.BLOB_TOKEN || '';

    if (projectId && token) {
      cachedBlobStore = getStore({
        name: storeName,
        projectId,
        token,
        consistency: 'strong'
      });
    } else {
      // Automatic auth inside EdgeOne Pages Functions runtime
      cachedBlobStore = getStore(storeName);
    }
    return cachedBlobStore;
  } catch {
    return null;
  }
}

async function blobLoadAllPacks(context: any = {}): Promise<SpeakPack[] | null> {
  const store = getBlobStore(context);
  if (!store) return null;
  try {
    const data = await store.get('all_packs.json', { type: 'json', consistency: 'strong' });
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

async function blobSaveAllPacks(packs: SpeakPack[], context: any = {}): Promise<boolean> {
  const store = getBlobStore(context);
  if (!store) return false;
  try {
    const index = packs.map(toIndexEntry);
    await store.setJSON('all_packs.json', packs);
    await store.setJSON('index/packs.json', index);
    return true;
  } catch {
    return false;
  }
}

async function blobSaveSinglePack(pack: SpeakPack, context: any = {}): Promise<boolean> {
  const store = getBlobStore(context);
  if (!store) return false;
  try {
    await store.setJSON(`packs/${pack.id}.json`, pack);
    return true;
  } catch {
    return false;
  }
}

async function blobDeletePack(id: string, context: any = {}): Promise<boolean> {
  const store = getBlobStore(context);
  if (!store) return false;
  try {
    await store.delete(`packs/${id}.json`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tier 3: GitHub Gist Fallback Sync
// ---------------------------------------------------------------------------
const GIST_FILENAME = 'speakstack-packs.json';
const GIST_DESCRIPTION = 'SpeakStack Bilingual Interview Packs (Multi-Tier Cloud Sync)';

function makeGistHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token.trim()}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SpeakStack-App/1.0'
  };
}

export function resolveEnvConfig(context: any = {}) {
  const env = context?.env || (typeof globalThis !== 'undefined' ? (globalThis as any) : {});
  const req: Request | undefined = context?.request;

  let githubToken = (env.GITHUB_TOKEN || env.GIST_TOKEN || '').trim();
  let gistId = (env.GIST_ID || '').trim();
  const mcpSecret = (env.MCP_SECRET || env.ADMIN_SECRET || '').trim();

  // Allow passing Gist credentials via headers from MCP client / API callers
  if (req?.headers) {
    const hToken = req.headers.get('x-gist-token') || req.headers.get('x-github-token');
    const hGistId = req.headers.get('x-gist-id');
    if (hToken) githubToken = hToken.trim();
    if (hGistId) gistId = hGistId.trim();
  }

  return {
    githubToken,
    gistId,
    mcpSecret,
    hasGist: Boolean(githubToken && gistId)
  };
}

export function checkSecretAuthorized(context: any = {}, providedSecret = ''): boolean {
  const { mcpSecret } = resolveEnvConfig(context);
  // If no MCP_SECRET is set in environment (local dev / zero-config), allow access
  if (!mcpSecret) return true;
  if (providedSecret && providedSecret === mcpSecret) return true;

  const req: Request | undefined = context?.request;
  if (req) {
    const auth = req.headers.get('authorization') || '';
    if (auth === `Bearer ${mcpSecret}` || auth === mcpSecret) return true;
    const headerSecret = req.headers.get('x-mcp-secret') || req.headers.get('x-admin-secret') || '';
    if (headerSecret === mcpSecret) return true;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get('secret') === mcpSecret) return true;
    } catch {}
  }
  return false;
}

async function gistLoadAll(token: string, gistId: string): Promise<SpeakPack[] | null> {
  if (!token || !gistId) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: makeGistHeaders(token)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const file = data?.files?.[GIST_FILENAME];
    if (!file || !file.content) return [];
    const parsed = JSON.parse(file.content);
    return Array.isArray(parsed.packs) ? parsed.packs : [];
  } catch {
    return null;
  }
}

async function gistSaveAll(token: string, gistId: string, packs: SpeakPack[]): Promise<boolean> {
  if (!token || !gistId) return false;
  try {
    const payload = {
      description: GIST_DESCRIPTION,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(
            {
              version: 1,
              updatedAt: new Date().toISOString(),
              index: packs.map(toIndexEntry),
              packs
            },
            null,
            2
          )
        }
      }
    };
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: makeGistHeaders(token),
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unified Store Operations (Blob -> Gist -> Memory)
// ---------------------------------------------------------------------------
export async function getAllPacksFromStore(context: any = {}): Promise<SpeakPack[]> {
  ensureMemorySeeded();

  // Tier 2: Read from EdgeOne Pages Blob
  const blobPacks = await blobLoadAllPacks(context);
  if (blobPacks && blobPacks.length > 0) {
    for (const p of blobPacks) {
      if (p && p.id) memoryPacks.set(p.id, p);
    }
    memoryIndex = Array.from(memoryPacks.values()).map(toIndexEntry);
  } else {
    // If blob store is available but newly initialized/empty, persist starter packs to Blob once
    const store = getBlobStore(context);
    if (store) {
      try {
        const existing = await store.get('all_packs.json');
        if (existing === null) {
          await blobSaveAllPacks(STARTER_PACKS, context);
        }
      } catch {}
    }
  }

  // Tier 3: Fallback sync from GitHub Gist
  const { hasGist, githubToken, gistId } = resolveEnvConfig(context);
  if (hasGist) {
    const remotePacks = await gistLoadAll(githubToken, gistId);
    if (remotePacks && remotePacks.length > 0) {
      for (const p of remotePacks) {
        if (p && p.id) memoryPacks.set(p.id, p);
      }
      memoryIndex = Array.from(memoryPacks.values()).map(toIndexEntry);
    }
  }

  const list = Array.from(memoryPacks.values());
  list.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  return list;
}

export async function getPackIndexFromStore(
  filters: { template?: string; topic?: string; tag?: string; level?: string } = {},
  context: any = {}
): Promise<PackIndexEntry[]> {
  const all = await getAllPacksFromStore(context);
  let entries = all.map(toIndexEntry);

  if (filters.template && filters.template !== 'all') {
    entries = entries.filter((e) => e.template === filters.template);
  }
  if (filters.topic && filters.topic !== 'all') {
    entries = entries.filter((e) => e.topic === filters.topic);
  }
  if (filters.tag && filters.tag !== 'all') {
    entries = entries.filter((e) => e.tags.includes(filters.tag!));
  }
  if (filters.level && filters.level !== 'all') {
    entries = entries.filter((e) => e.level === filters.level);
  }
  return entries;
}

export async function getPackByIdFromStore(id: string, context: any = {}): Promise<SpeakPack | null> {
  const all = await getAllPacksFromStore(context);
  const found = all.find((p) => p.id === id);
  if (found) return found;

  // Direct fetch from blob if not in full array
  const store = getBlobStore(context);
  if (store) {
    try {
      const direct = await store.get(`packs/${id}.json`, { type: 'json', consistency: 'strong' });
      if (direct && direct.id === id) {
        memoryPacks.set(direct.id, direct);
        return direct;
      }
    } catch {}
  }
  return null;
}

export async function createOrUpdatePackInStore(
  packInput: SpeakPack,
  isUpdate = false,
  context: any = {}
) {
  const all = await getAllPacksFromStore(context);
  const existingIds = new Set(all.map((p) => p.id));

  const validation = validatePack(packInput, existingIds, isUpdate);
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings
    };
  }

  const now = new Date().toISOString();
  const existing = memoryPacks.get(packInput.id);

  if (isUpdate && existing && packInput.version !== undefined && packInput.version < existing.version) {
    return {
      ok: false,
      errors: [
        {
          code: 'VERSION_CONFLICT',
          field: 'version',
          message: `Phiên bản gửi lên (${packInput.version}) thấp hơn phiên bản hiện tại (${existing.version}).`
        }
      ],
      warnings: validation.warnings
    };
  }

  const finalPack: SpeakPack = {
    ...packInput,
    version: isUpdate && existing ? (existing.version || 1) + 1 : packInput.version || 1,
    level: packInput.level || 'senior',
    tags: Array.isArray(packInput.tags) ? packInput.tags : [],
    createdAt: existing?.createdAt || packInput.createdAt || now,
    updatedAt: now
  };

  // 1. Update in memory
  memoryPacks.set(finalPack.id, finalPack);
  memoryIndex = Array.from(memoryPacks.values()).map(toIndexEntry);
  const allCurrentPacks = Array.from(memoryPacks.values());

  const targets: string[] = [];

  // 2. Persist to EdgeOne Pages Blob (Tier 2 Primary)
  const blobSaved = await blobSaveAllPacks(allCurrentPacks, context);
  if (blobSaved) {
    await blobSaveSinglePack(finalPack, context);
    targets.push('edgeone_blob');
  }

  // 3. Persist to GitHub Gist (Tier 3 Fallback)
  const { hasGist, githubToken, gistId } = resolveEnvConfig(context);
  if (hasGist) {
    const saved = await gistSaveAll(githubToken, gistId, allCurrentPacks);
    if (saved) targets.push('github_gist');
  }

  const isPersistent = targets.includes('edgeone_blob') || targets.includes('github_gist');
  const warnings = [...(validation.warnings || [])];

  if (!isPersistent) {
    targets.push('memory_ephemeral_only');
    warnings.push({
      code: 'EPHEMERAL_STORAGE_WARNING',
      field: 'storage',
      message:
        'CẢNH BÁO: Pack chỉ lưu tạm vào RAM worker (chưa kết nối EdgeOne Blob hoặc GitHub Gist) và có thể mất khi worker tắt.'
    });
  }

  const key = `packs/${finalPack.template}/${finalPack.topic}/${finalPack.id}.json`;
  return {
    ok: true,
    key,
    pack: finalPack,
    indexEntry: toIndexEntry(finalPack),
    warnings,
    targets,
    isPersistent
  };
}

export async function deletePackFromStore(id: string, context: any = {}) {
  await getAllPacksFromStore(context);
  const existed = memoryPacks.delete(id);
  memoryIndex = Array.from(memoryPacks.values()).map(toIndexEntry);
  const allCurrentPacks = Array.from(memoryPacks.values());

  // Blob delete
  await blobDeletePack(id, context);
  await blobSaveAllPacks(allCurrentPacks, context);

  // Gist delete
  const { hasGist, githubToken, gistId } = resolveEnvConfig(context);
  if (hasGist) {
    await gistSaveAll(githubToken, gistId, allCurrentPacks);
  }
  return { ok: existed, id };
}

export async function rebuildIndexInStore(context: any = {}) {
  const all = await getAllPacksFromStore(context);
  memoryIndex = all.map(toIndexEntry);
  await blobSaveAllPacks(all, context);
  return {
    ok: true,
    count: memoryIndex.length,
    index: memoryIndex,
    reindexedAt: new Date().toISOString()
  };
}

export async function getTopicsSummary(context: any = {}) {
  const all = await getAllPacksFromStore(context);
  const templates: TemplateType[] = ['concept', 'compare', 'experience', 'debug', 'system_design'];
  const topicMap = new Map<
    string,
    {
      topic: string;
      title: string;
      description: string;
      isCore: boolean;
      totalPacks: number;
      byTemplate: Record<TemplateType, number>;
    }
  >();

  for (const core of CORE_TOPICS) {
    topicMap.set(core.slug, {
      topic: core.slug,
      title: core.title,
      description: core.description,
      isCore: true,
      totalPacks: 0,
      byTemplate: { concept: 0, compare: 0, experience: 0, debug: 0, system_design: 0 }
    });
  }

  for (const p of all) {
    if (!topicMap.has(p.topic)) {
      topicMap.set(p.topic, {
        topic: p.topic,
        title: p.topic,
        description: 'Chủ đề mở rộng',
        isCore: false,
        totalPacks: 0,
        byTemplate: { concept: 0, compare: 0, experience: 0, debug: 0, system_design: 0 }
      });
    }
    const item = topicMap.get(p.topic)!;
    item.totalPacks += 1;
    if (templates.includes(p.template)) {
      item.byTemplate[p.template] += 1;
    }
  }

  return Array.from(topicMap.values());
}

export async function getCoverageMatrix(context: any = {}) {
  const topics = await getTopicsSummary(context);
  const all = await getAllPacksFromStore(context);
  const templates = Object.keys(TEMPLATE_LABELS) as TemplateType[];

  const matrix = topics.map((t) => {
    const cells: Record<TemplateType, { count: number; packIds: string[] }> = {
      concept: { count: 0, packIds: [] },
      compare: { count: 0, packIds: [] },
      experience: { count: 0, packIds: [] },
      debug: { count: 0, packIds: [] },
      system_design: { count: 0, packIds: [] }
    };
    for (const p of all) {
      if (p.topic === t.topic && cells[p.template]) {
        cells[p.template].count += 1;
        cells[p.template].packIds.push(p.id);
      }
    }
    return {
      topic: t.topic,
      title: t.title,
      isCore: t.isCore,
      totalPacks: t.totalPacks,
      cells
    };
  });

  const missingCells: { topic: string; template: TemplateType }[] = [];
  for (const row of matrix) {
    for (const tmpl of templates) {
      if (row.cells[tmpl].count === 0) {
        missingCells.push({ topic: row.topic, template: tmpl });
      }
    }
  }

  return {
    totalPacks: all.length,
    totalTopics: matrix.length,
    totalCells: matrix.length * templates.length,
    filledCells: matrix.length * templates.length - missingCells.length,
    missingCellsCount: missingCells.length,
    missingCells,
    matrix
  };
}

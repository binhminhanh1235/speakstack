import { SpeakPack, TierType } from '../../../shared/schema';
import { STARTER_PACKS } from '../../../shared/templates';
import {
  idbDeletePack,
  idbGetAllPacks,
  idbLoadProgress,
  idbSavePacks,
  idbSaveProgress,
  PackMastery,
  PracticeMode,
  UserProgressData,
  UserSettings
} from './idb';

// In-memory LRU Speculative Pre-fetch Cache
const speculativePackCache = new Map<string, SpeakPack>();

let localSeeded = false;

async function ensureClientSeeded(): Promise<SpeakPack[]> {
  const local = await idbGetAllPacks();
  if (local.length > 0) {
    localSeeded = true;
    for (const p of local) speculativePackCache.set(p.id, p);
    return local;
  }
  await idbSavePacks(STARTER_PACKS);
  localSeeded = true;
  for (const p of STARTER_PACKS) speculativePackCache.set(p.id, p);
  return STARTER_PACKS;
}

/**
 * Safe JSON fetch that checks Content-Type header to avoid SPA HTML fallback errors
 */
export async function safeJsonFetch<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Load all packs with offline-first IndexedDB + background Cloud API reconciliation
 */
export async function loadAllPacksUnified(): Promise<{
  packs: SpeakPack[];
  isOfflineFallback: boolean;
}> {
  const localPacks = await ensureClientSeeded();
  const packMap = new Map<string, SpeakPack>();
  for (const p of localPacks) {
    packMap.set(p.id, p);
  }

  // Try fetching full packs from /api/packs?full=1
  const remoteData = await safeJsonFetch<{ packs: SpeakPack[] }>('/api/packs?full=1');
  let isOfflineFallback = true;

  if (remoteData && Array.isArray(remoteData.packs) && remoteData.packs.length > 0) {
    isOfflineFallback = false;
    for (const rp of remoteData.packs) {
      if (!rp || !rp.id) continue;
      const existing = packMap.get(rp.id);
      if (existing) {
        const tLocal = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const tRemote = new Date(rp.updatedAt || rp.createdAt || 0).getTime();
        if (tRemote >= tLocal) {
          packMap.set(rp.id, rp);
        }
      } else {
        packMap.set(rp.id, rp);
      }
    }
    const merged = Array.from(packMap.values());
    await idbSavePacks(merged);
    for (const p of merged) speculativePackCache.set(p.id, p);
  }

  const finalPacks = Array.from(packMap.values());
  finalPacks.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  return { packs: finalPacks, isOfflineFallback };
}

/**
 * Speculatively pre-compute and cache the next random pack for 0ms transitions
 */
let prefetchedNextPack: SpeakPack | null = null;

export function triggerSpeculativeNextRandom(
  allPacks: SpeakPack[],
  currentPackId: string,
  templateFilter = 'all',
  topicFilter = 'all'
): SpeakPack | null {
  let pool = allPacks;
  if (templateFilter && templateFilter !== 'all') {
    pool = pool.filter((p) => p.template === templateFilter);
  }
  if (topicFilter && topicFilter !== 'all') {
    pool = pool.filter((p) => p.topic === topicFilter);
  }
  const withoutCurrent = pool.filter((p) => p.id !== currentPackId);
  const candidates = withoutCurrent.length > 0 ? withoutCurrent : pool;
  if (candidates.length === 0) return null;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  prefetchedNextPack = picked;
  speculativePackCache.set(picked.id, picked);
  return picked;
}

export function consumeSpeculativeNextRandom(
  allPacks: SpeakPack[],
  currentPackId: string,
  templateFilter = 'all',
  topicFilter = 'all'
): SpeakPack | null {
  if (
    prefetchedNextPack &&
    prefetchedNextPack.id !== currentPackId &&
    (templateFilter === 'all' || prefetchedNextPack.template === templateFilter) &&
    (topicFilter === 'all' || prefetchedNextPack.topic === topicFilter)
  ) {
    const ready = prefetchedNextPack;
    triggerSpeculativeNextRandom(allPacks, ready.id, templateFilter, topicFilter);
    return ready;
  }
  return triggerSpeculativeNextRandom(allPacks, currentPackId, templateFilter, topicFilter);
}

export async function savePackUnified(pack: SpeakPack, isUpdate = false, adminSecret = '') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminSecret) headers['X-Admin-Secret'] = adminSecret;

  const endpoint = isUpdate ? `/api/admin/packs/${pack.id}` : '/api/packs';
  const method = isUpdate ? 'PUT' : 'POST';

  const remoteRes = await safeJsonFetch<any>(endpoint, {
    method,
    headers,
    body: JSON.stringify({ pack })
  });

  if (remoteRes && remoteRes.ok && remoteRes.pack) {
    await idbSavePacks([remoteRes.pack]);
    speculativePackCache.set(remoteRes.pack.id, remoteRes.pack);
    return remoteRes;
  }

  // Offline local save fallback
  await idbSavePacks([pack]);
  speculativePackCache.set(pack.id, pack);
  return {
    ok: true,
    pack,
    warnings: remoteRes?.warnings || [],
    offlineSaved: true
  };
}

export async function deletePackUnified(packId: string, adminSecret = '') {
  await idbDeletePack(packId);
  speculativePackCache.delete(packId);
  const headers: Record<string, string> = {};
  if (adminSecret) headers['X-Admin-Secret'] = adminSecret;
  await safeJsonFetch(`/api/admin/packs/${packId}`, { method: 'DELETE', headers });
  return { ok: true, id: packId };
}

// ---------------------------------------------------------------------------
// Progress, Spaced Repetition & Weak Words
// ---------------------------------------------------------------------------
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

export async function recordPracticeSession(params: {
  packId: string;
  mode: PracticeMode;
  tier: TierType;
  wpm: number;
  longPauses: number;
  matchRate: number;
  missedWords?: string[];
}): Promise<UserProgressData> {
  const progress = await idbLoadProgress();
  const now = new Date();
  const nowIso = now.toISOString();

  progress.attempts.unshift({
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    packId: params.packId,
    mode: params.mode,
    tier: params.tier,
    timestamp: nowIso,
    wpm: params.wpm,
    longPauses: params.longPauses,
    matchRate: params.matchRate
  });
  if (progress.attempts.length > 200) progress.attempts.length = 200;

  // Update mastery (0..4) and spaced repetition
  const prevMastery: PackMastery = progress.mastery[params.packId] || {
    packId: params.packId,
    level: 0,
    intervalDays: 1,
    nextReview: nowIso,
    lastPracticedAt: nowIso
  };

  const modeLevelMap: Record<PracticeMode, 0 | 1 | 2 | 3 | 4> = {
    listen: 1,
    shadow: 1,
    type: 2,
    recall: 3,
    free: 4
  };

  const goodPerformance = params.matchRate >= 75 && params.longPauses <= 2;
  let newLevel = prevMastery.level;
  let newInterval = prevMastery.intervalDays || 1;

  if (goodPerformance) {
    const targetLevel = modeLevelMap[params.mode];
    if (targetLevel > newLevel) newLevel = targetLevel;
    const idx = REVIEW_INTERVALS.indexOf(newInterval);
    newInterval = idx >= 0 && idx < REVIEW_INTERVALS.length - 1 ? REVIEW_INTERVALS[idx + 1] : 30;
  } else {
    // Step back interval if performance is weak
    const idx = REVIEW_INTERVALS.indexOf(newInterval);
    newInterval = idx > 0 ? REVIEW_INTERVALS[idx - 1] : 1;
  }

  const nextReviewDate = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);
  progress.mastery[params.packId] = {
    packId: params.packId,
    level: newLevel,
    intervalDays: newInterval,
    nextReview: nextReviewDate.toISOString(),
    lastPracticedAt: nowIso
  };

  // Track weak words
  if (Array.isArray(params.missedWords)) {
    for (const rawWord of params.missedWords) {
      const clean = rawWord.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      if (!clean || clean.length < 3) continue;
      const existing = progress.weakWords[clean] || {
        word: clean,
        missCount: 0,
        lastMissedAt: nowIso
      };
      existing.missCount += 1;
      existing.lastMissedAt = nowIso;
      progress.weakWords[clean] = existing;
    }
  }

  await idbSaveProgress(progress);
  return progress;
}

export async function updateUserSettings(partial: Partial<UserSettings>): Promise<UserProgressData> {
  const progress = await idbLoadProgress();
  progress.settings = {
    ...progress.settings,
    ...partial
  };
  await idbSaveProgress(progress);
  return progress;
}

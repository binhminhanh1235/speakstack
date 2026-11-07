import {
  checkSecretAuthorized,
  createOrUpdatePackInStore,
  deletePackFromStore,
  getAllPacksFromStore,
  getCoverageMatrix,
  getPackByIdFromStore,
  getPackIndexFromStore,
  getTopicsSummary,
  rebuildIndexInStore
} from './_lib/store';
import { getTemplateSpec } from '../shared/templates';
import { validatePack } from '../shared/validator';
import { TemplateType } from '../shared/schema';

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Secret, X-Admin-Secret'
    }
  });
}

export function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Secret, X-Admin-Secret'
    }
  });
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC 2.0 Zero-Dependency Server
// ---------------------------------------------------------------------------
export const MCP_TOOLS_MANIFEST = [
  {
    name: 'get_template_spec',
    description:
      'Trả về khung nhãn bắt buộc, quy tắc văn nói, độ dài mục tiêu, quy tắc sơ đồ flow và 1 pack mẫu cho template. Agent PHẢI gọi trước khi viết pack.',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['concept', 'compare', 'experience', 'debug', 'system_design'],
          description: 'Tên template cần lấy quy tắc'
        }
      },
      required: ['template']
    }
  },
  {
    name: 'validate_pack',
    description: 'Kiểm tra pack theo quy tắc mục 5 (errors và warnings) mà không ghi dữ liệu.',
    inputSchema: {
      type: 'object',
      properties: {
        pack: { type: 'object', description: 'Đối tượng JSON của pack cần kiểm tra' }
      },
      required: ['pack']
    }
  },
  {
    name: 'create_pack',
    description:
      'Validate rồi lưu pack mới và tự động cập nhật chỉ mục index/packs.json. Từ chối nếu có errors hoặc id đã tồn tại.',
    inputSchema: {
      type: 'object',
      properties: {
        pack: { type: 'object', description: 'Đối tượng JSON của pack mới' }
      },
      required: ['pack']
    }
  },
  {
    name: 'update_pack',
    description: 'Ghi đè pack hiện có, tự động tăng version và cập nhật index/packs.json.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Slug id của pack cần cập nhật' },
        pack: { type: 'object', description: 'Nội dung pack mới' }
      },
      required: ['id', 'pack']
    }
  },
  {
    name: 'get_pack',
    description: 'Đọc chi tiết một pack theo id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Slug id của pack' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_packs',
    description: 'Lọc danh sách pack theo template, topic, tag, level.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string' },
        topic: { type: 'string' },
        tag: { type: 'string' },
        level: { type: 'string' }
      }
    }
  },
  {
    name: 'list_topics',
    description: 'Danh sách 8 topic cốt lõi + topic mở rộng và số lượng pack theo từng template.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_coverage',
    description: 'Ma trận độ phủ topic × template (8×5 ô cốt lõi) và danh sách các ô còn trống để agent biết nên viết gì tiếp.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'delete_pack',
    description: 'Xoá một pack theo id và cập nhật index/packs.json.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Slug id của pack cần xoá' }
      },
      required: ['id']
    }
  }
];

async function executeMcpTool(name: string, args: any = {}, context: any = {}) {
  switch (name) {
    case 'get_template_spec': {
      const tmpl = (args.template || 'concept') as TemplateType;
      return { data: getTemplateSpec(tmpl) };
    }
    case 'validate_pack': {
      const all = await getAllPacksFromStore(context);
      const existingIds = new Set(all.map((p) => p.id));
      const res = validatePack(args.pack, existingIds, false);
      return { isError: !res.valid, data: res };
    }
    case 'create_pack': {
      const res = await createOrUpdatePackInStore(args.pack, false, context);
      return { isError: !res.ok, data: res };
    }
    case 'update_pack': {
      const targetId = args.id || args.pack?.id;
      const payload = { ...(args.pack || {}), id: targetId };
      const res = await createOrUpdatePackInStore(payload, true, context);
      return { isError: !res.ok, data: res };
    }
    case 'get_pack': {
      const pack = await getPackByIdFromStore(args.id, context);
      if (!pack) {
        return { isError: true, data: { error: `Không tìm thấy pack "${args.id}"` } };
      }
      return { data: { pack } };
    }
    case 'list_packs': {
      const packs = await getPackIndexFromStore(args, context);
      return { data: { count: packs.length, packs } };
    }
    case 'list_topics': {
      const topics = await getTopicsSummary(context);
      return { data: { topics } };
    }
    case 'get_coverage': {
      const coverage = await getCoverageMatrix(context);
      return { data: coverage };
    }
    case 'delete_pack': {
      const res = await deletePackFromStore(args.id, context);
      return { isError: !res.ok, data: res };
    }
    default:
      return { isError: true, data: { error: `Unknown MCP tool: ${name}` } };
  }
}

export async function handleMcpRequest(request: Request, context: any = {}, routeSecret = ''): Promise<Response> {
  if (request.method === 'OPTIONS') return corsOptionsResponse();

  if (!checkSecretAuthorized({ ...context, request }, routeSecret)) {
    return jsonResponse({ error: 'Unauthorized MCP secret' }, 401);
  }

  if (request.method === 'GET') {
    return jsonResponse({
      name: 'speakstack-mcp',
      version: '1.0.0',
      transport: 'HTTP JSON-RPC 2.0 (Stateless)',
      tools: MCP_TOOLS_MANIFEST.map((t) => t.name)
    });
  }

  try {
    const body: any = await request.json();
    if (!body || typeof body !== 'object') {
      return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }

    const { id, method, params } = body;

    switch (method) {
      case 'initialize':
        return jsonResponse({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'speakstack-mcp', version: '1.0.0' }
          }
        });
      case 'notifications/initialized':
        return new Response(null, { status: 204 });
      case 'ping':
        return jsonResponse({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list':
        return jsonResponse({
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS_MANIFEST }
        });
      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const { isError, data } = await executeMcpTool(toolName, toolArgs, { ...context, request });
        return jsonResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            isError: Boolean(isError)
          }
        });
      }
      default:
        return jsonResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
    }
  } catch (err: any) {
    return jsonResponse(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: err?.message || 'Parse error' } },
      400
    );
  }
}

// ---------------------------------------------------------------------------
// Unified REST API Router (/api/*)
// ---------------------------------------------------------------------------
export async function handleApiRequest(request: Request, context: any = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return corsOptionsResponse();

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  // GET /api/topics
  if (pathname === '/api/topics' && method === 'GET') {
    const topics = await getTopicsSummary(context);
    return jsonResponse({ topics });
  }

  // GET /api/coverage
  if (pathname === '/api/coverage' && method === 'GET') {
    const coverage = await getCoverageMatrix(context);
    return jsonResponse(coverage);
  }

  // GET /api/random?template=&topic=&exclude=
  if (pathname === '/api/random' && method === 'GET') {
    const template = url.searchParams.get('template') || '';
    const topic = url.searchParams.get('topic') || '';
    const exclude = (url.searchParams.get('exclude') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let all = await getAllPacksFromStore(context);
    if (template && template !== 'all') all = all.filter((p) => p.template === template);
    if (topic && topic !== 'all') all = all.filter((p) => p.topic === topic);

    let pool = all.filter((p) => !exclude.includes(p.id));
    if (pool.length === 0) pool = all;

    if (pool.length === 0) {
      return jsonResponse({ error: 'Không có pack nào khớp bộ lọc' }, 404);
    }

    const randomPack = pool[Math.floor(Math.random() * pool.length)];
    return jsonResponse({ pack: randomPack });
  }

  // GET /api/packs?template=&topic=&tag=&level=&full=1
  if (pathname === '/api/packs' && method === 'GET') {
    const template = url.searchParams.get('template') || '';
    const topic = url.searchParams.get('topic') || '';
    const tag = url.searchParams.get('tag') || '';
    const level = url.searchParams.get('level') || '';
    const full = url.searchParams.get('full') === '1';

    if (full) {
      let packs = await getAllPacksFromStore(context);
      if (template && template !== 'all') packs = packs.filter((p) => p.template === template);
      if (topic && topic !== 'all') packs = packs.filter((p) => p.topic === topic);
      if (tag && tag !== 'all') packs = packs.filter((p) => p.tags.includes(tag));
      if (level && level !== 'all') packs = packs.filter((p) => p.level === level);
      return jsonResponse({ packs, index: packs.map((p) => p.id) });
    }

    const index = await getPackIndexFromStore({ template, topic, tag, level }, context);
    return jsonResponse({ packs: index });
  }

  // POST /api/packs (Create new pack from UI/Admin)
  if (pathname === '/api/packs' && method === 'POST') {
    if (!checkSecretAuthorized({ ...context, request })) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const body = await request.json();
    const res = await createOrUpdatePackInStore(body.pack || body, false, context);
    return jsonResponse(res, res.ok ? 201 : 400);
  }

  // GET /api/packs/{id} or /api/packs/{template}/{topic}/{id}
  if (pathname.startsWith('/api/packs/') && method === 'GET') {
    const parts = pathname.slice('/api/packs/'.length).split('/').filter(Boolean);
    const packId = parts[parts.length - 1].replace(/\.json$/, '');
    const pack = await getPackByIdFromStore(packId, context);
    if (!pack) return jsonResponse({ error: `Pack "${packId}" not found` }, 404);
    return jsonResponse({ pack });
  }

  // POST /api/admin/reindex
  if (pathname === '/api/admin/reindex' && method === 'POST') {
    if (!checkSecretAuthorized({ ...context, request })) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const res = await rebuildIndexInStore(context);
    return jsonResponse(res);
  }

  // PUT / DELETE /api/admin/packs/{id}
  if (pathname.startsWith('/api/admin/packs/')) {
    if (!checkSecretAuthorized({ ...context, request })) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const parts = pathname.slice('/api/admin/packs/'.length).split('/').filter(Boolean);
    const packId = parts[parts.length - 1].replace(/\.json$/, '');

    if (method === 'PUT') {
      const body = await request.json();
      const payload = { ...(body.pack || body), id: packId };
      const res = await createOrUpdatePackInStore(payload, true, context);
      return jsonResponse(res, res.ok ? 200 : 400);
    }
    if (method === 'DELETE') {
      const res = await deletePackFromStore(packId, context);
      return jsonResponse(res, res.ok ? 200 : 404);
    }
  }

  return jsonResponse({ error: `Endpoint not found: ${method} ${pathname}` }, 404);
}

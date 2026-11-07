import { describe, expect, it } from 'vitest';
import { STARTER_PACKS, getTemplateSpec } from '../shared/templates';
import { validatePack } from '../shared/validator';
import { handleApiRequest, handleMcpRequest } from '../functions/router';
import { alignSpokenToTarget, scoreWordSimilarity } from '../src/lib/speech/dictation';

describe('SpeakStack Shared Validator & Starter Packs', () => {
  it('validates all 5 starter packs with zero errors', () => {
    expect(STARTER_PACKS.length).toBe(5);
    for (const pack of STARTER_PACKS) {
      const res = validatePack(pack, new Set(), false);
      expect(res.valid, `Pack ${pack.id} failed: ${JSON.stringify(res.errors)}`).toBe(true);
      expect(res.errors).toEqual([]);
    }
  });

  it('rejects flow in compare or experience templates', () => {
    const comparePack = structuredClone(
      STARTER_PACKS.find((p) => p.template === 'compare')!
    );
    comparePack.flow = {
      kind: 'linear',
      nodes: [{ id: 'n1', label: 'Invalid flow', seg: 'goal' }],
      edges: []
    };
    const res = validatePack(comparePack, new Set(), true);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'FLOW_NOT_ALLOWED')).toBe(true);
  });

  it('rejects inverted label order or missing required labels', () => {
    const conceptPack = structuredClone(STARTER_PACKS[0]);
    conceptPack.segments.reverse();
    const res = validatePack(conceptPack, new Set(), true);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'LABEL_ORDER_INVERTED')).toBe(true);
  });

  it('returns complete template spec via getTemplateSpec', () => {
    const spec = getTemplateSpec('system_design');
    expect(spec.requiredLabelsInOrder).toEqual([
      'requirements',
      'scale',
      'high_level',
      'deep_dive',
      'tradeoff'
    ]);
    expect(spec.allowsFlow).toBe(true);
    expect(spec.coreTopics.length).toBe(8);
  });
});

describe('SpeakStack MCP JSON-RPC 2.0 Server & REST API', () => {
  it('lists all 9 MCP tools via tools/list', async () => {
    const req = new Request('http://localhost:5173/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const res = await handleMcpRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.length).toBe(9);
  });

  it('returns 8x5=40 coverage matrix via get_coverage tool', async () => {
    const req = new Request('http://localhost:5173/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_coverage', arguments: {} }
      })
    });
    const res = await handleMcpRequest(req);
    const body = await res.json();
    const data = JSON.parse(body.result.content[0].text);
    expect(data.totalTopics).toBe(8);
    expect(data.totalCells).toBe(40);
    expect(data.filledCells).toBe(5);
  });

  it('serves /api/packs and /api/random endpoints', async () => {
    const packsRes = await handleApiRequest(new Request('http://localhost:5173/api/packs'));
    expect(packsRes.status).toBe(200);
    const packsJson = await packsRes.json();
    expect(packsJson.packs.length).toBeGreaterThanOrEqual(5);

    const randRes = await handleApiRequest(
      new Request('http://localhost:5173/api/random?template=concept')
    );
    expect(randRes.status).toBe(200);
    const randJson = await randRes.json();
    expect(randJson.pack.template).toBe('concept');
  });
});

describe('Phonetic & Fuzzy Technical Dictation Matching', () => {
  it('matches technical terms with slight phonetic/spelling drift', () => {
    expect(scoreWordSimilarity('idempotency', 'idempotent')).toBe('near');
    expect(scoreWordSimilarity('Redis', 'reddis')).toBe('near');
    expect(scoreWordSimilarity('Kafka', 'cafka')).toBe('near');
    expect(scoreWordSimilarity('24', 'twenty-four')).toBe('exact');
  });

  it('aligns spoken sentence with target sentence', () => {
    const target = 'Under the hood, the client sends a unique idempotency key.';
    const spoken = 'under the hood the client sends a unique idempotent key';
    const aligned = alignSpokenToTarget(spoken, target);
    expect(aligned.matchRate).toBeGreaterThanOrEqual(90);
  });
});

import {
  SpeakPack,
  TEMPLATE_LABELS,
  TEMPLATE_META,
  TemplateType,
  countWords,
  calculatePackWordCounts
} from './schema';

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  wordCounts: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_TEMPLATES: TemplateType[] = ['concept', 'compare', 'experience', 'debug', 'system_design'];
const VALID_LEVELS = ['mid', 'senior', 'staff'];
const SPOKEN_CONNECTORS = [
  'so',
  'which means',
  'the reason is',
  'that said',
  'the trade-off is',
  'under the hood',
  'for example',
  'as a result',
  'in practice',
  'first',
  'because',
  'however',
  'otherwise'
];

const TECH_OR_NUMBER_REGEX =
  /\b(\d+|%|ms|rps|qps|tps|gb|mb|kb|redis|kafka|postgres|mysql|mongodb|jvm|g1gc|zgc|spring|kubernetes|docker|raft|paxos|grpc|http|tcp|thread|lock|cache|db|database|index|b-tree|outbox|saga|dlq)\b/i;

function hasCycle(nodes: string[], edges: [string, string][]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [u, v] of edges) {
    if (adj.has(u)) adj.get(u)!.push(v);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(u: string): boolean {
    visited.add(u);
    inStack.add(u);
    for (const v of adj.get(u) || []) {
      if (!visited.has(v)) {
        if (dfs(v)) return true;
      } else if (inStack.has(v)) {
        return true;
      }
    }
    inStack.delete(u);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n)) {
      if (dfs(n)) return true;
    }
  }
  return false;
}

export function validatePack(
  pack: Partial<SpeakPack> | any,
  existingIds: Set<string> = new Set(),
  isUpdate = false
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!pack || typeof pack !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_OBJECT', message: 'Pack phải là một JSON object hợp lệ.' }],
      warnings: [],
      wordCounts: { tier1: 0, tier2: 0, tier3: 0 }
    };
  }

  // 1. Validate id, topic, template, level
  if (!pack.id || typeof pack.id !== 'string' || !SLUG_REGEX.test(pack.id)) {
    errors.push({
      code: 'INVALID_ID',
      field: 'id',
      message: 'id phải là slug hợp lệ (a-z0-9-, không có khoảng trắng hoặc ký tự đặc biệt).'
    });
  } else if (!isUpdate && existingIds.has(pack.id)) {
    errors.push({
      code: 'DUPLICATE_ID',
      field: 'id',
      message: `Pack với id "${pack.id}" đã tồn tại.`
    });
  }

  if (!pack.topic || typeof pack.topic !== 'string' || !SLUG_REGEX.test(pack.topic)) {
    errors.push({
      code: 'INVALID_TOPIC',
      field: 'topic',
      message: 'topic phải là slug hợp lệ (a-z0-9-).'
    });
  }

  const template = pack.template as TemplateType;
  if (!VALID_TEMPLATES.includes(template)) {
    errors.push({
      code: 'INVALID_TEMPLATE',
      field: 'template',
      message: `template phải thuộc một trong: ${VALID_TEMPLATES.join(', ')}.`
    });
  }

  if (pack.level && !VALID_LEVELS.includes(pack.level)) {
    errors.push({
      code: 'INVALID_LEVEL',
      field: 'level',
      message: 'level phải là mid, senior hoặc staff.'
    });
  }

  // 2. Question
  if (!pack.question || !pack.question.en?.trim() || !pack.question.vi?.trim()) {
    errors.push({
      code: 'EMPTY_QUESTION',
      field: 'question',
      message: 'question.en và question.vi không được để trống.'
    });
  }

  // 3. Segments
  const segments = Array.isArray(pack.segments) ? pack.segments : [];
  if (segments.length === 0) {
    errors.push({
      code: 'EMPTY_SEGMENTS',
      field: 'segments',
      message: 'Pack phải có danh sách segments.'
    });
  }

  const requiredLabels = VALID_TEMPLATES.includes(template) ? TEMPLATE_LABELS[template] : [];
  const segIdSet = new Set<string>();
  const observedLabelOrder: string[] = [];
  const labelsWithTierLe2 = new Set<string>();
  const labelsWithTier1 = new Set<string>();

  let hasConnectorInPack = false;

  segments.forEach((seg: any, idx: number) => {
    const prefix = `segments[${idx}]`;
    if (!seg.id || typeof seg.id !== 'string') {
      errors.push({ code: 'MISSING_SEG_ID', field: prefix, message: `${prefix} thiếu id.` });
    } else if (segIdSet.has(seg.id)) {
      errors.push({
        code: 'DUPLICATE_SEG_ID',
        field: prefix,
        message: `segment.id "${seg.id}" bị trùng lặp.`
      });
    } else {
      segIdSet.add(seg.id);
    }

    if (!requiredLabels.includes(seg.label)) {
      errors.push({
        code: 'INVALID_SEG_LABEL',
        field: `${prefix}.label`,
        message: `Nhãn "${seg.label}" không thuộc template "${template}" (${requiredLabels.join(' -> ')}).`
      });
    } else {
      if (
        observedLabelOrder.length === 0 ||
        observedLabelOrder[observedLabelOrder.length - 1] !== seg.label
      ) {
        observedLabelOrder.push(seg.label);
      }
    }

    if (![1, 2, 3].includes(seg.tier)) {
      errors.push({
        code: 'INVALID_SEG_TIER',
        field: `${prefix}.tier`,
        message: `tier của segment "${seg.id}" phải là 1, 2 hoặc 3.`
      });
    } else {
      if (seg.tier <= 2 && seg.label) labelsWithTierLe2.add(seg.label);
      if (seg.tier === 1 && seg.label) labelsWithTier1.add(seg.label);
    }

    const en = typeof seg.en === 'string' ? seg.en.trim() : '';
    const vi = typeof seg.vi === 'string' ? seg.vi.trim() : '';

    if (!en || !vi) {
      errors.push({
        code: 'EMPTY_SEG_TEXT',
        field: prefix,
        message: `Segment "${seg.id || idx}" không được để trống en hoặc vi.`
      });
    } else {
      // Check forbidden markdown, URLs, bullets, parens in en
      if (/(\*\*|__|`|https?:\/\/|^\s*[-*•]\s|\(|\))/m.test(en)) {
        errors.push({
          code: 'FORBIDDEN_SYNTAX_EN',
          field: `${prefix}.en`,
          message: `Segment "${seg.id}" chứa markdown, URL, gạch đầu dòng hoặc ngoặc đơn trong en.`
        });
      }

      // Check word count warnings
      const wc = countWords(en);
      if (wc > 40) {
        warnings.push({
          code: 'SEGMENT_TOO_LONG',
          field: `${prefix}.en`,
          message: `Segment "${seg.id}" dài ${wc} từ (vượt mức khuyến nghị 40 từ).`
        });
      }

      const sentences = en
        .split(/[.!?]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      for (const s of sentences) {
        if (countWords(s) > 25) {
          warnings.push({
            code: 'SENTENCE_TOO_LONG',
            field: `${prefix}.en`,
            message: `Segment "${seg.id}" có câu dài hơn 25 từ.`
          });
          break;
        }
      }

      const lowerEn = en.toLowerCase();
      if (SPOKEN_CONNECTORS.some((c) => lowerEn.includes(c))) {
        hasConnectorInPack = true;
      }

      if (['example', 'result', 'scale'].includes(seg.label)) {
        if (!TECH_OR_NUMBER_REGEX.test(en)) {
          warnings.push({
            code: 'MISSING_CONCRETE_METRIC',
            field: `${prefix}.en`,
            message: `Segment "${seg.id}" (${seg.label}) nên chứa con số hoặc tên công nghệ cụ thể.`
          });
        }
      }

      const ratio = vi.length / Math.max(1, en.length);
      if (ratio < 0.4 || ratio > 2.5) {
        warnings.push({
          code: 'VI_LENGTH_ANOMALY',
          field: `${prefix}.vi`,
          message: `Độ dài phụ đề tiếng Việt của segment "${seg.id}" lệch bất thường so với tiếng Anh.`
        });
      }
    }

    // Keywords validation
    if (!Array.isArray(seg.keywords) || seg.keywords.length === 0 || seg.keywords.length > 3) {
      errors.push({
        code: 'INVALID_KEYWORDS_COUNT',
        field: `${prefix}.keywords`,
        message: `Segment "${seg.id}" phải có từ 1 đến 3 keywords.`
      });
    } else if (en) {
      const lowerEn = en.toLowerCase();
      for (const kw of seg.keywords) {
        if (!kw || typeof kw !== 'string' || !lowerEn.includes(kw.toLowerCase().trim())) {
          errors.push({
            code: 'KEYWORD_NOT_IN_EN',
            field: `${prefix}.keywords`,
            message: `Keyword "${kw}" không xuất hiện trong câu tiếng Anh của segment "${seg.id}".`
          });
        }
      }
    }
  });

  // Check label sequence & completeness
  if (requiredLabels.length > 0 && segments.length > 0) {
    // Missing labels
    for (const reqLabel of requiredLabels) {
      if (!observedLabelOrder.includes(reqLabel)) {
        errors.push({
          code: 'MISSING_REQUIRED_LABEL',
          field: 'segments',
          message: `Thiếu nhãn bắt buộc "${reqLabel}" của template "${template}".`
        });
      } else if (!labelsWithTierLe2.has(reqLabel)) {
        errors.push({
          code: 'MISSING_TIER2_COVERAGE',
          field: 'segments',
          message: `Nhãn "${reqLabel}" phải có ít nhất một segment ở tier <= 2.`
        });
      }
    }

    // Check order without duplicates or inversion
    const uniqueObserved: string[] = [];
    let orderInverted = false;
    for (const lbl of observedLabelOrder) {
      if (uniqueObserved.includes(lbl)) {
        orderInverted = true;
        break;
      }
      uniqueObserved.push(lbl);
    }

    if (!orderInverted) {
      let lastIdx = -1;
      for (const lbl of uniqueObserved) {
        const idx = requiredLabels.indexOf(lbl);
        if (idx < lastIdx) {
          orderInverted = true;
          break;
        }
        lastIdx = idx;
      }
    }

    if (orderInverted) {
      errors.push({
        code: 'LABEL_ORDER_INVERTED',
        field: 'segments',
        message: `Thứ tự nhãn bị đảo hoặc lặp lại không liền kề. Thứ tự đúng: ${requiredLabels.join(' -> ')}.`
      });
    }

    const firstLabel = requiredLabels[0];
    const lastLabel = requiredLabels[requiredLabels.length - 1];
    if (!labelsWithTier1.has(firstLabel) || !labelsWithTier1.has(lastLabel)) {
      warnings.push({
        code: 'TIER1_HEADLINE_INCOMPLETE',
        field: 'segments',
        message: `Tier 1 (Headline) nên có ít nhất nhãn mở đầu (${firstLabel}) và nhãn kết (${lastLabel}).`
      });
    }
  }

  // 4. Followups
  if (pack.followups !== undefined) {
    if (!Array.isArray(pack.followups) || pack.followups.length > 3) {
      errors.push({
        code: 'INVALID_FOLLOWUPS',
        field: 'followups',
        message: 'followups phải là mảng tối đa 3 phần tử.'
      });
    } else {
      pack.followups.forEach((f: any, i: number) => {
        if (
          !f?.question?.en?.trim() ||
          !f?.question?.vi?.trim() ||
          !f?.answer?.en?.trim() ||
          !f?.answer?.vi?.trim()
        ) {
          errors.push({
            code: 'EMPTY_FOLLOWUP_TEXT',
            field: `followups[${i}]`,
            message: `followups[${i}] thiếu câu hỏi hoặc câu trả lời song ngữ.`
          });
        }
      });
    }
  }
  if (!pack.followups || pack.followups.length === 0) {
    warnings.push({
      code: 'NO_FOLLOWUPS',
      field: 'followups',
      message: 'Pack chưa có câu hỏi phụ (followups).'
    });
  }

  // 5. Flow
  if (pack.flow !== undefined && pack.flow !== null) {
    const allowsFlow = VALID_TEMPLATES.includes(template) && TEMPLATE_META[template].allowsFlow;
    if (!allowsFlow) {
      errors.push({
        code: 'FLOW_NOT_ALLOWED',
        field: 'flow',
        message: `Template "${template}" không cho phép sử dụng sơ đồ flow (chỉ hợp lệ với concept, debug, system_design).`
      });
    } else {
      const flow = pack.flow;
      if (!['linear', 'decision-tree', 'architecture'].includes(flow.kind)) {
        errors.push({
          code: 'INVALID_FLOW_KIND',
          field: 'flow.kind',
          message: 'flow.kind phải là linear, decision-tree hoặc architecture.'
        });
      }
      const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
      const edges = Array.isArray(flow.edges) ? flow.edges : [];
      if (nodes.length === 0 || nodes.length > 7) {
        errors.push({
          code: 'INVALID_FLOW_NODES_COUNT',
          field: 'flow.nodes',
          message: 'flow.nodes phải có từ 1 đến 7 node.'
        });
      }
      if (edges.length > 10) {
        errors.push({
          code: 'INVALID_FLOW_EDGES_COUNT',
          field: 'flow.edges',
          message: 'flow.edges tối đa 10 cạnh.'
        });
      }

      const nodeIds = new Set<string>();
      for (const n of nodes) {
        if (!n.id || !n.label || !n.seg) {
          errors.push({
            code: 'INVALID_FLOW_NODE',
            field: 'flow.nodes',
            message: 'Mỗi node trong flow phải có đủ id, label và seg.'
          });
          continue;
        }
        nodeIds.add(n.id);
        if (n.label.length > 24) {
          errors.push({
            code: 'FLOW_NODE_LABEL_TOO_LONG',
            field: 'flow.nodes',
            message: `Nhãn node "${n.label}" vượt quá 24 ký tự.`
          });
        }
        if (!segIdSet.has(n.seg)) {
          errors.push({
            code: 'FLOW_NODE_INVALID_SEG',
            field: 'flow.nodes',
            message: `Node "${n.id}" trỏ tới segment "${n.seg}" không tồn tại.`
          });
        }
      }

      const validEdges: [string, string][] = [];
      for (const edge of edges) {
        if (!Array.isArray(edge) || edge.length !== 2) {
          errors.push({
            code: 'INVALID_FLOW_EDGE',
            field: 'flow.edges',
            message: 'Mỗi edge phải là cặp [fromNodeId, toNodeId].'
          });
          continue;
        }
        const [u, v] = edge;
        if (!nodeIds.has(u) || !nodeIds.has(v)) {
          errors.push({
            code: 'FLOW_EDGE_UNKNOWN_NODE',
            field: 'flow.edges',
            message: `Edge [${u}, ${v}] trỏ tới node không tồn tại.`
          });
        } else {
          validEdges.push([u, v]);
        }
      }

      if (
        (flow.kind === 'linear' || flow.kind === 'decision-tree') &&
        validEdges.length > 0 &&
        hasCycle(Array.from(nodeIds), validEdges)
      ) {
        errors.push({
          code: 'FLOW_HAS_CYCLE',
          field: 'flow.edges',
          message: `Sơ đồ "${flow.kind}" không được phép có chu trình (cycle).`
        });
      }
    }
  }

  // 6. Total word count warnings & connectors
  const wordCounts = calculatePackWordCounts(segments);
  if (segments.length > 0) {
    if (wordCounts.tier1 < 25 || wordCounts.tier1 > 95) {
      warnings.push({
        code: 'TIER1_WORD_COUNT_RANGE',
        field: 'segments',
        message: `Tổng số từ Tier 1 (Headline) là ${wordCounts.tier1} (mục tiêu: 30–90 từ).`
      });
    }
    if (wordCounts.tier2 < 85 || wordCounts.tier2 > 260) {
      warnings.push({
        code: 'TIER2_WORD_COUNT_RANGE',
        field: 'segments',
        message: `Tổng số từ Tier 2 (Full) là ${wordCounts.tier2} (mục tiêu: 100–260 từ).`
      });
    }
    if (wordCounts.tier3 < 110 || wordCounts.tier3 > 450) {
      warnings.push({
        code: 'TIER3_WORD_COUNT_RANGE',
        field: 'segments',
        message: `Tổng số từ Tier 3 (Deep) là ${wordCounts.tier3} (mục tiêu: 140–450 từ).`
      });
    }
    if (!hasConnectorInPack) {
      warnings.push({
        code: 'NO_SPOKEN_CONNECTOR',
        field: 'segments',
        message: 'Pack chưa có từ nối văn nói (so, which means, under the hood, that said, the trade-off is...).'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    wordCounts
  };
}

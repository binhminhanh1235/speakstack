export type TemplateType = 'concept' | 'compare' | 'experience' | 'debug' | 'system_design';
export type LevelType = 'mid' | 'senior' | 'staff';
export type TierType = 1 | 2 | 3;
export type FlowKind = 'linear' | 'decision-tree' | 'architecture';

export interface BilingualText {
  en: string;
  vi: string;
}

export interface PackSegment {
  id: string;
  label: string;
  tier: TierType;
  en: string;
  vi: string;
  keywords: string[];
}

export interface PackFollowup {
  question: BilingualText;
  answer: BilingualText;
}

export interface FlowNode {
  id: string;
  label: string;
  seg: string;
}

export interface PackFlow {
  kind: FlowKind;
  nodes: FlowNode[];
  edges: [string, string][];
}

export interface SpeakPack {
  id: string;
  version: number;
  template: TemplateType;
  topic: string;
  tags: string[];
  level: LevelType;
  question: BilingualText;
  segments: PackSegment[];
  followups?: PackFollowup[];
  flow?: PackFlow;
  createdAt: string;
  updatedAt?: string;
}

export interface PackIndexEntry {
  id: string;
  version: number;
  template: TemplateType;
  topic: string;
  tags: string[];
  level: LevelType;
  question: BilingualText;
  wordCounts: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  hasFlow: boolean;
  followupCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoreTopicDef {
  slug: string;
  title: string;
  description: string;
}

export const CORE_TOPICS: CoreTopicDef[] = [
  {
    slug: 'jvm-gc',
    title: 'JVM & Garbage Collection',
    description: 'JVM internals, Memory model, G1GC/ZGC, Heap tuning'
  },
  {
    slug: 'concurrency',
    title: 'Java Concurrency',
    description: 'Multithreading, Locks, Virtual Threads, CompletableFuture'
  },
  {
    slug: 'spring-boot',
    title: 'Spring Boot & Framework',
    description: 'IoC/AOP, Transaction propagation, Security, Auto-configuration'
  },
  {
    slug: 'kafka-messaging',
    title: 'Kafka & Messaging',
    description: 'Consumer group, Partitioning, Exactly-once, DLQ, Outbox pattern'
  },
  {
    slug: 'database-transactions',
    title: 'Database & Transactions',
    description: 'ACID, Isolation levels, B-Tree indexing, Locking, Sharding'
  },
  {
    slug: 'caching-redis',
    title: 'Caching & Redis',
    description: 'Cache-aside, Stampede prevention, Eviction, Distributed locks'
  },
  {
    slug: 'distributed-systems',
    title: 'Distributed Systems',
    description: 'Idempotency, Consensus, Rate limiting, Circuit breaker, Saga'
  },
  {
    slug: 'system-design',
    title: 'System Design',
    description: 'High throughput, Low latency, Scalability, Payment/Order systems'
  }
];

export const TEMPLATE_LABELS: Record<TemplateType, string[]> = {
  concept: ['definition', 'why', 'how', 'tradeoff', 'example'],
  compare: ['goal', 'difference', 'choose_a', 'choose_b', 'my_pick'],
  experience: ['situation', 'task', 'action', 'result', 'lesson'],
  debug: ['symptom', 'hypotheses', 'diagnose', 'fix', 'prevent'],
  system_design: ['requirements', 'scale', 'high_level', 'deep_dive', 'tradeoff']
};

export const TEMPLATE_META: Record<
  TemplateType,
  {
    titleVi: string;
    titleEn: string;
    openerEn: string;
    openerVi: string;
    allowsFlow: boolean;
    labelNamesVi: Record<string, string>;
  }
> = {
  concept: {
    titleVi: 'Khái niệm (Concept)',
    titleEn: 'Core Concept',
    openerEn: 'It is a core mechanism that solves reliability issues. Under the hood, it works by...',
    openerVi: 'Đây là cơ chế cốt lõi giải quyết bài toán tin cậy. Bên trong, nó hoạt động bằng cách...',
    allowsFlow: true,
    labelNamesVi: {
      definition: 'Định nghĩa',
      why: 'Tại sao cần',
      how: 'Cơ chế bên trong',
      tradeoff: 'Đánh đổi',
      example: 'Ví dụ thực tế'
    }
  },
  compare: {
    titleVi: 'So sánh (Compare A/B)',
    titleEn: 'Compare A vs B',
    openerEn: 'Both aim to solve the same problem, but the key difference lies in how they handle state.',
    openerVi: 'Cả hai đều giải quyết chung một bài toán, nhưng khác biệt chính nằm ở cách quản lý trạng thái.',
    allowsFlow: false,
    labelNamesVi: {
      goal: 'Mục tiêu chung',
      difference: 'Khác biệt cốt lõi',
      choose_a: 'Khi nào chọn A',
      choose_b: 'Khi nào chọn B',
      my_pick: 'Lựa chọn của tôi'
    }
  },
  experience: {
    titleVi: 'Kinh nghiệm (STAR+L)',
    titleEn: 'Past Experience',
    openerEn: 'In my previous payment project, we hit a critical bottleneck during peak traffic.',
    openerVi: 'Trong dự án thanh toán trước đây, chúng tôi gặp một điểm nghẽn nghiêm trọng vào giờ cao điểm.',
    allowsFlow: false,
    labelNamesVi: {
      situation: 'Bối cảnh (S)',
      task: 'Nhiệm vụ (T)',
      action: 'Hành động (A)',
      result: 'Kết quả (R)',
      lesson: 'Bài học (L)'
    }
  },
  debug: {
    titleVi: 'Xử lý sự cố (Debug)',
    titleEn: 'Production Debugging',
    openerEn: 'First, I would check the metrics and logs to isolate whether it is a network or resource issue.',
    openerVi: 'Đầu tiên, tôi kiểm tra metrics và log để khoanh vùng xem lỗi do mạng hay tài nguyên.',
    allowsFlow: true,
    labelNamesVi: {
      symptom: 'Triệu chứng',
      hypotheses: 'Giả thuyết',
      diagnose: 'Chẩn đoán',
      fix: 'Khắc phục',
      prevent: 'Phòng ngừa'
    }
  },
  system_design: {
    titleVi: 'Thiết kế hệ thống',
    titleEn: 'System Design',
    openerEn: 'Let me clarify the functional requirements and traffic scale before diving into the architecture.',
    openerVi: 'Hãy để tôi làm rõ yêu cầu nghiệp vụ và quy mô tải trước khi đi vào kiến trúc.',
    allowsFlow: true,
    labelNamesVi: {
      requirements: 'Yêu cầu',
      scale: 'Quy mô & Tải',
      high_level: 'Kiến trúc tổng thể',
      deep_dive: 'Đi sâu chi tiết',
      tradeoff: 'Đánh đổi'
    }
  }
};

export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function calculatePackWordCounts(segments: PackSegment[]): {
  tier1: number;
  tier2: number;
  tier3: number;
} {
  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;
  for (const seg of segments || []) {
    const wc = countWords(seg.en);
    if (seg.tier <= 1) tier1 += wc;
    if (seg.tier <= 2) tier2 += wc;
    if (seg.tier <= 3) tier3 += wc;
  }
  return { tier1, tier2, tier3 };
}

export function toIndexEntry(pack: SpeakPack): PackIndexEntry {
  const now = new Date().toISOString();
  return {
    id: pack.id,
    version: pack.version || 1,
    template: pack.template,
    topic: pack.topic,
    tags: pack.tags || [],
    level: pack.level || 'senior',
    question: pack.question,
    wordCounts: calculatePackWordCounts(pack.segments || []),
    hasFlow: Boolean(pack.flow && pack.flow.nodes && pack.flow.nodes.length > 0),
    followupCount: (pack.followups || []).length,
    createdAt: pack.createdAt || now,
    updatedAt: pack.updatedAt || pack.createdAt || now
  };
}

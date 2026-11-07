import { CORE_TOPICS, SpeakPack, TEMPLATE_LABELS, TEMPLATE_META, TemplateType } from './schema';

export const STARTER_PACKS: SpeakPack[] = [
  // 1. CONCEPT: Idempotency in Distributed Systems
  {
    id: 'idempotency-concept',
    version: 1,
    template: 'concept',
    topic: 'distributed-systems',
    tags: ['idempotency', 'payments', 'retry'],
    level: 'senior',
    question: {
      en: 'What is idempotency and why does it matter in distributed systems?',
      vi: 'Idempotency là gì và tại sao nó quan trọng trong hệ thống phân tán?'
    },
    segments: [
      {
        id: 'definition',
        label: 'definition',
        tier: 1,
        en: 'Idempotency means that doing the same operation many times has the same effect as doing it once.',
        vi: 'Idempotency nghĩa là thực hiện cùng một thao tác nhiều lần cho kết quả giống như thực hiện một lần.',
        keywords: ['same effect', 'once']
      },
      {
        id: 'why',
        label: 'why',
        tier: 1,
        en: 'It exists because networks are unreliable, so clients retry, and without it a retry can charge a customer twice.',
        vi: 'Nó tồn tại vì mạng không đáng tin cậy nên client sẽ retry, và nếu không có nó thì một lần retry có thể trừ tiền khách hai lần.',
        keywords: ['retry', 'twice']
      },
      {
        id: 'how1',
        label: 'how',
        tier: 2,
        en: 'Under the hood, the client sends a unique idempotency key with every payment request.',
        vi: 'Bên trong, client gửi kèm một idempotency key duy nhất trong mỗi request thanh toán.',
        keywords: ['idempotency key']
      },
      {
        id: 'how2',
        label: 'how',
        tier: 2,
        en: 'The server checks the key. If it exists, it returns the saved result, otherwise it processes the request once and stores the result.',
        vi: 'Server kiểm tra key. Nếu đã có thì trả về kết quả đã lưu, nếu chưa thì xử lý một lần rồi lưu kết quả.',
        keywords: ['saved result', 'processes']
      },
      {
        id: 'how3',
        label: 'how',
        tier: 3,
        en: 'In production, two identical requests can arrive at the same time, so I would use an atomic insert on the key and make the loser fail fast.',
        vi: 'Trên production, hai request giống hệt có thể đến cùng lúc, nên tôi dùng atomic insert trên key và cho request đến sau fail nhanh.',
        keywords: ['atomic insert', 'fail fast']
      },
      {
        id: 'tradeoff',
        label: 'tradeoff',
        tier: 2,
        en: 'The trade-off is extra storage and a lookup on every request, which means you must decide how long to keep the keys.',
        vi: 'Đánh đổi là tốn thêm bộ nhớ và một lần tra cứu cho mỗi request, nghĩa là bạn phải quyết định giữ key trong bao lâu.',
        keywords: ['extra storage', 'lookup']
      },
      {
        id: 'example',
        label: 'example',
        tier: 1,
        en: 'For example, in a payment service I keep the key in Redis for 24 hours, with a unique constraint in Postgres as the final safety net.',
        vi: 'Ví dụ, trong dịch vụ thanh toán tôi lưu key trong Redis 24 giờ, và dùng unique constraint trong Postgres làm lớp bảo vệ cuối.',
        keywords: ['Redis', 'unique constraint']
      }
    ],
    followups: [
      {
        question: {
          en: 'How is this different from a retry with exponential backoff?',
          vi: 'Khác gì với retry kèm exponential backoff?'
        },
        answer: {
          en: 'Backoff controls when to retry to avoid overloading the server, while idempotency makes the retry safe. You need both.',
          vi: 'Backoff quyết định khi nào retry để tránh quá tải server, còn idempotency làm cho retry an toàn. Bạn cần cả hai.'
        }
      },
      {
        question: {
          en: 'What happens if the server crashes right after charging the card but before saving the idempotency key?',
          vi: 'Chuyện gì xảy ra nếu server sập ngay sau khi trừ tiền nhưng trước khi kịp lưu idempotency key?'
        },
        answer: {
          en: 'To prevent that, I record the key in a pending state inside a local database transaction before calling the external gateway.',
          vi: 'Để tránh điều đó, tôi ghi nhận key ở trạng thái pending trong cùng transaction DB trước khi gọi cổng thanh toán bên ngoài.'
        }
      }
    ],
    flow: {
      kind: 'decision-tree',
      nodes: [
        { id: 'n1', label: 'Client + key', seg: 'how1' },
        { id: 'n2', label: 'Key exists?', seg: 'how2' },
        { id: 'n3', label: 'Return saved result', seg: 'how2' },
        { id: 'n4', label: 'Atomic lock + process', seg: 'how3' },
        { id: 'n5', label: 'Store Redis + DB', seg: 'example' }
      ],
      edges: [
        ['n1', 'n2'],
        ['n2', 'n3'],
        ['n2', 'n4'],
        ['n4', 'n5']
      ]
    },
    createdAt: '2026-11-07T08:00:00Z',
    updatedAt: '2026-11-07T08:00:00Z'
  },

  // 2. COMPARE: Virtual Threads vs Platform Threads in Java
  {
    id: 'virtual-vs-platform-threads-compare',
    version: 1,
    template: 'compare',
    topic: 'concurrency',
    tags: ['virtual-threads', 'java21', 'concurrency'],
    level: 'senior',
    question: {
      en: 'How do Java Virtual Threads compare to traditional Platform Threads, and when would you choose each?',
      vi: 'Virtual Threads trong Java khác gì với Platform Threads truyền thống, và khi nào bạn chọn loại nào?'
    },
    segments: [
      {
        id: 'goal',
        label: 'goal',
        tier: 1,
        en: 'Both aim to run concurrent tasks in Java, so the application can handle many requests at the same time.',
        vi: 'Cả hai đều nhằm chạy các tác vụ đồng thời trong Java, giúp ứng dụng xử lý nhiều request cùng lúc.',
        keywords: ['concurrent tasks', 'same time']
      },
      {
        id: 'diff1',
        label: 'difference',
        tier: 1,
        en: 'The key difference is that platform threads wrap OS threads one-to-one, while virtual threads are lightweight and managed by the JVM.',
        vi: 'Khác biệt cốt lõi là platform thread ánh xạ 1-1 với OS thread, còn virtual thread siêu nhẹ và do JVM quản lý.',
        keywords: ['OS threads', 'managed by the JVM']
      },
      {
        id: 'diff2',
        label: 'difference',
        tier: 2,
        en: 'Under the hood, when a virtual thread hits blocking IO, the JVM unmounts it from the carrier thread so the CPU never sits idle.',
        vi: 'Bên trong, khi virtual thread gặp lệnh IO chờ đợi, JVM tách nó khỏi carrier thread để CPU không bị rảnh rỗi.',
        keywords: ['blocking IO', 'unmounts']
      },
      {
        id: 'choose_a',
        label: 'choose_a',
        tier: 2,
        en: 'I choose virtual threads for IO-heavy microservices that make many calls to Redis, Kafka, or external REST APIs.',
        vi: 'Tôi chọn virtual threads cho các microservice nặng về IO, thường xuyên gọi Redis, Kafka hoặc REST API bên ngoài.',
        keywords: ['IO-heavy', 'microservices']
      },
      {
        id: 'choose_b',
        label: 'choose_b',
        tier: 2,
        en: 'However, I stick with a fixed pool of platform threads for CPU-bound tasks like video encoding or heavy cryptography.',
        vi: 'Tuy nhiên, tôi giữ nguyên thread pool cố định với platform threads cho tác vụ nặng CPU như mã hoá hay xử lý ảnh.',
        keywords: ['fixed pool', 'CPU-bound']
      },
      {
        id: 'pick1',
        label: 'my_pick',
        tier: 1,
        en: 'In practice, my pick for Spring Boot 3 services is virtual threads because we get reactive-level throughput with simple imperative code.',
        vi: 'Trong thực tế, lựa chọn của tôi cho Spring Boot 3 là virtual threads vì đạt throughput ngang reactive mà code vẫn tuần tự, dễ debug.',
        keywords: ['Spring Boot 3', 'throughput']
      },
      {
        id: 'pick2',
        label: 'my_pick',
        tier: 3,
        en: 'That said, I always replace synchronized blocks with ReentrantLock around IO calls to avoid pinning the carrier thread.',
        vi: 'Dù vậy, tôi luôn thay khối synchronized bằng ReentrantLock quanh các lệnh IO để tránh làm kẹt cứng carrier thread.',
        keywords: ['ReentrantLock', 'pinning']
      }
    ],
    followups: [
      {
        question: {
          en: 'Should we pool virtual threads using Executors.newFixedThreadPool?',
          vi: 'Có nên gom virtual threads vào pool cố định bằng newFixedThreadPool không?'
        },
        answer: {
          en: 'No, virtual threads are cheap enough to create per task. To limit concurrency to a downstream database, use a Semaphore instead.',
          vi: 'Không, virtual thread rất nhẹ nên cứ tạo mới cho mỗi task. Để giới hạn số kết nối xuống DB, hãy dùng Semaphore.'
        }
      }
    ],
    createdAt: '2026-11-07T08:10:00Z',
    updatedAt: '2026-11-07T08:10:00Z'
  },

  // 3. EXPERIENCE: Fixing Kafka Consumer Lag & Duplicate Processing
  {
    id: 'kafka-rebalance-outbox-experience',
    version: 1,
    template: 'experience',
    topic: 'kafka-messaging',
    tags: ['kafka', 'rebalance', 'outbox'],
    level: 'senior',
    question: {
      en: 'Tell me about a challenging production issue you solved with Kafka in a high-traffic microservice.',
      vi: 'Hãy kể về một sự cố production khó nhằn liên quan đến Kafka mà bạn đã giải quyết trong hệ thống tải cao.'
    },
    segments: [
      {
        id: 'situation',
        label: 'situation',
        tier: 1,
        en: 'In my previous order service handling 3000 messages per second, our Kafka consumer group kept entering rebalance storms during flash sales.',
        vi: 'Trong dịch vụ đơn hàng xử lý 3000 bản tin mỗi giây trước đây, consumer group Kafka liên tục bị bão rebalance vào dịp flash sale.',
        keywords: ['rebalance storms', 'flash sales']
      },
      {
        id: 'task',
        label: 'task',
        tier: 2,
        en: 'My task was to stop the consumer lag from spiking and eliminate duplicate downstream emails caused by uncommitted offsets.',
        vi: 'Nhiệm vụ của tôi là chặn đứng tình trạng consumer lag tăng vọt và xoá bỏ việc gửi trùng email do chưa kịp commit offset.',
        keywords: ['consumer lag', 'uncommitted offsets']
      },
      {
        id: 'action1',
        label: 'action',
        tier: 1,
        en: 'I discovered that slow synchronous HTTP calls inside the poll loop exceeded max poll interval, so the broker kicked consumers out.',
        vi: 'Tôi phát hiện các lệnh gọi HTTP đồng bộ bị chậm bên trong vòng lặp poll vượt quá max poll interval, khiến broker đá consumer ra.',
        keywords: ['poll loop', 'max poll interval']
      },
      {
        id: 'action2',
        label: 'action',
        tier: 2,
        en: 'So I decoupled polling from processing, tuned max poll records down from 500 to 100, and enabled cooperative sticky assignor.',
        vi: 'Vì vậy tôi tách việc poll khỏi luồng xử lý, giảm max poll records từ 500 xuống 100, và bật cooperative sticky assignor.',
        keywords: ['decoupled', 'cooperative sticky']
      },
      {
        id: 'action3',
        label: 'action',
        tier: 3,
        en: 'Furthermore, I added a Redis deduplication filter on message IDs and routed poison pills to a Dead Letter Queue after three retries.',
        vi: 'Hơn nữa, tôi thêm bộ lọc chống trùng bằng Redis theo message ID và đẩy các bản tin lỗi sang Dead Letter Queue sau ba lần thử.',
        keywords: ['deduplication', 'Dead Letter Queue']
      },
      {
        id: 'result',
        label: 'result',
        tier: 1,
        en: 'As a result, rebalance drops fell to zero, p99 lag stayed under 200 milliseconds, and duplicate notifications dropped by 100 percent.',
        vi: 'Kết quả là tình trạng rớt consumer về 0, độ trễ p99 giữ dưới 200ms, và thông báo trùng lặp giảm 100%.',
        keywords: ['zero', '200 milliseconds']
      },
      {
        id: 'lesson',
        label: 'lesson',
        tier: 2,
        en: 'The lesson I learned is never block the Kafka poll thread with external IO, and always design consumers to be idempotent.',
        vi: 'Bài học rút ra là không bao giờ chặn luồng poll của Kafka bằng lệnh IO ngoài, và luôn thiết kế consumer có tính idempotent.',
        keywords: ['never block', 'idempotent']
      }
    ],
    followups: [
      {
        question: {
          en: 'How did you preserve message ordering when decoupling the poll thread from worker threads?',
          vi: 'Làm sao bạn giữ được thứ tự bản tin khi tách luồng poll ra khỏi các worker thread?'
        },
        answer: {
          en: 'I hashed the order ID to assign tasks to dedicated single-threaded queues per key, so events for the same order stayed sequential.',
          vi: 'Tôi băm order ID để phân phối vào các hàng đợi đơn luồng riêng theo từng key, nhờ đó sự kiện của cùng một đơn hàng luôn chạy tuần tự.'
        }
      }
    ],
    createdAt: '2026-11-07T08:20:00Z',
    updatedAt: '2026-11-07T08:20:00Z'
  },

  // 4. DEBUG: Database Connection Pool Exhaustion
  {
    id: 'hikaricp-pool-exhaustion-debug',
    version: 1,
    template: 'debug',
    topic: 'database-transactions',
    tags: ['hikaricp', 'postgres', 'spring-transaction'],
    level: 'senior',
    question: {
      en: 'Your Spring Boot service suddenly throws HikariPool connection timeout errors in production. How do you debug and fix it?',
      vi: 'Service Spring Boot đột nhiên báo lỗi HikariPool connection timeout trên production. Bạn chẩn đoán và xử lý thế nào?'
    },
    segments: [
      {
        id: 'symptom',
        label: 'symptom',
        tier: 1,
        en: 'First, I observe the symptom: API latency spikes and logs show HikariPool-1 connection is not available after 30 seconds.',
        vi: 'Đầu tiên, tôi quan sát triệu chứng: độ trễ API tăng vọt và log báo HikariPool-1 không lấy được kết nối sau 30 giây.',
        keywords: ['latency spikes', 'not available']
      },
      {
        id: 'hypotheses',
        label: 'hypotheses',
        tier: 2,
        en: 'I form three hypotheses: a slow SQL query, a database lock contention, or a long Spring transaction holding a connection during HTTP calls.',
        vi: 'Tôi đặt ba giả thuyết: câu SQL chạy chậm, tranh chấp khoá trong DB, hoặc hàm transactional giữ kết nối trong lúc gọi HTTP.',
        keywords: ['lock contention', 'holding a connection']
      },
      {
        id: 'diagnose1',
        label: 'diagnose',
        tier: 2,
        en: 'To diagnose, I check Grafana Hikari active connections and query pg_stat_activity in Postgres to see what active sessions are doing.',
        vi: 'Để chẩn đoán, tôi xem chỉ số kết nối Hikari trên Grafana và truy vấn bảng pg_stat_activity trong Postgres xem các phiên đang làm gì.',
        keywords: ['pg_stat_activity', 'active connections']
      },
      {
        id: 'diagnose2',
        label: 'diagnose',
        tier: 3,
        en: 'In pg_stat_activity, I notice most connections are idle in transaction for several seconds while thread dumps point to an external REST client.',
        vi: 'Trong pg_stat_activity, tôi thấy đa số kết nối ở trạng thái idle in transaction nhiều giây liền, còn thread dump chỉ ra lệnh gọi REST bên ngoài.',
        keywords: ['idle in transaction', 'thread dumps']
      },
      {
        id: 'fix',
        label: 'fix',
        tier: 1,
        en: 'The root cause is @Transactional wrapping a slow third-party API call, so I move the HTTP call outside and use TransactionTemplate for the DB write.',
        vi: 'Nguyên nhân gốc là @Transactional bọc cả lệnh gọi API bên thứ ba bị chậm, nên tôi tách lệnh HTTP ra ngoài và chỉ mở TransactionTemplate khi ghi DB.',
        keywords: ['@Transactional', 'TransactionTemplate']
      },
      {
        id: 'prevent',
        label: 'prevent',
        tier: 2,
        en: 'To prevent this, I set leakDetectionThreshold to 5 seconds in HikariCP and enforce a 3-second timeout on all outbound HTTP clients.',
        vi: 'Để phòng ngừa, tôi bật leakDetectionThreshold ở mức 5 giây trong HikariCP và áp đặt timeout 3 giây cho mọi HTTP client gọi ra ngoài.',
        keywords: ['leakDetectionThreshold', 'timeout']
      }
    ],
    followups: [
      {
        question: {
          en: 'Why not just increase the Hikari maximumPoolSize from 20 to 200?',
          vi: 'Sao không đơn giản là tăng maximumPoolSize của Hikari từ 20 lên 200?'
        },
        answer: {
          en: 'Increasing pool size only shifts the bottleneck to Postgres CPU and context switching. Fixing connection hold time is the real solution.',
          vi: 'Tăng kích thước pool chỉ đẩy điểm nghẽn xuống CPU và phí chuyển ngữ cảnh của Postgres. Rút ngắn thời gian giữ kết nối mới là giải pháp gốc.'
        }
      }
    ],
    flow: {
      kind: 'linear',
      nodes: [
        { id: 'd1', label: 'Hikari timeout alert', seg: 'symptom' },
        { id: 'd2', label: 'Check pg_stat_activity', seg: 'diagnose1' },
        { id: 'd3', label: 'Idle in transaction', seg: 'diagnose2' },
        { id: 'd4', label: 'Split HTTP from TX', seg: 'fix' },
        { id: 'd5', label: 'Add leak detection', seg: 'prevent' }
      ],
      edges: [
        ['d1', 'd2'],
        ['d2', 'd3'],
        ['d3', 'd4'],
        ['d4', 'd5']
      ]
    },
    createdAt: '2026-11-07T08:30:00Z',
    updatedAt: '2026-11-07T08:30:00Z'
  },

  // 5. SYSTEM DESIGN: Distributed Rate Limiter
  {
    id: 'distributed-rate-limiter-system-design',
    version: 1,
    template: 'system_design',
    topic: 'system-design',
    tags: ['rate-limiter', 'redis', 'lua', 'api-gateway'],
    level: 'senior',
    question: {
      en: 'How would you design a distributed rate limiter for an API Gateway handling 100,000 requests per second?',
      vi: 'Bạn thiết kế bộ giới hạn tần suất (Rate Limiter) phân tán cho API Gateway chịu tải 100.000 request/giây như thế nào?'
    },
    segments: [
      {
        id: 'requirements',
        label: 'requirements',
        tier: 1,
        en: 'Let me clarify requirements first: we need to throttle requests per user and IP with under 5 milliseconds latency and high availability.',
        vi: 'Hãy để tôi làm rõ yêu cầu trước: ta cần giới hạn request theo từng user và IP với độ trễ dưới 5ms và tính sẵn sàng cao.',
        keywords: ['throttle', '5 milliseconds']
      },
      {
        id: 'scale',
        label: 'scale',
        tier: 2,
        en: 'At 100,000 requests per second across 50 gateway nodes, a local memory counter will be inaccurate, so we need centralized state in Redis Cluster.',
        vi: 'Ở quy mô 100.000 RPS qua 50 node gateway, bộ đếm cục bộ trên RAM sẽ lệch, nên ta cần lưu trạng thái tập trung trên Redis Cluster.',
        keywords: ['100,000', 'Redis Cluster']
      },
      {
        id: 'high_level',
        label: 'high_level',
        tier: 2,
        en: 'At a high level, the API Gateway middleware intercepts each request, hashes the user ID to a Redis shard, and checks the token bucket.',
        vi: 'Ở mức tổng thể, middleware trên API Gateway chặn mỗi request, băm user ID vào một shard Redis, và kiểm tra thuật toán token bucket.',
        keywords: ['middleware', 'token bucket']
      },
      {
        id: 'deep_dive1',
        label: 'deep_dive',
        tier: 2,
        en: 'Under the hood, reading and decrementing tokens in two steps causes race conditions, so I execute a single atomic Lua script on Redis.',
        vi: 'Đi sâu bên trong, việc đọc và trừ token làm hai bước sẽ gây race condition, nên tôi chạy một Lua script nguyên tử duy nhất trên Redis.',
        keywords: ['race conditions', 'Lua script']
      },
      {
        id: 'deep_dive2',
        label: 'deep_dive',
        tier: 3,
        en: 'For hot keys like a flash sale merchant, I add a short 100-millisecond local batching cache on each gateway node to cut Redis traffic by 80 percent.',
        vi: 'Với các hot key như gian hàng flash sale, tôi thêm lớp đệm gom lô 100ms ngay tại từng node gateway để giảm 80% tải xuống Redis.',
        keywords: ['hot keys', '80 percent']
      },
      {
        id: 'tradeoff',
        label: 'tradeoff',
        tier: 1,
        en: 'The trade-off is fail-open versus fail-closed: if Redis goes down, I fail open and fall back to local node limits so legitimate traffic still flows.',
        vi: 'Đánh đổi nằm ở việc chọn fail-open hay fail-closed: nếu Redis sập, tôi chọn fail-open và rơi về giới hạn cục bộ trên từng node để khách thật vẫn giao dịch được.',
        keywords: ['fail-open', 'local node limits']
      }
    ],
    followups: [
      {
        question: {
          en: 'Why choose Token Bucket over Fixed Window or Sliding Window Log?',
          vi: 'Tại sao chọn Token Bucket thay vì Fixed Window hay Sliding Window Log?'
        },
        answer: {
          en: 'Fixed window allows double traffic bursts at window boundaries, and sliding log uses too much memory. Token bucket handles bursts smoothly with O(1) memory.',
          vi: 'Fixed window bị lọt gấp đôi tải ở ranh giới cửa sổ, còn sliding log tốn quá nhiều RAM. Token bucket cho phép burst hợp lý và chỉ tốn bộ nhớ O(1).'
        }
      }
    ],
    flow: {
      kind: 'architecture',
      nodes: [
        { id: 's1', label: 'Client 100k RPS', seg: 'requirements' },
        { id: 's2', label: 'API Gateway Node', seg: 'high_level' },
        { id: 's3', label: 'Local Hot-Key Cache', seg: 'deep_dive2' },
        { id: 's4', label: 'Redis Lua Bucket', seg: 'deep_dive1' },
        { id: 's5', label: 'Fail-Open Fallback', seg: 'tradeoff' }
      ],
      edges: [
        ['s1', 's2'],
        ['s2', 's3'],
        ['s3', 's4'],
        ['s2', 's5']
      ]
    },
    createdAt: '2026-11-07T08:40:00Z',
    updatedAt: '2026-11-07T08:40:00Z'
  }
];

export function getTemplateSpec(template: TemplateType) {
  const meta = TEMPLATE_META[template];
  const labels = TEMPLATE_LABELS[template];
  const examplePack = STARTER_PACKS.find((p) => p.template === template) || STARTER_PACKS[0];

  return {
    template,
    titleVi: meta.titleVi,
    titleEn: meta.titleEn,
    requiredLabelsInOrder: labels,
    labelDescriptionsVi: meta.labelNamesVi,
    suggestedOpener: {
      en: meta.openerEn,
      vi: meta.openerVi
    },
    allowsFlow: meta.allowsFlow,
    coreTopics: CORE_TOPICS.map((t) => t.slug),
    spokenRules: [
      'Câu ngắn, mỗi câu một ý, khoảng 12–22 từ. Một segment gồm 1–2 câu (tối đa 40 từ).',
      'Bắt buộc dùng từ nối văn nói: so, which means, the reason is, that said, the trade-off is, under the hood, for example, as a result.',
      'Trọng tâm: chỉ đi sâu 2–3 ý quan trọng nhất, nêu cơ chế bên trong (under the hood), trade-off và con số/công nghệ cụ thể.',
      'Phụ đề tiếng Việt dịch thoát ý tự nhiên, giữ nguyên thuật ngữ kỹ thuật tiếng Anh (idempotent, throughput, latency, Redis, Kafka).',
      'Không dùng markdown, gạch đầu dòng, URL hay dấu ngoặc đơn trong trường en.',
      'Mỗi nhãn bắt buộc phải có ít nhất 1 segment ở tier <= 2. Tier 1 (Headline ~30s) phải có ít nhất nhãn mở đầu và nhãn kết luận.'
    ],
    wordCountTargets: {
      tier1Headline: '30–90 words (~30s at 120 WPM)',
      tier2Full: '100–260 words (~90s at 120 WPM)',
      tier3Deep: '140–450 words (~3m at 120 WPM)'
    },
    examplePack
  };
}

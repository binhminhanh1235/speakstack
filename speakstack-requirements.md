# SpeakStack — Requirement & Development Plan

> App luyện nói và gõ trả lời phỏng vấn dạng karaoke song ngữ (tiếng Anh là chính, tiếng Việt là subtitle).
> AI agent tạo nội dung qua MCP theo 5 template trả lời chuẩn Senior Java. Hỗ trợ speech/dictation, gõ phím (Mode Type), và nhạc nền.
> Tối ưu kiến trúc từ thực chiến dự án BiTyping (`typing-ev`).

---

## 1. Mục tiêu và phạm vi

### 1.1 Vấn đề
Người dùng có kiến thức chuyên môn tốt (Senior Java, microservices, distributed systems) nhưng **nói tiếng Anh chưa trôi chảy**. Cần chuyển kiến thức sẵn có thành **lời nói có cấu trúc, trọng tâm, có chiều sâu** như một câu trả lời phỏng vấn thật.

### 1.2 Mục tiêu
- Luyện trả lời theo **khung trả lời chuẩn** để không bị lan man khi phỏng vấn.
- Học bằng vòng 5 chế độ: **Listen (nghe) → Shadow (đọc theo) → Type (gõ nhớ cấu trúc) → Recall (nhớ khung & tự nói có gợi ý) → Free (tự nói không gợi ý)**.
- Nội dung do **AI agent sinh qua MCP**, không phải nhập tay.
- **Lean, miễn phí, 0-config ở client, truy cập từ bất kỳ đâu** (deploy EdgeOne Pages, offline-first).

### 1.3 Ngoài phạm vi (giai đoạn đầu)
- Tài khoản, đăng nhập, nhiều người dùng.
- Chấm phát âm chi tiết ở mức âm vị (phoneme level) bằng AI model nặng.
- Gọi LLM từ trong app để chấm nội dung câu trả lời tự do.
- Migrate cơ học nội dung cũ từ BiTyping (nội dung sẽ được agent sinh lại bằng schema mới có chiều sâu phỏng vấn).

### 1.4 Quan hệ với BiTyping (`typing-ev`)
SpeakStack kế thừa toàn bộ tinh hoa kỹ thuật của BiTyping (Preact, Multi-Tier Storage, JSON-RPC MCP, System Enhanced TTS, IME-safe TypingBlock, Mobile Viewport Adaptation) và tích hợp **Mode "Type"** ngay từ Phase 3 trên cùng schema pack để thay thế hoàn toàn BiTyping.

---

## 2. Người dùng và ngữ cảnh

- Một người dùng, dùng cá nhân. Thiết bị chính: laptop (Chrome) và điện thoại (iOS/Android).
- Giao diện tiếng Việt. Nội dung pack song ngữ Anh–Việt.
- Trình độ nghe nói tiếng Anh còn hạn chế, nên mọi màn hình luyện phải có **tiếng Việt hỗ trợ** và **điều chỉnh tốc độ**.
- Đạt chuẩn Mobile UI từ BiTyping: touch target `>= 44px` (WCAG AA), font-size input `>= 16px` (chống iOS auto-zoom), `safe-area-inset` top/bottom, và `visualViewport` tự co giãn khi bật bàn phím ảo.

---

## 3. Template trả lời (xương sống của app)

Mỗi pack thuộc đúng một template. Template quy định **các nhãn (label) bắt buộc, theo thứ tự**.

| `template` | Loại câu hỏi | Nhãn bắt buộc (theo thứ tự) | Câu mở đầu gợi ý |
|---|---|---|---|
| `concept` | Khái niệm | `definition` → `why` → `how` → `tradeoff` → `example` | "X is… It exists to solve… Under the hood…" |
| `compare` | So sánh A vs B | `goal` → `difference` → `choose_a` → `choose_b` → `my_pick` | "Both aim to…, the key difference is…" |
| `experience` | Kinh nghiệm | `situation` → `task` → `action` → `result` → `lesson` | "In my previous project…" |
| `debug` | Debug / sự cố | `symptom` → `hypotheses` → `diagnose` → `fix` → `prevent` | "First I'd check…" |
| `system_design` | System design | `requirements` → `scale` → `high_level` → `deep_dive` → `tradeoff` | "Let me clarify requirements first." |

Quy tắc:
- Một nhãn có thể có **nhiều segment liên tiếp**, nhưng thứ tự nhãn không được đảo.
- `get_template_spec` phải trả về cho agent: nhãn, mục đích từng nhãn, câu mở đầu gợi ý, quy tắc độ dài, quy tắc văn nói và một ví dụ.

### 3.1 Quy tắc văn nói (spoken answer) — đưa vào `get_template_spec`
- Câu ngắn, mỗi câu một ý, khoảng 12–22 từ. Một segment gồm 1–2 câu.
- Dùng từ nối của văn nói: *so*, *which means*, *the reason is*, *that said*, *the trade-off is*. Không dùng văn viết.
- Trọng tâm: chỉ đi sâu **2–3 ý quan trọng nhất**, không liệt kê tất cả.
- Có chiều sâu: nêu cơ chế bên trong (*under the hood*), trade-off và một ví dụ hoặc con số cụ thể.
- Với `experience`: dùng ngôi "I", nêu quyết định của bản thân, kết quả có số liệu, bài học rút ra.
- Với `compare`: luôn kết thúc bằng lựa chọn của mình (`my_pick`) và lý do.
- Phụ đề tiếng Việt **dịch ý, không dịch từng chữ**, giữ nguyên thuật ngữ kỹ thuật bằng tiếng Anh (ví dụ *idempotent*, *throughput*).
- Không dùng markdown, gạch đầu dòng, URL hay ngoặc đơn trong `en`.

### 3.2 Bộ 8 chủ đề khởi đầu (Core Topics cho Senior Java)
Khởi tạo sẵn 8 chủ đề cốt lõi trong cấu hình để `get_coverage()` luôn hiển thị ma trận **8 topics × 5 templates = 40 ô** cho AI agent chủ động lấp đầy:
1. `jvm-gc` (JVM internals, Memory model, Garbage Collection)
2. `concurrency` (Multithreading, Locks, Virtual Threads, CompletableFuture)
3. `spring-boot` (IoC/AOP, Transaction, Security, WebFlux, Auto-configuration)
4. `kafka-messaging` (Consumer group, Partitioning, Exactly-once, DLQ, Outbox)
5. `database-transactions` (ACID, Isolation levels, Indexing, Locking, Sharding)
6. `caching-redis` (Cache patterns, Stampede, Eviction, Distributed lock)
7. `distributed-systems` (Idempotency, Consensus, Rate limiting, Circuit breaker, Saga)
8. `system-design` (High throughput, Low latency, Scalability, Payment/Order systems)

---

## 4. Mô hình nội dung: Pack

### 4.1 Schema JSON

```jsonc
{
  "id": "idempotency-concept",          // slug, duy nhất, a-z0-9-
  "version": 1,                          // tăng khi sửa
  "template": "concept",                 // concept | compare | experience | debug | system_design
  "topic": "distributed-systems",        // slug chủ đề, a-z0-9-
  "tags": ["idempotency", "payments"],
  "level": "senior",                     // mid | senior | staff (thông tin, dùng để lọc)
  "question": { "en": "...", "vi": "..." },
  "segments": [
    {
      "id": "definition",                // duy nhất trong pack
      "label": "definition",             // thuộc nhãn của template
      "tier": 1,                         // 1 headline, 2 full, 3 deep
      "en": "...",
      "vi": "...",
      "keywords": ["same effect"]        // 1-3 cụm, phải xuất hiện trong "en"
    }
  ],
  "followups": [                         // tuỳ chọn, tối đa 3
    { "question": { "en": "...", "vi": "..." }, "answer": { "en": "...", "vi": "..." } }
  ],
  "flow": {                              // tuỳ chọn, chỉ cho concept | debug | system_design
    "kind": "linear",                    // linear | decision-tree | architecture
    "nodes": [ { "id": "n1", "label": "Client + key", "seg": "how1" } ],
    "edges": [ ["n1", "n2"] ]
  },
  "createdAt": "2026-11-07T00:00:00Z"
}
```

### 4.2 Tầng độ dài (tier)
- `tier` của segment cho biết nó thuộc tầng nào. Khi người dùng chọn tầng N, app phát các segment có `tier ≤ N`.
- Ba tầng: **Headline (≈30 giây)**, **Full (≈90 giây)**, **Deep (≈3 phút)**.
- Mọi nhãn bắt buộc phải có ít nhất một segment ở `tier ≤ 2`. Riêng `tier 1` phải đủ để trả lời trọn vẹn ngắn gọn (ít nhất nhãn đầu và nhãn kết luận của template).

### 4.3 Flow (sơ đồ minh hoạ)
- Chỉ hợp lệ với `concept`, `debug`, `system_design`. Với `compare` và `experience`, `flow` bị từ chối.
- Mỗi node trỏ đến **một segment có thật** qua `seg`. Khi karaoke đến segment nào, node tương ứng sáng lên.
- `kind`: `linear` (luồng xử lý), `decision-tree` (debug), `architecture` (system design).
- Giới hạn: tối đa 7 node, 10 edge, nhãn node tối đa 24 ký tự. `linear` và `decision-tree` không được có chu trình.
- Flow chỉ để **hiển thị minh hoạ**, không nằm trong phần người dùng phải nói và không tham gia chấm điểm.

### 4.4 Ví dụ pack đầy đủ (`concept`)

```json
{
  "id": "idempotency-concept",
  "version": 1,
  "template": "concept",
  "topic": "distributed-systems",
  "tags": ["idempotency", "payments", "retry"],
  "level": "senior",
  "question": {
    "en": "What is idempotency and why does it matter?",
    "vi": "Idempotency là gì và tại sao nó quan trọng?"
  },
  "segments": [
    {
      "id": "definition", "label": "definition", "tier": 1,
      "en": "Idempotency means that doing the same operation many times has the same effect as doing it once.",
      "vi": "Idempotency nghĩa là thực hiện cùng một thao tác nhiều lần cho kết quả giống như thực hiện một lần.",
      "keywords": ["same effect"]
    },
    {
      "id": "why", "label": "why", "tier": 1,
      "en": "It exists because networks are unreliable, so clients retry, and without it a retry can charge a customer twice.",
      "vi": "Nó tồn tại vì mạng không đáng tin cậy nên client sẽ retry, và nếu không có nó thì một lần retry có thể trừ tiền khách hai lần.",
      "keywords": ["retry", "twice"]
    },
    {
      "id": "how1", "label": "how", "tier": 2,
      "en": "Under the hood, the client sends a unique idempotency key with every request.",
      "vi": "Bên trong, client gửi kèm một idempotency key duy nhất trong mỗi request.",
      "keywords": ["idempotency key"]
    },
    {
      "id": "how2", "label": "how", "tier": 2,
      "en": "The server checks the key. If it exists, it returns the saved result, otherwise it processes the request once and stores the result.",
      "vi": "Server kiểm tra key. Nếu đã có thì trả về kết quả đã lưu, nếu chưa thì xử lý một lần rồi lưu kết quả.",
      "keywords": ["saved result"]
    },
    {
      "id": "how3", "label": "how", "tier": 3,
      "en": "In production, two identical requests can arrive at the same time, so I'd use an atomic insert on the key and make the loser wait or fail fast.",
      "vi": "Trên production, hai request giống hệt có thể đến cùng lúc, nên tôi dùng atomic insert trên key và cho request thua chờ hoặc fail nhanh.",
      "keywords": ["atomic insert"]
    },
    {
      "id": "tradeoff", "label": "tradeoff", "tier": 2,
      "en": "The trade-off is extra storage and a lookup on every request, and you must decide how long to keep the keys.",
      "vi": "Đánh đổi là tốn thêm bộ nhớ và một lần tra cứu cho mỗi request, và bạn phải quyết định giữ key trong bao lâu.",
      "keywords": ["extra storage"]
    },
    {
      "id": "example", "label": "example", "tier": 2,
      "en": "For example, in a payment service I'd keep the key in Redis for twenty-four hours, with a unique constraint in the database as the final safety net.",
      "vi": "Ví dụ, trong dịch vụ thanh toán tôi lưu key trong Redis 24 giờ, và dùng unique constraint trong database làm lớp bảo vệ cuối.",
      "keywords": ["Redis", "unique constraint"]
    }
  ],
  "followups": [
    {
      "question": {
        "en": "How is this different from a retry with exponential backoff?",
        "vi": "Khác gì với retry kèm exponential backoff?"
      },
      "answer": {
        "en": "Backoff controls when to retry, while idempotency makes the retry safe. You need both.",
        "vi": "Backoff quyết định khi nào retry, còn idempotency làm cho retry an toàn. Cần cả hai."
      }
    }
  ],
  "flow": {
    "kind": "decision-tree",
    "nodes": [
      { "id": "n1", "label": "Client + key", "seg": "how1" },
      { "id": "n2", "label": "Key exists?", "seg": "how2" },
      { "id": "n3", "label": "Return saved result", "seg": "how2" },
      { "id": "n4", "label": "Process once", "seg": "how2" },
      { "id": "n5", "label": "Store key + result", "seg": "tradeoff" }
    ],
    "edges": [["n1", "n2"], ["n2", "n3"], ["n2", "n4"], ["n4", "n5"]]
  },
  "createdAt": "2026-11-07T00:00:00Z"
}
```

---

## 5. Quy tắc validate (`validate_pack` và `create_pack` dùng chung)

Dùng **một module TypeScript chung** (`shared/validator.ts`) cho cả function và UI để hai bên không lệch nhau. Kết quả gồm `errors` (chặn lưu) và `warnings` (cho phép lưu).

**Errors**
- `template` không hợp lệ; `id` và `topic` không phải slug hợp lệ; `id` trùng với pack đã có (khi tạo mới).
- Thiếu nhãn bắt buộc của template, hoặc thứ tự nhãn bị đảo.
- `segment.id` trùng; `label` không thuộc template; `tier` không thuộc {1,2,3}.
- `en` hoặc `vi` rỗng ở bất kỳ segment, `question` hay `followups`.
- `en` chứa markdown, URL hay ký tự gạch đầu dòng.
- `keyword` không xuất hiện trong `en` của segment (không phân biệt hoa thường); quá 3 keyword mỗi segment.
- `flow` có mặt ở template không được phép; node trỏ đến segment không tồn tại; edge trỏ node không tồn tại; vượt giới hạn node/edge; `linear` hoặc `decision-tree` có chu trình.

**Warnings**
- Segment dài hơn 40 từ hoặc có câu dài hơn 25 từ.
- Tổng số từ ngoài khoảng mục tiêu của từng tầng (số từ cộng dồn các segment có `tier ≤ N`): Headline 30–90, Full 100–260, Deep 140–450. Con số tương ứng khoảng 120–140 từ/phút và có thể chỉnh trong cấu hình.
- Không có từ nối văn nói nào trong toàn pack.
- Segment `example`, `result` hoặc `scale` không chứa con số hoặc tên công nghệ cụ thể.
- Segment `vi` ngắn hơn 40% hoặc dài hơn 250% so với `en` (dấu hiệu dịch thiếu hoặc sai).
- Pack không có `followups`.

---

## 6. Lưu trữ: Multi-Tier Storage Adapter (Tối ưu từ BiTyping)

### 6.1 Kiến trúc 3 tầng (Resilient, 0-Config ở Client)
Kế thừa pattern `MultiStorageManager` từ BiTyping để không bao giờ bị chặn bởi giới hạn hạ tầng:
1. **Tier 1 — Client IndexedDB Cache**: Lưu cục bộ toàn bộ packs đã tải và tiến độ học. App khởi동 tức thì (0ms latency) và hoạt động 100% offline.
2. **Tier 2 — EdgeOne Pages Blob (Primary Cloud Storage)**:
   - Trong Node Cloud Functions dùng SDK `@edgeone/pages-blob` (namespace `speakstack`).
   - Có `setJSON`, `get`, `list` theo prefix. Gói free: 1GB Blob, tối đa 25MB/value.
3. **Tier 3 — GitHub Gist Server-Side Fallback**:
   - Nếu môi trường chạy là Edge V8 Isolate hoặc Blob chưa cấp quyền / gặp lỗi, backend tự động fallback sang đọc/ghi GitHub Gist thông qua biến môi trường trên server (`GITHUB_TOKEN` + `GIST_ID`, luôn kèm header `User-Agent: SpeakStack-App` để tránh lỗi 403 của GitHub API trên V8 isolate).
   - **0-config cho người dùng**: Client trình duyệt chỉ gọi `/api/*`, hoàn toàn không cần nhập bất kỳ token nào.

### 6.2 Cấu trúc key & Đồng bộ chỉ mục nguyên tử (Atomic Index Update)

```
packs/{template}/{topic}/{id}.json     # mỗi pack một file
index/packs.json                       # chỉ mục (id, question, template, topic, tags, level, wordCounts, updatedAt)
```

- **Tối ưu quan trọng**: Khi gọi `create_pack`, `update_pack`, hoặc `delete_pack`, backend **cập nhật trực tiếp luôn `index/packs.json`** ngay trong cùng thao tác. Agent và UI thấy pack mới ngay lập tức mà không cần gọi tay `/api/admin/reindex`.
- Endpoint `POST /api/admin/reindex` vẫn được giữ lại làm công cụ sửa chữa (repair tool) khi cần quét lại toàn bộ `packs/*`.
- Sửa `topic` hoặc `template` của pack nghĩa là **di chuyển key** (ghi key mới, xoá key cũ, cập nhật `index/packs.json`).

### 6.3 Consistency & Safety
- Dùng `consistency: "strong"` cho `list`/`get` ngay sau khi tạo/sửa, endpoint reindex, và MCP tools.
- Trên client, trước khi parse JSON từ `/api/*`, luôn kiểm tra `response.headers.get('content-type')?.includes('application/json')` để tránh lỗi SPA fallback trả về `index.html` (bài học thực tế từ BiTyping).
- **Audio mp3** để trong `public/music/` (static), không đưa vào Blob.

---

## 7. MCP Server (Zero-Dependency JSON-RPC 2.0)

### 7.1 Triển khai tối ưu từ BiTyping
- Thay vì phụ thuộc vào `@modelcontextprotocol/sdk` (dễ lỗi Node streams/SSE và nặng cold-start trên serverless), triển khai **Stateless JSON-RPC 2.0 MCP Handler thuần** (hỗ trợ `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`).
- Chạy mượt trên cả EdgeOne V8 Isolates (`edge-functions`) lẫn Node Cloud Functions (`cloud-functions`) với 0ms cold start.
- Đường dẫn bảo vệ: `/mcp/{secret}` (hoặc `/mcp` kèm kiểm tra secret nếu truyền qua query/header, ưu tiên `/mcp/{secret}` để agent chỉ cần 1 URL duy nhất). `MCP_SECRET` lấy từ biến môi trường trên EdgeOne Console.

### 7.2 Danh sách tool

| Tool | Mục đích | Ghi chú |
|---|---|---|
| `get_template_spec(template)` | Trả về khung, quy tắc văn nói, độ dài, flow cho template, ví dụ mẫu | Agent **phải gọi trước khi viết** |
| `validate_pack(pack)` | Kiểm tra theo mục 5, trả về errors/warnings | Không ghi dữ liệu |
| `create_pack(pack)` | Validate → Lưu pack → Tự động cập nhật `index/packs.json` | Trả về key và warnings |
| `update_pack(id, pack)` | Ghi đè pack, tăng `version`, cập nhật `index/packs.json` | Có kiểm tra `version` để tránh đè nhầm |
| `get_pack(id)` | Đọc một pack | |
| `list_packs(filter)` | Lọc theo `template`, `topic`, `tag`, `level` | Đọc từ index với strong consistency |
| `list_topics()` | Danh sách 8 topic cốt lõi + topic phát sinh và số pack theo template | Tránh trùng chủ đề |
| `get_coverage()` | Ma trận **topic × template** (8×5 ô cốt lõi + mở rộng, đánh dấu ô trống) | Để agent biết nên viết gì tiếp |
| `delete_pack(id)` | Xoá pack và cập nhật `index/packs.json` | Dùng hạn chế |

### 7.3 Luồng agent chuẩn
1. `get_coverage` (hoặc `list_topics`) để chọn chủ đề và template còn thiếu.
2. `get_template_spec(template)`.
3. Viết pack, `validate_pack`, sửa theo errors/warnings.
4. `create_pack`.

---

## 8. REST API cho frontend

| Endpoint | Mô tả |
|---|---|
| `GET /api/packs?template=&topic=&tag=&level=` | Danh sách (từ `index/packs.json`, tự fallback quét list nếu chưa có index) |
| `GET /api/packs/{id}` (hoặc `/api/packs/{template}/{topic}/{id}`) | Chi tiết một pack |
| `GET /api/random?template=&topic=&exclude=` | Pack ngẫu nhiên theo bộ lọc |
| `GET /api/topics` | Topic và số lượng theo template |
| `GET /api/coverage` | Ma trận phủ (8 chủ đề cốt lõi × 5 template) |
| `POST /api/admin/reindex` | Quét và dựng lại `index/packs.json` (cần secret) |
| `PUT/DELETE /api/admin/packs/{id}` | Sửa/xoá pack (cần secret) |

---

## 9. Chế độ luyện tập (Vòng 5 bước)

Mỗi pack luyện theo vòng 5 chế độ. Người dùng chọn **tầng** (Headline / Full / Deep) trước khi vào.

### 9.1 Listen (Nghe & Hiểu cấu trúc)
- Chữ tiếng Anh highlight theo từng từ (karaoke), phụ đề tiếng Việt hiển thị theo **câu/segment** (không ghép từng từ).
- Nghe giọng đọc TTS (tuỳ chọn). Tốc độ 0.75x / 1x / 1.25x.
- Thanh tiến trình theo **nhãn template** (đang ở `why`, còn `tradeoff`, `example`…). Hiển thị flow nếu có.

### 9.2 Shadow (Đọc đuổi theo nhịp)
- Người dùng đọc theo cùng lúc với highlight. Có nút tạm dừng, lặp lại segment hiện tại, chuyển segment trước/sau.
- Có thể bật nhạc nền (có ducking) và ghi âm.

### 9.3 Type (Gõ song ngữ — Kế thừa từ BiTyping)
- Gõ lại từng segment tiếng Anh, highlight chữ đúng/sai theo thời gian thực, hiển thị nghĩa tiếng Việt và nhãn khung bên dưới.
- Tái sử dụng trực tiếp kỹ thuật `TypingBlock` từ BiTyping:
  - Xử lý trọn vẹn vòng đời bộ gõ IME (`compositionstart` / `compositionend`) không bị nhảy con trỏ hay nuốt chữ.
  - Tự động tắt `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"`.
  - Hỗ trợ bật/tắt bàn phím ảo trên mobile và giữ khung nhìn bằng `visualViewport`.
- Giúp người dùng nhớ mặt chữ, từ nối văn nói và cấu trúc câu trước khi bước vào tự nói ở Recall/Free.

### 9.4 Recall (Nhớ khung & Tự nói có gợi ý)
Che chữ tiếng Anh theo mức, tiếng Việt và nhãn khung luôn hiện:
- **R1**: che các `keywords`.
- **R2**: chỉ hiện 3 từ đầu của mỗi câu.
- **R3**: chỉ hiện tiếng Việt và nhãn khung.
Người dùng tự nói, dictation đối chiếu với câu mẫu.

### 9.5 Free (Phỏng vấn thực chiến không gợi ý)
- Chỉ hiện câu hỏi, khung nhãn (5 bước) và đồng hồ. Flow ẩn, có nút "xem gợi ý".
- Người dùng tự trả lời, app ghi âm và dictation.
- Cuối phiên so với câu mẫu (xem 10.3).

### 9.6 Tính năng bổ sung
- **Next random**: kết thúc một pack thì bấm "Tiếp theo" (`N`) sẽ random pack kế theo bộ lọc template/topic hiện tại, kèm **Speculative Pre-fetching** (tải ngầm sẵn pack kế tiếp vào bộ nhớ để chuyển bài trong 0ms).
- **Mock interview**: bốc ngẫu nhiên N câu (mặc định 5) theo bộ lọc, mỗi câu 90 giây tự trả lời, rồi hiển thị câu mẫu và follow-up. Cuối phiên có tổng kết.
- **Follow-up ladder**: sau khi trả lời, hỏi tiếp các `followups` của pack.
- **Opener drill**: luyện 30 giây phản xạ cho 5 câu mở đầu của 5 template.

---

## 10. Speech, Karaoke và Dictation (Tối ưu từ thực chiến BiTyping)

### 10.1 TTS Engine & Hybrid Karaoke Sync
- **Bài học từ BiTyping**:
  - Loại bỏ Kokoro/Piper WASM (nặng 27–86MB, gây trễ vài giây trên mobile) và loại bỏ Edge Neural TTS proxy (lỗi thiếu Node stream/ws trên Edge V8 isolate).
  - Sử dụng **Web Speech API Enhanced (`system`)** làm mặc định: 0MB tải thêm, độ trễ 5–47ms, hoạt động 100% offline.
- **Voice Quality Ranking**: Ngay khi tải trang (`onvoiceschanged`), tự động chấm điểm và chọn giọng đọc tiếng Anh tự nhiên nhất của hệ điều hành (`Ava`/`Samantha Enhanced` trên macOS/iOS, `Natural`/`Online` trên Windows Edge, `Google US English` trên Chrome/Android). Luôn ép `lang = 'en-US'` hoặc `'en-GB'` để tránh hệ điều hành đọc tiếng Anh bằng giọng tiếng Việt.
- **Hybrid Karaoke Timing**:
  - Mặc định dùng **Weighted Pace Timing** (tính thời lượng mỗi từ dựa trên tốc độ mục tiêu mặc định **120 WPM**, có cộng thêm trọng số cho từ dài và dấu phẩy/dấu chấm câu).
  - Khi bật TTS trên desktop: lắng nghe sự kiện `onboundary` để đồng bộ từ đang đọc; nếu trình duyệt (như iOS Safari / Android) không bắn `onboundary`, tự động chuyển mượt về Weighted Pace Timing mà không bị đứng highlight.

### 10.2 Dictation & Quản lý Audio/Mic trên Mobile
- **Chống xung đột phần cứng trên Mobile**:
  - Trên iOS/Android, việc chạy đồng thời `speechSynthesis`, `SpeechRecognition` và `MediaRecorder` sẽ gây nghẽn hoặc giảm âm lượng.
  - Quy tắc: Khi bắt đầu ghi âm/dictation ở Recall/Free, **tự động `speechSynthesis.cancel()`** trước khi mở mic.
  - Quản lý vòng đời `SpeechRecognition`: trên mobile, API này tự ngắt sau vài giây nghỉ lấy hơi; app tự động lắng nghe `onend` để nối lại (`restart()`) chừng nào người dùng chưa bấm dừng.
- **Chuẩn hoá & Phonetic/Fuzzy Matching cho thuật ngữ kỹ thuật**:
  - Chuẩn hoá: chữ thường, bỏ dấu câu, quy đổi số (`24` ↔ `twenty-four`) và từ viết tắt phổ biến (`I'd` ↔ `I would`).
  - Dùng **căn chỉnh chuỗi (Edit Distance / Levenshtein) kết hợp so khớp âm gần đúng (Phonetic / Fuzzy threshold >= 0.8)** cho các thuật ngữ chuyên ngành (*idempotency*, *idempotent*, *Redis*, *Kafka*, *quorum*, *throughput*, *serializable*). Nhờ đó khi Web Speech API nhận diện trệch nhẹ từ chuyên ngành, người dùng vẫn được tính là **Đúng / Gần đúng** thay vì bị phạt đỏ oan.
- Danh sách **từ hay vấp (`weakWords`)**: từ bị bỏ sót hoặc đọc sai từ 3 lần trở lên, lưu lại để luyện riêng.

### 10.3 Chấm ở chế độ Free
Lời nói tự do sẽ khác câu mẫu, nên **không chấm theo độ khớp từng từ**. Thay vào đó:
- Hiển thị **keyword đã nói và chưa nói** theo từng nhãn của template (dựa trên `keywords`, có hỗ trợ fuzzy/stemming nhẹ).
- Hiển thị nhãn nào có nói đến, nhãn nào bị bỏ qua.
- Người dùng tự đánh dấu (checklist) và đối chiếu với câu mẫu.

### 10.4 Chỉ số nói (không phụ thuộc nhận dạng)
- **Tốc độ nói (WPM)**: tính từ số từ nhận dạng và thời gian thực nói.
- **Quãng im lặng dài** (mặc định > 1.5 giây): phát hiện qua mức âm thanh của micro (`AudioContext` + `AnalyserNode`).

### 10.5 Ghi âm
- Ghi bằng `MediaRecorder`, lưu cục bộ trong IndexedDB, giữ N bản gần nhất (mặc định 20), tự dọn bản cũ (LRU eviction). Không tải lên máy chủ.
- Cho phép nghe lại bản ghi đối chiếu cạnh câu mẫu.

---

## 11. Nhạc nền & Ducking

- Người dùng **tự cung cấp các file mp3**, đặt trong `public/music/`, kèm `music.json` (tiêu đề, file, mood). Chỉ dùng nhạc có quyền sử dụng hợp pháp.
- Trình phát: danh sách phát, shuffle, lặp, âm lượng (nhớ lại lần sau), nút bật/tắt nhanh trên header.
- **Ducking mượt**: nhạc tự giảm xuống khoảng 20% khi TTS đang đọc hoặc mic phát hiện người dùng đang nói, và tăng lại sau khoảng 800 ms im lặng. Dùng `GainNode.gain.exponentialRampToValueAtTime` (hoặc fallback `HTMLAudioElement.volume` trên iOS nếu bị giới hạn autoplay).
- Trình duyệt chặn tự phát nhạc, nên chỉ kích hoạt `AudioContext` sau tương tác đầu tiên của người dùng.

---

## 12. Tiến độ và ôn lại (Spaced Repetition)

Lưu trong **IndexedDB** trên thiết bị:
- `attempts`: pack, chế độ (`listen` | `shadow` | `type` | `recall` | `free`), tầng, thời điểm, tốc độ nói (WPM), quãng im lặng, tỷ lệ khớp.
- `mastery` mỗi pack: mức 0–4 (0: chưa học, 1: đã nghe/shadow, 2: đã gõ/type, 3: recall được, 4: nói free trôi chảy).
- `nextReview`: lặp ngắt quãng đơn giản (1, 3, 7, 14, 30 ngày); luyện kém thì quay lại bước ngắn hơn.
- `weakWords`: từ hay vấp và số lần.
- `settings`: tốc độ TTS, WPM mục tiêu (mặc định **120 WPM**), tầng mặc định, âm lượng nhạc, giọng đọc ưa thích, bật/tắt bàn phím ảo mobile, bộ lọc gần nhất.

Có nút **xuất / nhập JSON** và đồng bộ `user/progress.json` lên Cloud (Blob/Gist) để dùng xuyên suốt giữa laptop và điện thoại.

---

## 13. Giao diện (UX)

- **Mobile-first**, responsive, theme tối/sáng, chỉnh cỡ chữ.
- Màn hình chính: **Tiếp tục** (pack đang dở), **Đến hạn ôn**, **Random theo chủ đề**.
- Thư viện: lọc theo template, topic, tag, level; hiển thị số từ theo tầng và mức mastery.
- Màn hình luyện: chữ Anh lớn ở giữa, phụ đề Việt bên dưới, thanh nhãn template phía trên, flow ở bên (desktop) hoặc phía dưới và cuộn ngang trong khung riêng (mobile).
- **Giao diện theo template**: `system_design` hiển thị pipeline 5 bước; `compare` hai cột A/B; `experience` bốn khối S-T-A-R cộng Lesson; `debug` có cây chẩn đoán; `concept` có luồng xử lý.
- System design: flow hai tầng, high-level hiện sẵn, deep dive mở khi đến bước đó.
- Phím tắt trên desktop (Zero-Mouse Navigation): `Space` (tạm dừng/tiếp), `←`/`→` (segment), `R` (lặp), `N` (pack ngẫu nhiên tiếp theo), `1`–`5` (chuyển nhanh chế độ Listen/Shadow/Type/Recall/Free).
- Trang admin tối thiểu: danh sách, xem/sửa JSON, xoá, reindex, ma trận phủ 8×5.

---

## 14. Kiến trúc kỹ thuật (Đã chốt)

- **Frontend**: **Preact + Vite + TypeScript** (~3KB bundle, siêu nhanh, tương thích 100% các hook/component từ BiTyping), deploy EdgeOne Pages.
- **Backend**: EdgeOne Functions (hỗ trợ cả Node Cloud Functions và V8 Isolates) cho REST API và Zero-dependency JSON-RPC MCP; lưu dữ liệu qua **Multi-Tier Storage Adapter** (IndexedDB + EdgeOne Blob + GitHub Gist env fallback).
- **Module chung** `shared/` (schema, validator, template specs, 8 core topics, tính tier và số từ) dùng chung cho cả UI và backend.
- **Cấu trúc thư mục**:

```
/
├─ public/music/            # mp3 + music.json
├─ src/                     # Frontend (Preact + TypeScript)
│  ├─ components/           # KaraokeStage, TypingBlock, FlowDiagram, MusicPlayer, AdminModal...
│  ├─ lib/
│  │  ├─ storage/           # idb.ts, remote.ts, multi-storage.ts
│  │  ├─ speech/            # tts.ts (voice ranking), karaoke.ts, dictation.ts (fuzzy match), recorder.ts
│  │  └─ audio/             # music-ducking.ts
├─ shared/                  # Dùng chung cho cả Frontend & Functions
│  ├─ schema.ts             # Types, 5 templates, 8 core topics
│  ├─ templates.ts          # get_template_spec data & examples
│  └─ validator.ts          # validatePack(pack)
├─ functions/               # REST API (/api/*) & Stateless JSON-RPC MCP (/mcp/*)
└─ scripts/seed.ts          # Nạp 5 pack mẫu chuẩn vào storage
```

---

## 15. Kế hoạch phát triển

### Phase 0 — Spike & Khởi tạo nền tảng (0.5–1 ngày)
- Khởi tạo project Preact + Vite + TypeScript và cấu trúc `shared/`.
- Kiểm tra Multi-Tier Storage (Blob + Gist fallback) và JSON-RPC MCP endpoint.
- Kiểm tra `SpeechRecognition`, `MediaRecorder` và Hybrid Karaoke Timing trên Chrome desktop & mobile.

### Phase 1 — Nội dung cốt lõi & MCP Server
- Hoàn thiện `shared/schema.ts`, `shared/templates.ts` (5 templates + 8 core topics), `shared/validator.ts`.
- Xây dựng REST API (`/api/packs`, `/api/topics`, `/api/coverage`, `/api/random`, `/api/admin/*`) và MCP server (`/mcp/{secret}`) với đầy đủ 9 tools mục 7.2 + Atomic Index Update.
- Tạo 5 pack mẫu chất lượng cao (mỗi template 1 pack thuộc các chủ đề Senior Java), nạp qua seed.
- **Hoàn thành khi**: Agent gọi được MCP tools, tạo pack hợp lệ tự cập nhật vào `index/packs.json`, pack sai bị từ chối kèm lỗi rõ ràng.

### Phase 2 — Listen, Shadow & Thư viện
- Xây dựng Karaoke Engine (Weighted Pace 120 WPM + Web Speech API Enhanced với Voice Ranking), phụ đề Việt theo segment, chọn tầng (Headline/Full/Deep), thanh tiến trình nhãn template.
- Màn hình Thư viện, bộ lọc, **Next random** kèm Speculative Pre-fetching.
- **Hoàn thành khi**: Luyện liên tục nhiều pack ở chế độ Listen & Shadow mượt mà trên cả desktop và mobile.

### Phase 3 — Mode Type, Recall, Free & Flow Diagram
- Tích hợp **Mode Type** (tái sử dụng `TypingBlock` chống lỗi IME từ BiTyping) để gõ song ngữ theo segment.
- Xây dựng Recall (R1–R3), Free (ẩn gợi ý, checklist keywords), và render Flow 3 kiểu (`linear`, `decision-tree`, `architecture`) tự sáng node theo segment đang học.
- **Hoàn thành khi**: Đủ vòng 5 chế độ (Listen → Shadow → Type → Recall → Free) và sơ đồ Flow hoạt động chuẩn.

### Phase 4 — Dictation (Fuzzy Match), Ghi âm & Nhạc nền Ducking
- Tích hợp `SpeechRecognition` (kèm tự nối lại session trên mobile và Phonetic/Fuzzy matching cho từ khóa kỹ thuật), đo WPM & quãng im lặng (`AnalyserNode`).
- Ghi âm `MediaRecorder` lưu IndexedDB (giữ 20 bản gần nhất) và trình phát nhạc nền có Ducking (`GainNode`).
- **Hoàn thành khi**: Chấm từng từ đúng/gần đúng/bỏ sót chính xác cả với thuật ngữ khó, tự tắt TTS trước khi bật mic trên mobile, nhạc tự nhỏ xuống khi nói.

### Phase 5 — Tiến độ, Ôn tập ngắt quãng & Mock Interview
- Lưu IndexedDB (`attempts`, `mastery`, `nextReview`, `weakWords`, `settings`), xuất/nhập JSON và đồng bộ tiến độ lên Cloud.
- Hoàn thiện Mock Interview (5 câu × 90s), Follow-up Ladder, Opener Drill, và trang Admin (ma trận phủ 8×5, sửa/xoá JSON, reindex).

---

## 16. Rủi ro và cách giảm (Cập nhật từ bài học BiTyping)

| Rủi ro | Cách giảm |
|---|---|
| Web Speech API chọn nhầm giọng xấu hoặc giọng tiếng Việt | Chấm điểm chọn giọng Enhanced/Natural/Google ngay khi tải trang; luôn ép `lang = 'en-US'` |
| `onboundary` của TTS không chạy trên iOS/Android | Dùng Hybrid Sync: mặc định chạy theo Weighted Pace Timing (120 WPM), chỉ dùng `onboundary` khi trình duyệt phát sự kiện |
| Xung đột TTS + Mic + Ghi âm trên điện thoại | Tự động gọi `speechSynthesis.cancel()` trước khi mở mic; tách luồng ghi âm và nhận diện giọng nói; tự `restart()` khi `SpeechRecognition` ngắt giữa chừng |
| Dictation nghe sai thuật ngữ kỹ thuật (*idempotency*, *Kafka*...) | Dùng chuẩn hoá văn bản kết hợp Levenshtein + Phonetic/Fuzzy matching cho từ khoá kỹ thuật |
| EdgeOne Blob chưa cấp quyền hoặc lỗi môi trường V8 Isolate | Multi-Tier Storage Adapter: tự động fallback sang GitHub Gist qua biến môi trường server (0-config cho client) + IndexedDB offline cache |
| `@modelcontextprotocol/sdk` lỗi stream trên Serverless | Dùng Zero-dependency JSON-RPC 2.0 MCP Handler thuần (đã kiểm chứng trên production BiTyping) |
| Phải gọi tay `/api/admin/reindex` sau mỗi lần tạo pack | Cập nhật nguyên tử (Atomic Update) file `index/packs.json` ngay trong `create_pack`, `update_pack`, `delete_pack` |
| Lộ thông tin dự án thật trong pack `experience` | Ẩn danh tên công ty, khách hàng, số liệu nhạy cảm; không đưa nội dung dưới NDA |

---

## 17. Tiêu chí nghiệm thu (MVP = Phase 1–3)

- Agent đọc spec, tạo được pack cho cả 5 template qua MCP; pack không hợp lệ bị từ chối kèm lý do; `index/packs.json` tự động cập nhật.
- Người dùng luyện được trọn vẹn vòng 5 chế độ **Listen → Shadow → Type → Recall → Free** trên điện thoại và laptop.
- Phụ đề tiếng Việt hiển thị theo segment, highlight tiếng Anh theo từng từ, đổi tốc độ được (mặc định 120 WPM).
- Flow chỉ xuất hiện ở `concept`, `debug`, `system_design`, highlight đúng node theo segment.
- Kết thúc một pack, bấm **Tiếp theo** (`N`) sẽ chuyển tức thì sang pack ngẫu nhiên tiếp theo theo bộ lọc mà không phải quay về danh sách.
- Toàn bộ chạy trong gói miễn phí, 0-config ở client (người dùng mở web là dùng ngay).

---

## 18. Các quyết định thiết kế đã chốt

1. **Framework Frontend**: **Preact + Vite + TypeScript** (~3KB, tái sử dụng toàn bộ kiến trúc tối ưu từ BiTyping).
2. **Tên chính thức**: **SpeakStack**.
3. **Bộ 8 chủ đề khởi đầu (Senior Java)**: `jvm-gc`, `concurrency`, `spring-boot`, `kafka-messaging`, `database-transactions`, `caching-redis`, `distributed-systems`, `system-design`.
4. **Tốc độ nói mục tiêu mặc định**: **120 WPM** (từ/phút, chỉnh được trong Cài đặt).
5. **Lưu trữ**: **Multi-Tier Storage** (IndexedDB + EdgeOne Blob + GitHub Gist server-env fallback) kèm cập nhật `index/packs.json` tự động.
6. **MCP Server**: **Zero-dependency JSON-RPC 2.0 handler** tại `/mcp/{secret}`.
7. **Mode Type**: Đưa vào ngay **Phase 3** (học theo chu trình 5 bước Listen → Shadow → Type → Recall → Free) để thay thế sớm BiTyping.

import { useMemo, useState } from 'preact/hooks';
import {
  CORE_TOPICS,
  SpeakPack,
  TEMPLATE_META,
  TemplateType,
  calculatePackWordCounts
} from '../../shared/schema';
import { UserProgressData } from '../lib/storage/idb';

interface LibraryViewProps {
  packs: SpeakPack[];
  progress: UserProgressData;
  selectedTemplate: string;
  selectedTopic: string;
  onChangeFilters: (template: string, topic: string) => void;
  onSelectPack: (pack: SpeakPack) => void;
  onStartRandom: () => void;
}

export function LibraryView({
  packs,
  progress,
  selectedTemplate,
  selectedTopic,
  onChangeFilters,
  onSelectPack,
  onStartRandom
}: LibraryViewProps) {
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPacks = useMemo(() => {
    return packs.filter((p) => {
      if (selectedTemplate !== 'all' && p.template !== selectedTemplate) return false;
      if (selectedTopic !== 'all' && p.topic !== selectedTopic) return false;
      if (selectedLevel !== 'all' && p.level !== selectedLevel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchQ =
          p.question.en.toLowerCase().includes(q) ||
          p.question.vi.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchQ) return false;
      }
      return true;
    });
  }, [packs, selectedTemplate, selectedTopic, selectedLevel, searchQuery]);

  // Dashboard cards: Continue, Due for Review, Weak Words
  const continuePack = useMemo(() => {
    return (
      packs.find((p) => p.id === progress.settings.lastPackId) ||
      packs[0] ||
      null
    );
  }, [packs, progress.settings.lastPackId]);

  const duePacks = useMemo(() => {
    const now = Date.now();
    return packs.filter((p) => {
      const m = progress.mastery[p.id];
      if (!m) return true; // Unseen packs are ready to learn
      return new Date(m.nextReview).getTime() <= now;
    });
  }, [packs, progress.mastery]);

  const topWeakWords = useMemo(() => {
    return Object.values(progress.weakWords || {})
      .filter((w) => w.missCount >= 1)
      .sort((a, b) => b.missCount - a.missCount)
      .slice(0, 8);
  }, [progress.weakWords]);

  return (
    <div className="library-container" data-testid="library-view">
      {/* Top Quick Dashboard Cards (Req 13) */}
      <div className="dashboard-cards-grid">
        {continuePack && (
          <div className="dash-card dash-continue">
            <span className="dash-label">▶️ Tiếp tục pack đang dở</span>
            <h3>{continuePack.question.en}</h3>
            <p>{continuePack.question.vi}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSelectPack(continuePack)}
              data-testid="continue-pack-btn"
            >
              Luyện tiếp #{continuePack.id}
            </button>
          </div>
        )}

        <div className="dash-card dash-due">
          <span className="dash-label">📅 Đến hạn ôn tập (Spaced Repetition)</span>
          <h3>{duePacks.length} Pack cần ôn hôm nay</h3>
          <p>Chu kỳ ôn ngắt quãng: 1 → 3 → 7 → 14 → 30 ngày</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (duePacks.length > 0) onSelectPack(duePacks[0]);
            }}
            data-testid="review-due-btn"
          >
            Ôn ngay bài đến hạn
          </button>
        </div>

        <div className="dash-card dash-random">
          <span className="dash-label">🎲 Phản xạ ngẫu nhiên theo bộ lọc</span>
          <h3>Bốc câu hỏi bất kỳ</h3>
          <p>
            Đang lọc: Template <strong>{selectedTemplate}</strong> · Chủ đề{' '}
            <strong>{selectedTopic}</strong>
          </p>
          <button
            type="button"
            className="btn btn-accent"
            onClick={onStartRandom}
            data-testid="start-random-btn"
          >
            Random Pack ngay
          </button>
        </div>
      </div>

      {/* Weak Words Banner if any */}
      {topWeakWords.length > 0 && (
        <div className="weak-words-banner">
          <strong>⚠️ Từ hay vấp (cần chú ý phát âm):</strong>
          <div className="weak-words-list">
            {topWeakWords.map((w) => (
              <span key={w.word} className="weak-word-chip">
                {w.word} ({w.missCount}x)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="library-filters-bar">
        <div className="filter-group">
          <label htmlFor="filter-template">Khung trả lời (Template):</label>
          <select
            id="filter-template"
            value={selectedTemplate}
            onChange={(e: any) => onChangeFilters(e.target.value, selectedTopic)}
            data-testid="filter-template-select"
          >
            <option value="all">Tất cả 5 Templates</option>
            {(Object.keys(TEMPLATE_META) as TemplateType[]).map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_META[t].titleVi}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-topic">Chủ đề (Topic):</label>
          <select
            id="filter-topic"
            value={selectedTopic}
            onChange={(e: any) => onChangeFilters(selectedTemplate, e.target.value)}
            data-testid="filter-topic-select"
          >
            <option value="all">Tất cả 8 Chủ đề Senior Java</option>
            {CORE_TOPICS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title} ({c.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-level">Cấp độ (Level):</label>
          <select
            id="filter-level"
            value={selectedLevel}
            onChange={(e: any) => setSelectedLevel(e.target.value)}
          >
            <option value="all">Mọi cấp độ</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        <div className="filter-group filter-search">
          <label htmlFor="filter-search-input">Tìm kiếm:</label>
          <input
            id="filter-search-input"
            type="search"
            placeholder="Từ khoá, tag, câu hỏi..."
            value={searchQuery}
            onInput={(e: any) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Pack Cards Grid */}
      <div className="packs-grid" data-testid="packs-grid">
        {filteredPacks.map((pack) => {
          const wc = calculatePackWordCounts(pack.segments || []);
          const mastery = progress.mastery[pack.id]?.level || 0;
          return (
            <article key={pack.id} className="pack-card" data-testid={`pack-card-${pack.id}`}>
              <div className="pack-card-top">
                <span className={`template-pill pill-${pack.template}`}>
                  {TEMPLATE_META[pack.template]?.titleVi}
                </span>
                <span className="topic-pill">#{pack.topic}</span>
                <span className={`mastery-badge mastery-${mastery}`}>
                  Mastery {mastery}/4
                </span>
              </div>

              <h3 className="pack-card-title-en">{pack.question.en}</h3>
              <p className="pack-card-title-vi">{pack.question.vi}</p>

              <div className="pack-card-wordcounts">
                <span>T1: {wc.tier1} từ</span>
                <span>T2: {wc.tier2} từ</span>
                <span>T3: {wc.tier3} từ</span>
                {pack.flow && <span>🌿 Có Flow</span>}
              </div>

              <div className="pack-card-tags">
                {(pack.tags || []).map((tag) => (
                  <span key={tag} className="tag-chip">
                    #{tag}
                  </span>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-primary pack-start-btn"
                onClick={() => onSelectPack(pack)}
                data-testid={`select-pack-${pack.id}`}
              >
                🎙️ Vào luyện Pack này
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

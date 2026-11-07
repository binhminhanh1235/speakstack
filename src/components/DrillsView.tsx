import { useEffect, useMemo, useState } from 'preact/hooks';
import { SpeakPack, TEMPLATE_META, TemplateType } from '../../shared/schema';
import { speakSegmentText } from '../lib/speech/tts';

interface DrillsViewProps {
  packs: SpeakPack[];
  onSelectPack: (pack: SpeakPack) => void;
}

export function DrillsView({ packs, onSelectPack }: DrillsViewProps) {
  const [subTab, setSubTab] = useState<'mock' | 'opener'>('mock');

  // Mock Interview state (5 questions x 90s)
  const [mockStarted, setMockStarted] = useState(false);
  const [mockIdx, setMockIdx] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState(90);
  const [showSample, setShowSample] = useState(false);
  const [completedNotes, setCompletedNotes] = useState<Record<string, string>>({});
  const [mockFinished, setMockFinished] = useState(false);

  const mockQuestions = useMemo(() => {
    return packs.slice(0, 5);
  }, [packs]);

  const currentMockPack = mockQuestions[mockIdx] || mockQuestions[0];

  useEffect(() => {
    if (!mockStarted || mockFinished) return;
    const timer = setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          setShowSample(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [mockStarted, mockFinished, mockIdx]);

  // Opener Drill state (30s timer)
  const [openerTimer, setOpenerTimer] = useState(30);
  const [openerRunning, setOpenerRunning] = useState(false);

  useEffect(() => {
    if (!openerRunning) return;
    const t = setInterval(() => {
      setOpenerTimer((s) => {
        if (s <= 1) {
          setOpenerRunning(false);
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [openerRunning]);

  return (
    <div className="drills-container" data-testid="drills-view">
      <div className="drills-header">
        <h2>🎯 Phỏng vấn thử (Mock Interview) & Phản xạ Câu mở đầu (Opener Drill)</h2>
        <div className="drills-subtabs">
          <button
            type="button"
            className={`btn ${subTab === 'mock' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('mock')}
            data-testid="subtab-mock-btn"
          >
            ⏱️ Mock Interview (5 câu × 90s)
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'opener' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('opener')}
            data-testid="subtab-opener-btn"
          >
            ⚡ Opener Drill (30s × 5 Khung)
          </button>
        </div>
      </div>

      {subTab === 'mock' && (
        <div className="mock-panel" data-testid="mock-panel">
          {!mockStarted ? (
            <div className="mock-intro-card">
              <h3>Mô phỏng phỏng vấn Senior Java thực tế</h3>
              <p>
                Hệ thống chọn ra <strong>{mockQuestions.length} câu hỏi</strong> phủ đủ các template.
                Mỗi câu bạn có <strong>90 giây</strong> tự trả lời không gợi ý, sau đó đối chiếu câu mẫu và câu hỏi phụ (follow-up).
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setMockStarted(true);
                  setMockFinished(false);
                  setMockIdx(0);
                  setTimeLeftSec(90);
                  setShowSample(false);
                }}
                data-testid="start-mock-btn"
              >
                🚀 Bắt đầu phiên Mock Interview
              </button>
            </div>
          ) : mockFinished ? (
            <div className="mock-summary-card" data-testid="mock-summary-card">
              <h3>🎉 Hoàn thành phiên Mock Interview!</h3>
              <p>Tổng kết {mockQuestions.length} câu hỏi đã luyện:</p>
              <div className="mock-summary-list">
                {mockQuestions.map((q, i) => (
                  <div key={q.id} className="mock-summary-item">
                    <div>
                      <strong>
                        Câu {i + 1} ({q.template}):
                      </strong>{' '}
                      {q.question.en}
                      {completedNotes[q.id] && (
                        <p className="user-note-preview">Tự đánh giá: {completedNotes[q.id]}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => onSelectPack(q)}
                    >
                      Luyện kỹ lại Pack này
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setMockStarted(false)}
              >
                Làm phiên mới
              </button>
            </div>
          ) : (
            currentMockPack && (
              <div className="mock-active-card">
                <div className="mock-status-bar">
                  <span>
                    Câu hỏi <strong>{mockIdx + 1}</strong> / {mockQuestions.length} (
                    {TEMPLATE_META[currentMockPack.template].titleVi})
                  </span>
                  <span className={`mock-countdown ${timeLeftSec <= 15 ? 'urgent' : ''}`}>
                    ⏳ Còn lại: <strong>{timeLeftSec}s</strong>
                  </span>
                </div>

                <h3 className="mock-q-en">{currentMockPack.question.en}</h3>
                <p className="mock-q-vi">{currentMockPack.question.vi}</p>

                <textarea
                  className="mock-notes-input"
                  rows={3}
                  placeholder="Ghi chú nhanh dàn ý hoặc tự đánh giá câu trả lời của bạn..."
                  value={completedNotes[currentMockPack.id] || ''}
                  onInput={(e: any) =>
                    setCompletedNotes((prev) => ({
                      ...prev,
                      [currentMockPack.id]: e.target.value
                    }))
                  }
                />

                <div className="mock-actions-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowSample((s) => !s)}
                  >
                    {showSample ? 'Ẩn câu mẫu' : '📖 Xem câu mẫu & Follow-up'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (mockIdx < mockQuestions.length - 1) {
                        setMockIdx((i) => i + 1);
                        setTimeLeftSec(90);
                        setShowSample(false);
                      } else {
                        setMockFinished(true);
                      }
                    }}
                    data-testid="next-mock-question-btn"
                  >
                    {mockIdx < mockQuestions.length - 1
                      ? 'Câu tiếp theo ➔'
                      : '🏁 Kết thúc & Xem tổng kết'}
                  </button>
                </div>

                {showSample && (
                  <div className="mock-sample-box">
                    <h4>Đáp án chuẩn theo khung:</h4>
                    {currentMockPack.segments.map((seg) => (
                      <p key={seg.id}>
                        <span className="badge-label">{seg.label}</span> {seg.en}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {subTab === 'opener' && (
        <div className="opener-panel" data-testid="opener-panel">
          <div className="opener-timer-bar">
            <span>
              ⏱️ Đồng hồ phản xạ 30 giây: <strong>{openerTimer}s</strong>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setOpenerTimer(30);
                setOpenerRunning((r) => !r);
              }}
            >
              {openerRunning ? '⏸ Dừng đồng hồ' : '▶️ Bấm giờ 30s'}
            </button>
          </div>

          <div className="opener-cards-grid">
            {(Object.keys(TEMPLATE_META) as TemplateType[]).map((tmpl) => {
              const info = TEMPLATE_META[tmpl];
              return (
                <div key={tmpl} className="opener-card">
                  <div className="opener-card-head">
                    <span className={`template-pill pill-${tmpl}`}>{info.titleVi}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => speakSegmentText(info.openerEn)}
                    >
                      🔊 Nghe mẫu
                    </button>
                  </div>
                  <p className="opener-en">"{info.openerEn}"</p>
                  <p className="opener-vi">{info.openerVi}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

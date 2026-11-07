import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  PackSegment,
  SpeakPack,
  TEMPLATE_LABELS,
  TEMPLATE_META,
  TierType
} from '../../shared/schema';
import { PracticeMode, RecordingRecord, UserSettings, idbGetRecordingsForPack } from '../lib/storage/idb';
import {
  buildKaraokeTimeline,
  findWordIndexAtChar,
  findWordIndexAtTime
} from '../lib/speech/karaoke';
import { speakSegmentText, stopSpeech } from '../lib/speech/tts';
import {
  alignSpokenToTarget,
  DictationAlignmentResult,
  evaluateFreeModeKeywords,
  isSpeechRecognitionSupported,
  startContinuousDictation
} from '../lib/speech/dictation';
import { startMicRecorderAndMonitor, MicSessionHandle } from '../lib/speech/recorder';
import { musicController } from '../lib/audio/music-ducking';
import { FlowDiagram } from './FlowDiagram';
import { TypingBlock } from './TypingBlock';

interface PracticeStageProps {
  pack: SpeakPack;
  mode: PracticeMode;
  onModeChange: (mode: PracticeMode) => void;
  tier: TierType;
  onTierChange: (tier: TierType) => void;
  settings: UserSettings;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onNextRandomPack: () => void;
  onSessionComplete: (stats: {
    mode: PracticeMode;
    tier: TierType;
    wpm: number;
    longPauses: number;
    matchRate: number;
    missedWords?: string[];
  }) => void;
}

export function PracticeStage({
  pack,
  mode,
  onModeChange,
  tier,
  onTierChange,
  settings,
  onUpdateSettings,
  onNextRandomPack,
  onSessionComplete
}: PracticeStageProps) {
  const filteredSegments = useMemo(() => {
    const list = (pack.segments || []).filter((s) => s.tier <= tier);
    return list.length > 0 ? list : pack.segments || [];
  }, [pack, tier]);

  const [segIndex, setSegIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [recallLevel, setRecallLevel] = useState<'R1' | 'R2' | 'R3'>('R1');
  const [showFreeHints, setShowFreeHints] = useState(false);

  // Dictation & Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [liveWpm, setLiveWpm] = useState(0);
  const [longPauses, setLongPauses] = useState(0);
  const [alignmentResult, setAlignmentResult] = useState<DictationAlignmentResult | null>(null);
  const [freeFinished, setFreeFinished] = useState(false);
  const [selfCheckedLabels, setSelfCheckedLabels] = useState<Record<string, boolean>>({});
  const [freeTimerSec, setFreeTimerSec] = useState(0);
  const [savedRecordings, setSavedRecordings] = useState<RecordingRecord[]>([]);
  const [activeFollowupIdx, setActiveFollowupIdx] = useState<number | null>(null);

  const dictHandleRef = useRef<{ stop: () => void } | null>(null);
  const micHandleRef = useRef<MicSessionHandle | null>(null);
  const paceTimerRef = useRef<any>(null);
  const boundaryTriggeredRef = useRef(false);
  const runIdRef = useRef(0);
  const autoPlayRef = useRef(false);
  const [restartTick, setRestartTick] = useState(0);
  const [autoPlay, setAutoPlayState] = useState(false);
  const setAutoPlay = (v: boolean) => {
    autoPlayRef.current = v;
    setAutoPlayState(v);
  };

  const currentSegment: PackSegment = filteredSegments[segIndex] || filteredSegments[0];
  const nextSegment: PackSegment | undefined = filteredSegments[segIndex + 1];
  const templateLabels = TEMPLATE_LABELS[pack.template] || [];
  const labelNamesVi = TEMPLATE_META[pack.template]?.labelNamesVi || {};

  // Build weighted pace timeline for current segment
  const timeline = useMemo(() => {
    if (!currentSegment) return { tokens: [], totalDurationMs: 0 };
    return buildKaraokeTimeline(
      currentSegment.en,
      currentSegment.keywords,
      settings.targetWpm || 120,
      settings.ttsRate || 1
    );
  }, [currentSegment, settings.targetWpm, settings.ttsRate]);

  // Reset segment index when pack or tier changes
  useEffect(() => {
    setAutoPlay(false);
    stopAllPlaybackAndMic();
    setSegIndex(0);
    setActiveWordIdx(-1);
    setAlignmentResult(null);
    setSpokenTranscript('');
    setFreeFinished(false);
    setShowFreeHints(false);
    setActiveFollowupIdx(null);
    idbGetRecordingsForPack(pack.id).then(setSavedRecordings);
  }, [pack.id, tier]);

  // Stop playback when switching mode
  useEffect(() => {
    setAutoPlay(false);
    stopAllPlaybackAndMic();
    setAlignmentResult(null);
    setSpokenTranscript('');
    setFreeFinished(false);
  }, [mode]);

  // Auto-play: when the main segment changes while auto-play is on, start the new one
  useEffect(() => {
    if (!autoPlayRef.current || mode !== 'listen') return;
    const t = setTimeout(() => {
      if (autoPlayRef.current) startKaraokeSegment();
    }, 450);
    return () => clearTimeout(t);
  }, [segIndex, restartTick]);

  // Unmount cleanup
  useEffect(() => () => {
    autoPlayRef.current = false;
    stopAllPlaybackAndMic();
  }, []);

  const pauseAutoPlay = () => {
    setAutoPlay(false);
    stopAllPlaybackAndMic();
  };

  const restartFromBeginning = () => {
    stopAllPlaybackAndMic();
    setAlignmentResult(null);
    setSpokenTranscript('');
    setActiveWordIdx(-1);
    setAutoPlay(mode === 'listen');
    if (mode === 'listen' && !musicController.getState().isPlaying) {
      musicController.start(undefined, settings.musicVolume);
    }
    setSegIndex(0);
    setRestartTick((t) => t + 1);
  };

  const togglePlayback = () => {
    if (isPlaying || autoPlayRef.current) {
      pauseAutoPlay();
    } else {
      if (mode === 'listen') setAutoPlay(true);
      // Start background music on first user gesture (browser autoplay policy)
      if (!musicController.getState().isPlaying) {
        musicController.start(undefined, settings.musicVolume);
      }
      startKaraokeSegment();
    }
  };

  // Free mode elapsed timer
  useEffect(() => {
    if (mode !== 'free' || !isRecording) return;
    const t = setInterval(() => {
      setFreeTimerSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [mode, isRecording]);

  const stopAllPlaybackAndMic = () => {
    setIsPlaying(false);
    if (paceTimerRef.current) {
      clearInterval(paceTimerRef.current);
      paceTimerRef.current = null;
    }
    stopSpeech();
    if (dictHandleRef.current) {
      dictHandleRef.current.stop();
      dictHandleRef.current = null;
    }
    if (micHandleRef.current) {
      micHandleRef.current.stop().catch(() => {});
      micHandleRef.current = null;
    }
    setIsRecording(false);
  };

  // Start karaoke playback for current segment
  const startKaraokeSegment = () => {
    if (!currentSegment) return;
    stopAllPlaybackAndMic();
    const runId = ++runIdRef.current;
    setIsPlaying(true);
    setActiveWordIdx(0);
    boundaryTriggeredRef.current = false;

    const startTime = Date.now();
    paceTimerRef.current = setInterval(() => {
      if (runId !== runIdRef.current) return;
      if (boundaryTriggeredRef.current) return; // Let TTS onboundary drive if active
      const elapsed = Date.now() - startTime;
      const idx = findWordIndexAtTime(timeline.tokens, elapsed);
      setActiveWordIdx(idx);

      if (elapsed >= timeline.totalDurationMs + 250) {
        clearInterval(paceTimerRef.current);
        paceTimerRef.current = null;
        if (!settings.ttsEnabled) {
          handleSegmentPlaybackEnded(runId);
        }
      }
    }, 50);

    if (settings.ttsEnabled) {
      speakSegmentText(currentSegment.en, {
        rate: settings.ttsRate,
        voiceURI: settings.voiceURI,
        onWordBoundary: (charIndex) => {
          if (runId !== runIdRef.current) return;
          boundaryTriggeredRef.current = true;
          const idx = findWordIndexAtChar(timeline.tokens, charIndex);
          if (idx >= 0) setActiveWordIdx(idx);
        },
        onEnd: () => {
          handleSegmentPlaybackEnded(runId);
        }
      });
    }
  };

  const handleSegmentPlaybackEnded = (runId: number) => {
    if (runId !== runIdRef.current) return; // stale (paused / restarted / skipped)
    if (paceTimerRef.current) {
      clearInterval(paceTimerRef.current);
      paceTimerRef.current = null;
    }
    setIsPlaying(false);
    setActiveWordIdx(timeline.tokens.length - 1);

    if (segIndex < filteredSegments.length - 1) {
      // Auto-advance: next segment becomes main, effect above starts it
      if (mode === 'listen' && autoPlayRef.current) {
        setSegIndex((prev) => Math.min(filteredSegments.length - 1, prev + 1));
      }
    } else {
      setAutoPlay(false);
      onSessionComplete({
        mode,
        tier,
        wpm: settings.targetWpm,
        longPauses: 0,
        matchRate: 100
      });
    }
  };

  // Start / Stop Dictation + Mic Recording (for Shadow, Recall, Free)
  const toggleMicSession = async () => {
    if (isRecording) {
      dictHandleRef.current?.stop();
      dictHandleRef.current = null;
      const micResult = await micHandleRef.current?.stop();
      micHandleRef.current = null;
      setIsRecording(false);

      const finalPauses = micResult?.longPauses ?? longPauses;
      setLongPauses(finalPauses);
      if (micResult?.recording) {
        const recs = await idbGetRecordingsForPack(pack.id);
        setSavedRecordings(recs);
      }

      if (mode === 'free') {
        setFreeFinished(true);
        const kwEval = evaluateFreeModeKeywords(spokenTranscript, filteredSegments);
        const totalLabels = Object.keys(kwEval).length || 1;
        const coveredCount = Object.values(kwEval).filter((v) => v.covered).length;
        const matchRate = Math.round((coveredCount / totalLabels) * 100);
        onSessionComplete({
          mode: 'free',
          tier,
          wpm: liveWpm || settings.targetWpm,
          longPauses: finalPauses,
          matchRate
        });
      } else if (currentSegment) {
        const aligned = alignSpokenToTarget(spokenTranscript, currentSegment.en);
        setAlignmentResult(aligned);
        onSessionComplete({
          mode,
          tier,
          wpm: liveWpm || settings.targetWpm,
          longPauses: finalPauses,
          matchRate: aligned.matchRate,
          missedWords: aligned.missedWords
        });
      }
      return;
    }

    // Start new recording + dictation
    stopAllPlaybackAndMic();
    setSpokenTranscript('');
    setAlignmentResult(null);
    setLongPauses(0);
    setLiveWpm(0);
    setFreeTimerSec(0);
    setFreeFinished(false);
    setIsRecording(true);

    micHandleRef.current = await startMicRecorderAndMonitor({
      packId: pack.id,
      segmentId: currentSegment?.id || 'free',
      mode,
      onSpeakingStateChange: (speaking) => {
        musicController.setDucking(speaking);
      },
      onPauseCountChange: (pauses) => {
        setLongPauses(pauses);
      }
    });

    dictHandleRef.current = startContinuousDictation({
      lang: 'en-US',
      onTranscriptUpdate: (transcript, wpm) => {
        setSpokenTranscript(transcript);
        setLiveWpm(wpm);
        if (mode !== 'free' && currentSegment) {
          setAlignmentResult(alignSpokenToTarget(transcript, currentSegment.en));
        }
      }
    });
  };

  // Manual simulation input for environments without microphone / headless QA testing
  const handleSimulatedTranscript = (sampleText: string) => {
    setSpokenTranscript(sampleText);
    setLiveWpm(125);
    if (mode === 'free') {
      setFreeFinished(true);
    } else if (currentSegment) {
      const aligned = alignSpokenToTarget(sampleText, currentSegment.en);
      setAlignmentResult(aligned);
      onSessionComplete({
        mode,
        tier,
        wpm: 125,
        longPauses: 0,
        matchRate: aligned.matchRate,
        missedWords: aligned.missedWords
      });
    }
  };

  // Global keyboard shortcuts (Space, Left/Right, R, N, 1-5)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && (mode === 'listen' || mode === 'shadow')) {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSegIndex((i) => Math.min(filteredSegments.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSegIndex((i) => Math.max(0, i - 1));
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        startKaraokeSegment();
      } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onNextRandomPack();
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const modes: PracticeMode[] = ['listen', 'shadow', 'type', 'recall', 'free'];
        onModeChange(modes[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, isPlaying, filteredSegments.length, segIndex, currentSegment]);

  // Render English words according to mode (Listen, Shadow, Recall R1/R2/R3)
  const renderKaraokeOrRecallWords = () => {
    if (!currentSegment) return null;

    if (mode === 'recall' && recallLevel === 'R3') {
      return (
        <div className="recall-r3-placeholder" data-testid="recall-r3-box">
          <span>🙈 Chế độ R3: Đã ẩn toàn bộ tiếng Anh. Hãy nhìn phụ đề tiếng Việt và nhãn khung để tự nói!</span>
        </div>
      );
    }

    // Track sentence starts for R2 (show only first 3 words of each sentence)
    let wordInSentenceIdx = 0;

    return (
      <div className="karaoke-english-words" data-testid="karaoke-english-words">
        {timeline.tokens.map((tok, idx) => {
          const isCurrentWord = isPlaying && idx === activeWordIdx;
          const isPassedWord = isPlaying && idx < activeWordIdx;

          const currentWordIndexInSentence = wordInSentenceIdx;
          if (/[.!?]$/.test(tok.word)) {
            wordInSentenceIdx = 0;
          } else {
            wordInSentenceIdx += 1;
          }

          let masked = false;
          if (mode === 'recall') {
            if (recallLevel === 'R1' && tok.isKeyword) masked = true;
            if (recallLevel === 'R2' && currentWordIndexInSentence >= 3) masked = true;
          }

          // Check alignment status if dictation result exists
          const alignedWord = alignmentResult?.words[idx];
          const alignClass = alignedWord ? `align-${alignedWord.status}` : '';

          return (
            <span
              key={`${currentSegment.id}-w-${idx}`}
              className={`karaoke-word ${isCurrentWord ? 'active-word' : ''} ${
                isPassedWord ? 'passed-word' : ''
              } ${tok.isKeyword ? 'keyword-token' : ''} ${masked ? 'masked-word' : ''} ${alignClass}`}
            >
              {masked ? '••••' : tok.word}{' '}
            </span>
          );
        })}
      </div>
    );
  };

  const freeKeywordEval = useMemo(() => {
    return evaluateFreeModeKeywords(spokenTranscript, filteredSegments);
  }, [spokenTranscript, filteredSegments]);

  return (
    <section className={`practice-stage template-${pack.template}`} data-testid="practice-stage">
      {/* Top Question & Tier/Mode Bar */}
      <div className="question-banner">
        <div className="question-meta-row">
          <span className={`template-pill pill-${pack.template}`}>
            {TEMPLATE_META[pack.template]?.titleVi || pack.template}
          </span>
          <span className="topic-pill">#{pack.topic}</span>
          <span className="level-pill">{pack.level.toUpperCase()}</span>
          <div className="tier-selector" role="group" aria-label="Chọn tầng độ dài">
            {([1, 2, 3] as TierType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`tier-btn ${tier === t ? 'active' : ''}`}
                onClick={() => onTierChange(t)}
                data-testid={`tier-btn-${t}`}
              >
                {t === 1 ? 'T1 Headline (~30s)' : t === 2 ? 'T2 Full (~90s)' : 'T3 Deep (~3m)'}
              </button>
            ))}
          </div>
        </div>

        <h1 className="question-en" data-testid="question-en">{pack.question.en}</h1>
        <p className="question-vi" data-testid="question-vi">{pack.question.vi}</p>
      </div>

      {/* 5-Mode Loop Switcher */}
      <div className="mode-tabs" role="tablist" aria-label="Chế độ luyện tập">
        {(
          [
            { id: 'listen', icon: '🎧', label: '1. Listen' },
            { id: 'shadow', icon: '🗣️', label: '2. Shadow' },
            { id: 'type', icon: '⌨️', label: '3. Type' },
            { id: 'recall', icon: '🧠', label: '4. Recall' },
            { id: 'free', icon: '🔥', label: '5. Free' }
          ] as { id: PracticeMode; icon: string; label: string }[]
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`mode-tab-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => onModeChange(m.id)}
            data-testid={`mode-tab-${m.id}`}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Template Label Progress Stepper */}
      <div className="template-stepper" aria-label="Tiến trình nhãn câu trả lời" data-testid="template-stepper">
        {templateLabels.map((lbl, idx) => {
          const isCurrentLabel = currentSegment?.label === lbl;
          const hasSegInTier = filteredSegments.some((s) => s.label === lbl);
          const firstSegIdx = filteredSegments.findIndex((s) => s.label === lbl);

          return (
            <button
              key={lbl}
              type="button"
              disabled={!hasSegInTier}
              className={`step-pill ${isCurrentLabel ? 'active' : ''} ${!hasSegInTier ? 'disabled' : ''}`}
              onClick={() => {
                if (firstSegIdx >= 0) setSegIndex(firstSegIdx);
              }}
            >
              <span className="step-num">{idx + 1}</span>
              <span className="step-name">{lbl}</span>
              <span className="step-vi">{labelNamesVi[lbl] || lbl}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Split: Stage + Flow Diagram */}
      <div className="stage-main-grid">
        <div className="stage-primary-column">
          {/* MODE 3: TYPE */}
          {mode === 'type' && currentSegment && (
            <TypingBlock
              segment={currentSegment}
              enableVirtualKeyboard={settings.enableVirtualKeyboard}
              onToggleVirtualKeyboard={() =>
                onUpdateSettings({ enableVirtualKeyboard: !settings.enableVirtualKeyboard })
              }
              onPlayTts={() => startKaraokeSegment()}
              onComplete={(metrics) => {
                onSessionComplete({
                  mode: 'type',
                  tier,
                  wpm: metrics.wpm,
                  longPauses: 0,
                  matchRate: metrics.accuracy
                });
                if (segIndex < filteredSegments.length - 1) {
                  setSegIndex((s) => s + 1);
                }
              }}
            />
          )}

          {/* MODE 5: FREE (Unassisted Interview Mode) */}
          {mode === 'free' && (
            <div className="free-stage-card" data-testid="free-stage-card">
              <div className="free-header-row">
                <div className="free-timer-badge">
                  ⏱️ Thời gian: <strong>{freeTimerSec}s</strong> | Tốc độ:{' '}
                  <strong>{liveWpm} WPM</strong> | Ngập ngừng (&gt;1.5s):{' '}
                  <strong>{longPauses}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowFreeHints((v) => !v)}
                  data-testid="toggle-free-hints-btn"
                >
                  {showFreeHints ? '🙈 Ẩn gợi ý' : '💡 Xem gợi ý'}
                </button>
              </div>

              {showFreeHints && (
                <div className="free-hints-box" data-testid="free-hints-box">
                  <p>
                    <strong>Câu mở đầu gợi ý:</strong> "{TEMPLATE_META[pack.template].openerEn}"
                  </p>
                  <div className="free-keywords-hint-grid">
                    {filteredSegments.map((seg) => (
                      <div key={seg.id} className="free-hint-item">
                        <span className="badge-label">{seg.label}</span>:{' '}
                        {(seg.keywords || []).join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="free-action-row">
                <button
                  type="button"
                  className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
                  onClick={toggleMicSession}
                  data-testid="free-mic-btn"
                >
                  {isRecording ? '⏹ Dừng trả lời & Chấm điểm' : '🎙️ Bắt đầu trả lời tự do'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    handleSimulatedTranscript(filteredSegments.map((s) => s.en).join(' '))
                  }
                  data-testid="simulate-speech-btn"
                >
                  ⚡ Giả lập đọc mẫu (Test nhanh)
                </button>
              </div>

              {/* Checklist & Keyword Evaluation after Free response */}
              {(freeFinished || spokenTranscript) && (
                <div className="free-evaluation-panel" data-testid="free-evaluation-panel">
                  <h3>📊 Đối chiếu Khung trả lời & Keywords</h3>
                  <div className="free-checklist-grid">
                    {templateLabels.map((lbl) => {
                      const res = freeKeywordEval[lbl];
                      if (!res) return null;
                      const checked = Boolean(selfCheckedLabels[lbl] || res.covered);
                      return (
                        <div key={lbl} className={`free-check-row ${checked ? 'covered' : ''}`}>
                          <label className="free-check-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e: any) =>
                                setSelfCheckedLabels((prev) => ({
                                  ...prev,
                                  [lbl]: e.target.checked
                                }))
                              }
                            />
                            <strong>{lbl.toUpperCase()}</strong> ({labelNamesVi[lbl]})
                          </label>
                          <div className="free-kw-chips">
                            {res.matchedKeywords.map((kw) => (
                              <span key={kw} className="kw-chip matched">
                                ✓ {kw}
                              </span>
                            ))}
                            {res.missedKeywords.map((kw) => (
                              <span key={kw} className="kw-chip missed">
                                ○ {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <details className="sample-answer-accordion" open>
                    <summary>📖 Xem toàn bộ câu trả lời mẫu để đối chiếu</summary>
                    <div className="sample-segments-list">
                      {filteredSegments.map((seg) => (
                        <div key={seg.id} className="sample-seg-row">
                          <span className="badge-label">{seg.label}</span>
                          <p className="sample-en">{seg.en}</p>
                          <p className="sample-vi">{seg.vi}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* MODES 1, 2, 4: LISTEN, SHADOW, RECALL */}
          {(mode === 'listen' || mode === 'shadow' || mode === 'recall') && currentSegment && (
            <div className="karaoke-stage-card" data-testid="karaoke-stage-card">
              <div className="segment-header-bar">
                <div className="segment-badge-group">
                  <span className="badge-label">{currentSegment.label.toUpperCase()}</span>
                  <span className="segment-counter">
                    Segment {segIndex + 1} / {filteredSegments.length} (Tier {currentSegment.tier})
                  </span>
                </div>

                {mode === 'recall' && (
                  <div className="recall-level-switcher" role="group" aria-label="Mức độ che chữ">
                    {(['R1', 'R2', 'R3'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        className={`btn btn-sm ${recallLevel === lvl ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setRecallLevel(lvl)}
                        data-testid={`recall-btn-${lvl}`}
                      >
                        {lvl === 'R1'
                          ? 'R1: Che Keywords'
                          : lvl === 'R2'
                          ? 'R2: 3 từ đầu'
                          : 'R3: Chỉ hiện Việt'}
                      </button>
                    ))}
                  </div>
                )}

                <div className="speed-control-group">
                  {([0.75, 1, 1.25] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`speed-btn ${settings.ttsRate === r ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ ttsRate: r })}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Karaoke English Line */}
              {renderKaraokeOrRecallWords()}

              {/* Vietnamese Subtitle (always visible per requirement) */}
              <div className="karaoke-vietnamese-sub" data-testid="karaoke-vietnamese-sub">
                {currentSegment.vi}
              </div>

              {/* Keywords Bar */}
              <div className="segment-keywords-bar">
                <span className="kw-title">Keywords:</span>
                {(currentSegment.keywords || []).map((kw) => (
                  <span key={kw} className="kw-chip">
                    {mode === 'recall' && recallLevel !== 'R2' ? '•••' : kw}
                  </span>
                ))}
              </div>

              {/* Up-next preview (dimmed) */}
              {(mode === 'listen' || mode === 'shadow') && (
                <div className="next-segment-preview" data-testid="next-segment-preview">
                  <span className="next-seg-title">
                    {nextSegment ? `Tiếp theo · ${nextSegment.label.toUpperCase()}` : 'Segment cuối'}
                  </span>
                  {nextSegment && (
                    <div key={nextSegment.id} className="next-seg-body">
                      <p className="next-seg-en">{nextSegment.en}</p>
                      <p className="next-seg-vi">{nextSegment.vi}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Controls Bar */}
              <div className="stage-controls-bar">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={restartFromBeginning}
                  title="Phát lại câu phỏng vấn từ segment đầu tiên"
                  data-testid="restart-pack-btn"
                >
                  ⏮ Từ đầu
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={segIndex === 0}
                  onClick={() => setSegIndex((i) => Math.max(0, i - 1))}
                  data-testid="prev-seg-btn"
                >
                  ← Trước
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={togglePlayback}
                  data-testid="play-karaoke-btn"
                >
                  {isPlaying || autoPlay ? '⏸ Tạm dừng (Space)' : '▶️ Phát Karaoke (Space)'}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => startKaraokeSegment()}
                  title="Lặp lại segment này (Phím R)"
                >
                  ↺ Lặp lại (R)
                </button>

                {(mode === 'shadow' || mode === 'recall') && (
                  <>
                    <button
                      type="button"
                      className={`btn ${isRecording ? 'btn-danger' : 'btn-accent'}`}
                      onClick={toggleMicSession}
                      data-testid="dictation-mic-btn"
                    >
                      {isRecording ? '⏹ Dừng nói' : '🎙️ Nói & Chấm từ'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleSimulatedTranscript(currentSegment.en)}
                      data-testid="simulate-segment-speech-btn"
                      title="Giả lập nhận diện giọng nói khớp câu mẫu"
                    >
                      ⚡ Test khớp từ
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={segIndex >= filteredSegments.length - 1}
                  onClick={() =>
                    setSegIndex((i) => Math.min(filteredSegments.length - 1, i + 1))
                  }
                  data-testid="next-seg-btn"
                >
                  Tiếp →
                </button>
              </div>

              {/* Dictation Word Alignment Feedback */}
              {alignmentResult && (
                <div className="dictation-feedback-box" data-testid="dictation-feedback-box">
                  <div className="dictation-metrics-row">
                    <span>
                      🎯 Độ khớp: <strong>{alignmentResult.matchRate}%</strong>
                    </span>
                    <span>
                      ⚡ Tốc độ: <strong>{liveWpm || settings.targetWpm} WPM</strong>
                    </span>
                    <span>
                      ⏸ Ngập ngừng (&gt;1.5s): <strong>{longPauses}</strong>
                    </span>
                  </div>
                  <div className="aligned-words-row">
                    {alignmentResult.words.map((w, i) => (
                      <span
                        key={i}
                        className={`aligned-word-pill status-${w.status}`}
                        title={
                          w.status === 'exact'
                            ? 'Đúng chính xác'
                            : w.status === 'near'
                            ? `Gần đúng (${w.spokenEquivalent || ''})`
                            : 'Bỏ sót / Chưa khớp'
                        }
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Template-Specific Compare 2-Column Summary or Experience STAR Summary */}
          {pack.template === 'compare' && (
            <div className="compare-columns-card" data-testid="compare-columns-card">
              <div className="compare-col">
                <h4>🅰️ Khi nào chọn A (choose_a)</h4>
                {pack.segments
                  .filter((s) => s.label === 'choose_a')
                  .map((s) => (
                    <p key={s.id}>{s.en}</p>
                  ))}
              </div>
              <div className="compare-col">
                <h4>🅱️ Khi nào chọn B (choose_b)</h4>
                {pack.segments
                  .filter((s) => s.label === 'choose_b')
                  .map((s) => (
                    <p key={s.id}>{s.en}</p>
                  ))}
              </div>
            </div>
          )}

          {/* Follow-up Ladder */}
          {pack.followups && pack.followups.length > 0 && (
            <div className="followup-ladder-card" data-testid="followup-ladder">
              <div className="followup-header">
                <h3>🪜 Câu hỏi xoáy thêm (Follow-up Ladder)</h3>
                <span className="followup-count">{pack.followups.length} câu hỏi phụ</span>
              </div>
              <div className="followup-list">
                {pack.followups.map((fu, idx) => {
                  const isOpen = activeFollowupIdx === idx;
                  return (
                    <div key={idx} className="followup-item">
                      <button
                        type="button"
                        className="followup-q-btn"
                        onClick={() => setActiveFollowupIdx(isOpen ? null : idx)}
                      >
                        <span>
                          <strong>Q{idx + 1}:</strong> {fu.question.en}
                        </span>
                        <span className="followup-q-vi">{fu.question.vi}</span>
                      </button>
                      {isOpen && (
                        <div className="followup-a-box">
                          <p className="followup-a-en">{fu.answer.en}</p>
                          <p className="followup-a-vi">{fu.answer.vi}</p>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() =>
                              speakSegmentText(fu.answer.en, {
                                rate: settings.ttsRate,
                                voiceURI: settings.voiceURI
                              })
                            }
                          >
                            🔊 Nghe câu trả lời phụ
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Local Recordings Playback */}
          {savedRecordings.length > 0 && (
            <div className="recordings-card">
              <h4>🎙️ Bản ghi âm gần đây ({savedRecordings.length}/20 lưu cục bộ IndexedDB)</h4>
              <div className="recordings-list">
                {savedRecordings.slice(0, 3).map((rec) => {
                  const url = URL.createObjectURL(rec.blob);
                  return (
                    <div key={rec.id} className="recording-item">
                      <span>
                        {rec.mode.toUpperCase()} — #{rec.segmentId}
                      </span>
                      <audio controls src={url} preload="none" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Next Random Pack Bar */}
          <div className="next-random-footer">
            <span className="shortcut-hint">
              Phím tắt: <kbd>Space</kbd> Phát/Dừng · <kbd>←</kbd>/<kbd>→</kbd> Segment ·{' '}
              <kbd>1</kbd>–<kbd>5</kbd> Đổi chế độ · <kbd>N</kbd> Bài ngẫu nhiên kế tiếp
            </span>
            <button
              type="button"
              className="btn btn-primary btn-next-random"
              onClick={onNextRandomPack}
              data-testid="next-random-btn"
            >
              🎲 Tiếp theo (Random Pack — Phím N) ➔
            </button>
          </div>
        </div>

        {/* Right / Bottom Column: Flow Diagram */}
        <FlowDiagram
          template={pack.template}
          flow={pack.flow}
          activeSegmentId={currentSegment?.id || ''}
          activeLabel={currentSegment?.label || ''}
          hiddenInFreeMode={mode === 'free' && !showFreeHints}
          onSelectSegment={(segId) => {
            const idx = filteredSegments.findIndex((s) => s.id === segId);
            if (idx >= 0) setSegIndex(idx);
          }}
        />
      </div>
    </section>
  );
}

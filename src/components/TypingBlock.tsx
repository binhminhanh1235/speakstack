import { useEffect, useRef, useState } from 'preact/hooks';
import { PackSegment } from '../../shared/schema';

interface TypingBlockProps {
  segment: PackSegment;
  enableVirtualKeyboard: boolean;
  onToggleVirtualKeyboard: () => void;
  onComplete: (metrics: { wpm: number; accuracy: number; errorCount: number }) => void;
  onPlayTts: () => void;
}

export function checkIsSmallScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth <= 768 ||
    Boolean(window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
  );
}

export function TypingBlock({
  segment,
  enableVirtualKeyboard,
  onToggleVirtualKeyboard,
  onComplete,
  onPlayTts
}: TypingBlockProps) {
  const target = segment.en || '';
  const [cursor, setCursor] = useState(0);
  const [statuses, setStatuses] = useState<('untyped' | 'correct' | 'error')[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(() => checkIsSmallScreen());

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);

  // Reset state when segment changes
  useEffect(() => {
    setCursor(0);
    setStatuses(new Array(target.length).fill('untyped'));
    setErrorCount(0);
    setTotalKeystrokes(0);
    setStartTime(null);
    setIsComplete(false);
    isComposingRef.current = false;

    const shouldFocus = !checkIsSmallScreen() || enableVirtualKeyboard;
    if (shouldFocus) {
      setTimeout(() => {
        try {
          inputRef.current?.focus({ preventScroll: true });
        } catch {
          inputRef.current?.focus();
        }
      }, 40);
    }
  }, [segment.id, target, enableVirtualKeyboard]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsSmallScreen(checkIsSmallScreen());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // VisualViewport adaptation for mobile keyboard
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewport = () => {
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${window.visualViewport!.height}px`
      );
    };
    window.visualViewport.addEventListener('resize', handleViewport);
    handleViewport();
    return () => window.visualViewport?.removeEventListener('resize', handleViewport);
  }, []);

  const processCharInput = (char: string) => {
    if (isComplete || !char) return;

    setCursor((prevCursor) => {
      if (prevCursor >= target.length) return prevCursor;
      const now = Date.now();
      if (!startTime) setStartTime(now);

      let nextCursor = prevCursor;
      const expectedChar = target[nextCursor];
      const isMatch = char.toLowerCase() === expectedChar.toLowerCase();

      setStatuses((prevStatuses) => {
        const copy = [...prevStatuses];
        copy[nextCursor] = isMatch ? 'correct' : 'error';
        // Auto-skip trailing punctuation if next character is punctuation
        let scan = nextCursor + 1;
        while (scan < target.length && /^[.,;!?:'"-]$/.test(target[scan])) {
          copy[scan] = 'correct';
          scan++;
        }
        return copy;
      });

      if (!isMatch) {
        setErrorCount((e) => e + 1);
      }
      setTotalKeystrokes((k) => k + 1);

      nextCursor += 1;
      while (nextCursor < target.length && /^[.,;!?:'"-]$/.test(target[nextCursor])) {
        nextCursor += 1;
      }

      if (nextCursor >= target.length) {
        setIsComplete(true);
        const elapsedMin = Math.max(0.02, (now - (startTime || now - 3000)) / 60000);
        const wpm = Math.max(15, Math.round(target.length / 5 / elapsedMin));
        const total = Math.max(1, totalKeystrokes + 1);
        const acc = Math.max(0, Math.min(100, Math.round(((total - errorCount) / total) * 100)));
        setTimeout(() => {
          onComplete({ wpm, accuracy: acc, errorCount });
        }, 80);
      }

      return nextCursor;
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cursor > 0 && !isComplete) {
        const prev = cursor - 1;
        setCursor(prev);
        setStatuses((s) => {
          const copy = [...s];
          copy[prev] = 'untyped';
          return copy;
        });
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      setCursor(0);
      setStatuses(new Array(target.length).fill('untyped'));
      setIsComplete(false);
    }
  };

  const handleInput = (e: any) => {
    const val: string = e.target.value || '';
    e.target.value = '';
    if (isComposingRef.current || !val) return;
    for (const ch of val) {
      processCharInput(ch);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: any) => {
    isComposingRef.current = false;
    const val: string = e.data || '';
    if (e.target) e.target.value = '';
    for (const ch of val) {
      processCharInput(ch);
    }
  };

  return (
    <div
      className="typing-stage-box"
      onClick={() => {
        if (!isSmallScreen || enableVirtualKeyboard) {
          inputRef.current?.focus();
        }
      }}
      data-testid="typing-block"
    >
      <input
        ref={inputRef}
        type="text"
        className="hidden-typing-input"
        aria-label="Ô nhập gõ phím câu trả lời tiếng Anh"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellcheck={false}
        inputMode={isSmallScreen && !enableVirtualKeyboard ? 'none' : 'text'}
        onKeyDown={handleKeyDown as any}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />

      <div className="typing-toolbar">
        <span className="typing-hint">
          ⌨️ Gõ lại câu tiếng Anh bên dưới để thuộc cấu trúc & từ nối (Dấu câu tự động nhảy qua)
        </span>
        <div className="typing-toolbar-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onPlayTts();
            }}
          >
            🔊 Nghe mẫu
          </button>
          {isSmallScreen && (
            <button
              type="button"
              className={`btn btn-sm ${enableVirtualKeyboard ? 'btn-primary' : 'btn-secondary'}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVirtualKeyboard();
              }}
            >
              ⌨️ {enableVirtualKeyboard ? 'Tắt phím ảo' : 'Bật phím ảo'}
            </button>
          )}
        </div>
      </div>

      <div className="typing-english-line" data-testid="typing-english-line">
        {target.split('').map((ch, idx) => {
          const st = statuses[idx] || 'untyped';
          const isCurrent = idx === cursor && !isComplete;
          return (
            <span
              key={`${segment.id}-${idx}`}
              className={`typing-char status-${st} ${isCurrent ? 'cursor-here' : ''}`}
            >
              {ch}
            </span>
          );
        })}
      </div>

      <div className="typing-vietnamese-sub">{segment.vi}</div>

      <div className="typing-Keywords-row">
        <span className="kw-title">Keywords cần nhớ:</span>
        {(segment.keywords || []).map((kw) => (
          <span key={kw} className="kw-chip">
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

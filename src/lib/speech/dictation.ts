import { stopSpeech } from './tts';

export type WordMatchStatus = 'exact' | 'near' | 'missed';

export interface AlignedWordResult {
  word: string;
  cleanWord: string;
  status: WordMatchStatus;
  spokenEquivalent?: string;
}

export interface DictationAlignmentResult {
  words: AlignedWordResult[];
  matchRate: number;
  exactCount: number;
  nearCount: number;
  missedWords: string[];
}

const NUMBER_MAP: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '5': 'five',
  '10': 'ten',
  '20': 'twenty',
  '24': 'twentyfour',
  '30': 'thirty',
  '50': 'fifty',
  '80': 'eighty',
  '100': 'onehundred',
  '200': 'twohundred',
  '500': 'fivehundred',
  '3000': 'threethousand',
  '100000': 'onehundredthousand'
};

const CONTRACTION_MAP: Record<string, string> = {
  "i'd": 'i would',
  "i'll": 'i will',
  "i'm": 'i am',
  "i've": 'i have',
  "it's": 'it is',
  "that's": 'that is',
  "don't": 'do not',
  "doesn't": 'does not',
  "can't": 'cannot',
  "won't": 'will not',
  'twenty-four': 'twentyfour',
  'trade-off': 'tradeoff',
  'fail-open': 'failopen',
  'fail-closed': 'failclosed',
  'high-level': 'highlevel',
  'io-heavy': 'ioheavy',
  'cpu-bound': 'cpubound',
  'one-to-one': 'onetoone'
};

export function normalizeWordToken(raw: string): string {
  let s = (raw || '').toLowerCase().trim();
  if (CONTRACTION_MAP[s]) s = CONTRACTION_MAP[s];
  s = s.replace(/^[^\w]+|[^\w]+$/g, '');
  s = s.replace(/-/g, '');
  if (NUMBER_MAP[s]) return NUMBER_MAP[s];
  return s;
}

/**
 * Simple phonetic skeleton for technical terms (idempotency, kafka, redis, hikaricp, quorum, postgres...)
 */
export function phoneticCode(word: string): string {
  const clean = normalizeWordToken(word);
  if (!clean) return '';
  return clean
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/[aeiouy]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function scoreWordSimilarity(targetRaw: string, spokenRaw: string): WordMatchStatus {
  const t = normalizeWordToken(targetRaw);
  const s = normalizeWordToken(spokenRaw);
  if (!t || !s) return 'missed';
  if (t === s) return 'exact';

  // Stem match for plurals / verb endings
  if (t.length >= 4 && s.length >= 4 && (t.startsWith(s) || s.startsWith(t)) && Math.abs(t.length - s.length) <= 2) {
    return 'near';
  }

  const dist = levenshteinDistance(t, s);
  const maxLen = Math.max(t.length, s.length);
  const similarity = 1 - dist / maxLen;

  if (similarity >= 0.8) return 'near';

  // Phonetic check for longer technical terms
  if (t.length >= 5 && s.length >= 4) {
    const pt = phoneticCode(t);
    const ps = phoneticCode(s);
    if (pt && ps && (pt === ps || levenshteinDistance(pt, ps) <= 1)) {
      return 'near';
    }
  }

  return 'missed';
}

/**
 * Align spoken transcript against target sentence using sliding window + fuzzy/phonetic matching
 */
export function alignSpokenToTarget(transcript: string, targetText: string): DictationAlignmentResult {
  const targetTokens = (targetText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (targetTokens.length === 0) {
    return { words: [], matchRate: 100, exactCount: 0, nearCount: 0, missedWords: [] };
  }

  // Expand contractions in transcript
  let expandedTranscript = (transcript || '').toLowerCase();
  for (const [k, v] of Object.entries(CONTRACTION_MAP)) {
    expandedTranscript = expandedTranscript.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  }
  const spokenTokens = expandedTranscript
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const usedSpoken = new Set<number>();
  const words: AlignedWordResult[] = [];
  let exactCount = 0;
  let nearCount = 0;
  const missedWords: string[] = [];

  let searchCursor = 0;

  for (let i = 0; i < targetTokens.length; i++) {
    const rawTarget = targetTokens[i];
    const cleanTarget = normalizeWordToken(rawTarget);

    let bestStatus: WordMatchStatus = 'missed';
    let bestSpokenIdx = -1;

    const windowStart = Math.max(0, searchCursor - 3);
    const windowEnd = Math.min(spokenTokens.length - 1, searchCursor + 8);

    for (let j = windowStart; j <= windowEnd; j++) {
      if (usedSpoken.has(j)) continue;
      const st = scoreWordSimilarity(rawTarget, spokenTokens[j]);
      if (st === 'exact') {
        bestStatus = 'exact';
        bestSpokenIdx = j;
        break;
      } else if (st === 'near' && bestStatus === 'missed') {
        bestStatus = 'near';
        bestSpokenIdx = j;
      }
    }

    // Fallback global scan if not found in local window
    if (bestStatus === 'missed') {
      for (let j = 0; j < spokenTokens.length; j++) {
        if (usedSpoken.has(j)) continue;
        const st = scoreWordSimilarity(rawTarget, spokenTokens[j]);
        if (st === 'exact' || st === 'near') {
          bestStatus = st;
          bestSpokenIdx = j;
          break;
        }
      }
    }

    if (bestSpokenIdx >= 0) {
      usedSpoken.add(bestSpokenIdx);
      searchCursor = bestSpokenIdx + 1;
    }

    if (bestStatus === 'exact') exactCount++;
    else if (bestStatus === 'near') nearCount++;
    else if (cleanTarget.length >= 3) missedWords.push(cleanTarget);

    words.push({
      word: rawTarget,
      cleanWord: cleanTarget,
      status: bestStatus,
      spokenEquivalent: bestSpokenIdx >= 0 ? spokenTokens[bestSpokenIdx] : undefined
    });
  }

  const totalScore = exactCount + nearCount * 0.85;
  const matchRate = Math.min(100, Math.round((totalScore / targetTokens.length) * 100));

  return {
    words,
    matchRate,
    exactCount,
    nearCount,
    missedWords
  };
}

/**
 * Evaluate Free-mode spoken transcript against pack keywords per label
 */
export function evaluateFreeModeKeywords(
  transcript: string,
  segments: { id: string; label: string; keywords: string[] }[]
) {
  const lowerSpoken = (transcript || '').toLowerCase();
  const spokenWords = lowerSpoken.split(/\s+/).filter(Boolean);

  const labelResults: Record<
    string,
    {
      covered: boolean;
      matchedKeywords: string[];
      missedKeywords: string[];
    }
  > = {};

  for (const seg of segments) {
    if (!labelResults[seg.label]) {
      labelResults[seg.label] = {
        covered: false,
        matchedKeywords: [],
        missedKeywords: []
      };
    }
    const entry = labelResults[seg.label];

    for (const kw of seg.keywords || []) {
      const cleanKw = kw.toLowerCase().trim();
      if (!cleanKw) continue;

      let matched = lowerSpoken.includes(cleanKw);
      if (!matched) {
        // Check fuzzy match per word in keyword phrase
        const kwParts = cleanKw.split(/\s+/).filter(Boolean);
        matched = kwParts.every((part) =>
          spokenWords.some((sw) => scoreWordSimilarity(part, sw) !== 'missed')
        );
      }

      if (matched) {
        if (!entry.matchedKeywords.includes(kw)) entry.matchedKeywords.push(kw);
        entry.covered = true;
      } else {
        if (!entry.missedKeywords.includes(kw)) entry.missedKeywords.push(kw);
      }
    }
  }

  return labelResults;
}

// ---------------------------------------------------------------------------
// Continuous Mobile-Resilient SpeechRecognition Wrapper
// ---------------------------------------------------------------------------
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function startContinuousDictation(options: {
  lang?: string;
  onTranscriptUpdate: (fullTranscript: string, wpm: number) => void;
  onError?: (err: string) => void;
}) {
  // Always cancel TTS first to prevent mobile audio/mic hardware conflict
  stopSpeech();

  const SR =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  if (!SR) {
    options.onError?.('Trình duyệt không hỗ trợ Web Speech Recognition.');
    return { stop: () => {} };
  }

  let shouldKeepListening = true;
  let accumulatedFinal = '';
  const startTime = Date.now();
  let recognition: any = null;

  const computeWpm = (text: string) => {
    const wc = text.trim().split(/\s+/).filter(Boolean).length;
    const elapsedMin = Math.max(0.05, (Date.now() - startTime) / 60000);
    return Math.round(wc / elapsedMin);
  };

  const launchInstance = () => {
    if (!shouldKeepListening) return;
    try {
      recognition = new SR();
      recognition.lang = options.lang || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            accumulatedFinal += ' ' + res[0].transcript;
          } else {
            interim += ' ' + res[0].transcript;
          }
        }
        const combined = (accumulatedFinal + ' ' + interim).trim();
        options.onTranscriptUpdate(combined, computeWpm(combined));
      };

      recognition.onerror = (event: any) => {
        if (event.error && event.error !== 'no-speech' && event.error !== 'aborted') {
          options.onError?.(event.error);
        }
      };

      recognition.onend = () => {
        // Mobile browsers auto-close SpeechRecognition after a pause; auto-restart seamlessly
        if (shouldKeepListening) {
          setTimeout(() => {
            if (shouldKeepListening) launchInstance();
          }, 180);
        }
      };

      recognition.start();
    } catch {}
  };

  launchInstance();

  return {
    stop: () => {
      shouldKeepListening = false;
      try {
        recognition?.stop();
      } catch {}
    }
  };
}

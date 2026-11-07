export interface KaraokeWordToken {
  index: number;
  word: string;
  cleanWord: string;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  isKeyword: boolean;
}

/**
 * Compute weighted pace timing for each word in a segment.
 * Base speed = targetWpm * rateMultiplier.
 * Longer words and punctuation get proportional extra duration for natural speech rhythm.
 */
export function buildKaraokeTimeline(
  text: string,
  keywords: string[] = [],
  targetWpm = 120,
  rateMultiplier = 1.0
): { tokens: KaraokeWordToken[]; totalDurationMs: number } {
  if (!text || !text.trim()) {
    return { tokens: [], totalDurationMs: 0 };
  }

  const effectiveWpm = Math.max(40, targetWpm * rateMultiplier);
  const baseWordMs = 60000 / effectiveWpm;

  const rawTokens: { word: string; charStart: number; charEnd: number }[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    rawTokens.push({
      word: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length
    });
  }

  const lowerText = text.toLowerCase();
  const keywordRanges: [number, number][] = [];
  for (const kw of keywords || []) {
    const cleanKw = kw.toLowerCase().trim();
    if (!cleanKw) continue;
    let pos = 0;
    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(cleanKw, pos);
      if (idx === -1) break;
      keywordRanges.push([idx, idx + cleanKw.length]);
      pos = idx + cleanKw.length;
    }
  }

  let currentMs = 0;
  const tokens: KaraokeWordToken[] = rawTokens.map((rt, index) => {
    const cleanWord = rt.word.replace(/^[^\w]+|[^\w]+$/g, '');
    // Weight based on word length and trailing punctuation
    let weight = 0.75 + Math.min(cleanWord.length, 12) * 0.05;
    if (/[,;:]$/.test(rt.word)) weight += 0.35;
    if (/[.!?]$/.test(rt.word)) weight += 0.65;

    const durationMs = Math.round(baseWordMs * weight);
    const startMs = currentMs;
    const endMs = currentMs + durationMs;
    currentMs = endMs;

    const isKeyword = keywordRanges.some(
      ([kStart, kEnd]) => rt.charStart < kEnd && rt.charEnd > kStart
    );

    return {
      index,
      word: rt.word,
      cleanWord,
      charStart: rt.charStart,
      charEnd: rt.charEnd,
      startMs,
      endMs,
      durationMs,
      isKeyword
    };
  });

  return {
    tokens,
    totalDurationMs: currentMs
  };
}

export function findWordIndexAtChar(tokens: KaraokeWordToken[], charIndex: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (charIndex >= tokens[i].charStart && charIndex <= tokens[i].charEnd + 1) {
      return i;
    }
  }
  return -1;
}

export function findWordIndexAtTime(tokens: KaraokeWordToken[], elapsedMs: number): number {
  if (tokens.length === 0) return -1;
  for (let i = 0; i < tokens.length; i++) {
    if (elapsedMs >= tokens[i].startMs && elapsedMs < tokens[i].endMs) {
      return i;
    }
  }
  return elapsedMs >= tokens[tokens.length - 1].endMs ? tokens.length - 1 : 0;
}

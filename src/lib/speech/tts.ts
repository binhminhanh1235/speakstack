let cachedVoices: SpeechSynthesisVoice[] = [];
let duckingCallback: ((isActive: boolean) => void) | null = null;

export function registerTtsDuckingHook(cb: (isActive: boolean) => void) {
  duckingCallback = cb;
}

export function getEnglishVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices() || [];
      const enVoices = allVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      const pool = enVoices.length > 0 ? enVoices : allVoices;

      const sorted = [...pool].sort((a, b) => {
        const score = (v: SpeechSynthesisVoice) => {
          const name = (v.name || '').toLowerCase();
          if (name.includes('natural') || name.includes('online')) return 5;
          if (name.includes('ava') || name.includes('samantha') || name.includes('enhanced') || name.includes('premium'))
            return 4;
          if (name.includes('google') || name.includes('siri')) return 3;
          if (v.lang && (v.lang.toLowerCase() === 'en-us' || v.lang.toLowerCase() === 'en-gb')) return 2;
          return 0;
        };
        return score(b) - score(a);
      });

      cachedVoices = sorted;
      resolve(cachedVoices);
    };

    const initial = window.speechSynthesis.getVoices();
    if (initial && initial.length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(loadVoices, 250);
    }
  });
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  getEnglishVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    getEnglishVoices();
  };
}

export function stopSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  duckingCallback?.(false);
}

export async function speakSegmentText(
  text: string,
  options: {
    rate?: number;
    voiceURI?: string;
    onWordBoundary?: (charIndex: number) => void;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    options.onEnd?.();
    return;
  }

  stopSpeech();

  let voices = cachedVoices;
  if (!voices || voices.length === 0) {
    voices = await getEnglishVoices();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = Math.max(0.5, Math.min(2.0, Number(options.rate) || 1.0));

  let selectedVoice: SpeechSynthesisVoice | null = null;
  if (options.voiceURI && voices.length > 0) {
    selectedVoice = voices.find((v) => v.voiceURI === options.voiceURI) || null;
  }
  if (!selectedVoice && voices.length > 0) {
    selectedVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) || voices[0] || null;
  }
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    duckingCallback?.(true);
    options.onStart?.();
  };

  utterance.onboundary = (event: SpeechSynthesisEvent) => {
    if (event.name === 'word' && typeof event.charIndex === 'number') {
      options.onWordBoundary?.(event.charIndex);
    }
  };

  utterance.onend = () => {
    duckingCallback?.(false);
    options.onEnd?.();
  };

  utterance.onerror = () => {
    duckingCallback?.(false);
    options.onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

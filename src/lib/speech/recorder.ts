import { idbSaveRecording, RecordingRecord } from '../storage/idb';

export interface MicSessionHandle {
  stop: () => Promise<{
    longPauses: number;
    recording: RecordingRecord | null;
  }>;
}

/**
 * Starts microphone recording (MediaRecorder) + silence pause detector (>1.5s via AnalyserNode)
 * + notifies ducking callback when user is actively speaking.
 */
export async function startMicRecorderAndMonitor(options: {
  packId: string;
  segmentId: string;
  mode: string;
  silenceThresholdMs?: number;
  onSpeakingStateChange?: (isSpeaking: boolean) => void;
  onPauseCountChange?: (longPauses: number) => void;
}): Promise<MicSessionHandle> {
  const silenceLimit = options.silenceThresholdMs || 1500;
  let longPauses = 0;

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      stop: async () => ({ longPauses: 0, recording: null })
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 1. Web Audio AnalyserNode for speaking detection & >1.5s silence counter
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx: AudioContext | null = AudioCtx ? new AudioCtx() : null;
    let monitorInterval: any = null;

    if (audioCtx) {
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let hasSpokenOnce = false;
      let silenceStartMs: number | null = null;
      let pauseCountedForCurrentSilence = false;

      monitorInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const isSpeakingNow = avg > 14;

        options.onSpeakingStateChange?.(isSpeakingNow);

        if (isSpeakingNow) {
          hasSpokenOnce = true;
          silenceStartMs = null;
          pauseCountedForCurrentSilence = false;
        } else if (hasSpokenOnce) {
          if (silenceStartMs === null) {
            silenceStartMs = Date.now();
          } else if (
            !pauseCountedForCurrentSilence &&
            Date.now() - silenceStartMs >= silenceLimit
          ) {
            longPauses += 1;
            pauseCountedForCurrentSilence = true;
            options.onPauseCountChange?.(longPauses);
          }
        }
      }, 150);
    }

    // 2. MediaRecorder
    const chunks: BlobPart[] = [];
    const mimeType =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

    const recorder =
      typeof MediaRecorder !== 'undefined' ? new MediaRecorder(stream) : null;

    if (recorder) {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
    }

    return {
      stop: () =>
        new Promise((resolve) => {
          if (monitorInterval) clearInterval(monitorInterval);
          options.onSpeakingStateChange?.(false);

          const cleanupStream = () => {
            stream.getTracks().forEach((t) => t.stop());
            if (audioCtx && audioCtx.state !== 'closed') {
              audioCtx.close().catch(() => {});
            }
          };

          if (!recorder || recorder.state === 'inactive') {
            cleanupStream();
            resolve({ longPauses, recording: null });
            return;
          }

          recorder.onstop = async () => {
            cleanupStream();
            if (chunks.length === 0) {
              resolve({ longPauses, recording: null });
              return;
            }
            const blob = new Blob(chunks, { type: mimeType });
            const rec: RecordingRecord = {
              id: `rec-${Date.now()}`,
              packId: options.packId,
              segmentId: options.segmentId,
              mode: options.mode,
              createdAt: new Date().toISOString(),
              mimeType,
              blob
            };
            await idbSaveRecording(rec);
            resolve({ longPauses, recording: rec });
          };

          try {
            recorder.stop();
          } catch {
            cleanupStream();
            resolve({ longPauses, recording: null });
          }
        })
    };
  } catch {
    return {
      stop: async () => ({ longPauses: 0, recording: null })
    };
  }
}

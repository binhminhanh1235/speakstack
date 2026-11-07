import { registerTtsDuckingHook } from '../speech/tts';

export interface MusicTrack {
  id: string;
  title: string;
  file: string;
  mood: string;
}

class BackgroundMusicController {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscNodes: OscillatorNode[] = [];
  private htmlAudio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private baseVolume = 0.18;
  private listeners = new Set<(playing: boolean) => void>();
  private isDucked = false;
  private unduckTimer: any = null;
  private currentTrack: MusicTrack = {
    id: 'exodus',
    title: 'Exodus',
    file: '/music/exodus.mp3',
    mood: 'focus'
  };

  /** Warm the HTTP cache so playback starts instantly on first click. */
  public warm() {
    if (typeof fetch === 'undefined' || this.currentTrack.file.startsWith('synth:')) return;
    fetch(this.currentTrack.file).catch(() => {});
  }

  public subscribe(fn: (playing: boolean) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.isPlaying));
  }

  constructor() {
    registerTtsDuckingHook((active) => {
      this.setDucking(active);
    });
  }

  private ensureContext() {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = this.baseVolume;
        this.masterGain.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private stopSynthNodes() {
    for (const osc of this.oscNodes) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    }
    this.oscNodes = [];
    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
      } catch {}
      this.htmlAudio = null;
    }
  }

  public start(track?: MusicTrack, volume?: number) {
    if (track) this.currentTrack = track;
    if (typeof volume === 'number') this.baseVolume = Math.max(0.05, Math.min(1, volume));

    this.stopSynthNodes();
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (this.currentTrack.file.startsWith('synth:')) {
      const preset = this.currentTrack.file.slice('synth:'.length);
      const freqs =
        preset === 'lofi'
          ? [196.0, 246.94, 293.66, 369.99]
          : preset === 'drone'
          ? [130.81, 196.0, 261.63]
          : [174.61, 220.0, 261.63, 329.63];

      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const subGain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f;
        subGain.gain.value = 0.08 / freqs.length;
        osc.connect(subGain);
        subGain.connect(this.masterGain!);
        osc.start();
        this.oscNodes.push(osc);
      });
      this.isPlaying = true;
      this.applyGainImmediate();
    } else {
      const audio = new Audio(this.currentTrack.file);
      audio.loop = true;
      audio.volume = this.isDucked ? this.baseVolume * 0.2 : this.baseVolume;
      audio.play().catch(() => {});
      this.htmlAudio = audio;
      this.isPlaying = true;
    }
    this.emit();
  }

  public stop() {
    this.isPlaying = false;
    this.stopSynthNodes();
    this.emit();
  }

  public setVolume(vol: number) {
    this.baseVolume = Math.max(0.05, Math.min(1, vol));
    this.applyGainImmediate();
  }

  private applyGainImmediate() {
    const target = this.isDucked ? this.baseVolume * 0.2 : this.baseVolume;
    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.setTargetAtTime(Math.max(0.001, target), now, 0.12);
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = target;
    }
  }

  public setDucking(active: boolean) {
    if (this.unduckTimer) {
      clearTimeout(this.unduckTimer);
      this.unduckTimer = null;
    }
    if (active) {
      this.isDucked = true;
      this.applyGainImmediate();
    } else {
      // Restore after 800ms of silence per requirement 11
      this.unduckTimer = setTimeout(() => {
        this.isDucked = false;
        this.applyGainImmediate();
      }, 800);
    }
  }

  public getState() {
    return {
      isPlaying: this.isPlaying,
      isDucked: this.isDucked,
      volume: this.baseVolume,
      track: this.currentTrack
    };
  }
}

export const musicController = new BackgroundMusicController();

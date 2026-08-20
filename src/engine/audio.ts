/**
 * Procedural audio. Every sound is synthesised at call time from oscillators
 * and noise buffers — there are no audio assets to ship or load.
 */

type Wave = OscillatorType;

export type SfxName =
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'die'
  | 'pickup'
  | 'rupee'
  | 'heart'
  | 'chest'
  | 'secret'
  | 'menu'
  | 'select'
  | 'error'
  | 'bomb'
  | 'bow'
  | 'boomerang'
  | 'block'
  | 'charge'
  | 'spin'
  | 'stairs'
  | 'unlock'
  | 'levelup'
  | 'text';

interface Note {
  /** Semitones relative to A4 (440 Hz). */
  s: number;
  /** Beats. */
  d: number;
}

/** Melody lines, written as semitone offsets from A4. */
const SONGS: Record<string, { tempo: number; lead: Note[]; bass: Note[] }> = {
  overworld: {
    tempo: 132,
    lead: [
      { s: 4, d: 1 }, { s: 7, d: 0.5 }, { s: 9, d: 0.5 }, { s: 11, d: 1 }, { s: 9, d: 1 },
      { s: 7, d: 1 }, { s: 4, d: 0.5 }, { s: 2, d: 0.5 }, { s: 4, d: 2 },
      { s: 2, d: 1 }, { s: 4, d: 0.5 }, { s: 7, d: 0.5 }, { s: 9, d: 1 }, { s: 7, d: 1 },
      { s: 4, d: 1 }, { s: 0, d: 1 }, { s: 2, d: 2 },
    ],
    bass: [
      { s: -20, d: 1 }, { s: -13, d: 1 }, { s: -20, d: 1 }, { s: -13, d: 1 },
      { s: -18, d: 1 }, { s: -11, d: 1 }, { s: -18, d: 1 }, { s: -11, d: 1 },
      { s: -22, d: 1 }, { s: -15, d: 1 }, { s: -22, d: 1 }, { s: -15, d: 1 },
      { s: -20, d: 1 }, { s: -13, d: 1 }, { s: -20, d: 2 },
    ],
  },
  dungeon: {
    tempo: 96,
    lead: [
      { s: 0, d: 1 }, { s: 1, d: 0.5 }, { s: 0, d: 0.5 }, { s: -2, d: 2 },
      { s: -4, d: 1 }, { s: -2, d: 0.5 }, { s: 0, d: 0.5 }, { s: -5, d: 2 },
      { s: 0, d: 1 }, { s: 3, d: 1 }, { s: 1, d: 2 },
      { s: -2, d: 1 }, { s: -4, d: 1 }, { s: -5, d: 2 },
    ],
    bass: [
      { s: -24, d: 2 }, { s: -24, d: 2 }, { s: -26, d: 2 }, { s: -29, d: 2 },
      { s: -24, d: 2 }, { s: -21, d: 2 }, { s: -26, d: 2 }, { s: -29, d: 2 },
    ],
  },
  village: {
    tempo: 112,
    lead: [
      { s: 7, d: 0.5 }, { s: 9, d: 0.5 }, { s: 11, d: 1 }, { s: 9, d: 0.5 }, { s: 7, d: 0.5 }, { s: 4, d: 1 },
      { s: 7, d: 0.5 }, { s: 4, d: 0.5 }, { s: 2, d: 1 }, { s: 4, d: 2 },
      { s: 11, d: 0.5 }, { s: 12, d: 0.5 }, { s: 14, d: 1 }, { s: 12, d: 1 }, { s: 11, d: 1 },
      { s: 7, d: 1 }, { s: 9, d: 1 }, { s: 7, d: 2 },
    ],
    bass: [
      { s: -20, d: 2 }, { s: -15, d: 2 }, { s: -22, d: 2 }, { s: -17, d: 2 },
      { s: -20, d: 2 }, { s: -13, d: 2 }, { s: -18, d: 2 }, { s: -20, d: 2 },
    ],
  },
  drowned: {
    tempo: 88,
    lead: [
      { s: -2, d: 1 }, { s: 2, d: 1 }, { s: 5, d: 0.5 }, { s: 4, d: 0.5 }, { s: 2, d: 1 },
      { s: 0, d: 1 }, { s: -2, d: 1 }, { s: -5, d: 2 },
      { s: 2, d: 1 }, { s: 4, d: 0.5 }, { s: 5, d: 0.5 }, { s: 7, d: 1 }, { s: 5, d: 1 },
      { s: 2, d: 1 }, { s: 0, d: 1 }, { s: -2, d: 2 },
    ],
    bass: [
      { s: -26, d: 2 }, { s: -21, d: 2 }, { s: -26, d: 2 }, { s: -24, d: 2 },
      { s: -29, d: 2 }, { s: -21, d: 2 }, { s: -26, d: 2 }, { s: -31, d: 2 },
    ],
  },
  ashen: {
    tempo: 108,
    lead: [
      { s: 0, d: 0.5 }, { s: 3, d: 0.5 }, { s: 5, d: 1 }, { s: 3, d: 0.5 }, { s: 0, d: 0.5 }, { s: -2, d: 1 },
      { s: 0, d: 1 }, { s: 5, d: 0.5 }, { s: 7, d: 0.5 }, { s: 8, d: 2 },
      { s: 7, d: 0.5 }, { s: 5, d: 0.5 }, { s: 3, d: 1 }, { s: 0, d: 1 }, { s: -2, d: 2 },
      { s: 3, d: 1 }, { s: 5, d: 1 }, { s: 0, d: 2 },
    ],
    bass: [
      { s: -24, d: 1 }, { s: -17, d: 1 }, { s: -24, d: 1 }, { s: -19, d: 1 },
      { s: -26, d: 1 }, { s: -19, d: 1 }, { s: -26, d: 1 }, { s: -21, d: 1 },
      { s: -24, d: 2 }, { s: -17, d: 2 }, { s: -29, d: 2 }, { s: -24, d: 2 },
    ],
  },
  boss: {
    tempo: 156,
    lead: [
      { s: -5, d: 0.5 }, { s: -5, d: 0.5 }, { s: -4, d: 0.5 }, { s: -5, d: 0.5 },
      { s: -8, d: 1 }, { s: -5, d: 1 },
      { s: -5, d: 0.5 }, { s: -5, d: 0.5 }, { s: -3, d: 0.5 }, { s: -5, d: 0.5 },
      { s: -10, d: 1 }, { s: -5, d: 1 },
    ],
    bass: [
      { s: -29, d: 0.5 }, { s: -29, d: 0.5 }, { s: -29, d: 0.5 }, { s: -29, d: 0.5 },
      { s: -32, d: 0.5 }, { s: -32, d: 0.5 }, { s: -29, d: 0.5 }, { s: -29, d: 0.5 },
    ],
  },
};

export type SongName = keyof typeof SONGS;

function semitoneToHz(s: number): number {
  return 440 * Math.pow(2, s / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private currentSong: SongName | null = null;
  private musicTimer: number | null = null;
  private musicVoices: AudioScheduledSourceNode[] = [];

  private _muted = false;
  masterVolume = 0.75;
  musicVolume = 0.34;
  sfxVolume = 0.5;

  get muted(): boolean {
    return this._muted;
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    // One second of white noise, reused for percussive and explosive sounds.
    const frames = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master) this.master.gain.value = this._muted ? 0 : this.masterVolume;
    return this._muted;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v;
    if (this.master && !this._muted) this.master.gain.value = v;
  }

  private tone(
    wave: Wave,
    freq: number,
    duration: number,
    gain: number,
    opts: { sweepTo?: number; delay?: number; bus?: GainNode | null } = {},
  ): void {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), t0 + duration);
    }
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, duration * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(bus);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, gain: number, filterHz: number, opts: { delay?: number; sweepTo?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.sfxBus) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, t0);
    if (opts.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.sweepTo), t0 + duration);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(env).connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case 'swing':
        this.noise(0.11, 0.28, 5200, { sweepTo: 900 });
        break;
      case 'hit':
        this.tone('square', 320, 0.09, 0.24, { sweepTo: 120 });
        this.noise(0.07, 0.2, 2600);
        break;
      case 'block':
        this.tone('triangle', 900, 0.07, 0.3, { sweepTo: 1500 });
        this.noise(0.05, 0.16, 4000);
        break;
      case 'hurt':
        this.tone('sawtooth', 340, 0.26, 0.3, { sweepTo: 90 });
        break;
      case 'die':
        this.tone('sawtooth', 420, 0.7, 0.3, { sweepTo: 50 });
        this.noise(0.5, 0.2, 1800, { sweepTo: 200 });
        break;
      case 'pickup':
        this.tone('square', 880, 0.07, 0.22);
        this.tone('square', 1320, 0.1, 0.2, { delay: 0.06 });
        break;
      case 'rupee':
        this.tone('triangle', 1046, 0.06, 0.24);
        this.tone('triangle', 1568, 0.11, 0.2, { delay: 0.05 });
        break;
      case 'heart':
        this.tone('triangle', 784, 0.07, 0.22);
        this.tone('triangle', 1046, 0.07, 0.22, { delay: 0.07 });
        this.tone('triangle', 1318, 0.14, 0.2, { delay: 0.14 });
        break;
      case 'chest':
        this.tone('square', 523, 0.1, 0.2);
        this.tone('square', 659, 0.1, 0.2, { delay: 0.1 });
        this.tone('square', 784, 0.24, 0.22, { delay: 0.2 });
        break;
      case 'secret':
        [659, 784, 988, 1318].forEach((f, i) => this.tone('triangle', f, 0.16, 0.24, { delay: i * 0.1 }));
        break;
      case 'unlock':
        this.tone('square', 660, 0.08, 0.2);
        this.noise(0.16, 0.18, 3000, { sweepTo: 600 });
        this.tone('square', 990, 0.16, 0.2, { delay: 0.1 });
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('square', f, 0.18, 0.2, { delay: i * 0.075 }));
        break;
      case 'menu':
        this.tone('square', 520, 0.04, 0.13);
        break;
      case 'select':
        this.tone('square', 760, 0.05, 0.16);
        this.tone('square', 1140, 0.07, 0.13, { delay: 0.04 });
        break;
      case 'error':
        this.tone('square', 180, 0.16, 0.2, { sweepTo: 110 });
        break;
      case 'bomb':
        this.noise(0.55, 0.42, 1400, { sweepTo: 90 });
        this.tone('sine', 120, 0.4, 0.32, { sweepTo: 34 });
        break;
      case 'bow':
        this.noise(0.09, 0.2, 6000, { sweepTo: 1400 });
        this.tone('triangle', 1200, 0.07, 0.12, { sweepTo: 700 });
        break;
      case 'boomerang':
        this.tone('sine', 700, 0.3, 0.14, { sweepTo: 1500 });
        break;
      case 'charge':
        this.tone('triangle', 300, 0.5, 0.1, { sweepTo: 1200 });
        break;
      case 'spin':
        this.tone('sawtooth', 500, 0.42, 0.22, { sweepTo: 1600 });
        this.noise(0.4, 0.16, 4000, { sweepTo: 1200 });
        break;
      case 'stairs':
        [400, 500, 600, 700].forEach((f, i) => this.tone('square', f, 0.07, 0.14, { delay: i * 0.05 }));
        break;
      case 'text':
        this.tone('square', 1400, 0.015, 0.05);
        break;
    }
  }

  playSong(name: SongName | null): void {
    if (name === this.currentSong) return;
    this.currentSong = name;
    this.stopMusicVoices();
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (name === null || !this.ctx) return;
    this.scheduleLoop(name);
  }

  private stopMusicVoices(): void {
    for (const v of this.musicVoices) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicVoices = [];
  }

  /**
   * Schedules one pass of the song ahead of time, then re-arms itself. Notes
   * are queued against the AudioContext clock so timing does not depend on
   * the render loop.
   */
  private scheduleLoop(name: SongName): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const song = SONGS[name];
    const beat = 60 / song.tempo;
    const start = ctx.currentTime + 0.08;

    const emit = (notes: Note[], wave: Wave, gain: number, detune: number) => {
      let t = start;
      for (const note of notes) {
        const dur = note.d * beat;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = semitoneToHz(note.s);
        osc.detune.value = detune;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
        env.gain.setValueAtTime(gain, t + dur * 0.6);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.96);
        osc.connect(env).connect(bus);
        osc.start(t);
        osc.stop(t + dur);
        this.musicVoices.push(osc);
        t += dur;
      }
      return t - start;
    };

    const leadLen = emit(song.lead, 'square', 0.16, 0);
    const bassLen = emit(song.bass, 'triangle', 0.22, 0);
    const loopLen = Math.max(leadLen, bassLen);

    this.musicTimer = window.setTimeout(() => {
      this.musicVoices = [];
      if (this.currentSong === name) this.scheduleLoop(name);
    }, Math.max(200, (loopLen - 0.1) * 1000));
  }
}

export const audio = new AudioEngine();

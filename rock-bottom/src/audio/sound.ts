/**
 * Every sound in the game, synthesised with the Web Audio API.
 * No audio files are loaded, so there is nothing to download or license.
 */

interface ToneOptions {
  type?: OscillatorType;
  /** Start frequency in Hz. */
  freq: number;
  /** Frequency to glide to by the end of the note. */
  freqEnd?: number;
  /** Seconds from now until the note starts. */
  at?: number;
  /** Note length in seconds, including the fade. */
  duration: number;
  gain?: number;
  attack?: number;
  /** Low-pass filter cutoff in Hz. */
  lowpass?: number;
}

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Note frequencies used by the stings and fanfares. */
const NOTE = {
  C3: 130.81,
  G3: 196.0,
  C4: 261.63,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1567.98,
  B6: 1975.53,
  C7: 2093.0,
};

export class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private drop: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.context.currentTime, 0.02);
    }
    if (muted) this.stopDrop();
  }

  /**
   * Browsers only allow sound after a click or key press, so this is called
   * from the first user gesture. Safe to call repeatedly.
   */
  unlock(): void {
    if (!this.context) {
      const Context = audioContextClass();
      if (!Context) return;
      try {
        this.context = new Context();
      } catch {
        return;
      }
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  private ready(): { context: AudioContext; master: GainNode } | null {
    if (this.muted || !this.context || !this.master || this.context.state !== 'running') return null;
    return { context: this.context, master: this.master };
  }

  private tone(options: ToneOptions): void {
    const audio = this.ready();
    if (!audio) return;
    const { context, master } = audio;
    const start = context.currentTime + (options.at ?? 0);
    const end = start + options.duration;
    const peak = options.gain ?? 0.2;
    const attack = Math.min(options.attack ?? 0.005, options.duration / 2);

    const oscillator = context.createOscillator();
    oscillator.type = options.type ?? 'sine';
    oscillator.frequency.setValueAtTime(options.freq, start);
    if (options.freqEnd) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.freqEnd), end);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    let output: AudioNode = oscillator;
    if (options.lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.lowpass;
      output.connect(filter);
      output = filter;
    }
    output.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  private noise(options: {
    at?: number;
    duration: number;
    gain?: number;
    filter: BiquadFilterType;
    freq: number;
    freqEnd?: number;
    q?: number;
  }): void {
    const audio = this.ready();
    if (!audio) return;
    const { context, master } = audio;
    if (!this.noiseBuffer) {
      const length = context.sampleRate;
      this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const start = context.currentTime + (options.at ?? 0);
    const end = start + options.duration;

    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q ?? 1;
    filter.frequency.setValueAtTime(options.freq, start);
    if (options.freqEnd) filter.frequency.exponentialRampToValueAtTime(options.freqEnd, end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.2, start + Math.min(0.02, options.duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(end + 0.03);
  }

  /** A brassy chord: detuned saws through a low-pass with a triangle on top. */
  private brass(frequencies: number[], at: number, duration: number, gain = 0.09): void {
    for (const freq of frequencies) {
      this.tone({ type: 'sawtooth', freq, at, duration, gain, attack: 0.02, lowpass: 2600 });
      this.tone({ type: 'sawtooth', freq: freq * 1.006, at, duration, gain: gain * 0.7, attack: 0.02, lowpass: 2200 });
      this.tone({ type: 'triangle', freq: freq * 2, at, duration: duration * 0.8, gain: gain * 0.35 });
    }
  }

  // ------------------------------------------------------------ interface

  click(): void {
    this.tone({ type: 'triangle', freq: 660, freqEnd: 880, duration: 0.06, gain: 0.12 });
  }

  /** The answer has been locked in. */
  lockIn(): void {
    this.tone({ type: 'triangle', freq: 392, duration: 0.09, gain: 0.16 });
    this.tone({ type: 'triangle', freq: 587.33, at: 0.08, duration: 0.14, gain: 0.16 });
  }

  /** The answer could not be accepted (blank or already given). */
  reject(): void {
    this.tone({ type: 'square', freq: 196, duration: 0.09, gain: 0.08, lowpass: 900 });
    this.tone({ type: 'square', freq: 174.6, at: 0.11, duration: 0.14, gain: 0.08, lowpass: 900 });
  }

  /** A soft pulse while a computer team is thinking. */
  think(): void {
    this.tone({ type: 'sine', freq: 520, duration: 0.12, gain: 0.04 });
  }

  // ------------------------------------------------------------ countdown

  /** The answer is right: a bright bell before the column drops. */
  correct(): void {
    this.tone({ freq: NOTE.E6, duration: 0.7, gain: 0.16 });
    this.tone({ freq: NOTE.B6, duration: 0.5, gain: 0.08 });
    this.tone({ freq: NOTE.E6 * 2.01, duration: 0.3, gain: 0.03 });
  }

  /** The answer is wrong: a low, harsh double buzz. */
  buzzer(): void {
    for (const at of [0, 0.34]) {
      this.tone({ type: 'sawtooth', freq: 98, at, duration: at ? 0.62 : 0.26, gain: 0.26, lowpass: 1100 });
      this.tone({ type: 'sawtooth', freq: 103.8, at, duration: at ? 0.62 : 0.26, gain: 0.22, lowpass: 1100 });
      this.tone({ type: 'square', freq: 49, at, duration: at ? 0.62 : 0.26, gain: 0.14, lowpass: 400 });
    }
  }

  /** Starts the descending tone that follows the column down. */
  startDrop(): void {
    const audio = this.ready();
    if (!audio || this.drop) return;
    const { context, master } = audio;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.08);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.connect(gain);
    gain.connect(master);

    const oscillators = (['sawtooth', 'triangle'] as OscillatorType[]).map((type, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = this.dropFrequency(100) * (index === 0 ? 1 : 0.5);
      oscillator.connect(filter);
      oscillator.start();
      return oscillator;
    });
    this.drop = { oscillators, gain };
  }

  private dropFrequency(value: number): number {
    // Two and a bit octaves from the top of the column to the floor.
    return 150 * Math.pow(2, (value / 100) * 2.3);
  }

  /** Called as the column passes each whole number on the way down. */
  tick(value: number): void {
    const audio = this.ready();
    if (!audio) return;
    if (this.drop) {
      const now = audio.context.currentTime;
      const freq = this.dropFrequency(value);
      this.drop.oscillators.forEach((oscillator, index) =>
        oscillator.frequency.setTargetAtTime(freq * (index === 0 ? 1 : 0.5), now, 0.03),
      );
    }
    this.tone({ type: 'square', freq: 900 + value * 9, duration: 0.035, gain: 0.07, lowpass: 3200 });
    this.noise({ duration: 0.02, gain: 0.05, filter: 'highpass', freq: 4000 });
  }

  stopDrop(): void {
    if (!this.drop || !this.context) return;
    const now = this.context.currentTime;
    const { oscillators, gain } = this.drop;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.015);
    oscillators.forEach((oscillator) => oscillator.stop(now + 0.12));
    this.drop = null;
  }

  /** The column stops dead. */
  thud(): void {
    this.tone({ freq: 150, freqEnd: 38, duration: 0.42, gain: 0.7 });
    this.tone({ type: 'triangle', freq: 75, freqEnd: 30, duration: 0.5, gain: 0.35 });
    this.noise({ duration: 0.14, gain: 0.3, filter: 'lowpass', freq: 900, freqEnd: 120 });
  }

  /** A rock-bottom answer: the big one. */
  fanfare(): void {
    const { C5, E5, G5, C6, E6, G6, C7, C4, G4, E4 } = NOTE;
    this.thud();
    [C5, E5, G5, C6].forEach((freq, index) => this.brass([freq], 0.12 + index * 0.11, 0.2, 0.11));
    this.brass([C4, E4, G4, C5, E5, G5, C6], 0.6, 1.5, 0.07);
    [C6, E6, G6, C7, G6, C7].forEach((freq, index) =>
      this.tone({ freq, at: 0.62 + index * 0.09, duration: 0.5, gain: 0.07 }),
    );
    this.noise({ at: 0.58, duration: 1.3, gain: 0.09, filter: 'highpass', freq: 6000 });
    this.tone({ freq: 65.4, at: 0.6, duration: 1.4, gain: 0.3 });
  }

  /** The jackpot is won. */
  jackpot(): void {
    const { C4, E4, G4, C5, D5, E5, G5, A5, C6, E6, G6, C7 } = NOTE;
    this.fanfare();
    this.brass([D5, G5], 2.0, 0.22, 0.1);
    this.brass([E5, A5], 2.24, 0.22, 0.1);
    this.brass([G5, C6], 2.48, 0.3, 0.1);
    this.brass([C4, E4, G4, C5, E5, G5, C6, E6], 2.82, 2.2, 0.065);
    for (let i = 0; i < 16; i++) {
      this.tone({ freq: [C6, E6, G6, C7][i % 4], at: 2.84 + i * 0.1, duration: 0.4, gain: 0.05 });
    }
    this.noise({ at: 2.8, duration: 2.2, gain: 0.08, filter: 'highpass', freq: 7000 });
  }

  // ---------------------------------------------------------------- clock

  /** One tick of the answer clock; sharper in the last five seconds. */
  clockTick(urgent: boolean): void {
    this.tone({ type: 'triangle', freq: urgent ? 1180 : 820, duration: 0.05, gain: urgent ? 0.13 : 0.07 });
  }

  timeUp(): void {
    this.tone({ type: 'square', freq: 440, freqEnd: 220, duration: 0.5, gain: 0.14, lowpass: 1400 });
  }

  // ---------------------------------------------------------------- stings

  /** A sweep and a chord for a new round. */
  roundSting(): void {
    const { C4, G4, C5, E5, G5 } = NOTE;
    this.noise({ duration: 0.7, gain: 0.12, filter: 'bandpass', freq: 300, freqEnd: 5000, q: 2 });
    this.brass([C4, G4], 0.5, 0.16, 0.1);
    this.brass([C4, G4, C5, E5, G5], 0.72, 0.9, 0.075);
    this.tone({ freq: 65.4, at: 0.72, duration: 0.9, gain: 0.25 });
  }

  /** A falling minor phrase when a team leaves. */
  eliminated(): void {
    const { A4, E4, C4, G3 } = NOTE;
    [A4, E4, C4, G3 * 0.89].forEach((freq, index) =>
      this.tone({ type: 'triangle', freq, at: index * 0.26, duration: 0.5, gain: 0.16 }),
    );
    this.tone({ freq: 55, at: 0.78, duration: 1.1, gain: 0.3 });
  }

  /** A rising phrase for winning a question or a round. */
  success(): void {
    const { C5, E5, G5, C6 } = NOTE;
    [C5, E5, G5, C6].forEach((freq, index) =>
      this.tone({ type: 'triangle', freq, at: index * 0.09, duration: 0.3, gain: 0.14 }),
    );
  }

  /** A gentle falling phrase when the jackpot gets away. */
  commiserate(): void {
    const { G4, E4, C4 } = NOTE;
    [G4, E4, C4].forEach((freq, index) =>
      this.tone({ type: 'triangle', freq, at: index * 0.3, duration: 0.6, gain: 0.14 }),
    );
    this.tone({ freq: NOTE.C3, at: 0.6, duration: 1.2, gain: 0.2 });
  }
}

/** The single sound engine shared by the whole game. */
export const sound = new SoundEngine();

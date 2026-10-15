import { Chord, chordPitchClasses } from './chords';
import { ChordResult, detectNotes, matchChord } from './detectChord';
import { magnitudeSpectrum } from './fft';

export type HistoryEntry = {
  name: string;
  chord: Chord;
  /** Seconds since the follower started. */
  start: number;
};

export type FollowerState = {
  current: ChordResult | null;
  history: HistoryEntry[];
};

type Options = {
  a4?: number;
  ignoreBass?: boolean;
};

/** Onset detection step (~11 ms at 48 kHz) and its FFT size. */
const HOP = 512;
const ONSET_FFT = 1024;
/** Recent steps the onset threshold is measured against (~0.4 s). */
const ONSET_MEMORY = 40;
/** Spectral flux this many times the recent median marks a new strum. */
const ONSET_RATIO = 2;
const ONSET_REFRACTORY_S = 0.06;
/** Skip the pick noise right after a strum. */
const ATTACK_SKIP_S = 0.03;
const MIN_WINDOW = 4096; // ~85 ms
const MAX_WINDOW = 8192; // ~0.17 s
const ANALYSIS_INTERVAL_S = 0.1;
/**
 * Each note's strength is a running average over analyses (every 0.1 s),
 * keeping this much of the old value. Notes that are really ringing show up
 * in every window and stay strong; overtone phantoms come and go and average
 * out below NOTE_FLOOR.
 */
const NOTE_MEMORY = 0.6;
/** Notes below this (relative) strength don't count; weaker ones are mostly noise. */
const NOTE_FLOOR = 0.3;
/**
 * Semitones from a note to its 3rd, 5th, 6th and 7th harmonics. A weak note
 * at one of these distances above a stronger note is that note's overtone:
 * a power chord's 5th has its 3rd harmonic on the 9th (E5 reads as Esus2).
 */
const OVERTONE_INTERVALS = [19, 28, 31, 34];
/** Real strings at those intervals (Em's open B above its low E) are louder than this. */
const OVERTONE_MAX_WEIGHT = 0.5;
/** A strum this clear switches chords at once; otherwise two analyses must agree. */
const INSTANT_CONFIDENCE = 0.35;
/**
 * Two-note chords (power chords) must hold this long before they're shown:
 * fingerpicking often plays a chord's root and 5th before its 3rd, and for
 * that moment G looks exactly like G5.
 */
const POWER_CHORD_HOLD_S = 1.2;
/**
 * The bass is the lowest note heard while the current chord has been
 * playing (at most this long ago)...
 */
const BASS_MEMORY_S = 3;
/** ...plus whatever was heard just before switching to it. */
const BASS_CARRY_S = 0.3;
/**
 * ...at least this strong, and only if its note is part of what's heard.
 * Low strings are quiet through phone mics, so this is gentler than
 * NOTE_FLOOR; phantoms are ruled out by not belonging to the chord.
 */
const BASS_FLOOR = 0.12;
/** Combined strength a note needs across analyses to be the bass, so one-off phantoms can't. */
const BASS_EVIDENCE = 1;
/** A note needs this many cycles in the window to be measured reliably. */
const MIN_CYCLES = 6;
/** Silence after which the current chord clears. */
const SILENCE_CLEAR_S = 1.5;
/** A history entry shorter than this was a misreading and is dropped. */
const MIN_ENTRY_S = 0.4;

/**
 * Follows the chords of a song as it's played. Feed it audio as it arrives
 * with `push`; read `state` for the current chord and the history.
 *
 * - Strums are found from jumps in high-frequency energy, and each analysis
 *   only uses sound after the latest strum, so no window mixes two chords.
 * - Notes heard are collected with a short fade, so fingerpicked notes build
 *   up into a chord, while a full strum mostly replaces what came before.
 * - A clear strum switches chords at once; anything else needs two analyses
 *   in a row to agree. Blips shorter than 0.4 s are dropped from the history.
 */
export class SongFollower {
  readonly sampleRate: number;
  private readonly options: Options;
  private readonly buffer: Float32Array;
  /** Total samples received. */
  private received = 0;
  private sinceHop = 0;
  private fluxes: number[] = [];
  private previousSpectrum: Float64Array | null = null;
  private lastOnset = -Infinity;
  private analysedSinceOnset = false;
  private nextAnalysis = 0;
  private notes = new Array(12).fill(0);
  /** Notes of the previous analysis, to tell a strum (several new notes) from a pick. */
  private previousNotes = new Set<number>();
  /** Notes of each recent analysis, for the bass. */
  private lows: { midi: number; weight: number; time: number }[] = [];
  private lastHeard = 0;
  private candidate: { name: string; count: number; since: number; strummed: boolean } | null = null;
  readonly state: FollowerState = { current: null, history: [] };

  constructor(sampleRate: number, options: Options = {}) {
    this.sampleRate = sampleRate;
    this.options = options;
    // Two seconds of history is plenty for the longest window.
    this.buffer = new Float32Array(sampleRate * 2);
  }

  /** Seconds of audio received so far. */
  get time() {
    return this.received / this.sampleRate;
  }

  push(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      this.buffer[this.received % this.buffer.length] = sample;
      this.received++;
      if (++this.sinceHop === HOP) this.endHop();
      if (this.time >= this.nextAnalysis) this.analyse();
    }
  }

  /** Forgets the history but keeps following the current chord. */
  clearHistory() {
    const { current } = this.state;
    this.state.history = current ? [{ name: current.name, chord: current.chord, start: this.time }] : [];
  }

  reset() {
    this.received = 0;
    this.sinceHop = 0;
    this.fluxes = [];
    this.previousSpectrum = null;
    this.lastOnset = -Infinity;
    this.analysedSinceOnset = false;
    this.nextAnalysis = 0;
    this.notes.fill(0);
    this.previousNotes = new Set();
    this.lows = [];
    this.candidate = null;
    this.state.current = null;
    this.state.history = [];
  }

  /**
   * Onset detection by spectral flux: how much energy appeared since the last
   * step, summed over 140 Hz–4 kHz. Steady noise barely changes the spectrum;
   * a strum adds energy across it at once.
   */
  private endHop() {
    this.sinceHop = 0;
    if (this.received < ONSET_FFT) return;
    const frame = new Float32Array(ONSET_FFT);
    for (let i = 0; i < ONSET_FFT; i++) frame[i] = this.buffer[(this.received - ONSET_FFT + i) % this.buffer.length];
    const spectrum = magnitudeSpectrum(frame);
    const binHz = this.sampleRate / ONSET_FFT;
    const lo = Math.ceil(140 / binHz);
    const hi = Math.floor(4000 / binHz);
    // Square-root compression so loud low partials don't dominate.
    for (let k = lo; k <= hi; k++) spectrum[k] = Math.sqrt(spectrum[k]);

    let flux = 0;
    if (this.previousSpectrum) {
      for (let k = lo; k <= hi; k++) flux += Math.max(0, spectrum[k] - this.previousSpectrum[k]);
    }
    this.previousSpectrum = spectrum;

    const sorted = [...this.fluxes].sort((a, b) => a - b);
    const typical = sorted.length >= 8 ? sorted[Math.floor(sorted.length / 2)] : Infinity;
    if (flux > typical * ONSET_RATIO && this.time - this.lastOnset > ONSET_REFRACTORY_S) {
      this.lastOnset = this.time - HOP / this.sampleRate;
      this.analysedSinceOnset = false;
      // First look as soon as there's a minimal clean window.
      this.nextAnalysis = this.lastOnset + ATTACK_SKIP_S + MIN_WINDOW / this.sampleRate;
    }
    this.fluxes.push(flux);
    if (this.fluxes.length > ONSET_MEMORY) this.fluxes.shift();
  }

  private analyse() {
    this.nextAnalysis = this.time + ANALYSIS_INTERVAL_S;
    const cleanFrom = Math.round((this.lastOnset + ATTACK_SKIP_S) * this.sampleRate);
    const start = Math.max(this.received - MAX_WINDOW, cleanFrom, 0);
    const length = this.received - start;
    if (length < MIN_WINDOW) return;

    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) window[i] = this.buffer[(start + i) % this.buffer.length];
    const minFrequency = MIN_CYCLES / (length / this.sampleRate);
    const heard = detectNotes(window, this.sampleRate, this.options.a4, minFrequency) ?? [];
    const firstAfterStrum = !this.analysedSinceOnset;
    this.analysedSinceOnset = true;

    const frame = new Array(12).fill(0);
    const notes = new Set<number>();
    for (const { midi, weight } of heard) {
      if (weight < NOTE_FLOOR) continue;
      const overtone =
        weight < OVERTONE_MAX_WEIGHT &&
        heard.some((lower) => lower.weight >= weight && OVERTONE_INTERVALS.includes(midi - lower.midi));
      if (overtone) continue;
      frame[midi % 12] = Math.max(frame[midi % 12], weight);
      notes.add(midi);
    }
    // A strum brings in several new notes at once; re-strumming the same
    // chord brings none, and a fingerpicked note just one.
    const newNotes = [...notes].filter((midi) => !this.previousNotes.has(midi)).length;
    this.previousNotes = notes;
    const isStrum = firstAfterStrum && newNotes >= 2;

    // A strum that doesn't fit the chord showing starts afresh: its notes
    // replace the old ones, and the bass restarts. One that fits (an up-strum
    // after a muted strum misses the bass string, so Am would briefly read as
    // Am/E) just adds to the running average.
    const current = this.state.current?.chord;
    const fitsCurrent =
      current != null &&
      frame.every((w, pc) => w === 0 || chordPitchClasses(current.root, current.quality).includes(pc));
    const fresh = isStrum && !fitsCurrent;
    for (let pc = 0; pc < 12; pc++) {
      this.notes[pc] = fresh ? frame[pc] : this.notes[pc] * NOTE_MEMORY + frame[pc] * (1 - NOTE_MEMORY);
    }
    if (fresh) this.lows = [];
    this.lows = this.lows.filter((l) => this.time - l.time <= BASS_MEMORY_S);
    if (heard.some((n) => n.weight >= NOTE_FLOOR)) this.lastHeard = this.time;
    for (const { midi, weight } of heard) {
      if (weight >= BASS_FLOOR) this.lows.push({ midi, weight, time: this.time });
    }

    if (this.time - this.lastHeard > SILENCE_CLEAR_S) {
      this.state.current = null;
      this.candidate = null;
      this.lows = [];
      return;
    }

    const strongest = Math.max(...this.notes);
    if (strongest === 0) return;
    const profile = this.notes.map((w) => (w / strongest >= NOTE_FLOOR ? w / strongest : 0));
    // A real bass note shows up analysis after analysis; a phantom (a stray
    // G2 under Am7) comes and goes. So the bass is the lowest note with
    // enough evidence in total, falling back to the best-supported one.
    const evidence = new Map<number, number>();
    for (const { midi, weight } of this.lows) {
      if (profile[midi % 12] > 0) evidence.set(midi, (evidence.get(midi) ?? 0) + weight);
    }
    if (evidence.size === 0) return;
    const supported = [...evidence].filter(([, total]) => total >= BASS_EVIDENCE).map(([midi]) => midi);
    const bass = supported.length
      ? Math.min(...supported)
      : [...evidence].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const match = matchChord(profile, bass % 12, this.options.ignoreBass);
    if (!match) return;

    // The notes behind this analysis, for the readout and chord diagrams.
    const heardNotes = heard.filter((n) => notes.has(n.midi));
    if (match.name === this.state.current?.name) {
      this.state.current = { ...match, notes: heardNotes, pitchClasses: profile };
      this.candidate = null;
      return;
    }
    this.candidate =
      match.name === this.candidate?.name
        ? { ...this.candidate, count: this.candidate.count + 1 }
        : { name: match.name, count: 1, since: this.time, strummed: isStrum };
    // Only a power chord that built up note by note waits; a strummed one is
    // what's being played.
    const isPowerChord = profile.filter((w) => w > 0).length < 3;
    const ready =
      isPowerChord && !this.candidate.strummed
        ? this.time - this.candidate.since >= POWER_CHORD_HOLD_S
      : (isStrum && match.confidence >= INSTANT_CONFIDENCE) || this.candidate.count >= 2;
    if (ready) {
      this.switchTo({ ...match, notes: heardNotes, pitchClasses: profile });
    }
  }

  private switchTo(next: NonNullable<FollowerState['current']>) {
    this.state.current = next;
    this.candidate = null;
    const now = this.time;
    // Low notes from the previous chord no longer count towards the bass.
    this.lows = this.lows.filter((l) => now - l.time <= BASS_CARRY_S);
    const { history } = this.state;
    const last = history[history.length - 1];
    // A very short entry was a misreading on the way to this chord.
    if (last && now - last.start < MIN_ENTRY_S) history.pop();
    if (history[history.length - 1]?.name !== next.name) {
      history.push({ name: next.name, chord: next.chord, start: now });
    }
  }
}

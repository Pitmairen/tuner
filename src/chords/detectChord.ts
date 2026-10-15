import { Chord, chordName, TEMPLATES } from './chords';
import { magnitudeSpectrum } from './fft';

export type DetectedNote = {
  midi: number;
  /** Relative strength, 1 for the strongest note. */
  weight: number;
};

export type ChordResult = {
  chord: Chord;
  name: string;
  /** 0–1: how clearly the best chord beat the runner-up. */
  confidence: number;
  /** The notes heard, lowest first. */
  notes: DetectedNote[];
  /** Strength of each pitch class (0 = C), 0–1. */
  pitchClasses: number[];
};

/** Confidence at or above which a result counts as a clear match. */
export const CLEAR_MATCH = 0.2;

type Peak = { frequency: number; amplitude: number };

const MIN_NOTE = 28; // E1
// C6. Chord shapes on guitar and ukulele top out around A5; above that a
// "note" is almost always an overtone (two A4s on a ukulele put a strong
// 3rd harmonic on E6).
const MAX_NOTE = 84;
const HARMONICS = 10;
const MAX_NOTES = 6;
const SILENCE_RMS = 0.005;

/**
 * Recognises the chord in a mono buffer, ideally ~0.35 s of a held strum
 * (16384 samples at 48 kHz). Returns null for silence, a single note, or
 * when nothing chord-like is found.
 *
 * 1. Spectrum → peaks.
 * 2. Notes, one at a time: the candidate whose harmonic series best explains
 *    the remaining peaks wins, and its harmonics are then (partly) removed so
 *    overtones aren't mistaken for chord tones.
 * 3. Pitch-class weights → best-matching chord template, with the bass note
 *    breaking ties between chords that share notes (Asus2 / Esus4).
 */
export type DetectOptions = {
  a4?: number;
  /**
   * Treat the lowest note as meaningless: no slash chords, and no preference
   * for a root that happens to be lowest. For re-entrant instruments like a
   * ukulele, whose lowest note is rarely the bass of the chord.
   */
  ignoreBass?: boolean;
};

export function detectChord(
  signal: Float32Array,
  sampleRate: number,
  { a4 = 440, ignoreBass = false }: DetectOptions = {},
): ChordResult | null {
  let sumSquares = 0;
  for (let i = 0; i < signal.length; i++) sumSquares += signal[i] * signal[i];
  if (Math.sqrt(sumSquares / signal.length) < SILENCE_RMS) return null;

  const factor = sampleRate >= 32000 ? 2 : 1;
  const rate = sampleRate / factor;
  const decimated = decimate(signal, factor);
  const size = 1 << Math.floor(Math.log2(decimated.length));
  const peaks = findPeaks(magnitudeSpectrum(decimated.subarray(decimated.length - size)), rate, size);
  if (peaks.length === 0) return null;

  const notes = findNotes(peaks, a4);
  // A single note (in any octaves) isn't a chord.
  if (new Set(notes.map((n) => n.midi % 12)).size < 2) return null;

  const pitchClasses = new Array(12).fill(0);
  for (const { midi, weight } of notes) pitchClasses[midi % 12] = Math.max(pitchClasses[midi % 12], weight);
  const lowest = notes[0].midi % 12;

  const ranked = rankChords(pitchClasses, ignoreBass ? null : lowest);
  const [best, second] = ranked;
  if (best.score <= 0) return null;
  const chord = { root: best.root, quality: best.quality, bass: ignoreBass ? best.root : lowest };
  return {
    chord,
    name: chordName(chord),
    confidence: Math.max(0, Math.min(1, (best.score - second.score) / best.score)),
    notes,
    pitchClasses,
  };
}

function decimate(input: Float32Array, factor: number): Float32Array {
  if (factor === 1) return input;
  const output = new Float32Array(Math.floor(input.length / factor));
  for (let i = 0; i < output.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += input[i * factor + j];
    output[i] = sum / factor;
  }
  return output;
}

/** Local maxima well above the noise floor, with interpolated frequencies. */
function findPeaks(mags: Float64Array, rate: number, size: number): Peak[] {
  const binHz = rate / size;
  const lo = Math.max(2, Math.floor(35 / binHz));
  const hi = Math.min(mags.length - 2, Math.ceil(5000 / binHz));

  let max = 0;
  const band: number[] = [];
  for (let k = lo; k <= hi; k++) {
    max = Math.max(max, mags[k]);
    band.push(mags[k]);
  }
  band.sort((a, b) => a - b);
  const floor = band[Math.floor(band.length / 2)];
  const threshold = Math.max(floor * 4, max * 0.003);

  const peaks: Peak[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = mags[k];
    if (m < threshold || m <= mags[k - 1] || m < mags[k + 1]) continue;
    // Parabolic interpolation on log magnitude.
    const a = Math.log(mags[k - 1] + 1e-12);
    const b = Math.log(m);
    const c = Math.log(mags[k + 1] + 1e-12);
    const denominator = a - 2 * b + c;
    const offset = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator;
    // Square-root compression keeps quieter strings from being drowned out.
    peaks.push({ frequency: (k + offset) * binHz, amplitude: Math.sqrt(m / max) });
  }
  return peaks;
}

/** Iteratively picks the notes whose harmonic series explain the peaks. */
function findNotes(peaks: Peak[], a4: number): DetectedNote[] {
  const amps = peaks.map((p) => p.amplitude);
  const logFreqs = peaks.map((p) => Math.log2(p.frequency));
  const found: { midi: number; salience: number }[] = [];
  /** Peaks already explained as an overtone of a found note. */
  const overtones = new Set<number>();

  for (let round = 0; round < MAX_NOTES; round++) {
    let best = { midi: -1, salience: 0, matches: [] as { peak: number; harmonic: number }[] };
    for (let midi = MIN_NOTE; midi <= MAX_NOTE; midi++) {
      if (found.some((n) => n.midi === midi)) continue;
      const candidate = salience(midi, a4, logFreqs, amps);
      if (candidate.salience > best.salience) best = { midi, ...candidate };
    }
    if (best.midi < 0) break;
    // A note whose fundamental is itself an overtone of a note already found
    // (F# above a low B is B's 3rd harmonic) is usually a phantom, so it has
    // to be clearly stronger than the leftovers of that overtone to count.
    const fundamental = best.matches.find((m) => m.harmonic === 1)!.peak;
    const minimum = overtones.has(fundamental) ? 0.4 : 0.18;
    if (found.length > 0 && best.salience < found[0].salience * minimum) {
      if (overtones.has(fundamental)) {
        // Rule this candidate out and keep looking for real notes.
        amps[fundamental] = 0;
        round--;
        continue;
      }
      break;
    }

    found.push({ midi: best.midi, salience: best.salience });
    // Explain away this note's partials: the fundamental entirely, overtones
    // mostly (another chord tone may share them, e.g. G4 is C3's 3rd harmonic).
    for (const { peak, harmonic } of best.matches) {
      amps[peak] *= harmonic === 1 ? 0 : 0.35;
      if (harmonic > 1) overtones.add(peak);
    }
  }

  const strongest = Math.max(...found.map((n) => n.salience));
  return found
    .map((n) => ({ midi: n.midi, weight: n.salience / strongest }))
    .sort((a, b) => a.midi - b.midi);
}

function salience(midi: number, a4: number, logFreqs: number[], amps: number[]) {
  const logF0 = Math.log2(a4) + (midi - 69) / 12;
  let total = 0;
  let hasFundamental = false;
  const matches: { peak: number; harmonic: number }[] = [];
  for (let h = 1; h <= HARMONICS; h++) {
    // Real strings' overtones run slightly sharp, so allow more room higher up.
    const tolerance = (h <= 4 ? 35 : 55) / 1200;
    const target = logF0 + Math.log2(h);
    let bestPeak = -1;
    let bestDistance = tolerance;
    for (let i = 0; i < logFreqs.length; i++) {
      const distance = Math.abs(logFreqs[i] - target);
      if (distance < bestDistance && amps[i] > 0) {
        bestDistance = distance;
        bestPeak = i;
      }
    }
    if (bestPeak < 0) continue;
    if (h === 1) hasFundamental = true;
    total += amps[bestPeak] / Math.pow(h, 0.6);
    matches.push({ peak: bestPeak, harmonic: h });
  }
  // Without its fundamental a candidate is almost always a sub-octave ghost
  // of a real note (C2 "explains" C3's harmonics).
  return { salience: hasFundamental ? total : 0, matches };
}

type Ranked = { root: number; quality: Chord['quality']; score: number };

function rankChords(pitchClasses: number[], bass: number | null): Ranked[] {
  const ranked: Ranked[] = [];
  for (let root = 0; root < 12; root++) {
    for (const { quality, intervals, prior } of TEMPLATES) {
      const members = new Set(intervals.map((i) => (root + i) % 12));
      let present = 0;
      let extra = 0;
      let missing = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (members.has(pc)) {
          present += pitchClasses[pc];
          if (pitchClasses[pc] < 0.08) missing++;
        } else {
          extra += pitchClasses[pc];
        }
      }
      const score = present - extra - 0.6 * missing + prior + (bass === root ? 0.25 : 0);
      ranked.push({ root, quality, score });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}

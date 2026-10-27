import { magnitudeSpectrum } from '../chords/fft';

/**
 * Turns a recording into per-frame features for chord recognition: a
 * spectrogram with the drums taken out, the recording's tuning, and chroma
 * (strength per pitch class) for the bass and for everything above it.
 *
 * Each step works on frames in order with a short lookahead (the drum
 * filter needs ~0.4 s), so a live version can run the same steps on audio
 * as it arrives; only the smoothing in chordModel.ts needs the whole song.
 */

/** Analysis rate. Chord tones and their first overtones sit well below 5 kHz. */
export const ANALYSIS_RATE = 11025;
/** ~0.37 s windows: long enough to separate semitones down to ~80 Hz. */
export const FRAME_SIZE = 4096;
/** ~46 ms between frames. */
export const HOP = 512;
export const FRAME_SECONDS = HOP / ANALYSIS_RATE;

const MIN_HZ = 30;
const MAX_HZ = 4000;

/** Fractional positions the resampling kernel is computed at. */
const KERNEL_PHASES = 256;

/**
 * Band-limited resampling with a windowed-sinc kernel, low-passed below the
 * new Nyquist frequency so nothing above it folds back in. The kernel is
 * computed once for KERNEL_PHASES positions between input samples
 * (polyphase), so the inner loop only multiplies and adds: computing it per
 * sample took seconds per song where phones and tests are slow at Math.sin.
 */
export function resample(input: Float32Array, fromRate: number, toRate = ANALYSIS_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  // Cutoff in cycles per input sample, a little under the new Nyquist.
  const cutoff = Math.min(0.5, 0.45 / ratio);
  const halfWidth = Math.ceil(8 / cutoff);
  const taps = 2 * halfWidth;
  // table[p * taps + j]: the weight of input sample (base - halfWidth + 1 + j)
  // for an output at base + p / KERNEL_PHASES.
  const table = new Float64Array((KERNEL_PHASES + 1) * taps);
  for (let p = 0; p <= KERNEL_PHASES; p++) {
    for (let j = 0; j < taps; j++) {
      const x = j - halfWidth + 1 - p / KERNEL_PHASES;
      const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      // Blackman window over the kernel.
      const w = 0.42 + 0.5 * Math.cos((Math.PI * x) / halfWidth) + 0.08 * Math.cos((2 * Math.PI * x) / halfWidth);
      table[p * taps + j] = Math.abs(x) >= halfWidth ? 0 : sinc * w;
    }
  }

  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  const last = input.length - 1;
  for (let n = 0; n < length; n++) {
    const center = n * ratio;
    const base = Math.floor(center);
    const phase = (center - base) * KERNEL_PHASES;
    const p = Math.floor(phase);
    const mix = phase - p;
    const row = p * taps;
    const nextRow = row + taps;
    const first = base - halfWidth + 1;
    const from = first < 0 ? -first : 0;
    const to = first + taps - 1 > last ? last - first : taps - 1;
    let sum = 0;
    for (let j = from; j <= to; j++) {
      sum += input[first + j] * (table[row + j] * (1 - mix) + table[nextRow + j] * mix);
    }
    output[n] = sum;
  }
  return output;
}

export type Spectrogram = {
  /** frames[t][k] is the magnitude of bin `firstBin + k` in frame t. */
  frames: Float32Array[];
  firstBin: number;
  binHz: number;
};

/** Magnitude spectrogram of the analysis-rate signal, 30 Hz to 4 kHz. */
export function spectrogram(signal: Float32Array): Spectrogram {
  const binHz = ANALYSIS_RATE / FRAME_SIZE;
  const firstBin = Math.ceil(MIN_HZ / binHz);
  const lastBin = Math.floor(MAX_HZ / binHz);
  const frames: Float32Array[] = [];
  const window = new Float32Array(FRAME_SIZE);
  // Frames are centred on t * HOP, padding the ends with silence.
  for (let center = 0; center < signal.length; center += HOP) {
    const start = center - FRAME_SIZE / 2;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const j = start + i;
      window[i] = j >= 0 && j < signal.length ? signal[j] : 0;
    }
    const mags = magnitudeSpectrum(window);
    frames.push(Float32Array.from(mags.subarray(firstBin, lastBin + 1)));
  }
  return { frames, firstBin, binHz };
}

/** Median of `values[0..n)`, reordering them (quickselect). */
function median(values: Float32Array, n: number): number {
  let lo = 0;
  let hi = n - 1;
  const k = n >> 1;
  while (lo < hi) {
    const pivot = values[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (values[i] < pivot) i++;
      while (values[j] > pivot) j--;
      if (i <= j) {
        const t = values[i];
        values[i] = values[j];
        values[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return values[k];
}

/** Frames before and after for the time median (~0.4 s each way). */
const HARMONIC_SPAN = 8;
/** Bins below and above for the frequency median (~22 Hz each way). */
const PERCUSSIVE_SPAN = 8;

/**
 * Harmonic/percussive separation by median filtering (FitzGerald 2010):
 * sustained notes are smooth along time, drum hits along frequency. Keeps
 * the harmonic part with a soft mask.
 */
export function harmonicPart({ frames, firstBin, binHz }: Spectrogram, onProgress?: (fraction: number) => void): Spectrogram {
  const bins = frames[0]?.length ?? 0;
  const scratch = new Float32Array(2 * Math.max(HARMONIC_SPAN, PERCUSSIVE_SPAN) + 1);
  const out: Float32Array[] = frames.map(() => new Float32Array(bins));
  for (let t = 0; t < frames.length; t++) {
    if (onProgress && t % 200 === 0) onProgress(t / frames.length);
    const frame = frames[t];
    // Loop bounds are worked out first: calls in a loop condition are slow on
    // Hermes and in Babel-compiled tests.
    const firstFrame = Math.max(0, t - HARMONIC_SPAN);
    const lastFrame = Math.min(frames.length - 1, t + HARMONIC_SPAN);
    for (let k = 0; k < bins; k++) {
      let n = 0;
      for (let u = firstFrame; u <= lastFrame; u++) scratch[n++] = frames[u][k];
      const h = median(scratch, n);
      n = 0;
      const lowBin = k > PERCUSSIVE_SPAN ? k - PERCUSSIVE_SPAN : 0;
      const highBin = k + PERCUSSIVE_SPAN < bins ? k + PERCUSSIVE_SPAN : bins - 1;
      for (let b = lowBin; b <= highBin; b++) scratch[n++] = frame[b];
      const p = median(scratch, n);
      const h2 = h * h;
      const p2 = p * p;
      out[t][k] = h2 + p2 > 0 ? (frame[k] * h2) / (h2 + p2) : 0;
    }
  }
  return { frames: out, firstBin, binHz };
}

/**
 * How far the recording is from A4 = 440 Hz, in cents (-50 to 50): the
 * magnitude-weighted circular mean of where spectral peaks fall between
 * semitones. Old recordings and some bands are a bit sharp or flat.
 */
export function estimateTuning({ frames, firstBin, binHz }: Spectrogram): number {
  let re = 0;
  let im = 0;
  for (let t = 0; t < frames.length; t += 2) {
    const frame = frames[t];
    let max = 0;
    for (let k = 0; k < frame.length; k++) max = Math.max(max, frame[k]);
    if (max === 0) continue;
    for (let k = 1; k < frame.length - 1; k++) {
      const m = frame[k];
      if (m < max * 0.05 || m <= frame[k - 1] || m < frame[k + 1]) continue;
      const a = Math.log(frame[k - 1] + 1e-12);
      const b = Math.log(m);
      const c = Math.log(frame[k + 1] + 1e-12);
      const denominator = a - 2 * b + c;
      const offset = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator;
      const frequency = (firstBin + k + offset) * binHz;
      if (frequency < 80 || frequency > 2000) continue;
      const angle = 2 * Math.PI * (12 * Math.log2(frequency / 440));
      re += m * Math.cos(angle);
      im += m * Math.sin(angle);
    }
  }
  return re === 0 && im === 0 ? 0 : (Math.atan2(im, re) / (2 * Math.PI)) * 100;
}

/** MIDI range of the semitone spectrum: A1 (55 Hz) to C7. */
const LOWEST_NOTE = 33;
const HIGHEST_NOTE = 96;
/** The bass chroma: A1 to G#3 (55-208 Hz). */
const BASS_TOP = 56;
/** The treble chroma: A2 to C7, where chords are usually voiced. */
const TREBLE_BOTTOM = 45;

export type ChromaFrame = {
  /** Strength of each pitch class (0 = C) above the bass, normalised to sum 1 (or all 0). */
  treble: Float32Array;
  /** The same for the bass range. */
  bass: Float32Array;
  /** Overall harmonic energy, for telling quiet passages apart. */
  energy: number;
};

/**
 * Semitone spectrum per frame (each note's bins weighted by a triangle
 * around its tuned frequency), log-compressed and with the local noise floor
 * removed, then folded into bass and treble chroma.
 */
export function chroma(spec: Spectrogram, tuningCents: number): ChromaFrame[] {
  const { frames, firstBin, binHz } = spec;
  const notes = HIGHEST_NOTE - LOWEST_NOTE + 1;
  // For each note: the bins it covers and their weights.
  const kernels = Array.from({ length: notes }, (_, i) => {
    const midi = LOWEST_NOTE + i;
    const center = 440 * Math.pow(2, (midi - 69 + tuningCents / 100) / 12);
    const lo = center * Math.pow(2, -1 / 12);
    const hi = center * Math.pow(2, 1 / 12);
    const weights: { bin: number; weight: number }[] = [];
    for (let b = Math.ceil(lo / binHz); b <= Math.floor(hi / binHz); b++) {
      const k = b - firstBin;
      if (k < 0 || k >= (frames[0]?.length ?? 0)) continue;
      const semitones = Math.abs(12 * Math.log2((b * binHz) / center));
      weights.push({ bin: k, weight: Math.max(0, 1 - semitones) });
    }
    return weights;
  });

  const semitone = new Float32Array(notes);
  const whitened = new Float32Array(notes);
  return frames.map((frame) => {
    let energy = 0;
    for (let i = 0; i < notes; i++) {
      let sum = 0;
      for (const { bin, weight } of kernels[i]) sum += frame[bin] * weight;
      energy += sum;
      semitone[i] = Math.log(1 + 100 * sum);
    }
    // Subtract the mean of the surrounding octave: a broadband floor (noise,
    // leftover drums) lifts every note equally and says nothing about the chord.
    for (let i = 0; i < notes; i++) {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - 6); j <= Math.min(notes - 1, i + 6); j++) {
        sum += semitone[j];
        n++;
      }
      whitened[i] = Math.max(0, semitone[i] - sum / n);
    }
    const treble = new Float32Array(12);
    const bass = new Float32Array(12);
    for (let i = 0; i < notes; i++) {
      const midi = LOWEST_NOTE + i;
      if (midi <= BASS_TOP) bass[midi % 12] += whitened[i];
      if (midi >= TREBLE_BOTTOM) treble[midi % 12] += whitened[i];
    }
    normalise(treble);
    normalise(bass);
    return { treble, bass, energy };
  });
}

function normalise(values: Float32Array) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  if (sum > 0) for (let i = 0; i < values.length; i++) values[i] /= sum;
}

import { ChromaFrame, Spectrogram } from './frames';

/**
 * Beat tracking (Ellis 2007, "Beat Tracking by Dynamic Programming"): an
 * onset curve from the spectrogram, the tempo from how that curve repeats,
 * then the row of beats that best fits both. Chords usually change on a
 * beat, so the chord model uses the beats to make changes there likely and
 * changes between them unlikely.
 */

export type Beats = {
  /** Frame index of each beat. */
  frames: number[];
  bpm: number;
};

const MIN_BPM = 40;
const MAX_BPM = 180;
/** Most songs sit near this tempo; the tempo estimate leans towards it. */
const PREFERRED_BPM = 120;
/** Width of the tempo preference, in octaves: narrower makes half or double the tempo less likely. */
const TEMPO_SPREAD = 0.5;
/** How much the beat spacing may stretch (Ellis's "tightness"). */
const TIGHTNESS = 100;

/**
 * How much new energy appears in each frame: the rise in log magnitude,
 * summed over all bins, with the slowly changing level taken out.
 */
export function onsetStrength({ frames }: Spectrogram, frameSeconds: number): Float32Array {
  const onset = new Float32Array(frames.length);
  for (let t = 1; t < frames.length; t++) {
    const now = frames[t];
    const before = frames[t - 1];
    let flux = 0;
    for (let k = 0; k < now.length; k++) {
      const rise = Math.log(1 + 1000 * now[k]) - Math.log(1 + 1000 * before[k]);
      if (rise > 0) flux += rise;
    }
    onset[t] = flux;
  }
  // Subtract a ~1 s moving average, keep the rises above it, and scale to unit spread.
  const half = Math.round(0.5 / frameSeconds);
  const out = new Float32Array(onset.length);
  for (let t = 0; t < onset.length; t++) {
    let local = 0;
    let count = 0;
    for (let u = Math.max(0, t - half); u <= Math.min(onset.length - 1, t + half); u++) {
      local += onset[u];
      count++;
    }
    out[t] = Math.max(0, onset[t] - local / count);
  }
  return unitSpread(out);
}

/** Seconds of chroma compared before and after each frame. */
const HARMONIC_CHANGE_SECONDS = 0.4;

/**
 * How much the harmony changes at each frame: how different the chroma just
 * after it is from the chroma just before (Harte et al. 2006). Chord
 * changes fall on beats, often more reliably than drum hits or strums do
 * (strummed guitar is often loudest between the beats), so this helps the
 * beat tracker put its beats where the chords change.
 */
export function harmonicChange(frames: ChromaFrame[], frameSeconds: number): Float32Array {
  const span = Math.max(1, Math.round(HARMONIC_CHANGE_SECONDS / frameSeconds));
  const out = new Float32Array(frames.length);
  const before = new Float64Array(24);
  const after = new Float64Array(24);
  for (let t = span; t < frames.length - span; t++) {
    before.fill(0);
    after.fill(0);
    for (let u = 0; u < span; u++) {
      for (let k = 0; k < 12; k++) {
        before[k] += frames[t - 1 - u].treble[k];
        before[12 + k] += frames[t - 1 - u].bass[k];
        after[k] += frames[t + u].treble[k];
        after[12 + k] += frames[t + u].bass[k];
      }
    }
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let k = 0; k < 24; k++) {
      dot += before[k] * after[k];
      na += before[k] * before[k];
      nb += after[k] * after[k];
    }
    out[t] = na > 0 && nb > 0 ? 1 - dot / Math.sqrt(na * nb) : 0;
  }
  return unitSpread(out);
}

function unitSpread(values: Float32Array) {
  let sum = 0;
  for (let t = 0; t < values.length; t++) sum += values[t] * values[t];
  const spread = Math.sqrt(sum / Math.max(1, values.length));
  if (spread > 0) for (let t = 0; t < values.length; t++) values[t] /= spread;
  return values;
}

/** The beat period in frames: the autocorrelation peak, weighted towards PREFERRED_BPM. */
function beatPeriod(onset: Float32Array, frameSeconds: number): number {
  const minLag = Math.floor(60 / MAX_BPM / frameSeconds);
  const maxLag = Math.ceil(60 / MIN_BPM / frameSeconds);
  const preferred = 60 / PREFERRED_BPM / frameSeconds;
  let best = minLag;
  let bestScore = -Infinity;
  const scores = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1 && lag < onset.length; lag++) {
    let sum = 0;
    for (let t = lag; t < onset.length; t++) sum += onset[t] * onset[t - lag];
    scores[lag] = sum / (onset.length - lag);
  }
  for (let lag = minLag; lag <= maxLag && lag < onset.length; lag++) {
    // A log-normal weight around the preferred tempo.
    const octaves = Math.log2(lag / preferred);
    const score = scores[lag] * Math.exp(-0.5 * (octaves / TEMPO_SPREAD) ** 2);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  // Parabolic interpolation for a fractional period.
  const a = scores[best - 1] ?? scores[best];
  const b = scores[best];
  const c = scores[best + 1] ?? scores[best];
  const denominator = a - 2 * b + c;
  return best + (denominator === 0 ? 0 : (0.5 * (a - c)) / denominator);
}

/**
 * The tempo comes from `onset` alone; the beats are placed on `placement`
 * (by default the same), which can add evidence such as harmonic change
 * that would pull the tempo towards the length of a chord.
 */
export function trackBeats(onset: Float32Array, frameSeconds: number, placement: Float32Array = onset): Beats {
  const T = onset.length;
  if (T < 4) return { frames: [], bpm: 0 };
  const period = beatPeriod(onset, frameSeconds);
  // score[t]: the best total for a row of beats ending with one at t.
  const score = new Float64Array(T);
  const previous = new Int32Array(T).fill(-1);
  const from = Math.round(period / 2);
  const to = Math.round(period * 2);
  for (let t = 0; t < T; t++) {
    let best = 0;
    let bestFrom = -1;
    for (let u = t - to; u <= t - from; u++) {
      if (u < 0) continue;
      const stretch = Math.log((t - u) / period);
      const candidate = score[u] - TIGHTNESS * stretch * stretch;
      if (bestFrom < 0 || candidate > best) {
        best = candidate;
        bestFrom = u;
      }
    }
    score[t] = placement[t] + (bestFrom >= 0 ? Math.max(0, best) : 0);
    previous[t] = bestFrom >= 0 && best > 0 ? bestFrom : -1;
  }
  // End on the best beat within the last period, and walk back.
  let last = Math.max(0, T - Math.round(period));
  for (let t = last; t < T; t++) if (score[t] > score[last]) last = t;
  const frames: number[] = [];
  for (let t = last; t >= 0; t = previous[t]) frames.push(t);
  frames.reverse();
  return { frames, bpm: 60 / (period * frameSeconds) };
}

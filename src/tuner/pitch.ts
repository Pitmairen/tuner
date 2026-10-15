export type PitchResult = {
  frequency: number;
  /** 0–1, how periodic the signal is. Higher is more trustworthy. */
  clarity: number;
};

type DetectOptions = {
  minFrequency?: number;
  maxFrequency?: number;
  /** YIN absolute threshold. Lower is stricter. */
  threshold?: number;
  /** RMS below this is treated as silence. */
  silenceRms?: number;
  /**
   * Downsampling factor applied before analysis. Low notes need long windows,
   * and the O(n·τ) difference function only stays cheap at a reduced rate.
   * Defaults to 2 for rates of 32 kHz and up.
   */
  decimation?: number;
};

/**
 * Detects the fundamental frequency of a mono buffer with the YIN algorithm
 * (de Cheveigné & Kawahara, 2002). Returns null for silence or noise.
 */
export function detectPitch(
  input: Float32Array,
  sampleRate: number,
  { minFrequency = 60, maxFrequency = 1200, threshold = 0.15, silenceRms = 0.008, decimation }: DetectOptions = {},
): PitchResult | null {
  // Instrument fundamentals sit well below 1.2 kHz, so the signal can be
  // downsampled to cut the O(n·τ) cost of the difference function.
  const factor = decimation ?? (sampleRate >= 32000 ? 2 : 1);
  const buffer = factor > 1 ? decimate(input, factor) : input;
  const rate = sampleRate / factor;

  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
  if (Math.sqrt(sumSquares / buffer.length) < silenceRms) return null;

  const tauMin = Math.max(2, Math.floor(rate / maxFrequency));
  const tauMax = Math.min(Math.floor(rate / minFrequency), Math.floor(buffer.length / 2));
  const window = buffer.length - tauMax;
  if (tauMax <= tauMin || window <= 0) return null;

  // Cumulative mean normalized difference, d'(τ).
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let diff = 0;
    for (let i = 0; i < window; i++) {
      const delta = buffer[i] - buffer[i + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    cmnd[tau] = runningSum === 0 ? 1 : (diff * tau) / runningSum;
  }

  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  const coarsePeriod = refineTau(cmnd, tau, tauMax) * factor;
  const period = factor > 1 ? refineAtFullRate(input, coarsePeriod, factor) : coarsePeriod;
  return { frequency: sampleRate / period, clarity: 1 - cmnd[tau] };
}

/**
 * Downsampling makes the period estimate coarse (a 440 Hz period is only ~27
 * samples at 12 kHz). Re-evaluate the difference function on the original
 * signal at just the few lags around the estimate, which restores full
 * accuracy for almost no cost.
 */
function refineAtFullRate(input: Float32Array, coarsePeriod: number, factor: number): number {
  const lo = Math.max(2, Math.floor(coarsePeriod) - factor);
  const hi = Math.ceil(coarsePeriod) + factor;
  const window = input.length - (hi + 1);
  if (window <= 0) return coarsePeriod;

  const diff = new Float64Array(hi - lo + 3);
  for (let tau = lo - 1; tau <= hi + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const delta = input[i] - input[i + tau];
      sum += delta * delta;
    }
    diff[tau - lo + 1] = sum;
  }

  let best = 1;
  for (let k = 2; k <= hi - lo + 1; k++) if (diff[k] < diff[best]) best = k;
  const prev = diff[best - 1];
  const curr = diff[best];
  const next = diff[best + 1];
  const denominator = 2 * (2 * curr - next - prev);
  const offset = denominator === 0 ? 0 : (next - prev) / denominator;
  return lo - 1 + best + offset;
}

/** Parabolic interpolation around the minimum for sub-sample accuracy. */
function refineTau(cmnd: Float32Array, tau: number, tauMax: number): number {
  if (tau < 1 || tau >= tauMax) return tau;
  const prev = cmnd[tau - 1];
  const curr = cmnd[tau];
  const next = cmnd[tau + 1];
  const denominator = 2 * (2 * curr - next - prev);
  return denominator === 0 ? tau : tau + (next - prev) / denominator;
}

/** Averages each run of `factor` samples: a crude but cheap low-pass and downsample. */
function decimate(input: Float32Array, factor: number): Float32Array {
  const output = new Float32Array(Math.floor(input.length / factor));
  for (let i = 0; i < output.length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += input[i * factor + j];
    output[i] = sum / factor;
  }
  return output;
}

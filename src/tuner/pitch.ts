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
};

/**
 * Detects the fundamental frequency of a mono buffer with the YIN algorithm
 * (de Cheveigné & Kawahara, 2002). Returns null for silence or noise.
 */
export function detectPitch(
  input: Float32Array,
  sampleRate: number,
  { minFrequency = 60, maxFrequency = 1200, threshold = 0.15, silenceRms = 0.008 }: DetectOptions = {},
): PitchResult | null {
  // Guitar fundamentals sit well below 1.2 kHz, so halve high sample rates to
  // cut the O(n·τ) cost of the difference function.
  let buffer = input;
  let rate = sampleRate;
  if (sampleRate >= 32000) {
    buffer = decimateByTwo(input);
    rate = sampleRate / 2;
  }

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

  return {
    frequency: rate / refineTau(cmnd, tau, tauMax),
    clarity: 1 - cmnd[tau],
  };
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

function decimateByTwo(input: Float32Array): Float32Array {
  const output = new Float32Array(Math.floor(input.length / 2));
  for (let i = 0; i < output.length; i++) {
    output[i] = (input[2 * i] + input[2 * i + 1]) * 0.5;
  }
  return output;
}

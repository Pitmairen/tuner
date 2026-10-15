export type Steadiness = 'fast' | 'balanced' | 'stable';

export const STEADINESS_OPTIONS: { id: Steadiness; label: string; description: string }[] = [
  { id: 'fast', label: 'Fast', description: 'Reacts instantly, jumpier' },
  { id: 'balanced', label: 'Balanced', description: 'A steady, responsive needle' },
  { id: 'stable', label: 'Stable', description: 'Calmer; for noisy rooms and low strings' },
];

export const DEFAULT_STEADINESS: Steadiness = 'balanced';

type Smoothing = {
  /** Readings in the rolling median. */
  history: number;
  /** Exponential smoothing weight for each new median (1 = none). */
  follow: number;
};

const SMOOTHING: Record<Steadiness, Smoothing> = {
  fast: { history: 3, follow: 1 },
  balanced: { history: 5, follow: 1 },
  stable: { history: 9, follow: 0.3 },
};

/** Spring for the gauge needle (React Native Animated.spring config). */
export const NEEDLE_SPRING: Record<Steadiness, { stiffness: number; damping: number; mass: number }> = {
  fast: { stiffness: 280, damping: 24, mass: 0.5 },
  balanced: { stiffness: 180, damping: 20, mass: 0.6 },
  stable: { stiffness: 90, damping: 18, mass: 0.8 },
};

/** A jump bigger than this is a new note, not noise, so smoothing restarts there. */
const RESET_CENTS = 50;

/**
 * Smooths a stream of detected frequencies: a rolling median to reject
 * outliers, then optional exponential smoothing (in cents) to calm jitter.
 */
export class PitchSmoother {
  private steadiness: Steadiness;
  private history: number[] = [];
  private smoothedLog: number | null = null;

  constructor(steadiness: Steadiness) {
    this.steadiness = steadiness;
  }

  setSteadiness(steadiness: Steadiness) {
    this.steadiness = steadiness;
  }

  push(frequency: number): number {
    const { history, follow } = SMOOTHING[this.steadiness];
    this.history = [...this.history.slice(-(history - 1)), frequency];
    const log = Math.log2(median(this.history));
    if (this.smoothedLog == null || Math.abs(1200 * (log - this.smoothedLog)) > RESET_CENTS) {
      this.smoothedLog = log;
    } else {
      this.smoothedLog += follow * (log - this.smoothedLog);
    }
    return 2 ** this.smoothedLog;
  }

  reset() {
    this.history = [];
    this.smoothedLog = null;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

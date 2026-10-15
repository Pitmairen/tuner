import { ChordResult } from './detectChord';

/** Consecutive matching detections needed before a new chord is shown. */
const CONFIRMATIONS = 2;
/** How long a chord stays on screen after detections stop. */
const HOLD_MS = 2500;

/**
 * Turns a noisy stream of per-frame chord detections into a steady display:
 * a chord appears once it's been heard twice in a row, stays while the strum
 * rings out, and clears a while after the sound stops.
 */
export class ChordStabilizer {
  private shown: ChordResult | null = null;
  private lastConfirmedAt = 0;
  private candidate: ChordResult | null = null;
  private candidateCount = 0;

  /** Feeds one detection (null = nothing chord-like); returns what to display. */
  push(result: ChordResult | null, now: number): ChordResult | null {
    if (result) {
      if (result.name === this.candidate?.name) {
        this.candidateCount++;
      } else {
        this.candidate = result;
        this.candidateCount = 1;
      }
      if (this.candidateCount >= CONFIRMATIONS || result.name === this.shown?.name) {
        // Keep the freshest notes and confidence for the chord being shown.
        this.shown = result;
        this.lastConfirmedAt = now;
      }
    } else {
      this.candidate = null;
      this.candidateCount = 0;
    }
    if (this.shown && now - this.lastConfirmedAt > HOLD_MS) this.shown = null;
    return this.shown;
  }

  reset() {
    this.shown = null;
    this.candidate = null;
    this.candidateCount = 0;
  }
}

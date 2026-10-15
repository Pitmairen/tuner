/**
 * Keeps the last few seconds of microphone audio in memory, so a clip can be
 * shared when detection gets something wrong. Nothing is written anywhere
 * unless `snapshot` is called and the caller saves it.
 */
export class ClipRecorder {
  private readonly seconds: number;
  private buffer: Float32Array = new Float32Array(0);
  private sampleRate = 0;
  private written = 0;

  constructor(seconds: number) {
    this.seconds = seconds;
  }

  push(samples: Float32Array, sampleRate: number) {
    if (sampleRate !== this.sampleRate) {
      this.sampleRate = sampleRate;
      this.buffer = new Float32Array(Math.round(sampleRate * this.seconds));
      this.written = 0;
    }
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.written % this.buffer.length] = samples[i];
      this.written++;
    }
  }

  /** The audio held, oldest first; null if nothing has been heard yet. */
  snapshot(): { samples: Float32Array; sampleRate: number } | null {
    if (this.written === 0) return null;
    const length = Math.min(this.written, this.buffer.length);
    const start = this.written - length;
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) samples[i] = this.buffer[(start + i) % this.buffer.length];
    return { samples, sampleRate: this.sampleRate };
  }
}

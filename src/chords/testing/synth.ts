/**
 * Test-only guitar strum synthesizer. Deliberately messier than the app's
 * reference-tone synth, so the chord detector isn't tested against the same
 * idealised model: detuned strings, inharmonic overtones, random pick
 * position and loudness, a phone-mic-like bass roll-off, strum timing and noise.
 */

export const SAMPLE_RATE = 48000;
/** Analysis window the detector is designed for (~0.34 s). */
export const WINDOW = 16384;

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type StrumOptions = {
  seed: number;
  /** Max random detune per string, in cents. */
  detuneCents?: number;
  /** Signal-to-noise ratio in dB. */
  snrDb?: number;
  /** Time from the first to the last string, in ms. */
  strumMs?: number;
  /** Where the window starts after the first string, in ms. */
  startMs?: number;
};

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Returns the analysis window of a strum of `notes` (MIDI numbers, low to high). */
export function strum(
  notes: number[],
  { seed, detuneCents = 5, snrDb = 30, strumMs = 25, startMs = 90 }: StrumOptions,
): Float32Array {
  const rand = random(seed);
  const out = new Float32Array(WINDOW);
  const start = (startMs / 1000) * SAMPLE_RATE;

  notes.forEach((midi, string) => {
    const onset = ((string / Math.max(1, notes.length - 1)) * strumMs * SAMPLE_RATE) / 1000;
    const f0 = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * detuneCents) / 1200);
    const loudness = 0.6 + 0.4 * rand();
    const pickPosition = 0.08 + 0.17 * rand();
    const inharmonicity = 0.00005 + 0.00015 * rand();

    for (let h = 1; h <= 20; h++) {
      const f = h * f0 * Math.sqrt(1 + inharmonicity * h * h);
      if (f > 6000) break;
      // Plucked-string spectrum, shaped by where the string was picked.
      let amplitude = (loudness * Math.abs(Math.sin(Math.PI * h * pickPosition))) / h ** 1.1;
      // Phone microphones roll off below ~100 Hz.
      amplitude /= 1 + (100 / f) ** 2;
      const decayPerSecond = 0.8 + 0.5 * h;
      const phase = 2 * Math.PI * rand();
      const omega = (2 * Math.PI * f) / SAMPLE_RATE;
      // Rotate a decaying phasor rather than calling sin/exp per sample.
      const first = Math.max(0, Math.ceil(onset - start));
      const t0 = start + first - onset;
      const envelope = amplitude * Math.exp((-decayPerSecond * t0) / SAMPLE_RATE);
      let re = envelope * Math.cos(omega * t0 + phase);
      let im = envelope * Math.sin(omega * t0 + phase);
      const decay = Math.exp(-decayPerSecond / SAMPLE_RATE);
      const cos = Math.cos(omega) * decay;
      const sin = Math.sin(omega) * decay;
      for (let i = first; i < WINDOW; i++) {
        out[i] += im;
        const nextRe = re * cos - im * sin;
        im = re * sin + im * cos;
        re = nextRe;
      }
    }
  });

  let power = 0;
  for (let i = 0; i < WINDOW; i++) power += out[i] * out[i];
  const noise = Math.sqrt(power / WINDOW) * 10 ** (-snrDb / 20);
  for (let i = 0; i < WINDOW; i++) {
    // Sum of uniforms: close enough to Gaussian noise.
    out[i] += noise * (rand() + rand() + rand() - 1.5) * 2;
  }
  return out;
}

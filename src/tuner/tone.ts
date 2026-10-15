export const TONE_DURATION_S = 2.5;
/** Time between strings in a strum. */
export const STRUM_GAP_S = 0.35;
const SAMPLE_RATE = 44100;
const MIN_HARMONICS = 8;
const MAX_HARMONICS = 24;
const ATTACK_S = 0.004;
const RELEASE_S = 0.08;

/**
 * Synthesizes a plucked-string-like note as a 16-bit mono WAV file.
 * Additive synthesis keeps the pitch exact, which matters for a reference tone.
 */
export function synthesizeToneWav(frequency: number): Uint8Array {
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * TONE_DURATION_S));
  addPluck(samples, frequency, 0);
  return encodeWav(finish(samples));
}

/** Synthesizes the notes plucked one after another, each left ringing. */
export function synthesizeStrumWav(frequencies: number[]): Uint8Array {
  const gap = Math.floor(SAMPLE_RATE * STRUM_GAP_S);
  const samples = new Float32Array(gap * (frequencies.length - 1) + Math.floor(SAMPLE_RATE * TONE_DURATION_S));
  frequencies.forEach((frequency, i) => addPluck(samples, frequency, i * gap));
  return encodeWav(finish(samples));
}

export function strumDurationS(stringCount: number): number {
  return STRUM_GAP_S * (stringCount - 1) + TONE_DURATION_S;
}

/** Mixes one decaying note into `samples`, starting at `offset`. */
function addPluck(samples: Float32Array, frequency: number, offset: number) {
  const attack = ATTACK_S * SAMPLE_RATE;
  // Phone speakers can't reproduce deep bass fundamentals, so low notes get
  // harmonics up to ~600 Hz; the ear infers the missing fundamental from them.
  const harmonics = Math.min(MAX_HARMONICS, Math.max(MIN_HARMONICS, Math.round(600 / frequency)));
  for (let h = 1; h <= harmonics; h++) {
    const f = frequency * h;
    if (f > SAMPLE_RATE / 2.2) break;
    // Higher harmonics die out faster, like a real string.
    const decay = Math.exp(-(1.6 + h * 0.9) / SAMPLE_RATE);
    const omega = (2 * Math.PI * f) / SAMPLE_RATE;
    // Rotate a phasor instead of calling sin/exp per sample; this is several
    // times faster on Hermes and exact enough for a few seconds of audio.
    const cos = Math.cos(omega) * decay;
    const sin = Math.sin(omega) * decay;
    let re = 1 / Math.pow(h, 1.3);
    let im = 0;
    for (let i = offset; i < samples.length; i++) {
      const n = i - offset;
      samples[i] += n < attack ? (im * n) / attack : im;
      const nextRe = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nextRe;
    }
  }
}

/** Applies the final fade-out and normalizes to a comfortable peak. */
function finish(samples: Float32Array): Float32Array {
  const release = RELEASE_S * SAMPLE_RATE;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= Math.min(1, (samples.length - i) / release);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const gain = peak > 0 ? 0.8 / peak : 0;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

function encodeWav(samples: Float32Array): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return bytes;
}

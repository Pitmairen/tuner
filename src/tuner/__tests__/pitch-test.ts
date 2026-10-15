import { midiToFrequency } from '../notes';
import { detectPitch } from '../pitch';
import { instrument, WIDE_DETECTION } from '../tunings';

const SAMPLE_RATE = 48000;

/** A plucked-string-like tone: a fundamental plus decaying harmonics. */
function tone(frequency: number, length: number, { fundamental = 1, noise = 0.01 } = {}) {
  const out = new Float32Array(length);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < length; i++) {
    let x = fundamental * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
    for (let h = 2; h <= 6; h++) x += (0.8 / h) * Math.sin((2 * Math.PI * frequency * h * i) / SAMPLE_RATE + h);
    out[i] = 0.3 * x + noise * (rand() - 0.5);
  }
  return out;
}

const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected);

describe('detectPitch', () => {
  const guitar = instrument('guitar').detection;
  const guitarOptions = { minFrequency: guitar.minFrequency, maxFrequency: guitar.maxFrequency, decimation: guitar.decimation };

  it.each([40, 45, 50, 55, 59, 64, 76])('finds guitar note %i within 0.5 cents', (midi) => {
    const f = midiToFrequency(midi);
    const result = detectPitch(tone(f, guitar.windowSize), SAMPLE_RATE, guitarOptions);
    expect(Math.abs(cents(result!.frequency, f))).toBeLessThan(0.5);
  });

  it('finds the pitch even when the fundamental is missing (as through a phone mic)', () => {
    const f = midiToFrequency(40);
    const result = detectPitch(tone(f, guitar.windowSize, { fundamental: 0 }), SAMPLE_RATE, guitarOptions);
    expect(Math.abs(cents(result!.frequency, f))).toBeLessThan(0.5);
  });

  it.each([23, 28, 33])('finds bass note %i with the wide detection', (midi) => {
    const f = midiToFrequency(midi);
    const { windowSize, minFrequency, maxFrequency, decimation } = WIDE_DETECTION;
    const result = detectPitch(tone(f, windowSize), SAMPLE_RATE, { minFrequency, maxFrequency, decimation });
    expect(Math.abs(cents(result!.frequency, f))).toBeLessThan(0.5);
  });

  it('cannot hear bass notes below the guitar detection floor', () => {
    expect(detectPitch(tone(midiToFrequency(28), guitar.windowSize), SAMPLE_RATE, guitarOptions)).toBeNull();
  });

  it('returns null for silence and for noise', () => {
    expect(detectPitch(new Float32Array(4096), SAMPLE_RATE, guitarOptions)).toBeNull();
    let seed = 7;
    const noise = Float32Array.from({ length: 4096 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
    const result = detectPitch(noise, SAMPLE_RATE, guitarOptions);
    expect(result == null || result.clarity < 0.85).toBe(true);
  });
});

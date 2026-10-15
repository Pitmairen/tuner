import { PitchSmoother } from '../steadiness';

const fromCents = (base: number, cents: number) => base * 2 ** (cents / 1200);
const toCents = (f: number, base: number) => 1200 * Math.log2(f / base);

describe('PitchSmoother', () => {
  it('ignores a one-off outlier (an octave glitch)', () => {
    const smoother = new PitchSmoother('balanced');
    const outputs = [110, 110, 220, 110, 110].map((f) => smoother.push(f));
    expect(outputs.every((f) => Math.abs(toCents(f, 110)) < 1)).toBe(true);
  });

  it('jumps straight to a new note instead of gliding', () => {
    const smoother = new PitchSmoother('stable');
    for (let i = 0; i < 10; i++) smoother.push(110);
    // A new string, a fourth up: within a few readings it should be there.
    const outputs = Array.from({ length: 6 }, () => smoother.push(fromCents(110, 500)));
    expect(Math.abs(toCents(outputs[outputs.length - 1], fromCents(110, 500)))).toBeLessThan(1);
  });

  it('calms jitter more in Stable than in Fast', () => {
    const jitter = Array.from({ length: 60 }, (_, i) => fromCents(110, (((i * 7919) % 13) - 6) * 1.0));
    const spread = (mode: 'fast' | 'stable') => {
      const smoother = new PitchSmoother(mode);
      const out = jitter.map((f) => toCents(smoother.push(f), 110)).slice(10);
      return Math.max(...out) - Math.min(...out);
    };
    expect(spread('stable')).toBeLessThan(spread('fast'));
  });

  it('starts over after reset', () => {
    const smoother = new PitchSmoother('stable');
    for (let i = 0; i < 10; i++) smoother.push(110);
    smoother.reset();
    expect(smoother.push(220)).toBeCloseTo(220);
  });
});

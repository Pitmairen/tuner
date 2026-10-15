import { chordName, chordPitchClasses } from '../chords';
import { detectChord } from '../detectChord';
import { magnitudeSpectrum } from '../fft';
import { SAMPLE_RATE, strum, StrumOptions, WINDOW } from '../testing/synth';
import { allVoicings } from '../testing/voicings';

const sine = (hz: number, n = 4096, rate = 48000) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));

describe('magnitudeSpectrum', () => {
  it('puts a sine at its bin', () => {
    const mags = magnitudeSpectrum(sine(1500, 4096));
    const peak = mags.indexOf(Math.max(...mags));
    expect(peak * (48000 / 4096)).toBeCloseTo(1500, -1);
  });
});

describe('chordName', () => {
  it('names qualities and slash chords', () => {
    expect(chordName({ root: 9, quality: 'm7', bass: 9 })).toBe('Am7');
    expect(chordName({ root: 0, quality: 'maj', bass: 4 })).toBe('C/E');
    expect(chordName({ root: 4, quality: '5', bass: 4 })).toBe('E5');
    expect(chordPitchClasses(7, '7')).toEqual([7, 11, 2, 5]);
  });
});

describe('detectChord', () => {
  it('returns null for silence', () => {
    expect(detectChord(new Float32Array(WINDOW), SAMPLE_RATE)).toBeNull();
  });

  it('recognises an open C major strum', () => {
    const result = detectChord(strum([48, 52, 55, 60, 64], { seed: 1 }), SAMPLE_RATE);
    expect(result?.name).toBe('C');
  });

  it('does not call a single note a chord', () => {
    // Every note of a guitar's first five frets on each string, in two conditions.
    const misses: string[] = [];
    for (const open of [40, 45, 50, 55, 59, 64]) {
      for (let fret = 0; fret <= 5; fret++) {
        for (const snrDb of [30, 15]) {
          const result = detectChord(strum([open + fret], { seed: open * 10 + fret, snrDb }), SAMPLE_RATE);
          if (result) misses.push(`${open + fret} → ${result.name}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it('follows the reference pitch', () => {
    // An A minor chord played with everything 32 cents flat (A4 = 432).
    const flat = (midi: number) => midi - 0.32;
    const result = detectChord(strum([45, 52, 57, 60, 64].map(flat), { seed: 2, detuneCents: 2 }), SAMPLE_RATE, { a4: 432 });
    expect(result?.name).toBe('Am');
  });
});

/**
 * Accuracy over many synthesized strums. Prints a per-category table and
 * guards against regressions with minimum accuracies (set from measured
 * results, with a little slack).
 *
 * These numbers are an upper bound, not a prediction: the synthesizer has no
 * body resonance, room reverb, pick or fret noise, sympathetic strings or
 * microphone gain control. Real-world accuracy has to be measured on a device.
 */
describe('accuracy on synthesized strums', () => {
  /** Each voicing is strummed under progressively harder conditions. */
  const CONDITIONS: Omit<StrumOptions, 'seed'>[] = [
    {},
    { snrDb: 18 },
    { startMs: 400, detuneCents: 8, strumMs: 45 },
    // Rough: noisy room, badly tuned strings, sloppy strum, mostly decayed.
    { snrDb: 12, detuneCents: 12, strumMs: 80, startMs: 700 },
  ];
  const MIN_ACCURACY: Record<string, number> = {
    triads: 0.95,
    sevenths: 0.95,
    sus: 0.95,
    // Four open shapes only, so one miss in 16 strums is 6%.
    add9: 0.85,
    power: 0.95,
    'dim/aug': 0.95,
    // Few samples (12), and the hardest family: one miss is 8%.
    inversions: 0.75,
  };

  it('meets the minimum accuracy per chord family', () => {
    const tally: Record<string, { right: number; total: number; misses: string[] }> = {};
    const byCondition = CONDITIONS.map(() => ({ right: 0, total: 0 }));
    allVoicings().forEach((v, index) => {
      const entry = (tally[v.category] ??= { right: 0, total: 0, misses: [] });
      CONDITIONS.forEach((condition, c) => {
        const result = detectChord(strum(v.notes, { ...condition, seed: c * 1000 + index }), SAMPLE_RATE);
        const expected = chordName(v.expected);
        entry.total++;
        byCondition[c].total++;
        if (result?.name === expected) {
          entry.right++;
          byCondition[c].right++;
        }
        else entry.misses.push(`${v.label} [condition ${c + 1}] → ${result?.name ?? 'nothing'}`);
      });
    });

    const lines = Object.entries(tally).map(
      ([category, { right, total }]) =>
        `${category.padEnd(11)} ${String(right).padStart(4)}/${String(total).padEnd(4)} ${((100 * right) / total).toFixed(1).padStart(5)}%`,
    );
    lines.push(
      '',
      ...byCondition.map(
        ({ right, total }, c) => `condition ${c + 1}  ${right}/${total}  ${((100 * right) / total).toFixed(1)}%`,
      ),
    );
    const allMisses = Object.values(tally).flatMap((t) => t.misses);
    console.log(
      `Chord accuracy\n${lines.join('\n')}\n\nMisses (${allMisses.length}):\n${allMisses.slice(0, 60).join('\n')}`,
    );

    const accuracies = Object.fromEntries(Object.entries(tally).map(([c, t]) => [c, t.right / t.total]));
    for (const [category, minimum] of Object.entries(MIN_ACCURACY)) {
      // Wrapped in an object so a failure names the category.
      expect({ [category]: accuracies[category] >= minimum }).toEqual({ [category]: true });
    }
  });
});

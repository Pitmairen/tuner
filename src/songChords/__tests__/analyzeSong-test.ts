import { analyzeSong } from '../analyzeSong';
import { synthesizeSong } from '../testing/songSynth';

/**
 * The whole analysis on synthesized songs (drums, walking bass, a loud
 * melody outside the chords, reverb, off-pitch tuning). Synthesis is kinder
 * than real recordings, so these are lower limits, not a measure of
 * quality; real songs are checked by realSongs-test.ts.
 */
const SEEDS = [3, 11, 16];
const SECONDS = 24;

describe('analyzeSong on synthesized songs', () => {
  const results = SEEDS.map((seed) => {
    const song = synthesizeSong(seed, SECONDS);
    return { song, analysis: analyzeSong(song.samples, song.sampleRate) };
  });

  it.each(results.map((r, i) => [SEEDS[i], r] as const))('song %i: right chord most of the time', (_, { song, analysis }) => {
    let total = 0;
    let right = 0;
    const at = (segments: { start: number; end: number; chord: { root: number; quality: string } | null }[], t: number) => {
      const s = segments.find((x) => t >= x.start && t < x.end);
      return s && s.chord ? `${s.chord.root}${s.chord.quality}` : 'N';
    };
    for (let t = 0; t < SECONDS; t += 0.05) {
      total++;
      if (at(song.truth, t) === at(analysis.segments, t)) right++;
    }
    expect(right / total).toBeGreaterThan(0.85);
  });

  it.each(results.map((r, i) => [SEEDS[i], r] as const))('song %i: tuning and tempo', (_, { song, analysis }) => {
    expect(Math.abs(analysis.tuningCents - song.tuningCents)).toBeLessThan(3);
    const bpm = Number(/^(\d+) bpm/.exec(song.description)![1]);
    expect(Math.abs(analysis.bpm / bpm - 1)).toBeLessThan(0.04);
  });

  it('reports progress up to 1', () => {
    const song = synthesizeSong(1, 8);
    const progress: number[] = [];
    analyzeSong(song.samples, song.sampleRate, {}, (f) => progress.push(f));
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((f, i) => i === 0 || f >= progress[i - 1])).toBe(true);
  });
});

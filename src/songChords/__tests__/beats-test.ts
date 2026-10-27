import { trackBeats } from '../beats';

const FRAME_SECONDS = 512 / 11025;

/** An onset curve with a hit on every beat, a weaker one halfway between, and some noise. */
function onsets(bpm: number, seconds: number, offset = 0.3) {
  const frames = Math.round(seconds / FRAME_SECONDS);
  const curve = new Float32Array(frames);
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.2;
  for (let t = 0; t < frames; t++) curve[t] = noise();
  const beat = 60 / bpm;
  for (let time = offset; time < seconds; time += beat) {
    curve[Math.round(time / FRAME_SECONDS)] += 1;
    const half = Math.round((time + beat / 2) / FRAME_SECONDS);
    if (half < frames) curve[half] += 0.4;
  }
  return curve;
}

describe('trackBeats', () => {
  it.each([100, 128])('finds the tempo of %i bpm', (bpm) => {
    const { bpm: found } = trackBeats(onsets(bpm, 40), FRAME_SECONDS);
    expect(Math.abs(found / bpm - 1)).toBeLessThan(0.04);
  });

  it('may read a slow song with strong off-beats at double tempo', () => {
    // The tempo leans towards 120 bpm, which fixes half-tempo readings of
    // fast songs; the price is that 80 bpm with loud eighths can come out as
    // 160. That still gives beats on every beat, just bars of half length.
    const { bpm } = trackBeats(onsets(80, 40), FRAME_SECONDS);
    expect([80, 160].some((t) => Math.abs(bpm / t - 1) < 0.04)).toBe(true);
  });

  it('puts the beats on the hits, not between them', () => {
    const bpm = 110;
    const offset = 0.3;
    const { frames } = trackBeats(onsets(bpm, 40, offset), FRAME_SECONDS);
    const beat = 60 / bpm;
    const onBeat = frames.filter((t) => {
      const phase = ((t * FRAME_SECONDS - offset) / beat) % 1;
      return Math.min(phase, 1 - phase) < 0.15;
    });
    expect(onBeat.length / frames.length).toBeGreaterThan(0.9);
  });

  it('uses a placement curve to choose where the beats fall', () => {
    // Hits every 0.5 s on both curves' grid; the placement curve marks the
    // off-beats, as harmonic change does when strums are loudest between beats.
    const tempo = onsets(120, 30, 0.25);
    const placement = onsets(120, 30, 0.5);
    const { frames, bpm } = trackBeats(tempo, FRAME_SECONDS, placement);
    expect(Math.abs(bpm / 120 - 1)).toBeLessThan(0.04);
    const onPlacement = frames.filter((t) => {
      const phase = ((t * FRAME_SECONDS - 0.5) / 0.5) % 1;
      return Math.min(phase, 1 - phase) < 0.15;
    });
    expect(onPlacement.length / frames.length).toBeGreaterThan(0.9);
  });
});

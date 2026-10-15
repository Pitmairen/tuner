import { ChordResult } from '../detectChord';
import { ChordStabilizer } from '../stabilizer';

const chord = (name: string): ChordResult => ({
  chord: { root: 0, quality: 'maj', bass: 0 },
  name,
  confidence: 0.5,
  notes: [],
  pitchClasses: new Array(12).fill(0),
});

/** Feeds detections 250 ms apart and returns the displayed names. */
function run(detections: (string | null)[]) {
  const stabilizer = new ChordStabilizer();
  return detections.map((name, i) => stabilizer.push(name ? chord(name) : null, i * 250)?.name ?? null);
}

describe('ChordStabilizer', () => {
  it('shows a chord only after two matching detections', () => {
    expect(run(['C', 'C', 'C'])).toEqual([null, 'C', 'C']);
  });

  it('ignores a one-off misdetection', () => {
    expect(run(['C', 'C', 'Cmaj7', 'C', 'C'])).toEqual([null, 'C', 'C', 'C', 'C']);
  });

  it('switches once the new chord is confirmed', () => {
    expect(run(['C', 'C', 'G', 'G'])).toEqual([null, 'C', 'C', 'G']);
  });

  it('holds the chord through dropouts, then clears', () => {
    const shown = run(['Am', 'Am', ...new Array(12).fill(null)]);
    expect(shown.slice(0, 4)).toEqual([null, 'Am', 'Am', 'Am']);
    // 2.5 s after the last confirmation (at 250 ms) it clears.
    expect(shown[10]).toBe('Am');
    expect(shown[12]).toBeNull();
  });
});

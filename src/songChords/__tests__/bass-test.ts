import { addBassNotes } from '../bass';
import { Segment } from '../chordModel';
import { ChromaFrame } from '../frames';

const FRAME_SECONDS = 0.05;
const BEAT_FRAMES = 10; // 0.5 s
const KEY = { tonic: 4, minor: false, name: 'E' };

/** Frames with the given bass note per beat (pitch classes, 0 = C). */
function frames(bassPerBeat: number[]): ChromaFrame[] {
  return bassPerBeat.flatMap((pc) =>
    Array.from({ length: BEAT_FRAMES }, () => {
      const bass = new Float32Array(12);
      bass[pc] = 1;
      return { treble: new Float32Array(12), bass, energy: 1 };
    }),
  );
}

/** Segments from [root, quality, beats] in order. */
function segments(chords: [number, 'maj' | 'min', number][]): Segment[] {
  let start = 0;
  return chords.map(([root, quality, beats]) => {
    const seconds = (beats * BEAT_FRAMES * FRAME_SECONDS);
    const segment: Segment = { start, end: start + seconds, chord: { root, quality, bass: root }, name: '', key: KEY };
    start += seconds;
    return segment;
  });
}

function names(chords: [number, 'maj' | 'min', number][], bassPerBeat: number[]) {
  const beats = Array.from({ length: bassPerBeat.length + 1 }, (_, i) => i * BEAT_FRAMES);
  return addBassNotes(segments(chords), frames(bassPerBeat), FRAME_SECONDS, beats).map((s) => s.name);
}

const A = 9;
const E = 4;
const F_SHARP = 6;
const G_SHARP = 8;

describe('addBassNotes', () => {
  it('names the 3rd in the bass as a slash chord', () => {
    // D for 4 beats with F# in the bass: D/F#.
    expect(names([[2, 'maj', 4]], [F_SHARP, F_SHARP, F_SHARP, F_SHARP])).toEqual(['D/F#']);
  });

  it('follows a bass walk inside a chord', () => {
    // A, A/G#, then F#m: | A A A G# | F# ... |
    expect(names([[A, 'maj', 4], [F_SHARP, 'min', 4]], [A, A, A, G_SHARP, F_SHARP, F_SHARP, F_SHARP, F_SHARP])).toEqual(['A', 'A/G#', 'F#m']);
  });

  it('gives a walk that lands after the chord change to the chord before', () => {
    // The G# is heard on the first beat of F#m; F#m/G# isn't a chord, A/G# is.
    expect(names([[A, 'maj', 3], [F_SHARP, 'min', 5]], [A, A, A, G_SHARP, F_SHARP, F_SHARP, F_SHARP, F_SHARP])).toEqual(['A', 'A/G#', 'F#m']);
  });

  it('leaves the bass moving early to the next root alone', () => {
    // C#m's 3rd is E, the next chord's root: a beat early, that's anticipation.
    expect(names([[1, 'min', 4], [E, 'maj', 4]], [1, 1, 1, E, E, E, E, E])).toEqual(['C#m', 'E']);
  });

  it('writes a 5th in the bass as the plain chord', () => {
    // An open A string under D: D, not D/A.
    expect(names([[2, 'maj', 4]], [A, A, A, A])).toEqual(['D']);
  });
});

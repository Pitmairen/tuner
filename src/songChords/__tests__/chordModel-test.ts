import { chordPitchClasses } from '../../chords/chords';
import { markUnclearThirds, recogniseChords, Segment, spellChord } from '../chordModel';
import { ChromaFrame } from '../frames';

const FRAME_SECONDS = 0.05;

/** Frames for a chord: its notes in the treble, the root in the bass. */
function framesFor(root: number, quality: 'maj' | 'min', seconds: number): ChromaFrame[] {
  const treble = new Float32Array(12);
  for (const pc of chordPitchClasses(root, quality)) treble[pc] = 1 / 3;
  const bass = new Float32Array(12);
  bass[root] = 1;
  return Array.from({ length: Math.round(seconds / FRAME_SECONDS) }, () => ({ treble, bass, energy: 1 }));
}

function song(chords: [number, 'maj' | 'min'][], seconds = 2, repeats = 4): ChromaFrame[] {
  const frames: ChromaFrame[] = [];
  for (let r = 0; r < repeats; r++) for (const [root, quality] of chords) frames.push(...framesFor(root, quality, seconds));
  return frames;
}

describe('spellChord', () => {
  it('uses flats in flat keys and sharps in sharp keys', () => {
    const gMinor = { tonic: 7, minor: true };
    expect(spellChord({ root: 3, quality: 'maj', bass: 3 }, gMinor)).toBe('Eb');
    expect(spellChord({ root: 10, quality: 'maj', bass: 10 }, gMinor)).toBe('Bb');
    expect(spellChord({ root: 3, quality: 'min', bass: 3 }, { tonic: 11, minor: false })).toBe('D#m');
  });

  it('uses the usual names outside C major', () => {
    const cMajor = { tonic: 0, minor: false };
    expect(spellChord({ root: 10, quality: 'maj', bass: 10 }, cMajor)).toBe('Bb');
    expect(spellChord({ root: 6, quality: 'maj', bass: 6 }, cMajor)).toBe('F#');
  });
});

describe('recogniseChords', () => {
  it('follows a progression and finds its key', () => {
    // G C D Em: as likely in E minor as in G major by the chords alone, and
    // G and Em are heard equally long; the major key is far more common.
    const frames = song([[7, 'maj'], [0, 'maj'], [2, 'maj'], [4, 'min']]);
    const segments = recogniseChords(frames, FRAME_SECONDS);
    expect(segments.map((s) => s.name).slice(0, 4)).toEqual(['G', 'C', 'D', 'Em']);
    expect(new Set(segments.map((s) => s.key.name))).toEqual(new Set(['G']));
  });

  it('spells the chords of a flat key with flats', () => {
    // Gm Eb Cm D, as in a song in G minor.
    const frames = song([[7, 'min'], [3, 'maj'], [0, 'min'], [2, 'maj']]);
    const names = recogniseChords(frames, FRAME_SECONDS).map((s) => s.name);
    expect(names.slice(0, 4)).toEqual(['Gm', 'Eb', 'Cm', 'D']);
  });

  it('shows no chord for silence', () => {
    const silence = Array.from({ length: 40 }, () => ({ treble: new Float32Array(12), bass: new Float32Array(12), energy: 0 }));
    const frames = [...silence, ...framesFor(9, 'min', 4)];
    const segments = recogniseChords(frames, FRAME_SECONDS);
    expect(segments[0].chord).toBeNull();
    expect(segments[segments.length - 1].name).toBe('Am');
  });

  it('changes chords on the beats it is given', () => {
    // A chord change at 2.0 s, beats every 0.5 s: the change is placed on a beat.
    const frames = [...framesFor(0, 'maj', 2.02), ...framesFor(7, 'maj', 2)];
    const beats = Array.from({ length: 9 }, (_, i) => Math.round((i * 0.5) / FRAME_SECONDS));
    const segments = recogniseChords(frames, FRAME_SECONDS, {}, beats);
    expect(segments.map((s) => s.name)).toEqual(['C', 'G']);
    expect(segments[1].start).toBeCloseTo(2, 1);
  });
});

describe('markUnclearThirds', () => {
  const C_MAJOR = { tonic: 0, minor: false, name: 'C' };
  const dMinor: Segment = { start: 0, end: 1, chord: { root: 2, quality: 'min', bass: 2 }, name: 'Dm', key: C_MAJOR };
  /** One second of D and A (and `third`) in the treble. */
  const heard = (third: number, strength: number) => {
    const treble = new Float32Array(12);
    treble[2] = 0.4;
    treble[9] = 0.4;
    treble[third] = strength;
    return Array.from({ length: Math.round(1 / FRAME_SECONDS) }, () => ({ treble, bass: new Float32Array(12), energy: 1 }));
  };

  it('marks a chord heard without its third', () => {
    // D and A only: D or Dm is the key's guess.
    expect(markUnclearThirds([dMinor], heard(6, 0.01), FRAME_SECONDS)[0].unclearThird).toBe(true);
  });

  it('leaves a chord whose third is heard, either one', () => {
    expect(markUnclearThirds([dMinor], heard(5, 0.2), FRAME_SECONDS)[0].unclearThird).toBeUndefined();
    // The other third (F#) heard clearly is still a clear third, just not this chord's.
    expect(markUnclearThirds([dMinor], heard(6, 0.2), FRAME_SECONDS)[0].unclearThird).toBeUndefined();
  });
});

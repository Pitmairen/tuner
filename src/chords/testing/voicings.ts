import { Chord, ChordQuality, chordName } from '../chords';

/** Standard tuning, low E to high E. */
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

export type Voicing = {
  label: string;
  /** Sounding MIDI notes, low to high. */
  notes: number[];
  expected: Chord;
  /** For reporting: which family this voicing belongs to. */
  category: string;
};

/** Frets per string, low E first; null = muted. */
type Frets = (number | null)[];

function parseShape(shape: string): Frets {
  return shape.split('').map((c) => (c === 'x' ? null : Number(c)));
}

function voicing(frets: Frets, root: number, quality: ChordQuality, category: string): Voicing {
  const notes = frets.flatMap((fret, string) => (fret == null ? [] : [OPEN_STRINGS[string] + fret]));
  const expected = { root: root % 12, quality, bass: notes[0] % 12 };
  return { label: `${chordName(expected)} (${frets.map((f) => f ?? 'x').join('-')})`, notes, expected, category };
}

const pc = (name: string) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(name);

const OPEN: [string, string, ChordQuality][] = [
  ['x32010', 'C', 'maj'],
  ['x02220', 'A', 'maj'],
  ['320003', 'G', 'maj'],
  ['022100', 'E', 'maj'],
  ['xx0232', 'D', 'maj'],
  ['x02210', 'A', 'min'],
  ['022000', 'E', 'min'],
  ['xx0231', 'D', 'min'],
  ['x02020', 'A', '7'],
  ['020100', 'E', '7'],
  ['xx0212', 'D', '7'],
  ['320001', 'G', '7'],
  ['x32310', 'C', '7'],
  ['x21202', 'B', '7'],
  ['x32000', 'C', 'maj7'],
  ['x02120', 'A', 'maj7'],
  ['xx0222', 'D', 'maj7'],
  ['xx3210', 'F', 'maj7'],
  ['x02010', 'A', 'm7'],
  ['022030', 'E', 'm7'],
  ['xx0211', 'D', 'm7'],
  ['x02200', 'A', 'sus2'],
  ['x02230', 'A', 'sus4'],
  ['xx0230', 'D', 'sus2'],
  ['xx0233', 'D', 'sus4'],
  ['x32030', 'C', 'add9'],
  ['320203', 'G', 'add9'],
  ['x02420', 'A', 'add9'],
  ['024100', 'E', 'add9'],
  ['022200', 'E', 'sus4'],
  ['x32110', 'C', 'aug'],
  ['0321xx', 'E', 'aug'],
  ['3210xx', 'G', 'aug'],
  // Inversions: the bass note isn't the root.
  ['032010', 'C', 'maj'],
  ['x20003', 'G', 'maj'],
  ['200232', 'D', 'maj'],
];

/** Movable shapes: fret offsets from the barre, root on the low E (E) or A (A) string. */
const MOVABLE: [Frets, 'E' | 'A', ChordQuality, string][] = [
  [[0, 2, 2, 1, 0, 0], 'E', 'maj', 'triads'],
  [[0, 2, 2, 0, 0, 0], 'E', 'min', 'triads'],
  [[0, 2, 0, 1, 0, 0], 'E', '7', 'sevenths'],
  [[0, 2, 0, 0, 0, 0], 'E', 'm7', 'sevenths'],
  [[0, null, 1, 1, 0, null], 'E', 'maj7', 'sevenths'],
  [[null, 0, 2, 2, 2, 0], 'A', 'maj', 'triads'],
  [[null, 0, 2, 2, 1, 0], 'A', 'min', 'triads'],
  [[null, 0, 2, 0, 2, 0], 'A', '7', 'sevenths'],
  [[null, 0, 2, 0, 1, 0], 'A', 'm7', 'sevenths'],
  [[null, 0, 2, 1, 2, 0], 'A', 'maj7', 'sevenths'],
  [[null, 0, 2, 2, 3, 0], 'A', 'sus4', 'sus'],
  [[null, 0, 2, 2, 0, 0], 'A', 'sus2', 'sus'],
  [[0, 2, 2, null, null, null], 'E', '5', 'power'],
  [[null, 0, 2, 2, null, null], 'A', '5', 'power'],
  [[null, 0, 1, 2, 1, null], 'A', 'dim', 'dim/aug'],
];

const CATEGORY: Record<ChordQuality, string> = {
  maj: 'triads',
  min: 'triads',
  '7': 'sevenths',
  maj7: 'sevenths',
  m7: 'sevenths',
  add9: 'add9',
  sus2: 'sus',
  sus4: 'sus',
  dim: 'dim/aug',
  aug: 'dim/aug',
  '5': 'power',
};

export function allVoicings(): Voicing[] {
  const open = OPEN.map(([shape, root, quality]) => {
    const v = voicing(parseShape(shape), pc(root), quality, CATEGORY[quality]);
    return v.expected.bass !== v.expected.root ? { ...v, category: 'inversions' } : v;
  });
  const movable = MOVABLE.flatMap(([offsets, rootString, quality, category]) =>
    [1, 2, 3, 4, 5, 6, 7].map((barre) => {
      const frets = offsets.map((o) => (o == null ? null : o + barre));
      const root = (rootString === 'E' ? 40 : 45) + barre;
      return voicing(frets, root, quality, category);
    }),
  );
  return [...open, ...movable];
}

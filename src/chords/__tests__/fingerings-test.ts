import { ChordQuality, PITCH_NAMES, TEMPLATES } from '../chords';
import { findFingerings, rankByHeard, STANDARD_TUNING } from '../fingerings';

const pc = (name: string) => PITCH_NAMES.indexOf(name);
const shape = (frets: (number | null)[]) => frets.map((f) => f ?? 'x').join('');
const shapes = (root: string, quality: ChordQuality, bass = root) =>
  findFingerings({ root: pc(root), quality, bass: pc(bass) }).map((f) => shape(f.frets));

describe('findFingerings', () => {
  it.each([
    ['C', 'maj', 'x32010'],
    ['A', 'maj', 'x02220'],
    ['G', 'maj', '320003'],
    ['E', 'maj', '022100'],
    ['D', 'maj', 'xx0232'],
    ['A', 'min', 'x02210'],
    ['E', 'min', '022000'],
    ['D', 'min', 'xx0231'],
    ['A', '7', 'x02020'],
    ['E', '7', '020100'],
    ['A', 'm7', 'x02010'],
    ['C', 'maj7', 'x32000'],
  ] as [string, ChordQuality, string][])('finds the familiar %s %s shape first (%s)', (root, quality, expected) => {
    expect(shapes(root, quality)[0]).toBe(expected);
  });

  it.each([
    ['A', 'sus4', 'x02230'],
    ['A', 'sus2', 'x02200'],
    ['D', 'sus4', 'xx0233'],
  ] as [string, ChordQuality, string][])('lists the familiar %s %s shape among the options (%s)', (root, quality, expected) => {
    // Sus chords have several equally valid open shapes.
    expect(shapes(root, quality)).toContain(expected);
  });

  it('finds a barre chord for F', () => {
    const [first] = findFingerings({ root: pc('F'), quality: 'maj', bass: pc('F') });
    expect(first.barre).toEqual(expect.objectContaining({ fret: 1 }));
    expect(shape(first.frets)).toBe('133211');
  });

  it('honours slash chords: the bass is the lowest note', () => {
    for (const [root, bass] of [['C', 'E'], ['G', 'B'], ['D', 'F#']]) {
      for (const f of findFingerings({ root: pc(root), quality: 'maj', bass: pc(bass) })) {
        const lowest = f.frets.findIndex((fret) => fret != null);
        expect((STANDARD_TUNING[lowest] + f.frets[lowest]!) % 12).toBe(pc(bass));
      }
    }
  });

  it('finds at least one playable shape for every chord the detector can name', () => {
    const missing: string[] = [];
    for (let root = 0; root < 12; root++) {
      for (const { quality } of TEMPLATES) {
        if (findFingerings({ root, quality, bass: root }).length === 0) missing.push(`${PITCH_NAMES[root]} ${quality}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never needs more than four fingers or a stretch over four frets', () => {
    for (let root = 0; root < 12; root++) {
      for (const { quality } of TEMPLATES) {
        for (const f of findFingerings({ root, quality, bass: root })) {
          const fretted = f.frets.filter((x): x is number => x != null && x > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
          const fingers = f.barre ? 1 + fretted.filter((x) => x !== f.barre!.fret).length : fretted.length;
          expect(fingers).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});

describe('rankByHeard', () => {
  it('prefers the shape whose exact notes were heard', () => {
    const options = findFingerings({ root: pc('C'), quality: 'maj', bass: pc('C') }, STANDARD_TUNING, 20);
    // A barre C on the 3rd fret, A-shape: x35553 → C3 G3 C4 E4 G4.
    const heard = [48, 55, 60, 64, 67];
    const ranked = rankByHeard(options, heard);
    expect(shape(ranked[0].frets)).toBe('x35553');
  });
});

import { ChordQuality, PITCH_NAMES, TEMPLATES } from '../chords';
import { detectChord } from '../detectChord';
import { CHORD_BOOK } from '../chordBook';
import { findFingerings, GUITAR, rankByHeard, UKULELE } from '../fingerings';
import { SAMPLE_RATE, strum } from '../testing/synth';

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
        expect((GUITAR.tuning[lowest] + f.frets[lowest]!) % 12).toBe(pc(bass));
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

describe('truncated shapes', () => {
  it.each([
    ['D', 'maj', 'xx02x2'],
    ['G', 'maj', '320xxx'],
    ['C', 'maj', 'x3201x'],
  ] as [string, ChordQuality, string][])('does not offer a cut-down %s %s (%s)', (root, quality, truncated) => {
    expect(shapes(root, quality)).not.toContain(truncated);
  });
});

describe('rankByHeard', () => {
  // The detector folds octave doublings into one note (open D's D3 and D4
  // read as just D3) and can miss quiet strings, so the heard notes are
  // usually a subset of what's played.
  it.each([
    ['D', [50, 57, 66], 'xx0232'], // D3 A3 F#4; D4 folded into D3
    ['G', [43, 47, 50, 59], '320003'], // G2 B2 D3 B3; G3 and G4 folded into G2
    ['C', [48, 52, 55, 64], 'x32010'], // C3 E3 G3 E4; C4 folded into C3
    ['A', [45, 52, 61], 'x02220'], // A2 E3 C#4; A3 and E4 missed
  ] as [string, number[], string][])(
    'keeps the natural %s shape when doubled or quiet notes were missed',
    (root, heard, expected) => {
      const options = findFingerings({ root: pc(root), quality: 'maj', bass: pc(root) }, GUITAR, 12);
      expect(shape(rankByHeard(options, heard)[0].frets)).toBe(expected);
    },
  );

  it('prefers the shape whose exact notes were heard', () => {
    const options = findFingerings({ root: pc('C'), quality: 'maj', bass: pc('C') }, GUITAR, 20);
    // A barre C on the 3rd fret, A-shape: x35553 → C3 G3 C4 E4 G4.
    const heard = [48, 55, 60, 64, 67];
    const ranked = rankByHeard(options, heard);
    expect(shape(ranked[0].frets)).toBe('x35553');
  });
});

describe('detector → fingering, end to end', () => {
  // Strum each open chord, run the real detector, and check the diagram
  // offers the shape that was actually played.
  const OPEN_CHORDS: [string, string][] = [
    ['x32010', 'C'],
    ['x02220', 'A'],
    ['320003', 'G'],
    ['022100', 'E'],
    ['xx0232', 'D'],
    ['x02210', 'Am'],
    ['022000', 'Em'],
    ['xx0231', 'Dm'],
    ['x02020', 'A7'],
    ['020100', 'E7'],
    ['x02010', 'Am7'],
    ['133211', 'F'],
  ];

  it.each(OPEN_CHORDS)('shows %s for a strummed %s', (played, name) => {
    const notes = played
      .split('')
      .flatMap((c, s) => (c === 'x' ? [] : [GUITAR.tuning[s] + Number(c)]));
    for (const [seed, options] of [
      [1, {}],
      [2, { snrDb: 18 }],
      [3, { startMs: 400, detuneCents: 8 }],
    ] as const) {
      const result = detectChord(strum(notes, { seed, ...options }), SAMPLE_RATE);
      expect(result?.name).toBe(name);
      const shown = rankByHeard(
        findFingerings(result!.chord, GUITAR, 12),
        result!.notes.map((n) => n.midi),
      )[0];
      expect({ seed, shape: shape(shown.frets) }).toEqual({ seed, shape: played });
    }
  });
});

describe('ukulele (G C E A, re-entrant)', () => {
  const uke = (root: string, quality: ChordQuality) =>
    findFingerings({ root: pc(root), quality, bass: pc(root) }, UKULELE).map((f) => shape(f.frets));

  it.each([
    ['C', 'maj', '0003'],
    ['A', 'min', '2000'],
    ['F', 'maj', '2010'],
    ['G', 'maj', '0232'],
    ['D', 'maj', '2220'],
    ['A', 'maj', '2100'],
    ['D', 'min', '2210'],
    ['A', '7', '0100'],
    ['G', '7', '0212'],
    ['C', '7', '0001'],
    ['E', '7', '1202'],
    ['A', 'm7', '0000'],
    ['C', 'maj7', '0002'],
    ['A#', 'maj', '3211'],
  ] as [string, ChordQuality, string][])('finds the familiar %s %s shape first (%s)', (root, quality, expected) => {
    expect(uke(root, quality)[0]).toBe(expected);
  });

  it('lists the usual Em (0432) among the options', () => {
    // 0402 is an equally valid, easier Em, so either may come first.
    expect(uke('E', 'min')).toContain('0432');
  });

  it('ignores the bass for slash chords (no inversions on a re-entrant uke)', () => {
    const plain = uke('C', 'maj');
    const slash = findFingerings({ root: pc('C'), quality: 'maj', bass: pc('E') }, UKULELE).map((f) => shape(f.frets));
    expect(slash).toEqual(plain);
  });

  it('finds a playable shape for every chord the detector can name', () => {
    const missing: string[] = [];
    for (let root = 0; root < 12; root++) {
      for (const { quality } of TEMPLATES) {
        if (findFingerings({ root, quality, bass: root }, UKULELE).length === 0) missing.push(`${PITCH_NAMES[root]} ${quality}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('ukulele detector → fingering, end to end', () => {
  const UKE_CHORDS: [string, string, ChordQuality][] = [
    ['0003', 'C', 'maj'],
    ['2000', 'A', 'min'],
    ['2010', 'F', 'maj'],
    ['0232', 'G', 'maj'],
    ['2220', 'D', 'maj'],
    ['2100', 'A', 'maj'],
    ['2210', 'D', 'min'],
    ['0100', 'A', '7'],
    ['0212', 'G', '7'],
    ['0000', 'A', 'm7'],
  ];

  it.each(UKE_CHORDS)('shows %s for a strummed ukulele %s %s', (played, root, quality) => {
    const notes = played.split('').map((c, s) => UKULELE.tuning[s] + Number(c));
    for (const [seed, options] of [
      [1, {}],
      [2, { snrDb: 18 }],
      [3, { startMs: 400, detuneCents: 8 }],
    ] as const) {
      const result = detectChord(strum(notes, { seed, ...options }), SAMPLE_RATE);
      // Root and quality; the bass is meaningless on a re-entrant ukulele.
      expect({ seed, root: result?.chord.root, quality: result?.chord.quality }).toEqual({
        seed,
        root: pc(root),
        quality,
      });
      const shown = rankByHeard(
        findFingerings(result!.chord, UKULELE, 12),
        result!.notes.map((n) => n.midi),
        UKULELE,
      )[0];
      expect({ seed, shape: shape(shown.frets) }).toEqual({ seed, shape: played });
    }
  });
});

describe('barres', () => {
  const first = (root: string, quality: ChordQuality, instrument = GUITAR) =>
    findFingerings({ root: pc(root), quality, bass: pc(root) }, instrument)[0];

  it('draws a barre only where the shape needs one', () => {
    expect(first('F', 'maj').barre).not.toBeNull(); // 133211
    expect(first('A#', 'maj', UKULELE).barre).not.toBeNull(); // 3211
    expect(first('A', 'maj').barre).toBeNull(); // x02220: three fingers
    expect(first('G', 'maj', UKULELE).barre).toBeNull(); // 0232: three fingers
    expect(first('D', 'maj', UKULELE).barre).toBeNull(); // 2220: three fingers
  });
});

describe('chord book', () => {
  it.each(
    Object.entries(CHORD_BOOK).flatMap(([id, chords]) =>
      Object.entries(chords).flatMap(([name, shapes]) => shapes.map((shape) => [id, name, shape] as const)),
    ),
  )('%s %s (%s) is a valid shape and is offered', (id, name, shape) => {
    const instrument = id === 'ukulele' ? UKULELE : GUITAR;
    const match = /^([A-G]#?)(.*?)(?:\/([A-G]#?))?$/.exec(name)!;
    const quality = TEMPLATES.find((t) => t.suffix === match[2])!.quality;
    const chord = { root: pc(match[1]), quality, bass: pc(match[3] ?? match[1]) };
    // Only the chord's notes, all of them, playable: findFingerings rejects
    // anything else, so a typo in the book makes this fail.
    expect(findFingerings(chord, instrument, 10).map((f) => shape_(f.frets))).toContain(shape);
  });

  it('puts the standard add9 shapes first', () => {
    expect(shapes('C', 'add9')[0]).toBe('x32030');
    expect(shapes('G', 'add9')[0]).toBe('320203');
    expect(
      findFingerings({ root: pc('C'), quality: 'add9', bass: pc('C') }, UKULELE).map((f) => shape(f.frets))[0],
    ).toBe('0203');
  });
});

function shape_(frets: (number | null)[]) {
  return frets.map((f) => f ?? 'x').join('');
}

describe('device regressions', () => {
  it('shows the standard D after Dsus4, even with the open A string ringing', () => {
    // From a phone recording: switching from Dsus4 to D, heard A2 D3 F#4.
    // The diagram showed 10-0-0-7-7-10 (really a D/A, with the open A as
    // its lowest note).
    const options = findFingerings({ root: pc('D'), quality: 'maj', bass: pc('D') }, GUITAR, 12);
    expect(options.map((f) => shape(f.frets))).not.toContain('10007710');
    expect(shape(rankByHeard(options, [45, 50, 66])[0].frets)).toBe('xx0232');
  });
});

import { Chord, chordPitchClasses, TEMPLATES } from './chords';

/** Standard guitar tuning, low E to high E (MIDI). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

export type Fingering = {
  /** Fret per string, low E first; 0 = open, null = muted. */
  frets: (number | null)[];
  /** A finger laid across several strings at one fret, if the shape needs it. */
  barre: { fret: number; from: number; to: number } | null;
  /** Lower is easier/more common. */
  score: number;
};

const HAND_SPAN = 3; // frets between index and little finger
const MAX_POSITION = 12;
const MAX_FINGERS = 4;

/**
 * Playable fingerings for a chord, easiest first. Searches every hand
 * position for fret combinations that sound only chord tones, include all of
 * them (a 7th chord may drop its 5th), have the chord's bass as the lowest
 * note, and fit four fingers (counting a barre as one).
 */
export function findFingerings(chord: Chord, tuning = STANDARD_TUNING, limit = 3): Fingering[] {
  const tones = new Set(chordPitchClasses(chord.root, chord.quality));
  const fifth = (chord.root + 7) % 12;
  const isSeventh = (TEMPLATES.find((t) => t.quality === chord.quality)?.intervals.length ?? 0) === 4;
  const minStrings = chord.quality === '5' ? 2 : 3;

  const found = new Map<string, Fingering>();
  for (let position = 0; position <= MAX_POSITION; position++) {
    const lo = Math.max(1, position);
    const hi = lo + HAND_SPAN;
    // Each string: muted, open (if a chord tone), or a chord tone within reach.
    const options = tuning.map((open) => {
      const choices: (number | null)[] = [null];
      if (tones.has(open % 12)) choices.push(0);
      for (let fret = lo; fret <= hi; fret++) if (tones.has((open + fret) % 12)) choices.push(fret);
      return choices;
    });

    const frets: (number | null)[] = new Array(tuning.length).fill(null);
    const visit = (string: number) => {
      if (string === tuning.length) {
        const fingering = evaluate(frets, tuning, chord, tones, fifth, isSeventh, minStrings);
        if (fingering) {
          const key = frets.map((f) => f ?? 'x').join(',');
          const existing = found.get(key);
          if (!existing || fingering.score < existing.score) found.set(key, fingering);
        }
        return;
      }
      for (const choice of options[string]) {
        frets[string] = choice;
        visit(string + 1);
      }
    };
    visit(0);
  }

  return [...found.values()].sort((a, b) => a.score - b.score).slice(0, limit);
}

function evaluate(
  frets: (number | null)[],
  tuning: number[],
  chord: Chord,
  tones: Set<number>,
  fifth: number,
  isSeventh: boolean,
  minStrings: number,
): Fingering | null {
  const sounding = frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, midi: tuning[s] + f }]));
  if (sounding.length < minStrings) return null;
  if (sounding[0].midi % 12 !== chord.bass) return null;

  const present = new Set(sounding.map((n) => n.midi % 12));
  let omittedFifth = false;
  for (const tone of tones) {
    if (present.has(tone)) continue;
    if (isSeventh && tone === fifth) omittedFifth = true;
    else return null;
  }

  // Muted strings: fine at the edges, at most one in between.
  const first = sounding[0].string;
  const last = sounding[sounding.length - 1].string;
  const innerMutes = frets.slice(first, last + 1).filter((f) => f == null).length;
  if (innerMutes > 1) return null;

  const fretted = sounding.filter((n) => n.fret > 0);
  const frettedFrets = fretted.map((n) => n.fret);
  if (frettedFrets.length > 0 && Math.max(...frettedFrets) - Math.min(...frettedFrets) > HAND_SPAN) return null;

  // A barre: the lowest fret, held on two or more strings, with nothing open
  // or muted underneath it.
  let barre: Fingering['barre'] = null;
  let fingers = fretted.length;
  if (fretted.length > 0) {
    const lowest = Math.min(...frettedFrets);
    const atLowest = fretted.filter((n) => n.fret === lowest);
    if (atLowest.length >= 2) {
      const from = atLowest[0].string;
      const to = atLowest[atLowest.length - 1].string;
      const covered = frets.slice(from, to + 1);
      if (covered.every((f) => f != null && f >= lowest)) {
        barre = { fret: lowest, from, to };
        fingers = 1 + fretted.filter((n) => n.fret !== lowest).length;
      } else if (frets.slice(from, to + 1).some((f) => f != null && f > lowest)) {
        // Without a barre each note needs its own finger, and fingers can't
        // cross: a higher-fretted note between two lowest-fret notes (10321x)
        // is unplayable. Open strings between them are fine (A7: x02020).
        return null;
      }
    }
  }
  if (fingers > MAX_FINGERS) return null;

  const lowestFret = frettedFrets.length > 0 ? Math.min(...frettedFrets) : 0;
  const highestFret = frettedFrets.length > 0 ? Math.max(...frettedFrets) : 0;
  const open = sounding.length - fretted.length;
  const muted = frets.length - sounding.length;
  const score =
    // Lower on the neck is more common; high frets mixed with open strings
    // (e.g. 502220) are awkward stretches.
    lowestFret * 0.8 +
    highestFret * 0.4 +
    (highestFret - lowestFret) * 0.5 +
    // Full-sounding chords are preferred when they're playable.
    muted * 0.9 +
    innerMutes * 2 +
    (omittedFifth ? 1.5 : 0) +
    fingers * 0.4 +
    (barre ? 0.8 : 0) -
    // Open strings are what make first-position chords easy.
    (highestFret <= 4 ? open * 0.3 : 0);
  return { frets: [...frets], barre, score };
}

/**
 * Puts the fingering that best matches the exact notes heard first (e.g. a
 * barre C at the 3rd fret rather than the open C), keeping the rest in order.
 */
export function rankByHeard(fingerings: Fingering[], heard: number[], tuning = STANDARD_TUNING): Fingering[] {
  if (fingerings.length === 0 || heard.length === 0) return fingerings;
  const heardSet = new Set(heard);
  // Unique notes, so doubled strings don't count twice.
  const match = (f: Fingering) => {
    const notes = new Set(f.frets.flatMap((fret, s) => (fret == null ? [] : [tuning[s] + fret])));
    const hits = [...notes].filter((n) => heardSet.has(n)).length;
    return hits / notes.size + hits / heardSet.size;
  };
  const scored = fingerings.map((f, i) => ({ f, i, m: match(f) }));
  const best = scored.reduce((a, b) => (b.m > a.m + 0.05 ? b : a));
  return [best.f, ...fingerings.filter((_, i) => i !== best.i)];
}

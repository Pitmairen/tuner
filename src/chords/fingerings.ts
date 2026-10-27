import { CHORD_BOOK } from './chordBook';
import { Chord, chordName, chordPitchClasses, TEMPLATES } from './chords';

export type FretInstrumentId = 'guitar' | 'ukulele';

/** An instrument chord shapes can be drawn for. */
export type FretInstrument = {
  id: FretInstrumentId;
  name: string;
  /** Open strings in playing order, left to right on a chord diagram (MIDI). */
  tuning: number[];
  stringNames: string[];
  /**
   * A re-entrant instrument's strings aren't in pitch order (a ukulele's G4
   * is above its C4), so its shapes don't have a meaningful bass note and
   * slash chords don't apply.
   */
  reentrant: boolean;
  /** Cost per muted string: guitars mute strings routinely, ukuleles almost never. */
  mutePenalty: number;
};

export const GUITAR: FretInstrument = {
  id: 'guitar',
  name: 'Guitar',
  tuning: [40, 45, 50, 55, 59, 64],
  stringNames: ['E', 'A', 'D', 'G', 'B', 'E'],
  reentrant: false,
  mutePenalty: 0.9,
};

export const UKULELE: FretInstrument = {
  id: 'ukulele',
  name: 'Ukulele',
  tuning: [67, 60, 64, 69],
  stringNames: ['G', 'C', 'E', 'A'],
  reentrant: true,
  mutePenalty: 6,
};

export const FRET_INSTRUMENTS: FretInstrument[] = [GUITAR, UKULELE];

export type Fingering = {
  /** Fret per string, in the instrument's string order; 0 = open, null = muted. */
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
 * Playable fingerings for a chord: the chord book's standard shapes first,
 * then the generator's, easiest first. The generator searches every hand
 * position for fret combinations that sound only chord tones, include all of
 * them (a 7th chord may drop its 5th), have the chord's bass as the lowest
 * note (except on re-entrant instruments), and fit four fingers (counting a
 * barre as one).
 */
export function findFingerings(chord: Chord, instrument = GUITAR, limit = 3): Fingering[] {
  const { tuning, reentrant, mutePenalty } = instrument;
  const chordTones = new Set(chordPitchClasses(chord.root, chord.quality));
  // A bass note outside the chord, as in a bass walk (A/G#, Dm/C): it joins
  // the notes the shape may (and must) play, as the lowest note and only
  // once, so A/G# is an A with G# under it rather than an Amaj7 voicing.
  // A ukulele has no bass string, so it plays the plain chord.
  const passing = !reentrant && chord.bass !== chord.root && !chordTones.has(chord.bass);
  const tones = passing ? new Set([...chordTones, chord.bass]) : chordTones;
  const bassOnce = (frets: (number | null)[]) =>
    !passing || frets.filter((f, s) => f != null && (tuning[s] + f) % 12 === chord.bass).length === 1;
  const fifth = (chord.root + 7) % 12;
  const isSeventh = (TEMPLATES.find((t) => t.quality === chord.quality)?.intervals.length ?? 0) === 4;
  // A slash chord on guitar needs a real voicing over its bass: as three
  // strings, Em/G would be just the open G, B and E strings (xxx000).
  const minStrings = chord.quality === '5' ? 2 : chord.bass !== chord.root && !reentrant ? 4 : 3;

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
        const fingering = bassOnce(frets) && evaluate(frets, tuning, reentrant, mutePenalty, chord, tones, fifth, isSeventh, minStrings);
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

  // The chord book's shapes lead: the generator's scoring can't tell the
  // standard Cadd9 (x32030) from an easier but unusual one (x30010).
  const name = chordName(reentrant ? { ...chord, bass: chord.root } : chord);
  const book = (CHORD_BOOK[instrument.id][name] ?? []).flatMap((shape) => {
    const frets = shape.split('').map((c) => (c === 'x' ? null : Number(c)));
    const fingering = evaluate(frets, tuning, reentrant, mutePenalty, chord, tones, fifth, isSeventh, minStrings, false);
    return fingering ? [fingering] : [];
  });

  const ranked = [...book, ...[...found.values()].sort((a, b) => a.score - b.score)];
  // Drop duplicates, and truncated copies of fuller, better-ranked shapes
  // (320xxx is just 320003 with the top strings left out). An awkward
  // extension like 502220 doesn't knock out the natural x02220, since it
  // ranks lower.
  const key = (f: Fingering) => f.frets.join();
  const complete = ranked.filter(
    (shape, i) =>
      !ranked.slice(0, i).some((better) => key(better) === key(shape) || extends_(better, shape)),
  );
  return complete.slice(0, limit);
}

/** True if `fuller` plays everything `shape` plays, on the same frets, and more. */
function extends_(fuller: Fingering, shape: Fingering): boolean {
  let extra = false;
  for (let s = 0; s < shape.frets.length; s++) {
    if (shape.frets[s] == null) {
      if (fuller.frets[s] != null) extra = true;
    } else if (fuller.frets[s] !== shape.frets[s]) {
      return false;
    }
  }
  return extra;
}

function evaluate(
  frets: (number | null)[],
  tuning: number[],
  reentrant: boolean,
  mutePenalty: number,
  chord: Chord,
  tones: Set<number>,
  fifth: number,
  isSeventh: boolean,
  minStrings: number,
  /**
   * Check the hand can play it (span, fingers, no crossing). Off for chord-book
   * shapes, which are known to be played, sometimes with the thumb (D/F#).
   */
  checkPlayability = true,
): Fingering | null {
  const sounding = frets.flatMap((f, s) => (f == null ? [] : [{ string: s, fret: f, midi: tuning[s] + f }]));
  if (sounding.length < minStrings) return null;
  // The bass is the lowest *pitch*, which isn't always on the lowest string
  // (10-0-0-7-7-10 has an open A below the low string's D).
  if (!reentrant && Math.min(...sounding.map((n) => n.midi)) % 12 !== chord.bass) return null;

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
  if (checkPlayability && innerMutes > 1) return null;

  const fretted = sounding.filter((n) => n.fret > 0);
  const frettedFrets = fretted.map((n) => n.fret);
  const span = frettedFrets.length > 0 ? Math.max(...frettedFrets) - Math.min(...frettedFrets) : 0;
  if (checkPlayability && span > HAND_SPAN) return null;

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
        // Barre only when it's how the shape is really played: when separate
        // fingers wouldn't be enough (F: 133211), or when a clean barre saves
        // the fourth finger (ukulele A#: 3211). Otherwise use one finger per
        // note (ukulele G: 0232, guitar A: x02220).
        const withBarre = 1 + fretted.filter((n) => n.fret !== lowest).length;
        const clean = covered.every((f) => f === lowest);
        if (fingers > MAX_FINGERS || (fingers === MAX_FINGERS && clean)) {
          barre = { fret: lowest, from, to };
          fingers = withBarre;
        }
      } else if (frets.slice(from, to + 1).some((f) => f != null && f > lowest)) {
        // Without a barre each note needs its own finger, and fingers can't
        // cross: a higher-fretted note between two lowest-fret notes (10321x)
        // is unplayable. Open strings between them are fine (A7: x02020).
        if (checkPlayability) return null;
      }
    }
  }
  if (checkPlayability && fingers > MAX_FINGERS) return null;

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
    muted * mutePenalty +
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
/** How much more of the heard notes a shape must explain to jump the queue. */
const CLEARLY_BETTER = 0.15;
/**
 * ...and how much harder (in score) it may be than the first shape. A barre
 * C at the 3rd fret (+4.2 over the open C) qualifies; a far-up-the-neck shape
 * that happens to include an open string someone hit (+7) doesn't.
 */
const MAX_PROMOTION_COST = 5;

export function rankByHeard(fingerings: Fingering[], heard: number[], { tuning } = GUITAR): Fingering[] {
  if (fingerings.length === 0 || heard.length === 0) return fingerings;
  const heardSet = new Set(heard);
  // Only what a shape *explains* counts. Shape notes that weren't heard are
  // normal (the detector folds octave doublings like open D's D3+D4 into one
  // note, and quiet strings get missed), so they mustn't count against it.
  const coverage = (f: Fingering) => {
    const notes = new Set(f.frets.flatMap((fret, s) => (fret == null ? [] : [tuning[s] + fret])));
    return [...heardSet].filter((n) => notes.has(n)).length / heardSet.size;
  };
  const limit = fingerings[0].score + MAX_PROMOTION_COST;
  const scored = fingerings.map((f, i) => ({ f, i, coverage: f.score <= limit ? coverage(f) : -1 }));
  // Keep the natural order unless another shape clearly matches better,
  // e.g. a barre C at the 3rd fret rather than the open C.
  const best = scored.reduce((a, b) => (b.coverage > a.coverage + CLEARLY_BETTER ? b : a));
  return [best.f, ...fingerings.filter((_, i) => i !== best.i)];
}

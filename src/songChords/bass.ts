import { Chord } from '../chords/chords';
import { spellChord, Segment } from './chordModel';
import { ChromaFrame } from './frames';

/**
 * Slash chords: where the bass clearly plays another note than the chord's
 * root for a beat or more, the chord gets that bass (A/G#, D/F#). Done after
 * the chords are found, so the chords themselves don't change; a bass walk
 * (A, A/G#, F#m) is no longer hidden inside the chords around it.
 */

/**
 * Bass notes written as slash chords, in semitones above the root: the 3rd
 * (D/F#) and the notes a bass walks through (A/G, A/G#, Am/G, Am/F#). Not
 * the 5th: that is usually an open string ringing under the chord (D/A),
 * which sheets write as plain D, as the chord mode does.
 */
const SLASH_INTERVALS: Record<Chord['quality'], number[]> = {
  maj: [4, 10, 11],
  min: [3, 9, 10],
  '7': [], maj7: [], m7: [], add9: [], sus2: [], sus4: [], dim: [], aug: [], '5': [],
};
/** Extended chords take the slash notes of the chord they extend (A7/G, Dm7/C, Cadd9/E). */
const SLASH_BASE: Partial<Record<Chord['quality'], Chord['quality']>> = { '7': 'maj', maj7: 'maj', add9: 'maj', m7: 'min' };
/** The bass note must have at least this share of the beat's bass chroma... */
const MIN_SHARE = 0.3;
/** ...and be this many times stronger than the root in the bass. */
const OVER_ROOT = 1.5;

type Beat = { segment: number; from: number; to: number; bass: number | null };

export function addBassNotes(segments: Segment[], frames: ChromaFrame[], frameSeconds: number, beats: number[]): Segment[] {
  if (beats.length < 2) return segments;
  const allowed = (chord: Chord | null) =>
    chord ? SLASH_INTERVALS[SLASH_BASE[chord.quality] ?? chord.quality].map((i) => (chord.root + i) % 12) : [];

  // The song's beats, split at chord changes, each with its bass note.
  const pieces: Beat[] = [];
  segments.forEach((segment, i) => {
    const from = Math.round(segment.start / frameSeconds);
    const to = Math.round(segment.end / frameSeconds);
    const edges = [from, ...beats.filter((b) => b > from && b < to), to];
    for (let e = 0; e < edges.length - 1; e++) {
      const root = segment.chord ? segment.chord.root : -1;
      pieces.push({ segment: i, from: edges[e], to: edges[e + 1], bass: root < 0 ? null : bassOf(frames, edges[e], edges[e + 1], root) });
    }
  });

  // Which chord and bass each piece gets.
  const owner = pieces.map((p) => p.segment);
  const bassNote = pieces.map((p) => {
    const chord = segments[p.segment].chord;
    return chord && p.bass !== null && allowed(chord).includes(p.bass) ? p.bass : chord ? chord.root : null;
  });
  pieces.forEach((p, k) => {
    const chord = segments[p.segment].chord;
    if (!chord || p.bass === null) return;
    const first = k === 0 || pieces[k - 1].segment !== p.segment;
    const last = k === pieces.length - 1 || pieces[k + 1].segment !== p.segment;
    // A walk into the next chord (A, A/G#, F#m): the passing note can land
    // after the chord change. If it doesn't fit this chord but is a slash
    // note of the chord before, it belongs to that one.
    const before = k > 0 ? segments[pieces[k - 1].segment].chord : null;
    if (first && before && p.bass !== chord.root && !allowed(chord).includes(p.bass) && allowed(before).includes(p.bass)) {
      owner[k] = pieces[k - 1].segment;
      bassNote[k] = p.bass;
      return;
    }
    // The bass moving to the next chord's root a beat early is anticipation, not a slash chord.
    const after = k < pieces.length - 1 ? segments[pieces[k + 1].segment].chord : null;
    if (last && after && bassNote[k] === after.root && bassNote[k] !== chord.root) bassNote[k] = chord.root;
  });

  // Join pieces with the same chord and bass into segments.
  const out: Segment[] = [];
  pieces.forEach((p, k) => {
    const segment = segments[owner[k]];
    const start = p.from * frameSeconds;
    const end = p.to * frameSeconds;
    const previous = out[out.length - 1];
    const chord: Chord | null = segment.chord ? { ...segment.chord, bass: bassNote[k]! } : null;
    if (previous && sameChord(previous.chord, chord) && previous.key === segment.key) {
      previous.end = end;
      return;
    }
    out.push({ ...segment, start, end, chord, name: chord ? spellChord(chord, segment.key) : 'N' });
  });
  if (out.length) {
    out[0].start = segments[0].start;
    out[out.length - 1].end = segments[segments.length - 1].end;
  }
  return out;
}

function sameChord(a: Chord | null, b: Chord | null) {
  if (!a || !b) return !a && !b;
  return a.root === b.root && a.quality === b.quality && a.bass === b.bass;
}

/** The clearly strongest bass note in frames [from, to), or null if none stands out. */
function bassOf(frames: ChromaFrame[], from: number, to: number, root: number): number | null {
  const sum = new Float64Array(12);
  for (let t = from; t < to && t < frames.length; t++) for (let k = 0; k < 12; k++) sum[k] += frames[t].bass[k];
  let total = 0;
  let best = 0;
  for (let k = 0; k < 12; k++) {
    total += sum[k];
    if (sum[k] > sum[best]) best = k;
  }
  if (total === 0 || sum[best] / total < MIN_SHARE) return null;
  if (best !== root && sum[best] < OVER_ROOT * sum[root]) return null;
  return best;
}

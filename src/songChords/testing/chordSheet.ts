import { PITCH_NAMES } from '../../chords/chords';
import { Segment } from '../chordModel';

/**
 * Test-only: reads the chords of a chord sheet or tab, to score song
 * analysis against real recordings whose chords are only known from a
 * sheet (no timings). Chords are reduced to major/minor; H is B, as in
 * Norwegian sheets.
 */

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const CHORD = /^([A-H])([#b]?)(m(?!aj))?([0-9a-z/#]*)$/;

/** Chord names on chord lines ("G  Cadd9 D", "| G | C D |", "C#m / H / A"), as "C#", "Em". */
export function sheetChords(text: string): Set<string> {
  const chords = new Set<string>();
  for (const line of text.split('\n')) {
    // Bar lines, parentheses ("(G)"), marks ("D*") and lone slashes don't count against a chord line.
    const tokens = line.replace(/[|()]/g, ' ').replace(/\*/g, '').trim().split(/\s+/).filter((t) => t && t !== '/');
    const matches = tokens.map((t) => CHORD.exec(t));
    if (!tokens.length || matches.some((m) => !m)) continue;
    for (const m of matches) {
      const root = (LETTERS[m![1]] + (m![2] === '#' ? 1 : m![2] === 'b' ? 11 : 0)) % 12;
      chords.add(PITCH_NAMES[root] + (m![3] ? 'm' : ''));
    }
  }
  return chords;
}

/**
 * The share of the time with a chord that falls on a chord the sheet uses,
 * at the best transposition (sheets are often written for a capo or in
 * another key), and that transposition in semitones.
 */
export function sheetMatch(segments: Segment[], chords: Set<string>): { share: number; transpose: number } {
  let played = 0;
  for (const s of segments) if (s.chord) played += s.end - s.start;
  let best = { share: 0, transpose: 0 };
  for (let k = 0; k < 12; k++) {
    let inSheet = 0;
    for (const s of segments) {
      if (!s.chord) continue;
      // Reduced to major/minor like the sheet's chords: Am7 is Am, Cadd9 and Dsus4 count as C and D.
      const minor = s.chord.quality === 'min' || s.chord.quality === 'm7';
      const name = PITCH_NAMES[(s.chord.root + k) % 12] + (minor ? 'm' : '');
      if (chords.has(name)) inSheet += s.end - s.start;
    }
    const share = played > 0 ? inSheet / played : 0;
    if (share > best.share) best = { share, transpose: k };
  }
  return best;
}

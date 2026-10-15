/** How close to a whole number of octaves counts as "the right note, wrong octave". */
const OCTAVE_TOLERANCE_CENTS = 50;
/** Beyond this, say which note is actually being played. */
const FAR_CENTS = 100;

export type NoteHint = { kind: 'octave' | 'far'; text: string };

/**
 * Explains a reading that is far from its target: the right note in the wrong
 * octave (common when on the wrong string or hitting a harmonic), or simply
 * which note is being played. Null when the reading is close enough.
 */
export function noteHint(cents: number, playing: string, target: string): NoteHint | null {
  const octaves = Math.round(cents / 1200);
  if (octaves !== 0 && Math.abs(cents - octaves * 1200) <= OCTAVE_TOLERANCE_CENTS) {
    const distance = Math.abs(octaves) === 1 ? 'an octave' : `${Math.abs(octaves)} octaves`;
    return { kind: 'octave', text: `Playing ${playing} · ${distance} ${octaves > 0 ? 'above' : 'below'} ${target}` };
  }
  if (Math.abs(cents) > FAR_CENTS) return { kind: 'far', text: `Playing ${playing}` };
  return null;
}

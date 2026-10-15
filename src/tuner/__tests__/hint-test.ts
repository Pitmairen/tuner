import { noteHint } from '../hint';

describe('noteHint', () => {
  it('says nothing when close to the target', () => {
    expect(noteHint(3, 'E2', 'E2')).toBeNull();
    expect(noteHint(-90, 'D#2', 'E2')).toBeNull();
  });

  it('names the note when more than a semitone off', () => {
    expect(noteHint(-150, 'D2', 'E2')).toEqual({ kind: 'far', text: 'Playing D2' });
  });

  it('spots the right note in the wrong octave', () => {
    expect(noteHint(1200, 'E3', 'E2')).toEqual({ kind: 'octave', text: 'Playing E3 · an octave above E2' });
    expect(noteHint(-1190, 'E1', 'E2')).toEqual({ kind: 'octave', text: 'Playing E1 · an octave below E2' });
    expect(noteHint(2405, 'E4', 'E2')?.text).toBe('Playing E4 · 2 octaves above E2');
  });

  it('does not call a nearby note an octave error', () => {
    expect(noteHint(1270, 'F3', 'E2')?.kind).toBe('far');
  });
});

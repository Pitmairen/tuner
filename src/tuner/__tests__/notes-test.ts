import { centsBetween, frequencyToMidi, midiToFrequency, noteName, parseNote, pitchClass } from '../notes';

describe('note maths', () => {
  it('parses scientific pitch notation, sharps and flats', () => {
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('E2')).toBe(40);
    expect(parseNote('F#3')).toBe(54);
    expect(parseNote('Bb3')).toBe(58);
    expect(parseNote('B0')).toBe(23);
    expect(() => parseNote('H2')).toThrow();
  });

  it('names notes with sharps, round-tripping through parseNote', () => {
    expect(noteName(61)).toEqual({ name: 'C#', octave: 4 });
    for (let midi = 21; midi <= 108; midi++) {
      const { name, octave } = noteName(midi);
      expect(parseNote(`${name}${octave}`)).toBe(midi);
    }
  });

  it('converts between MIDI and frequency, honouring A4', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(57)).toBeCloseTo(220);
    expect(midiToFrequency(40)).toBeCloseTo(82.41, 2);
    expect(midiToFrequency(69, 442)).toBe(442);
    expect(frequencyToMidi(440)).toBeCloseTo(69);
    expect(frequencyToMidi(442, 442)).toBeCloseTo(69);
  });

  it('measures cents', () => {
    expect(centsBetween(440, 440)).toBe(0);
    expect(centsBetween(880, 440)).toBeCloseTo(1200);
    expect(centsBetween(midiToFrequency(70), 440)).toBeCloseTo(100);
    expect(centsBetween(439, 440)).toBeCloseTo(-3.94, 2);
  });

  it('strips octaves', () => {
    expect(pitchClass('F#3')).toBe('F#');
    expect(pitchClass('Eb2')).toBe('Eb');
  });
});

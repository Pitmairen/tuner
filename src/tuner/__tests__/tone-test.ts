import { midiToFrequency } from '../notes';
import { detectPitch } from '../pitch';
import { strumDurationS, synthesizeStrumWav, synthesizeToneWav, TONE_DURATION_S } from '../tone';

const WAV_RATE = 44100;

/** Reads `length` samples of 16-bit mono PCM starting at `start` seconds. */
function samples(wav: Uint8Array, start: number, length: number) {
  const view = new DataView(wav.buffer);
  const offset = Math.round(start * WAV_RATE);
  return Float32Array.from({ length }, (_, i) => view.getInt16(44 + (offset + i) * 2, true) / 0x7fff);
}

describe('reference tones', () => {
  it('writes a valid 16-bit mono WAV of the right length', () => {
    const wav = synthesizeToneWav(110);
    const text = (from: number, to: number) => String.fromCharCode(...wav.slice(from, to));
    const view = new DataView(wav.buffer);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(WAV_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(Math.floor(WAV_RATE * TONE_DURATION_S) * 2);
  });

  it.each([28, 40, 57, 64, 69])('plays MIDI note %i in tune (within 0.5 cents)', (midi) => {
    const f = midiToFrequency(midi);
    const result = detectPitch(samples(synthesizeToneWav(f), 0.5, 8192), WAV_RATE, {
      minFrequency: 25,
      decimation: 2,
    });
    expect(Math.abs(1200 * Math.log2(result!.frequency / f))).toBeLessThan(0.5);
  });

  it('strums the notes one after another', () => {
    const notes = [40, 45, 50, 55, 59, 64].map((m) => midiToFrequency(m));
    const wav = synthesizeStrumWav(notes);
    const seconds = (wav.length - 44) / 2 / WAV_RATE;
    expect(seconds).toBeCloseTo(strumDurationS(notes.length), 1);
    // Before the second string comes in, only the low E is sounding.
    const result = detectPitch(samples(wav, 0.05, 8192), WAV_RATE, { minFrequency: 60, decimation: 2 });
    expect(Math.abs(1200 * Math.log2(result!.frequency / notes[0]))).toBeLessThan(1);
  });
});

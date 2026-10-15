import { ClipRecorder } from '../clipRecorder';
import { decodeWav, encodeWav } from '../wav';

describe('WAV', () => {
  it('round-trips mono samples through 16-bit PCM', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.8);
    const { samples: decoded, sampleRate } = decodeWav(encodeWav(samples, 48000));
    expect(sampleRate).toBe(48000);
    expect(decoded.length).toBe(samples.length);
    expect(Math.max(...decoded.map((x, i) => Math.abs(x - samples[i])))).toBeLessThan(1e-4);
  });

  it('clips out-of-range samples instead of wrapping', () => {
    const { samples } = decodeWav(encodeWav(Float32Array.from([2, -2]), 44100));
    expect(samples[0]).toBeCloseTo(1, 3);
    expect(samples[1]).toBeCloseTo(-1, 3);
  });

  it('rejects files that are not WAV', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow('Not a WAV file');
  });
});

describe('ClipRecorder', () => {
  it('keeps only the most recent seconds, oldest first', () => {
    const recorder = new ClipRecorder(1);
    expect(recorder.snapshot()).toBeNull();
    for (let n = 0; n < 3; n++) recorder.push(Float32Array.from({ length: 6 }, (_, i) => n * 6 + i), 10);
    // 18 samples pushed at 10 Hz into a 1-second buffer: the last 10 remain.
    const clip = recorder.snapshot()!;
    expect(clip.sampleRate).toBe(10);
    expect(Array.from(clip.samples)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

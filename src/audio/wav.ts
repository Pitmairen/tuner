/** Encodes mono samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return bytes;
}

/**
 * Decodes a WAV file to mono samples: 16-bit or 32-bit float PCM, taking the
 * first channel of multi-channel files. Enough for recordings from phones
 * and common audio tools.
 */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('Not a WAV file');

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  // Walk the chunks: "fmt " describes the audio, "data" holds it.
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format code is in the sub-format GUID.
      if (format === 0xfffe) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      const frameBytes = (bits / 8) * channels;
      const frames = Math.floor(Math.min(size, bytes.length - body) / frameBytes);
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const at = body + i * frameBytes;
        if (format === 1 && bits === 16) samples[i] = view.getInt16(at, true) / 0x8000;
        else if (format === 3 && bits === 32) samples[i] = view.getFloat32(at, true);
        else throw new Error(`Unsupported WAV format ${format} / ${bits}-bit`);
      }
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV file has no audio data');
}

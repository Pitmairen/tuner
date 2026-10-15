import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { encodeWav } from './wav';

/**
 * Saves a clip as a WAV file in the cache and opens the share sheet. `label`
 * (what the app was showing, e.g. "chord-Am") goes into the file name so a
 * clip can be matched with what the tuner thought it heard.
 */
export async function shareClip(clip: { samples: Float32Array; sampleRate: number }, label: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeLabel = label.replace(/[^A-Za-z0-9#+-]/g, '_');
  const file = new File(Paths.cache, `tuner-${stamp}-${safeLabel}.wav`);
  if (file.exists) file.delete();
  file.write(encodeWav(clip.samples, clip.sampleRate));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'audio/wav',
    UTI: 'com.microsoft.waveform-audio',
    dialogTitle: 'Share audio clip',
  });
}

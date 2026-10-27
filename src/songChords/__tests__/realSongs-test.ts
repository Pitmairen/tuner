import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { analyzeSong } from '../analyzeSong';
import { sheetChords, sheetMatch } from '../testing/chordSheet';

/**
 * Real songs, scored against their chord sheets. The songs can't be part of
 * this repo, so the test reads a manifest named by SONG_TESTS and is skipped
 * without it:
 *
 *   SONG_TESTS=~/song-tests.json npx jest realSongs
 *
 * The manifest lists { "audio", "sheet", "minShare", "note" }; paths are
 * relative to the manifest. `minShare` is the least share of the time with a
 * chord that must be on a chord the sheet uses (at the best transposition).
 * Audio is decoded with ffmpeg, which must be installed.
 */
type SongTest = { audio: string; sheet: string; minShare: number; transpose?: number; note?: string };

const manifest = process.env.SONG_TESTS;
const RATE = 44100;

function decode(path: string): Float32Array {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

if (!manifest) {
  describe('real songs', () => {
    it.todo('set SONG_TESTS to a manifest of songs and chord sheets to run these');
  });
} else {
  const folder = dirname(resolve(manifest));
  const songs: SongTest[] = JSON.parse(readFileSync(manifest, 'utf8'));

  describe('real songs', () => {
    it.each(songs.map((s) => [s.audio, s] as const))('%s', (_, song) => {
      const audio = resolve(folder, song.audio);
      if (!existsSync(audio)) {
        console.warn(`Skipping ${song.audio}: not found`);
        return;
      }
      const analysis = analyzeSong(decode(audio), RATE);
      const match = sheetMatch(analysis.segments, sheetChords(readFileSync(resolve(folder, song.sheet), 'utf8')));
      expect(match.share).toBeGreaterThanOrEqual(song.minShare);
      // A capo or a sheet in another key: the transposition must match too, if given.
      if (song.transpose != null) expect(match.transpose).toBe(song.transpose);
    }, 120_000);
  });
}

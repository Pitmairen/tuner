import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

import { STRUM_GAP_S, strumDurationS, synthesizeStrumWav, synthesizeToneWav, TONE_DURATION_S } from './tone';
import { TuningString } from './tunings';

/** Lets the room go quiet before the tuner listens again. */
const TAIL_MS = 300;
/**
 * Cutting a note off mid-waveform causes an audible click, so a note that is
 * interrupted fades out on its own player while the next starts on another.
 */
const FADE_MS = 80;
const FADE_STEPS = 8;
const POOL_SIZE = 3;

/** Plays a synthesized reference note. `playing` is the note currently sounding. */
export function useReferenceTone() {
  const players = useRef<AudioPlayer[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [strumming, setStrumming] = useState(false);
  const current = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fades = useRef(new Map<AudioPlayer, ReturnType<typeof setInterval>>());

  useEffect(() => {
    const pool = Array.from({ length: POOL_SIZE }, () => createAudioPlayer(null));
    const activeFades = fades.current;
    players.current = pool;
    return () => {
      // Clearing the timers would otherwise leave `playing` set (and the tuner
      // muted) forever, e.g. after a Fast Refresh mid-note.
      timers.current.forEach(clearTimeout);
      setPlaying(null);
      setStrumming(false);
      activeFades.forEach((fade) => clearInterval(fade));
      activeFades.clear();
      pool.forEach((player) => player.remove());
      players.current = [];
    };
  }, []);

  const cancelFade = useCallback((player: AudioPlayer) => {
    const fade = fades.current.get(player);
    if (fade) clearInterval(fade);
    fades.current.delete(player);
  }, []);

  const fadeOut = useCallback(
    (player: AudioPlayer) => {
      cancelFade(player);
      const startVolume = player.volume;
      let step = 0;
      const fade = setInterval(() => {
        step++;
        player.volume = startVolume * Math.pow(1 - step / FADE_STEPS, 2);
        if (step >= FADE_STEPS) {
          cancelFade(player);
          player.pause();
        }
      }, FADE_MS / FADE_STEPS);
      fades.current.set(player, fade);
    },
    [cancelFade],
  );

  /** Plays `file`, highlighting each cue's note at its time offset. */
  const playFile = useCallback(
    (file: File, cues: { note: string; atMs: number }[], durationMs: number) => {
      const pool = players.current;
      if (pool.length === 0) return;

      // `playing` can lag right after play(), so fade unconditionally; fading a
      // finished player is harmless.
      fadeOut(pool[current.current]);

      // Round-robin so the next player is the one least likely to still be fading.
      current.current = (current.current + 1) % pool.length;
      const next = pool[current.current];
      cancelFade(next);
      next.replace({ uri: file.uri });
      next.volume = 1;
      next.seekTo(0);
      next.play();

      timers.current.forEach(clearTimeout);
      timers.current = cues.map(({ note, atMs }) => setTimeout(() => setPlaying(note), atMs));
      timers.current.push(
        setTimeout(() => {
          setPlaying(null);
          setStrumming(false);
        }, durationMs + TAIL_MS),
      );
    },
    [fadeOut, cancelFade],
  );

  const play = useCallback(
    (string: TuningString) => {
      // Keyed by frequency, not note, so a different A4 gets its own file.
      const file = new File(Paths.cache, `tone-${string.frequency.toFixed(3)}.wav`);
      if (!file.exists) file.write(synthesizeToneWav(string.frequency));
      setStrumming(false);
      playFile(file, [{ note: string.note, atMs: 0 }], TONE_DURATION_S * 1000);
    },
    [playFile],
  );

  /** Plays every string in order, low to high, like a slow strum. */
  const strum = useCallback(
    (strings: TuningString[]) => {
      const file = new File(Paths.cache, `strum-${strings.map((s) => s.frequency.toFixed(3)).join('-')}.wav`);
      if (!file.exists) file.write(synthesizeStrumWav(strings.map((s) => s.frequency)));
      setStrumming(true);
      playFile(
        file,
        strings.map((s, i) => ({ note: s.note, atMs: i * STRUM_GAP_S * 1000 })),
        strumDurationS(strings.length) * 1000,
      );
    },
    [playFile],
  );

  return { play, strum, playing, strumming };
}

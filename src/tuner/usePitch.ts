import {
  AudioStreamBuffer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ClipRecorder } from '../audio/clipRecorder';
import { DetectOptions } from '../chords/detectChord';
import { FollowerState, SongFollower } from '../chords/songFollower';
import { detectPitch } from './pitch';
import { PitchSmoother, Steadiness } from './steadiness';
import { Detection, WIDE_DETECTION } from './tunings';

export type PermissionState = 'unknown' | 'granted' | 'denied';

/** Holds the longest analysis window; shorter ones read its most recent samples. */
const RING_SIZE = WIDE_DETECTION.windowSize;
const ANALYSIS_INTERVAL_MS = 60;
const NO_CHORDS: FollowerState = { current: null, history: [] };
/** Seconds of recent audio kept in memory for sharing a clip. */
const CLIP_SECONDS = 10;
/** How long to keep showing the last pitch after the string goes quiet. */
const HOLD_MS = 1200;
const MIN_CLARITY = 0.85;

/**
 * Streams the microphone and reports a smoothed fundamental frequency, or
 * null when nothing is being played. With `chordOptions` set it follows the
 * chords being played instead, with a history. While `muted`, input is ignored.
 */
export function usePitch(
  muted: boolean,
  detection: Detection,
  steadiness: Steadiness,
  chordOptions: DetectOptions | null,
) {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [frequency, setFrequency] = useState<number | null>(null);
  const [chords, setChords] = useState<FollowerState>(NO_CHORDS);

  const ring = useRef(new Float32Array(RING_SIZE));
  const writeIndex = useRef(0);
  const filled = useRef(0);
  const lastAnalysis = useRef(0);
  const lastHeard = useRef(0);
  const [smoother] = useState(() => new PitchSmoother(steadiness));
  const mutedRef = useRef(muted);
  const detectionRef = useRef(detection);
  const [clips] = useState(() => new ClipRecorder(CLIP_SECONDS));
  const chordOptionsRef = useRef(chordOptions);
  /** Created on the first buffer, when the real sample rate is known. */
  const follower = useRef<SongFollower | null>(null);
  /** What was last published, so unchanged analyses don't re-render. */
  const publishedKey = useRef('');
  // Compared by value: callers build a fresh object each render.
  const chordKey = chordOptions ? `${chordOptions.a4}:${chordOptions.ignoreBass}` : null;

  useEffect(() => {
    chordOptionsRef.current = chordOptions;
    // New settings (or leaving chord mode) start a fresh follower.
    follower.current = null;
    smoother.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chordKey stands in for chordOptions
  }, [chordKey, smoother]);

  const publishChords = useCallback((state: FollowerState) => {
    const { current, history } = state;
    const key = `${current?.name}|${current?.confidence.toFixed(1)}|${history.length}|${history[history.length - 1]?.name}`;
    if (key === publishedKey.current) return;
    publishedKey.current = key;
    setChords({ current, history: [...history] });
  }, []);

  const clearChordHistory = useCallback(() => {
    if (!follower.current) return;
    follower.current.clearHistory();
    publishChords(follower.current.state);
  }, [publishChords]);

  useEffect(() => {
    // Readings from the previous instrument's settings shouldn't be smoothed
    // together with the new ones.
    detectionRef.current = detection;
    smoother.reset();
  }, [detection, smoother]);

  useEffect(() => smoother.setSteadiness(steadiness), [smoother, steadiness]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      smoother.reset();
      filled.current = 0;
      lastHeard.current = 0;
    }
  }, [muted, smoother]);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (mutedRef.current) return;
    const samples = new Float32Array(buffer.data);
    const step = Math.max(1, buffer.channels);
    const mono = step === 1 ? samples : samples.filter((_, i) => i % step === 0);
    clips.push(mono, buffer.sampleRate);

    const options = chordOptionsRef.current;
    if (options != null) {
      if (follower.current?.sampleRate !== buffer.sampleRate) {
        follower.current = new SongFollower(buffer.sampleRate, options);
      }
      follower.current.push(mono);
      publishChords(follower.current.state);
      return;
    }

    for (let i = 0; i < mono.length; i++) {
      ring.current[writeIndex.current] = mono[i];
      writeIndex.current = (writeIndex.current + 1) % RING_SIZE;
    }
    filled.current = Math.min(RING_SIZE, filled.current + mono.length);
    const now = Date.now();

    const { windowSize, minFrequency, maxFrequency, decimation } = detectionRef.current;
    if (filled.current < windowSize || now - lastAnalysis.current < ANALYSIS_INTERVAL_MS) return;
    lastAnalysis.current = now;

    const window = latest(ring.current, writeIndex.current, windowSize);
    const result = detectPitch(window, buffer.sampleRate, { minFrequency, maxFrequency, decimation });
    if (result && result.clarity >= MIN_CLARITY) {
      lastHeard.current = now;
      setFrequency(smoother.push(result.frequency));
    } else if (now - lastHeard.current > HOLD_MS) {
      smoother.reset();
      setFrequency(null);
    }
  }, [smoother, publishChords, clips]);

  /** The last few seconds the microphone heard, for sharing. */
  const recentAudio = useCallback(() => clips.snapshot(), [clips]);

  const { stream } = useAudioStream({ sampleRate: 48000, channels: 1, encoding: 'float32', onBuffer });

  // useAudioStream releases the stream on unmount (which also stops capture),
  // and its cleanup runs before ours. Any call on a released stream throws, so
  // only touch it while this is true, re-checking after every await.
  const streamUsable = useRef(false);

  const start = useCallback(async () => {
    try {
      const response = await requestRecordingPermissionsAsync();
      if (!streamUsable.current) return;
      setPermission(response.granted ? 'granted' : 'denied');
      if (!response.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (streamUsable.current && !stream.isStreaming) await stream.start();
    } catch (error) {
      console.warn('Could not start microphone', error);
    }
  }, [stream]);

  useEffect(() => {
    streamUsable.current = true;

    getRecordingPermissionsAsync().then((response) => {
      if (!streamUsable.current) return;
      if (response.granted || response.canAskAgain) start();
      else setPermission('denied');
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (!streamUsable.current) return;
      if (state === 'active') {
        start();
      } else if (stream.isStreaming) {
        stream.stop();
        smoother.reset();
        filled.current = 0;
        setFrequency(null);
      }
    });

    return () => {
      streamUsable.current = false;
      subscription.remove();
    };
  }, [start, stream, smoother]);

  const chordMode = chordOptions != null;
  return {
    frequency: muted || chordMode ? null : frequency,
    chords: muted || !chordMode ? NO_CHORDS : chords,
    clearChordHistory,
    recentAudio,
    permission,
    retry: start,
  };
}

/** The most recent `length` samples of the ring, oldest first. */
function latest(ring: Float32Array, writeIndex: number, length: number): Float32Array {
  const out = new Float32Array(length);
  const start = (writeIndex - length + ring.length) % ring.length;
  if (start + length <= ring.length) {
    out.set(ring.subarray(start, start + length));
  } else {
    const head = ring.length - start;
    out.set(ring.subarray(start));
    out.set(ring.subarray(0, length - head), head);
  }
  return out;
}

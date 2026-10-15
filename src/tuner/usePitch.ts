import {
  AudioStreamBuffer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { detectPitch } from './pitch';

export type PermissionState = 'unknown' | 'granted' | 'denied';

/** ~85 ms at 48 kHz: enough for two periods of a low C (65 Hz). */
const WINDOW_SIZE = 4096;
const ANALYSIS_INTERVAL_MS = 60;
const HISTORY_SIZE = 5;
/** How long to keep showing the last pitch after the string goes quiet. */
const HOLD_MS = 1200;
const MIN_CLARITY = 0.85;

/**
 * Streams the microphone and reports a smoothed fundamental frequency,
 * or null when nothing is being played. While `muted`, input is ignored.
 */
export function usePitch(muted = false) {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [frequency, setFrequency] = useState<number | null>(null);

  const ring = useRef(new Float32Array(WINDOW_SIZE));
  const writeIndex = useRef(0);
  const filled = useRef(0);
  const lastAnalysis = useRef(0);
  const lastHeard = useRef(0);
  const history = useRef<number[]>([]);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      history.current = [];
      filled.current = 0;
      lastHeard.current = 0;
    }
  }, [muted]);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (mutedRef.current) return;
    const samples = new Float32Array(buffer.data);
    const step = Math.max(1, buffer.channels);
    for (let i = 0; i < samples.length; i += step) {
      ring.current[writeIndex.current] = samples[i];
      writeIndex.current = (writeIndex.current + 1) % WINDOW_SIZE;
    }
    filled.current = Math.min(WINDOW_SIZE, filled.current + samples.length / step);

    const now = Date.now();
    if (filled.current < WINDOW_SIZE || now - lastAnalysis.current < ANALYSIS_INTERVAL_MS) return;
    lastAnalysis.current = now;

    const result = detectPitch(unroll(ring.current, writeIndex.current), buffer.sampleRate);
    if (result && result.clarity >= MIN_CLARITY) {
      lastHeard.current = now;
      history.current = [...history.current.slice(-(HISTORY_SIZE - 1)), result.frequency];
      setFrequency(median(history.current));
    } else if (now - lastHeard.current > HOLD_MS) {
      history.current = [];
      setFrequency(null);
    }
  }, []);

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
        history.current = [];
        filled.current = 0;
        setFrequency(null);
      }
    });

    return () => {
      streamUsable.current = false;
      subscription.remove();
    };
  }, [start, stream]);

  return { frequency: muted ? null : frequency, permission, retry: start };
}

function unroll(ring: Float32Array, start: number): Float32Array {
  const out = new Float32Array(ring.length);
  out.set(ring.subarray(start));
  out.set(ring.subarray(0, start), ring.length - start);
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

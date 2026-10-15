# Test recordings

Real recordings that the detection engine is tested against (`npm test`
runs `src/__tests__/recordings-test.ts`). Synthesized test audio is cleaner
than real guitars, rooms and phone microphones; these keep the engine honest.

## Adding a recording

1. In the app, play the thing that went wrong, then open **Settings →
   Share last 10 seconds** and send the WAV file. Its name says what the
   app was showing, e.g. `tuner-2026-10-15T10-22-33-chord-Am.wav`.
   (Any 16-bit or 32-bit float WAV works too.)
2. Put the file in this folder and add an entry to `manifest.json` saying
   what was actually played:

```json
[
  {
    "file": "open-c-strum.wav",
    "mode": "chords",
    "expect": ["C"],
    "note": "One open C strum, Pixel 7, quiet room"
  },
  {
    "file": "pop-progression.wav",
    "mode": "chords",
    "expect": ["C", "G", "Am", "F"],
    "historyErrors": 1
  },
  {
    "file": "low-e-flat.wav",
    "mode": "note",
    "instrument": "guitar",
    "expect": "E2",
    "cents": -20,
    "centsTolerance": 5
  }
]
```

- `mode: "chords"`: the clip is played through the chord follower and the
  chords it records must match `expect` in order (allowing `historyErrors`
  differences, default 0). Add `"ignoreBass": true` for ukulele.
- `mode: "note"`: the clip is run through the tuner's pitch detection for
  `instrument` (`guitar`, `bass` or `ukulele`); the most common note heard
  must be `expect`, and if `cents` is given, its median offset from that
  note must be within `centsTolerance` (default 5).
- `note` is free text for whoever reads the test later.

A recording that fails shows what was heard; either fix the engine or, if
the recording itself is ambiguous, add a `note` explaining why and loosen
the expectation.

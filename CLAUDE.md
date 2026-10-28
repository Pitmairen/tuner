@AGENTS.md

# Tuner: project guide

A guitar/bass/ukulele tuner and chord recogniser for phones, built with Expo
SDK 57 / React Native / TypeScript. Android is the main target (EAS project
`@pitmairen/tuner`, app id `net.myr1.tuner`). Code: public repo
https://github.com/Pitmairen/tuner (MIT); commits are authored as
`Pitmairen <progrper@gmail.com>` (set in this repo's git config). All audio analysis runs on the
device in plain TypeScript; there is no backend.

Deviation from AGENTS.md: there is one screen and no navigation, so Expo Router
isn't used (`App.tsx` → `src/screens/TunerScreen.tsx`).

## Commands

```bash
npm test                      # Jest (jest-expo), ~1 min; must pass before committing
npx tsc --noEmit && npx expo lint
npx expo-doctor
npx expo start --go           # run in Expo Go (--go needed: expo-dev-client is installed)
npx eas-cli@latest build --profile preview --platform android   # installable APK
node scripts/generate-icons.mjs <path-to @resvg/resvg-js> assets  # regenerate all icons
```

`@resvg/resvg-js` is deliberately not a dependency; install it somewhere
temporary (see the script header). Icons/splash only show in real builds, not
Expo Go.

## Architecture

```
mic (expo-audio useAudioStream, 48 kHz float32 mono)
  └─ src/tuner/usePitch.ts          one hook owns the stream (never create a second)
       ├─ ClipRecorder              last 10 s kept in memory for "Share clip"
       ├─ tuner modes: ring buffer → detectPitch (YIN) → PitchSmoother → frequency
       └─ chord mode:  SongFollower → { current chord, history }
  └─ src/tuner/useTuner.ts          frequency + tuning → reading (target, cents, string),
                                    ✓ badges and the all-tuned celebration
  └─ src/screens/TunerScreen.tsx    settings, sheets, picks the mode, renders components
```

- **Modes** are chosen by `settings.tuningId`: a real tuning id, `CHROMATIC_ID`
  or `CHORD_ID` (pseudo-tunings in `src/tuner/tunings.ts`). Chromatic and chord
  are "freeform" (no strings, no capo).
- **Persistence:** `src/storage.ts` writes JSON to the app documents dir via
  expo-file-system: `settings.json` (`useSettings`: tuningId, a4, steadiness,
  transpose, fingering) and `custom-tunings.json` (`useCustomTunings`).
  Loaders validate and migrate old shapes; keep them tolerant.
- **Reference tones** (`useReferenceTone` + `tone.ts`): additive synthesis to
  cached WAVs (name includes `TONE_VERSION`; bump it when the sound changes),
  pool of 3 players with fades to avoid clicks. The tuner is muted while a tone
  plays.

### Folders

- `src/tuner/`: tuning engine. `pitch.ts` (YIN, configurable decimation +
  full-rate refinement), `tunings.ts` (instruments, tunings, `detectionFor`,
  transpose), `notes.ts`, `steadiness.ts` (smoother), `hint.ts` (octave hint).
- `src/chords/`: chord engine. `detectChord.ts` (`detectNotes` + `matchChord`),
  `songFollower.ts` (live following + history), `fingerings.ts` (shape
  generator + `rankByHeard`), `chordBook.ts` (curated standard shapes),
  `chords.ts` (templates, naming), `fft.ts`. `testing/` holds test-only synths
  and voicings (kept out of `__tests__` so Jest doesn't run them as suites).
- `src/songChords/`: chords of a whole recording (not used by the app yet;
  the nortabs.net song page runs it in the browser, built from here).
  `frames.ts` (resample, spectrogram, drum removal, tuning, chroma),
  `beats.ts`, `chordModel.ts` (key + chord HMM, spelling), `bars.ts` (chord
  sheet in bars), `analyzeSong.ts`. `testing/` has a band synthesizer and a
  chord-sheet reader.
- `src/audio/`: WAV encode/decode, clip recorder, share.
- `src/components/`: UI. `TuningSheet`/`SettingsSheet` share `BottomSheet`.

## How the engines work (and why)

**Tuner.** YIN with per-instrument detection (`Detection` in `tunings.ts`):
guitar/ukulele use a 4096-sample window decimated ×2 (fast), bass and
chromatic use 8192 decimated ×4 with full-rate refinement (reaches 28 Hz).
`detectionFor` widens the range only when transposed targets need it.

**Chords** (`detectNotes` → `matchChord`). Notes are picked iteratively from
spectral peaks by harmonic salience; each found note's overtones are mostly
removed, and a note whose fundamental is an overtone of a found note needs a
higher bar. Matching scores 11 templates × 12 roots (maj, m, 7, maj7, m7, add9,
sus2, sus4, dim, aug, 5).
- Twins with identical notes (Dsus4/Gsus2) count as one finding for confidence;
  the bass picks the name (root, else the chord it's the 5th of).
- `add9` needs its 9th ≥ 0.45 (`colorTones`): a faint 9th is the 5th's overtone.
- Slash chords only when the bass is a chord tone and not the 5th (D/A → D).
- Note range stops at C6: higher "notes" were overtone phantoms.

**SongFollower** (chord mode). Spectral-flux strum detection; analysis windows
start after the latest strum (no mixing of chords); a strum = ≥ 2 new notes;
running-average note strengths; weak overtone notes dropped (also against low
strings heard in the last second); bass = lowest in-chord note with enough
accumulated evidence; instant switch on clear strums, otherwise two agreeing
analyses with confidence ≥ 0.12; power chords that build up note by note wait
1.2 s; windows under −34 dB are silence; history drops blips < 0.4 s.

**Fingerings.** `findFingerings` puts `CHORD_BOOK` shapes first (trusted on
playability, e.g. D/F# uses the thumb, but they must contain exactly the
chord's notes), then generated shapes (≤ 4 fingers incl. barre, ≤ 4-fret span,
no finger crossing; barres drawn only when needed). The bass is the lowest
*pitch*, not the lowest string. Ukulele is re-entrant: no bass constraint, no
slash chords. `rankByHeard` may promote a shape only if it explains clearly more
heard notes and costs ≤ 5 more than the first.

**Song analysis** (`analyzeSong`, for whole recordings with band and vocals).
Resample to 11025 Hz; 4096-sample frames, hop 512 (46 ms); drums removed by
median-filter HPSS (FitzGerald); tuning from where peaks fall between
semitones; bass and treble chroma with the local floor subtracted. A Viterbi
over 24 keys × (24 maj/min chords + no chord) picks keys and chords together:
the key's chords are likelier, key changes are rare, and a relative
major/minor tie goes to the key whose tonic chord is heard longer (major if
equal). Beats: tempo from onset autocorrelation (log-normal preference around
120 bpm, 0.5 octave wide: wider gave half tempo on fast songs), beats placed
by dynamic programming (Ellis 2007) on onsets plus harmonic change (strummed
off-beats otherwise win); chord changes are likelier on beats. Bars: 4/4 vs 3/4
from where chords change; bar lines found by a Viterbi over beats that may
shift (songs add half bars). The chart is simplified like a chord sheet
(`BarOptions.simplify`): a one-beat chord between two of one root goes, and
a major/minor flip of one root within a bar is settled; walks keep their
root and are never touched (busy bars 14% → 7%, sheet agreement unchanged).
A chord whose third is under a tenth of its root and fifth gets
`unclearThird` (major/minor is then the key's guess, right ~96% of the
time; pages can offer the other). Everything up to the chord Viterbi works frame by
frame with ≤ 0.4 s lookahead, so a live version can reuse it.
- What didn't help: a per-frame key bias (fragments keys), narrower HPSS
  windows (short chords weren't lost there: they were bass walks, A/G#).
  Extending each found maj/min chord afterwards (7, maj7, add9, sus) from its
  averaged chroma: at most 17% of the extended chords were on the sheet,
  unless so strict that almost none were found. The added note is usually
  present anyway (B is E's 3rd harmonic, so C looks like Cmaj7; held melody
  notes), and real ones are split before that step (Cadd9 contains a G chord,
  so it is read as C, G). Extended chords would have to be states in the
  chord Viterbi itself.
- Recognising chords per beat (each beat's mean chroma, one Viterbi step
  per beat, changes then moved to the frame where the harmony moves): fixes
  half-beat chords slipping in near changes, and every chord shown was more
  often on the sheet (96.7% → 97.9% of chart beats), but that measure is
  blind to missed chords. In sheet order (longest common subsequence of the
  chart's chord changes with the sheet's) it found 83-85.5% of the sheets'
  changes against 88.7% frame by frame, at any sharpness (38-300); by ear,
  Time of Your Life lost its two-beat Cadd9s. Score engine changes in sheet
  order, not only by whether the chords are on the sheet.
- Giving each beat the chord sounding longest in it (instead of the one a
  quarter into the beat) for the chart: as many songs got worse as better,
  and with the same rule for bar lines the bars shifted.

## Testing

- Unit tests live in `__tests__/` with the `-test.ts` suffix.
- Accuracy suites (`detectChord-test`, `songFollower-test`) use deliberately
  messy synthesized guitars and print tables. Treat their numbers as an upper
  bound: every real-device clip so far exposed something synthesis missed.
- **Real recordings are the ground truth.** In the app: Settings → "Share last
  10 seconds" saves a WAV named after what was on screen. Put it in
  `test-recordings/`, add a manifest entry with what was actually played
  (see `test-recordings/README.md`), and `recordings-test.ts` replays it. Fix
  the engine against the clip, then keep it as a regression test.
- Debugging a clip: replay it through `SongFollower` in a temporary test and
  log per-analysis notes/profile/match; remove the temporary test and any
  trace hooks afterwards.
- Song analysis: `analyzeSong-test` runs synthesized band songs (limits, not
  scores). `realSongs-test` checks real songs against their chord sheets
  (share of chord time on the sheet's chords, at the best transposition); the
  songs can't be in the repo, so it reads a manifest from `SONG_TESTS` and is
  skipped without it (see the test's header).
- Jest perf gotcha: Babel-compiled tight loops are slow if the loop condition
  calls functions (`i < Math.min(...)`); hoist bounds out of hot loops.
- Phone CPU: estimate with `node --jitless` on transpiled code (Hermes has no
  JIT). Chord detection ≈ 17 ms/analysis, song follower ≈ 19% of a core.

## Conventions

- Commit only when the user asks ("commit this"). Before committing, check
  `git status`/`git diff`: tools like `eas init` edit `app.json` behind the
  scenes. Commit messages: summary line + bullet body + Co-Authored-By trailer.
- Run typecheck, lint and tests (and expo-doctor after dependency changes)
  before reporting work as done.
- Use `npx expo install` for packages. Don't edit generated `android/`/`ios/`.
- Note names use sharps (A#, not Bb) throughout, except song analysis, which
  spells chords for their key (Eb in G minor) as chord sheets do.
- Design: dark UI (`src/theme.ts`), mint accent `#4DF2B0`; flat colours, no
  gradients. Icon = grey arc + mint needle on flat `#0F131B`, generated by
  `scripts/generate-icons.mjs` (adaptive layer scaled to Android's safe zone).
- `expo-audio` background playback is off on purpose (no foreground-service
  permissions, no iOS background audio).

## Releases (Google Play)

Live since 16 October 2026: https://play.google.com/store/apps/details?id=net.myr1.tuner
(1.0.0, version code 2). Personal developer account from before Nov 2023, so no
closed-test requirement.

- Store material: listing text and Play Console answers in `store/listing.md`,
  Play icon + feature graphic in `store/` (`generate-icons.mjs … assets store`),
  phone screenshots in `store/screenshots/` (cropped to ≤ 2:1, no alpha).
- Privacy policy: `docs/privacy-policy.html`, served by GitHub Pages at
  https://pitmairen.github.io/tuner/privacy-policy.html (developer Pitmairen,
  progrper@gmail.com). Update its effective date when it changes.
- Android permissions are trimmed in `app.json` (`android.blockedPermissions`).
- R8 minify + resource shrinking are on for release builds (`expo-build-properties`;
  Play flags low DEX obfuscation). R8's `mapping.txt` and native debug
  symbols are packed into the AAB, and Play picks them up on upload; nothing
  to upload by hand. Test a preview APK after native dependency changes,
  since R8 can strip code that's only used by reflection.
- Update flow: bump `version` in `app.json`, then
  `npx eas-cli@latest build --profile production --platform android`
  (version code is remote and auto-incremented). Upload the AAB in Play
  Console, or `npx eas-cli@latest submit --platform android` once a Google
  service account key is set up (not done yet); the submit profile targets
  the internal track as a draft, then promote to production.

## Open items

- Fingerpicking in chord mode is the weakest case (~1 s lag, passing chords).
- Not recognised: 6, m6, 9, m(add9) and other extended chords.
- Song analysis knows only major/minor (Cadd9 shows as C) and no slash chords;
  slow songs with loud eighths may get double tempo (half-length bars).
- Silence gate is a fixed level (−34 dB); a quiet phone mic could fall under it.
- Ideas: share several clips at once; larger splash gauge.

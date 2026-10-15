# Tuner

A tuner and chord recogniser for guitar, bass and ukulele, built with Expo /
React Native. All audio analysis runs on the phone in TypeScript; there's no
backend, account, ads or tracking.

- Needle tuner with automatic string detection, ✓ per tuned string, octave hints
- Guitar, bass and ukulele tunings, custom tunings, capo/transpose, A4 calibration
- Reference notes and a strum of the whole tuning
- Chromatic mode
- Chord mode: names the chord you strum (major, minor, 7ths, sus, add9, dim,
  aug, power), follows along as you play with a history, and shows guitar or
  ukulele chord diagrams

## Development

```bash
npm install
npx expo start --go     # run in Expo Go
npm test                # unit tests, synthesized accuracy suites and real recordings
npx tsc --noEmit && npx expo lint
```

Builds use EAS: `npx eas-cli@latest build --profile preview --platform android`
gives an installable APK. See `CLAUDE.md` for the architecture, how the pitch
and chord engines work, and the testing workflow with real recordings in
`test-recordings/`.

## Privacy

See [`docs/privacy-policy.html`](docs/privacy-policy.html).

## License

[MIT](LICENSE)

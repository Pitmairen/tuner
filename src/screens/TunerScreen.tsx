import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shareClip } from '../audio/shareClip';
import { FRET_INSTRUMENTS } from '../chords/fingerings';
import { HistoryEntry } from '../chords/songFollower';
import { ChordDiagramSheet } from '../components/ChordDiagramSheet';
import { ChordHistory } from '../components/ChordHistory';
import { ChordReadout } from '../components/ChordReadout';
import { Header } from '../components/Header';
import { NoteStrip } from '../components/NoteStrip';
import { PermissionPrompt } from '../components/PermissionPrompt';
import { SettingsSheet } from '../components/SettingsSheet';
import { StringSelector } from '../components/StringSelector';
import { TuningReadout } from '../components/TuningReadout';
import { TuningSheet } from '../components/TuningSheet';
import { centsColor, colors } from '../theme';
import { DEFAULT_A4, pitchClass } from '../tuner/notes';
import { CHORD_ID, CHROMATIC_ID, instrument, InstrumentId, transposeLabel, TUNINGS } from '../tuner/tunings';
import { useCustomTunings } from '../tuner/useCustomTunings';
import { useReferenceTone } from '../tuner/useReferenceTone';
import { useTuner } from '../tuner/useTuner';
import { useSettings } from '../useSettings';

/**
 * The app's one screen: owns the settings, the microphone (via useTuner) and
 * the sheets, and shows the tuner, chromatic or chord mode.
 */
export function TunerScreen() {
  // Nobody touches the screen while tuning, so don't let it sleep.
  useKeepAwake();

  const custom = useCustomTunings();
  // tuningId is tracked rather than the tuning itself so edits to (or deletion
  // of) a custom tuning apply immediately.
  const [settings, updateSettings] = useSettings();
  const chromatic = settings.tuningId === CHROMATIC_ID;
  const chordMode = settings.tuningId === CHORD_ID;
  const fingering = FRET_INSTRUMENTS.find((i) => i.id === settings.fingering) ?? null;
  /** Chromatic and chord modes have no strings to tune. */
  const freeform = chromatic || chordMode;
  // Unused in freeform modes, where it falls back to guitar Standard.
  const tuning = [...TUNINGS, ...custom.tunings].find((t) => t.id === settings.tuningId) ?? TUNINGS[0];

  const [lockedString, setLockedString] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState<InstrumentId>(tuning.instrument);
  const [toneMode, setToneMode] = useState(false);
  const [shownChord, setShownChord] = useState<HistoryEntry | null>(null);
  const tone = useReferenceTone();
  // Stop listening while a reference note plays so the tuner doesn't hear itself.
  const paused = tone.playing != null;

  const {
    reading,
    chord,
    chordHistory,
    clearChordHistory,
    recentAudio,
    strings,
    tunedStrings,
    celebration,
    permission,
    retry,
  } = useTuner({
    tuning,
    chromatic,
    chordMode,
    // A ukulele's lowest note isn't the chord's bass, so no slash chords.
    ignoreBass: fingering?.reentrant ?? false,
    lockedString: freeform ? null : lockedString,
    a4: settings.a4,
    transpose: settings.transpose,
    muted: paused,
    steadiness: settings.steadiness,
  });

  // A light tap each time a new chord is recognised.
  const chordName = chord?.name ?? null;
  useEffect(() => {
    if (chordName) Haptics.selectionAsync();
  }, [chordName]);

  const playingString = strings.find((s) => s.note === tone.playing);
  const idleTarget = playingString ?? (lockedString != null ? strings[lockedString] : null);

  /** Saves the last few seconds of audio, named after what was on screen, and shares it. */
  const shareRecentAudio = () => {
    const clip = recentAudio();
    if (!clip) {
      Alert.alert('Nothing to share yet', 'Play something first, then share right after.');
      return;
    }
    const showing = chordMode
      ? `chord-${chord?.name ?? 'none'}`
      : `${chromatic ? 'chromatic' : tuning.id}-${reading ? `${reading.target.note}${Math.round(reading.cents)}c` : 'none'}`;
    setSettingsOpen(false);
    // Let the settings sheet close before the share sheet opens over it.
    setTimeout(() => {
      shareClip(clip, showing).catch((error: Error) => Alert.alert('Could not share the clip', error.message));
    }, 400);
  };

  const tags = [
    ...(settings.a4 !== DEFAULT_A4
      ? [{ label: `A${settings.a4}`, accessibilityLabel: 'Reference pitch settings' }]
      : []),
    ...(!freeform && transposeLabel(settings.transpose)
      ? [{ label: transposeLabel(settings.transpose)!, accessibilityLabel: 'Capo settings' }]
      : []),
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title={chordMode ? 'Chord' : chromatic ? 'Chromatic' : `${instrument(tuning.instrument).name} · ${tuning.name}`}
        subtitle={chordMode ? 'Strum to name it' : chromatic ? 'Any note' : tuning.notes.map(pitchClass).join(' ')}
        tags={tags}
        onOpenTuning={() => {
          setSheetInstrument(tuning.instrument);
          setSheetOpen(true);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {permission === 'denied' ? (
        <PermissionPrompt onRetry={retry} />
      ) : chordMode ? (
        <View style={styles.main}>
          <ChordReadout result={chord} fingering={fingering} />
        </View>
      ) : (
        <TuningReadout
          reading={reading}
          idleTarget={idleTarget}
          paused={paused}
          chromatic={chromatic}
          steadiness={settings.steadiness}
          celebration={celebration}
          stringCount={strings.length}
        />
      )}

      <View style={styles.footer}>
        {chordMode ? (
          <ChordHistory
            history={chordHistory}
            live={chord != null && chordHistory[chordHistory.length - 1]?.name === chord.name}
            onClear={clearChordHistory}
            onSelect={fingering ? setShownChord : undefined}
          />
        ) : chromatic ? (
          <NoteStrip
            active={reading ? [pitchClass(reading.target.note)] : []}
            color={centsColor(reading?.cents ?? null)}
            caption="Chromatic · any note"
          />
        ) : (
          <StringSelector
            strings={strings}
            activeString={reading?.stringIndex ?? null}
            lockedString={lockedString}
            tunedStrings={tunedStrings}
            onLockChange={setLockedString}
            toneMode={toneMode}
            onToneModeChange={setToneMode}
            playingNote={tone.playing}
            onPlay={tone.play}
            onStrum={() => tone.strum(strings)}
            strumming={tone.strumming}
            celebration={celebration}
          />
        )}
      </View>

      <TuningSheet
        visible={sheetOpen}
        selectedId={chordMode ? CHORD_ID : chromatic ? CHROMATIC_ID : tuning.id}
        instrumentTab={sheetInstrument}
        onInstrumentTabChange={setSheetInstrument}
        a4={settings.a4}
        customTunings={custom.tunings}
        onSaveCustom={custom.save}
        onDeleteCustom={custom.remove}
        onPlay={tone.play}
        onClose={() => setSheetOpen(false)}
        onSelect={(id) => {
          updateSettings({ tuningId: id });
          setLockedString(null);
          setSheetOpen(false);
        }}
      />

      <ChordDiagramSheet entry={shownChord} instrument={fingering} onClose={() => setShownChord(null)} />

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        a4={settings.a4}
        onA4Change={(a4) => updateSettings({ a4 })}
        steadiness={settings.steadiness}
        onSteadinessChange={(steadiness) => updateSettings({ steadiness })}
        transpose={settings.transpose}
        onTransposeChange={(transpose) => updateSettings({ transpose })}
        transposeApplies={!freeform}
        fingering={settings.fingering}
        onFingeringChange={(value) => updateSettings({ fingering: value })}
        onShareClip={shareRecentAudio}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingBottom: 24,
  },
});

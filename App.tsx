import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Gauge } from './src/components/Gauge';
import { MicOffIcon } from './src/components/icons';
import { NoteStrip } from './src/components/NoteStrip';
import { TunedBanner } from './src/components/TunedBanner';
import { StringSelector } from './src/components/StringSelector';
import { TuningSheet } from './src/components/TuningSheet';
import { centsColor, colors } from './src/theme';
import { noteHint } from './src/tuner/hint';
import { DEFAULT_A4, pitchClass } from './src/tuner/notes';
import { CHROMATIC_ID, instrument, InstrumentId, transposeLabel, TUNINGS } from './src/tuner/tunings';
import { useCustomTunings } from './src/tuner/useCustomTunings';
import { useReferenceTone } from './src/tuner/useReferenceTone';
import { IN_TUNE_CENTS, useTuner } from './src/tuner/useTuner';
import { useSettings } from './src/useSettings';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <TunerScreen />
    </SafeAreaProvider>
  );
}

function TunerScreen() {
  const { width } = useWindowDimensions();
  const custom = useCustomTunings();
  // tuningId is tracked rather than the tuning itself so edits to (or deletion
  // of) a custom tuning apply immediately.
  const [settings, updateSettings] = useSettings();
  const chromatic = settings.tuningId === CHROMATIC_ID;
  // Unused in chromatic mode, where it falls back to guitar Standard.
  const tuning = [...TUNINGS, ...custom.tunings].find((t) => t.id === settings.tuningId) ?? TUNINGS[0];
  const [lockedString, setLockedString] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState<InstrumentId>(tuning.instrument);
  const [toneMode, setToneMode] = useState(false);
  const tone = useReferenceTone();
  // Stop listening while a reference note plays so the tuner doesn't hear itself.
  const paused = tone.playing != null;
  const { reading, strings, tunedStrings, celebration, permission, retry } = useTuner({
    tuning,
    chromatic,
    lockedString: chromatic ? null : lockedString,
    a4: settings.a4,
    transpose: settings.transpose,
    muted: paused,
    steadiness: settings.steadiness,
  });

  const cents = reading?.cents ?? null;
  const playingString = strings.find((s) => s.note === tone.playing);
  const target = reading
    ? reading.target
    : (playingString ?? (lockedString != null ? strings[lockedString] : null));
  const accent = centsColor(cents);
  // Chromatic mode already shows the played note, so it needs no hint.
  const hint = reading && !chromatic && !paused ? noteHint(reading.cents, reading.playing, reading.target.note) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>tuner</Text>
        <Pressable
          onPress={() => {
            setSheetInstrument(tuning.instrument);
            setSheetOpen(true);
          }}
          style={({ pressed }) => [styles.tuningChip, pressed && { opacity: 0.7 }]}>
          <Text style={styles.tuningName} numberOfLines={1}>
            {chromatic ? 'Chromatic' : `${instrument(tuning.instrument).name} · ${tuning.name}`}
          </Text>
          <Text style={styles.tuningNotes}>{chromatic ? 'Any note' : tuning.notes.map(pitchClass).join(' ')}</Text>
          {settings.a4 !== DEFAULT_A4 && <Text style={styles.a4Tag}>A{settings.a4}</Text>}
          {!chromatic && transposeLabel(settings.transpose) && (
            <Text style={styles.a4Tag}>{transposeLabel(settings.transpose)}</Text>
          )}
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
      </View>

      {permission === 'denied' ? (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>Microphone access needed</Text>
          <Text style={styles.permissionBody}>The tuner listens to your instrument through the microphone. Nothing is recorded or stored.</Text>
          <Pressable style={styles.permissionButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable onPress={retry}>
            <Text style={styles.permissionRetry}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.main}>
          <TunedBanner trigger={celebration} stringCount={strings.length} />
          <Gauge cents={cents} size={Math.min(width - 40, 380)} paused={paused} steadiness={settings.steadiness} />

          <View style={styles.readout}>
            <View style={styles.noteRow}>
              <Text style={[styles.note, { color: reading ? colors.text : paused ? colors.muted : colors.faint }]}>
                {target ? pitchClass(target.note) : '–'}
              </Text>
              {target && <Text style={styles.octave}>{target.note.match(/\d+$/)?.[0]}</Text>}
            </View>
            <Text style={styles.detail}>
              {paused && target
                ? `Reference · ${target.frequency.toFixed(1)} Hz`
                : reading
                ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(0)} cents · ${reading.frequency.toFixed(1)} Hz`
                : target
                  ? `${target.frequency.toFixed(1)} Hz`
                  : ' '}
            </Text>
            {/* Always rendered so the status pill doesn't move when a hint appears. */}
            <Text style={[styles.hint, hint?.kind === 'octave' && styles.hintOctave]} numberOfLines={1}>
              {hint?.text ?? ' '}
            </Text>
            {paused ? (
              <View style={[styles.status, styles.statusPaused]}>
                <MicOffIcon color={colors.muted} size={15} />
                <Text style={[styles.statusText, { color: colors.muted }]}>Tuner paused</Text>
              </View>
            ) : (
              <View style={[styles.status, { borderColor: accent, backgroundColor: reading ? `${accent}1A` : 'transparent' }]}>
                <Text style={[styles.statusText, { color: reading ? accent : colors.muted }]}>
                  {hint?.kind === 'octave' ? 'Wrong octave' : statusLabel(cents, chromatic)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        {chromatic ? (
          <NoteStrip active={reading ? pitchClass(reading.target.note) : null} color={accent} />
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
        selectedId={chromatic ? CHROMATIC_ID : tuning.id}
        instrumentTab={sheetInstrument}
        onInstrumentTabChange={setSheetInstrument}
        a4={settings.a4}
        onA4Change={(a4) => updateSettings({ a4 })}
        steadiness={settings.steadiness}
        onSteadinessChange={(steadiness) => updateSettings({ steadiness })}
        transpose={settings.transpose}
        onTransposeChange={(transpose) => updateSettings({ transpose })}
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
    </SafeAreaView>
  );
}

function statusLabel(cents: number | null, chromatic: boolean): string {
  if (cents == null) return chromatic ? 'Play a note' : 'Play a string';
  if (Math.abs(cents) <= IN_TUNE_CENTS) return 'In tune';
  return cents < 0 ? 'Tune up  ↑' : 'Tune down  ↓';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tuningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tuningName: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  tuningNotes: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  a4Tag: {
    color: colors.close,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 200, 87, 0.12)',
    overflow: 'hidden',
  },
  chevron: {
    color: colors.muted,
    fontSize: 12,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  readout: {
    alignItems: 'center',
    gap: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  note: {
    fontSize: 104,
    lineHeight: 112,
    fontWeight: '800',
    letterSpacing: -3,
  },
  octave: {
    color: colors.muted,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
    marginLeft: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: -4,
  },
  hintOctave: {
    color: colors.close,
  },
  detail: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPaused: {
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    paddingBottom: 24,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: colors.inTune,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  permissionButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  permissionRetry: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    padding: 8,
  },
});

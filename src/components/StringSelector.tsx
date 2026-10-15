import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { pitchClass } from '../tuner/notes';
import { TuningString } from '../tuner/tunings';
import { SpeakerIcon, StrumIcon } from './icons';

type Props = {
  strings: TuningString[];
  activeString: number | null;
  lockedString: number | null;
  tunedStrings: Set<number>;
  onLockChange: (index: number | null) => void;
  /** When on, tapping a string plays its reference note instead of locking it. */
  toneMode: boolean;
  onToneModeChange: (on: boolean) => void;
  playingNote: string | null;
  onPlay: (string: TuningString) => void;
  onStrum: () => void;
  strumming: boolean;
};

export function StringSelector({
  strings,
  activeString,
  lockedString,
  tunedStrings,
  onLockChange,
  toneMode,
  onToneModeChange,
  playingNote,
  onPlay,
  onStrum,
  strumming,
}: Props) {
  const [strumOpacity] = useState(() => new Animated.Value(toneMode ? 1 : 0));
  useEffect(() => {
    Animated.timing(strumOpacity, { toValue: toneMode ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [strumOpacity, toneMode]);

  const select = (index: number | null) => {
    Haptics.selectionAsync();
    onLockChange(index);
  };

  const toggleTone = () => {
    Haptics.selectionAsync();
    onToneModeChange(!toneMode);
  };

  return (
    <View style={styles.container}>
      <View style={styles.pills}>
        <Pressable
          onPress={() => select(null)}
          style={[styles.pill, lockedString == null && styles.pillActive]}
          accessibilityRole="switch"
          accessibilityState={{ checked: lockedString == null }}
        >
          <View style={[styles.autoDot, lockedString == null && styles.autoDotActive]} />
          <Text style={[styles.pillText, lockedString == null && styles.pillTextActive]}>Auto detect</Text>
        </Pressable>
        <Pressable
          onPress={toggleTone}
          style={[styles.pill, toneMode && styles.pillActive]}
          accessibilityRole="switch"
          accessibilityState={{ checked: toneMode }}
        >
          <SpeakerIcon color={toneMode ? colors.inTune : colors.muted} />
          <Text style={[styles.pillText, toneMode && styles.pillTextActive]}>Play notes</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {strings.map((string, index) => {
          const active = index === activeString;
          const locked = index === lockedString;
          const tuned = tunedStrings.has(index);
          const playing = string.note === playingNote;
          return (
            <Pressable
              key={index}
              onPress={() => (toneMode ? onPlay(string) : select(locked ? null : index))}
              accessibilityLabel={`${toneMode ? 'Play' : 'String'} ${strings.length - index}, ${string.note}`}
              style={({ pressed }) => [
                styles.string,
                active && styles.stringActive,
                locked && styles.stringLocked,
                playing && styles.stringPlaying,
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              <Text style={[styles.stringNote, locked && styles.onLocked]}>
                {pitchClass(string.note)}
              </Text>
              {toneMode ? (
                <SpeakerIcon color={locked ? colors.background : playing ? colors.inTune : colors.muted} size={12} />
              ) : (
                <Text style={[styles.stringNumber, locked && styles.onLocked]}>{strings.length - index}</Text>
              )}
              {tuned && (
                <View style={[styles.tunedBadge, locked && styles.tunedBadgeOnLocked]} accessibilityLabel="Tuned">
                  <Text style={[styles.tunedBadgeText, locked && styles.tunedBadgeTextOnLocked]}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Always laid out so toggling Play notes never shifts the string row. */}
      <Animated.View
        style={{ opacity: strumOpacity }}
        pointerEvents={toneMode ? 'auto' : 'none'}
        accessibilityElementsHidden={!toneMode}
        importantForAccessibility={toneMode ? 'auto' : 'no-hide-descendants'}
      >
        <Pressable
          onPress={onStrum}
          disabled={!toneMode}
          accessibilityLabel="Strum all strings"
          style={({ pressed }) => [
            styles.strum,
            strumming && styles.strumActive,
            pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
          ]}
        >
          <StrumIcon color={strumming ? colors.background : colors.inTune} />
          <Text style={[styles.strumText, strumming && styles.strumTextActive]}>Strum all strings</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 18,
  },
  pills: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    borderColor: colors.inTune,
    backgroundColor: 'rgba(77, 242, 176, 0.08)',
  },
  autoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.faint,
  },
  autoDotActive: {
    backgroundColor: colors.inTune,
  },
  pillText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pillTextActive: {
    color: colors.inTune,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  string: {
    width: 50,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    // Always set so stringPlaying only toggles opacity; removing shadow props
    // isn't reliably applied and can leave the glow behind.
    shadowColor: colors.inTune,
    shadowOpacity: 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  tunedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.inTune,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tunedBadgeOnLocked: {
    backgroundColor: colors.background,
  },
  tunedBadgeTextOnLocked: {
    color: colors.inTune,
  },
  tunedBadgeText: {
    color: colors.background,
    fontSize: 9,
    fontWeight: '800',
  },
  stringActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.text,
  },
  stringLocked: {
    backgroundColor: colors.inTune,
    borderColor: colors.inTune,
  },
  strum: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(77, 242, 176, 0.35)',
    backgroundColor: 'rgba(77, 242, 176, 0.06)',
    // Always set; strumActive only raises the opacity (see `string` above).
    shadowColor: colors.inTune,
    shadowOpacity: 0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  strumActive: {
    borderColor: colors.inTune,
    backgroundColor: colors.inTune,
    shadowOpacity: 0.6,
  },
  strumText: {
    color: colors.inTune,
    fontSize: 15,
    fontWeight: '700',
  },
  strumTextActive: {
    color: colors.background,
  },
  stringPlaying: {
    borderColor: colors.inTune,
    shadowOpacity: 0.7,
  },
  stringNote: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  onLocked: {
    color: colors.background,
  },
  stringNumber: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});

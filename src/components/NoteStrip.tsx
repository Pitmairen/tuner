import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

type Props = {
  /** Pitch classes to light, e.g. ["C"]. */
  active: string[];
  color: string;
  caption: string;
};

/** The twelve notes of the octave with the ones heard lit. Used in chromatic mode. */
export function NoteStrip({ active, color, caption }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.row}>
        {PITCH_CLASSES.map((pitch) => {
          const isActive = active.includes(pitch);
          const sharp = pitch.length > 1;
          return (
            <View
              key={pitch}
              style={[
                styles.cell,
                sharp && styles.cellSharp,
                isActive && { backgroundColor: color, borderColor: color },
              ]}
            >
              <Text
                style={[styles.text, sharp && styles.textSharp, isActive && styles.textActive]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {pitch}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 12,
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    maxWidth: 380,
  },
  cell: {
    flex: 1,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSharp: {
    backgroundColor: colors.background,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  textSharp: {
    color: colors.muted,
    fontSize: 11,
  },
  textActive: {
    color: colors.background,
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { SlidersIcon } from './icons';

type Props = {
  /** What's being tuned to, e.g. "Guitar · Drop D". */
  title: string;
  /** Its notes, or a short description in chromatic and chord modes. */
  subtitle: string;
  /** Reminders that a setting is changed (A442, Capo 2); tapping one opens settings. */
  tags: { label: string; accessibilityLabel: string }[];
  onOpenTuning: () => void;
  onOpenSettings: () => void;
};

export function Header({ title, subtitle, tags, onOpenTuning, onOpenSettings }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>tuner</Text>
        <Pressable
          onPress={onOpenSettings}
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [styles.settingsButton, pressed && { opacity: 0.6 }]}
        >
          <SlidersIcon color={colors.muted} />
        </Pressable>
      </View>
      <Pressable onPress={onOpenTuning} style={({ pressed }) => [styles.tuningChip, pressed && { opacity: 0.7 }]}>
        <Text style={styles.tuningName} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tuningNotes}>{subtitle}</Text>
        {tags.map(({ label, accessibilityLabel }) => (
          <Pressable key={label} onPress={onOpenSettings} hitSlop={6} accessibilityLabel={accessibilityLabel}>
            <Text style={styles.settingTag}>{label}</Text>
          </Pressable>
        ))}
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
  settingTag: {
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
});

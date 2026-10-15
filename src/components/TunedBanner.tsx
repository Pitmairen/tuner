import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';

import { colors } from '../theme';

type Props = {
  /** Shows the banner each time this changes (0 = never shown yet). */
  trigger: number;
  stringCount: number;
};

/** A brief "all strings in tune" pill that slides in, holds, and fades away. */
export function TunedBanner({ trigger, stringCount }: Props) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (trigger === 0) return;
    AccessibilityInfo.announceForAccessibility(`All ${stringCount} strings in tune`);
    progress.setValue(0);
    Animated.sequence([
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, stiffness: 220, damping: 18 }),
      Animated.delay(2000),
      Animated.timing(progress, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    // Only a new trigger should replay the banner, not a change of string count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, trigger]);

  return (
    <Animated.View
      pointerEvents="none"
      // Announced explicitly above; the invisible resting banner shouldn't be focusable.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.banner,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
    >
      <Text style={styles.check}>✓</Text>
      <Text style={styles.text}>All {stringCount} strings in tune</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.inTune,
    shadowColor: colors.inTune,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  check: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '900',
  },
  text: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
});

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { centsColor, colors } from '../theme';
import { IN_TUNE_CENTS } from '../tuner/useTuner';
import { SpeakerIcon } from './icons';

const RANGE_CENTS = 50;
const SWEEP_DEG = 62;

type Props = {
  cents: number | null;
  size: number;
  /** Detection is off (a reference note is playing): dim the dial and hide the needle. */
  paused?: boolean;
};

/** Semicircular needle gauge spanning ±50 cents. */
export function Gauge({ cents, size, paused = false }: Props) {
  const radius = size / 2 - 12;
  const cx = size / 2;
  const cy = radius + 12;
  const height = cy + 16;
  const color = centsColor(cents);

  const [angle] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const clamped = cents == null ? 0 : Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents));
    Animated.spring(angle, {
      toValue: (clamped / RANGE_CENTS) * SWEEP_DEG,
      useNativeDriver: true,
      stiffness: 180,
      damping: 20,
      mass: 0.6,
    }).start();
  }, [angle, cents]);

  const [dim] = useState(() => new Animated.Value(paused ? 1 : 0));
  useEffect(() => {
    Animated.timing(dim, { toValue: paused ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [dim, paused]);
  const dialOpacity = dim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] });
  const needleOpacity = dim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const ticks = [];
  for (let c = -RANGE_CENTS; c <= RANGE_CENTS; c += 5) {
    const major = c % 25 === 0;
    const theta = ((c / RANGE_CENTS) * SWEEP_DEG * Math.PI) / 180;
    const outer = radius;
    const inner = radius - (major ? 18 : 10);
    ticks.push(
      <Line
        key={c}
        x1={cx + outer * Math.sin(theta)}
        y1={cy - outer * Math.cos(theta)}
        x2={cx + inner * Math.sin(theta)}
        y2={cy - inner * Math.cos(theta)}
        stroke={c === 0 ? colors.text : major ? colors.muted : colors.faint}
        strokeWidth={c === 0 ? 3 : major ? 2 : 1.5}
        strokeLinecap="round"
      />,
    );
  }

  const zoneRadius = radius + 6;
  const zoneTheta = ((IN_TUNE_CENTS / RANGE_CENTS) * SWEEP_DEG * Math.PI) / 180;
  const zone = `M ${cx - zoneRadius * Math.sin(zoneTheta)} ${cy - zoneRadius * Math.cos(zoneTheta)}
    A ${zoneRadius} ${zoneRadius} 0 0 1 ${cx + zoneRadius * Math.sin(zoneTheta)} ${cy - zoneRadius * Math.cos(zoneTheta)}`;

  const needleLength = radius - 6;

  return (
    <View style={{ width: size, height }}>
      <Animated.View style={{ opacity: dialOpacity }}>
        <Svg width={size} height={height}>
          <Path d={zone} stroke={colors.inTune} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.9} />
          {ticks}
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.needle,
          {
            left: cx - 2,
            top: cy - needleLength,
            height: needleLength,
            backgroundColor: color,
            shadowColor: color,
            opacity: needleOpacity,
            transform: [
              { rotate: angle.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[styles.hub, { left: cx - 9, top: cy - 9, borderColor: color, opacity: dialOpacity }]}
      />
      {paused && (
        <View style={[styles.pausedLabel, { top: cy * 0.42 }]} pointerEvents="none">
          <SpeakerIcon color={colors.text} size={16} />
          <Text style={styles.pausedText}>Reference playing</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pausedLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pausedText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  needle: {
    position: 'absolute',
    width: 4,
    borderRadius: 2,
    transformOrigin: 'bottom',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  hub: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 4,
    backgroundColor: colors.background,
  },
});

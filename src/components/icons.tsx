import Svg, { Path } from 'react-native-svg';

/** A plectrum sweeping across strings. */
export function StrumIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4v16M10 4v16M15 4v16" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
      <Path d="M3 12h15m0 0-4-4m4 4-4 4" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SpeakerIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9v6h4l5 4V5L8 9H4z" fill={color} />
      <Path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** A microphone with a slash through it. */
export function MicOffIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 9V6a3 3 0 0 1 6 0v5M15 14.5A3 3 0 0 1 9 12M5.5 11a6.5 6.5 0 0 0 11 4.7M18.5 11c0 .6-.1 1.2-.2 1.8M12 17.5V21M9 21h6M4 4l16 16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

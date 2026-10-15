import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Fingering, FretInstrument } from '../chords/fingerings';
import { colors } from '../theme';

const STRING_GAP = 24;
const FRET_GAP = 28;
const ROWS = 4;
const LEFT = 30; // room for the "5fr" label
const TOP = 22; // room for x / o markers
const GRID_HEIGHT = FRET_GAP * ROWS;
export const DIAGRAM_HEIGHT = TOP + GRID_HEIGHT + 24;

export function diagramWidth(stringCount: number) {
  return LEFT + STRING_GAP * (stringCount - 1) + 16;
}

type Props = {
  fingering: Fingering;
  instrument: FretInstrument;
  color: string;
};

/** A standard chord box: strings vertical (in playing order), frets horizontal. */
export function ChordDiagram({ fingering, instrument, color }: Props) {
  const stringNames = instrument.stringNames;
  const gridWidth = STRING_GAP * (stringNames.length - 1);
  const fretted = fingering.frets.filter((f): f is number => f != null && f > 0);
  const highest = fretted.length ? Math.max(...fretted) : 0;
  // Shapes that fit in the first four frets are drawn from the nut.
  const baseFret = highest <= ROWS ? 1 : Math.min(...fretted);
  const x = (string: number) => LEFT + string * STRING_GAP;
  const y = (fret: number) => TOP + (fret - baseFret + 0.5) * FRET_GAP;

  return (
    <Svg
      width={diagramWidth(stringNames.length)}
      height={DIAGRAM_HEIGHT}
      accessibilityLabel={`Chord shape ${fingering.frets.map((f) => (f == null ? 'muted' : f)).join(', ')}`}
    >
      {/* Frets; the nut is drawn thick when the shape starts at fret 1. */}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <Line
          key={`fret-${i}`}
          x1={LEFT}
          x2={LEFT + gridWidth}
          y1={TOP + i * FRET_GAP}
          y2={TOP + i * FRET_GAP}
          stroke={i === 0 && baseFret === 1 ? colors.text : colors.faint}
          strokeWidth={i === 0 && baseFret === 1 ? 5 : 1.5}
        />
      ))}
      {stringNames.map((name, s) => (
        <Line
          key={`string-${s}`}
          x1={x(s)}
          x2={x(s)}
          y1={TOP}
          y2={TOP + GRID_HEIGHT}
          stroke={colors.muted}
          strokeWidth={1.5}
        />
      ))}
      {baseFret > 1 && (
        <SvgText x={LEFT - 8} y={y(baseFret) + 4} fill={colors.muted} fontSize={12} fontWeight="700" textAnchor="end">
          {`${baseFret}fr`}
        </SvgText>
      )}

      {fingering.barre && (
        <Rect
          x={x(fingering.barre.from) - 9}
          y={y(fingering.barre.fret) - 9}
          width={x(fingering.barre.to) - x(fingering.barre.from) + 18}
          height={18}
          rx={9}
          fill={color}
        />
      )}

      {fingering.frets.map((fret, s) => {
        if (fret == null) {
          return (
            <SvgText key={s} x={x(s)} y={TOP - 7} fill={colors.muted} fontSize={13} fontWeight="700" textAnchor="middle">
              ×
            </SvgText>
          );
        }
        if (fret === 0) {
          return <Circle key={s} cx={x(s)} cy={TOP - 11} r={5} stroke={colors.muted} strokeWidth={1.5} fill="none" />;
        }
        return <Circle key={s} cx={x(s)} cy={y(fret)} r={9} fill={color} />;
      })}

      {stringNames.map((name, s) => (
        <SvgText
          key={`name-${s}`}
          x={x(s)}
          y={TOP + GRID_HEIGHT + 18}
          fill={colors.faint}
          fontSize={11}
          fontWeight="600"
          textAnchor="middle"
        >
          {name}
        </SvgText>
      ))}
    </Svg>
  );
}

/** The app's mark (the launcher icon): a brass anchor on deep ink. */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { ACCENT, ON_ACCENT } from '../brand';

export function AppMark({ size = 88 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="18 18 72 72" accessible={false}>
      <Rect x={18} y={18} width={72} height={72} rx={18} fill={ON_ACCENT} />
      <Circle cx={54} cy={33} r={5.5} stroke={ACCENT} strokeWidth={5} fill="none" />
      <Path d="M54 39V80M42 47H66M35 63C37 75 45 81 54 81C63 81 71 75 73 63" stroke={ACCENT} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d="M30 66L35 55L41 65ZM78 66L73 55L67 65Z" fill={ACCENT} />
    </Svg>
  );
}

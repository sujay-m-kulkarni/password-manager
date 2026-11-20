/**
 * Vault's icons: simple 24×24 line drawings (2 px rounded strokes), drawn as vectors so they stay
 * sharp at any size and look the same on every phone (text symbols depend on the phone's fonts).
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'vault'
  | 'sparkle'
  | 'settings'
  | 'lock'
  | 'fingerprint'
  | 'star'
  | 'star-outline'
  | 'plus'
  | 'minus'
  | 'refresh'
  | 'chevron-left'
  | 'chevron-right'
  | 'check'
  | 'copy'
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'bank'
  | 'chart'
  | 'people'
  | 'mail'
  | 'grid'
  | 'pin'
  | 'umbrella'
  | 'sunset'
  | 'id'
  | 'home'
  | 'car'
  | 'receipt'
  | 'doc'
  | 'phone'
  | 'heart'
  | 'family';

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z';

const PATHS: Record<IconName, string[]> = {
  vault: ['M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z', 'M12 10.5v4'],
  sparkle: ['M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 4.5v5', 'M9 14.5v5'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3', 'M12 14.5v2'],
  fingerprint: [
    'M7.5 18.5c1-1.7 1.5-3.7 1.5-6a3 3 0 016 0c0 1.2-.1 2.4-.4 3.5',
    'M12 12.5c0 3.1-.9 5.8-2.6 8',
    'M5 15.5c.6-1 1-2.1 1-3.3a6 6 0 0112 0c0 2.6-.4 4.9-1.2 7',
    'M6.5 5.8A8.5 8.5 0 0120.5 12',
  ],
  star: [STAR],
  'star-outline': [STAR],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  refresh: ['M19.5 12a7.5 7.5 0 11-2.2-5.3', 'M19.5 4.5v4h-4'],
  'chevron-left': ['M14.5 6l-6 6 6 6'],
  'chevron-right': ['M9.5 6l6 6-6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  copy: ['M8 8h12v12H8z', 'M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M20 20l-3.5-3.5'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],
  'eye-off': ['M3 3l18 18', 'M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3 3.9', 'M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4', 'M9.9 9.9a3 3 0 004.2 4.2'],
  bank: ['M3 10l9-6 9 6', 'M5 10v8', 'M10 10v8', 'M14 10v8', 'M19 10v8', 'M3 20h18'],
  chart: ['M4 18l5-6 4 3 7-8', 'M4 20h16'],
  people: ['M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'M16 4.5a3.5 3.5 0 010 6.5', 'M18 14c2 .7 3 2.8 3 6'],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  pin: ['M2 7h20v10H2z', 'M7 12h.01', 'M12 12h.01', 'M17 12h.01'],
  umbrella: ['M3 12a9 9 0 0118 0z', 'M12 12v6a2 2 0 01-4 0', 'M12 3v.5'],
  sunset: ['M4 18h16', 'M7 18a5 5 0 0110 0', 'M12 6v3', 'M5.6 9.6l2 2', 'M18.4 9.6l-2 2'],
  id: ['M3 5h18v14H3z', 'M10 11a2 2 0 100-4 2 2 0 000 4z', 'M6.5 16c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6', 'M15.5 9h3', 'M15.5 12.5h3'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  car: ['M4 17v-4l2.2-5.5h11.6L20 13v4z', 'M4 13h16', 'M7.5 17v2', 'M16.5 17v2'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  phone: ['M7 3h10v18H7z', 'M11 18h2'],
  heart: ['M12 20s-7-4.4-9-9.2C1.8 7.6 4 4.5 7.2 4.5c2 0 3.5 1.2 4.8 3 1.3-1.8 2.8-3 4.8-3 3.2 0 5.4 3.1 4.2 6.3-2 4.8-9 9.2-9 9.2z'],
  family: ['M8 10a3 3 0 100-6 3 3 0 000 6z', 'M17 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M2.5 20c0-3.2 2.5-5.8 5.5-5.8s5.5 2.6 5.5 5.8', 'M13.5 15.2c.9-.8 2.1-1.2 3.5-1.2 2.7 0 4.5 2.2 4.5 5'],
};

const FILLED: Partial<Record<IconName, true>> = { star: true };

export function Icon({ name, size = 24, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const filled = FILLED[name] === true;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {PATHS[name].map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? color : 'none'}
        />
      ))}
      {name === 'vault' && <Circle cx={12} cy={9.5} r={1.6} fill={color} />}
    </Svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

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
  | 'check';

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

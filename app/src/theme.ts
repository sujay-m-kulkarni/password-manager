// Option D — "Full set, colourful"
export const colors = {
  primary: '#5B3DF5',
  primarySoft: '#EAE5FF',
  bg: '#F7F5FF',
  surface: '#FFFFFF',
  ink: '#1B1530',
  inkSoft: '#3E3756',
  muted: '#5D5675',
  border: '#D9D3F5',
  divider: '#EFEBFA',
  danger: '#9F1D24',
  dangerSoft: '#FDE4E6',
  success: '#15803D',
  warn: '#FFC145',
  warnSoft: '#FFF4D6',
  warnInk: '#5C3A06',
  white: '#FFFFFF',
};

export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
};

/** Folder colour palette. `key` is what's stored in folders.color. */
export const folderPalette: Record<string, { solid: string; soft: string; ink: string }> = {
  blue: { solid: '#2563EB', soft: '#E3ECFF', ink: '#1E4FC2' },
  orange: { solid: '#C2410C', soft: '#FFEBDD', ink: '#9A3412' },
  pink: { solid: '#DB2777', soft: '#FCE4EF', ink: '#9D174D' },
  green: { solid: '#15803D', soft: '#DDF5E5', ink: '#166534' },
  sky: { solid: '#0369A1', soft: '#E0F2FE', ink: '#075985' },
  violet: { solid: '#5B3DF5', soft: '#EAE5FF', ink: '#4326D9' },
};

export const folderColor = (key: string | null | undefined) =>
  folderPalette[key ?? ''] ?? folderPalette.violet;

export const radius = { sm: 12, md: 14, lg: 16, xl: 20 };

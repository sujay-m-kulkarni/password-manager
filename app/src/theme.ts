// Option G — "Dusk Soft Dark": soft charcoal ground, pale lavender accent, muted pastel folders.
// Text colours are chosen for at least 4.5:1 contrast on the surfaces they sit on.
export const colors = {
  primary: '#A99CF0', // accent: buttons, links, active tab
  onPrimary: '#1E1F2B', // text and icons on the accent
  primarySoft: '#33354A', // soft buttons, chips
  bg: '#1E1F2B', // screen background
  surface: '#272938', // cards, inputs, tab bar
  raised: '#33354A', // things on cards: segmented control thumb, switch track
  deep: '#16171F', // recessed panels: generated password, recovery code, toast
  ink: '#E9E8F2',
  inkSoft: '#C4C3D4',
  muted: '#A9A8BC',
  border: '#3A3C52',
  divider: '#33354A',
  danger: '#F2A5AA',
  dangerSoft: '#3D2529',
  success: '#A8D4B5',
  successSoft: '#26362C',
  warn: '#E8C79E',
  warnSoft: '#3A3125',
  warnInk: '#E8C79E',
  white: '#FFFFFF',
};

export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
};

/**
 * Folder colour palette. `key` is what's stored in folders.color.
 * `soft` is the tinted background (chips, avatars, favourite tiles, entry header),
 * `ink` the pastel text/icon colour on it, `solid` the pastel itself (swatches, active chip).
 */
export const folderPalette: Record<string, { solid: string; soft: string; ink: string }> = {
  blue: { solid: '#A9C0E8', soft: '#2A3348', ink: '#A9C0E8' },
  orange: { solid: '#EBB896', soft: '#3A2C24', ink: '#EBB896' },
  pink: { solid: '#E8B3CB', soft: '#3A2A35', ink: '#E8B3CB' },
  green: { solid: '#A8D4B5', soft: '#26362C', ink: '#A8D4B5' },
  sky: { solid: '#9FD0E6', soft: '#233540', ink: '#9FD0E6' },
  violet: { solid: '#C9C0F7', soft: '#33354A', ink: '#C9C0F7' },
  // Used for the PINs filter, not offered as a folder colour.
  amber: { solid: '#E8C79E', soft: '#3A3125', ink: '#E8C79E' },
};

/** Colours offered for folders, in display order. */
export const FOLDER_COLORS = ['blue', 'orange', 'pink', 'green', 'sky', 'violet'] as const;

export const folderColor = (key: string | null | undefined) =>
  folderPalette[key ?? ''] ?? folderPalette.violet;

/** Rounder than before: pill buttons and fields, soft cards. */
export const radius = { sm: 14, md: 18, lg: 28, xl: 24 };

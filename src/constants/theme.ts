import '@/global.css';

export const Palette = {
  banana: '#FFD43B',
  bananaDeep: '#F5B700',
  leaf: '#2F9E44',
  peel: '#7A4E2D',
  bruise: '#8E5BA8',
  ink: '#2B1D0E',
  cream: '#FFF8E1',
};

export const Colors = {
  light: {
    text: Palette.ink,
    textSecondary: '#7A6A55',
    background: Palette.cream,
    card: '#FFFFFF',
    border: '#F1E3B5',
    primary: Palette.banana,
    onPrimary: Palette.ink,
    accent: Palette.leaf,
    onAccent: '#FFFFFF',
    brown: Palette.peel,
    danger: '#E03131',
    backgroundElement: '#FFF1C2',
    backgroundSelected: '#FFE58A',
  },
  dark: {
    text: '#FFF4D6',
    textSecondary: '#BFAF8F',
    background: '#17110A',
    card: '#241A10',
    border: '#3A2B1A',
    primary: Palette.banana,
    onPrimary: Palette.ink,
    accent: '#51CF66',
    onAccent: '#10240F',
    brown: '#C08A5B',
    danger: '#FF6B6B',
    backgroundElement: '#2E2214',
    backgroundSelected: '#4A3820',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

export const Fonts = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
};

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const Radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;
export const MaxContentWidth = 560;

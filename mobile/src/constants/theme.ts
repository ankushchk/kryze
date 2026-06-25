/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#FAF7F2',
    surface: '#FFFFFF',
    surface2: '#F5F0E8',
    primary: '#C45E3A',
    primaryDim: '#FAE9E0',
    primaryText: '#FFFFFF',
    lent: '#4D9A6A',
    lentDim: '#EFF4EB',
    owe: '#D94F2C',
    oweDim: '#FDEAE6',
    text: '#3D1F10',
    text2: '#7A5540',
    text3: '#B08070',
    border: 'rgba(61,31,16,0.10)',
    inputBg: '#FAF7F2',
    // Preserved compatibility for existing components
    backgroundElement: '#F5F0E8',
    backgroundSelected: '#FAE9E0',
    textSecondary: '#7A5540',
  },
  dark: {
    background: '#141210',
    surface: '#1D1A14',
    surface2: '#231F18',
    primary: '#E8A020',
    primaryDim: '#2A2010',
    primaryText: '#1A1300',
    lent: '#48B87A',
    lentDim: '#0F2018',
    owe: '#E86050',
    oweDim: '#2A1210',
    text: '#F5EDD6',
    text2: '#C8B090',
    text3: '#7A6850',
    border: 'rgba(245,237,214,0.08)',
    inputBg: '#231F18',
    // Preserved compatibility
    backgroundElement: '#231F18',
    backgroundSelected: '#2A2010',
    textSecondary: '#C8B090',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Typography = {
  display: 'Fraunces_400Regular_Italic',
  displayDark: 'LibreBaskerville_400Regular',
  ui: 'Nunito_500Medium',
  uiBold: 'Nunito_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  mono: 'GeistMono_500Medium',
};

// Original Fonts export kept for backwards compatibility if needed
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

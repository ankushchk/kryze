/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Theme type extends color palette with a boolean indicating dark mode
export type Theme = typeof Colors.light & { isDark: boolean };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  const isDark = theme === 'dark';

  // Return the color palette along with the isDark flag
  return { ...Colors[theme], isDark } as const;
}

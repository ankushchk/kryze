import { StyleSheet, Text, type TextProps } from 'react-native';

import { Typography, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'display';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'display' && { ...styles.display, fontFamily: isDark ? Typography.displayDark : Typography.display },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: Typography.body,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: Typography.uiBold,
    fontSize: 48,
    lineHeight: 52,
  },
  subtitle: {
    fontFamily: Typography.uiBold,
    fontSize: 32,
    lineHeight: 44,
  },
  display: {
    fontSize: 32,
    lineHeight: 44,
  },
  link: {
    fontFamily: Typography.body,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: Typography.bodyMedium,
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Typography.mono,
    fontSize: 12,
  },
});

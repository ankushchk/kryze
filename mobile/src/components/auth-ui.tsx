import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, TextInputProps, TouchableOpacityProps } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';

export function AuthInput({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
      <Text style={[styles.inputLabel, { color: theme.text3 }]}>{label}</Text>
      <TextInput 
        style={[styles.inputValue, { color: theme.text }]} 
        placeholderTextColor={theme.text3}
        {...props} 
      />
    </View>
  );
}

export const PrimaryButton = React.forwardRef<View, TouchableOpacityProps & { title: string; loading?: boolean; iconRight?: React.ReactNode }>(({ title, loading, style, iconRight, ...props }, ref) => {
  const theme = useTheme();
  return (
    <TouchableOpacity 
      ref={ref}
      style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: props.disabled ? 0.7 : 1 }, style]} 
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>{title}</Text>
          {iconRight}
        </View>
      )}
    </TouchableOpacity>
  );
});

export function SocialButton({ title, icon, ...props }: TouchableOpacityProps & { title: string, icon: string }) {
  const theme = useTheme();
  return (
    <TouchableOpacity 
      style={[styles.socialButton, { backgroundColor: theme.surface, borderColor: theme.border }]} 
      activeOpacity={0.8}
      {...props}
    >
      <Text style={{ marginRight: 8, fontSize: 14 }}>{icon}</Text>
      <Text style={[styles.socialButtonText, { color: theme.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Divider({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.dividerContainer}>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
      <Text style={[styles.dividerText, { color: theme.text3 }]}>{text}</Text>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
    </View>
  );
}

export function PinDots() {
  const theme = useTheme();
  return (
    <View style={[styles.pinBlock, { backgroundColor: theme.primaryDim }]}>
      <Text style={[styles.pinTitle, { color: theme.primary }]}>Quick PIN login</Text>
      <View style={styles.dotsRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.dotFilled, { backgroundColor: theme.primary }]}>
            <Text style={styles.dotText}>●</Text>
          </View>
        ))}
        <View style={[styles.dotEmpty, { borderColor: theme.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  inputLabel: {
    fontFamily: Typography.body,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * 9,
    marginBottom: 2,
  },
  inputValue: {
    fontFamily: Typography.ui, 
    fontSize: 14,
    padding: 0,
    margin: 0,
  },
  primaryButton: {
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: {
    fontFamily: Typography.uiBold,
    fontSize: 13,
    letterSpacing: 0.01 * 13,
  },
  socialButton: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  socialButtonText: {
    fontFamily: Typography.bodyMedium,
    fontSize: 12,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: Typography.body,
    fontSize: 10,
    marginHorizontal: 10,
  },
  pinBlock: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  pinTitle: {
    fontFamily: Typography.uiBold,
    fontSize: 10,
    marginBottom: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dotFilled: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotEmpty: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  dotText: {
    fontFamily: Typography.mono,
    fontSize: 14,
    color: '#FFFFFF',
  }
});

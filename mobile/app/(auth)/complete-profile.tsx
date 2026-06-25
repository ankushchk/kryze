import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { AuthInput, PrimaryButton } from '@/components/auth-ui';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { ThemedView } from '@/components/themed-view';

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user already has an email, we don't need to ask for it again
  const showEmailInput = !user?.email;

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    const emailParam = showEmailInput && email.trim() ? email.trim() : undefined;
    const { error: updateError } = await updateProfile(name.trim(), emailParam);

    if (updateError) {
      setError(updateError.message || 'Failed to update profile details');
    } else {
      // Success is handled by state updates. Root layout will redirect user to main tabs /(tabs)
      router.replace('/(tabs)');
    }
    setLoading(false);
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.logoBlock}>
            <Text style={[styles.logo, { color: theme.primary }]}>Splikaro</Text>
            <Text style={[styles.welcomeText, { color: theme.text2 }]}>Almost there! Complete your profile 🚀</Text>
          </View>

          <View style={styles.contentBlock}>
            <View style={styles.formBlock}>
              <AuthInput 
                label="Full Name" 
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
                autoCapitalize="words"
              />

              {showEmailInput && (
                <AuthInput 
                  label="Email Address (Optional)" 
                  value={email}
                  onChangeText={setEmail}
                  placeholder="john@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            </View>

            <PrimaryButton 
              title="Continue to App" 
              onPress={handleSaveProfile} 
              loading={loading}
              iconRight={<ArrowRight size={18} color={theme.primaryText} strokeWidth={2.5} />}
              disabled={loading}
            />
          </View>

          {error && (
            <Text style={[styles.errorText, { color: theme.owe }]}>{error}</Text>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 100,
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontFamily: Typography.displayDark,
    fontStyle: 'italic',
    fontSize: 28,
    marginBottom: 4,
  },
  welcomeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    textAlign: 'center',
  },
  contentBlock: {
    width: '100%',
  },
  formBlock: {
    marginBottom: 20,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  }
});

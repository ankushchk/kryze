import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { AuthInput, PrimaryButton, SocialButton, Divider } from '@/components/auth-ui';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { ThemedView } from '@/components/themed-view';

export default function SignUpScreen() {
  const theme = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!email || !password || !name) {
      setError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
    } else {
      // Supabase automatically logs in if email confirmations are off.
      // If confirmed, the session will change and redirect.
      // We will also push to tabs just in case, but let the AuthProvider handle it normally.
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
            <Text style={[styles.tagline, { color: theme.text3 }]}>Your shared expense tracker</Text>
          </View>

          <View style={styles.socialBlock}>
            <SocialButton title="Continue with Google" icon="G" />
            <SocialButton title="Continue with Phone" icon="📱" />
          </View>

          <Divider text="or sign up with email" />

          <View style={styles.formBlock}>
            <AuthInput 
              label="Full Name" 
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <AuthInput 
              label="Email" 
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <AuthInput 
              label="Password" 
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <PrimaryButton 
            title="Create account" 
            onPress={handleSignUp} 
            loading={loading}
            disabled={loading}
          />

          {error && (
            <Text style={[styles.errorText, { color: theme.owe }]}>{error}</Text>
          )}

          <Text style={[styles.termsText, { color: theme.text3 }]}>
            By continuing you agree to our{' '}
            <Text style={{ color: theme.primary }}>Terms</Text> and{' '}
            <Text style={{ color: theme.primary }}>Privacy Policy</Text>
          </Text>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.text3 }]}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Text style={StyleSheet.flatten([styles.footerLink, { color: theme.primary }])}>Sign in</Text>
            </Link>
          </View>

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
    paddingTop: 120,
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
  tagline: {
    fontFamily: Typography.body,
    fontSize: 10,
  },
  socialBlock: {
    marginBottom: 10,
  },
  formBlock: {
    marginBottom: 20,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  termsText: {
    fontFamily: Typography.body,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  footerText: {
    fontFamily: Typography.body,
    fontSize: 14,
  },
  footerLink: {
    fontFamily: Typography.uiBold,
    fontSize: 14,
  }
});

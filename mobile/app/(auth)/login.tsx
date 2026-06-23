import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { AuthInput, PrimaryButton, SocialButton, Divider, PinDots } from '@/components/auth-ui';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '@/hooks/useAuth';
import { ThemedView } from '@/components/themed-view';

export default function LoginScreen() {
  const theme = useTheme();
  const { signInWithPassword, signInWithGoogle, isGoogleConfigured } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const { error: signInError } = await signInWithPassword(email, password);

    if (signInError) {
      setError(signInError.message);
    }
    // Success is handled by AuthProvider (redirects to tabs)
    
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured) {
      setError('Google Sign-In is not configured in this build environment (client IDs are missing).');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) {
        throw new Error('Google Sign-In did not return an ID token');
      }

      const { error: googleError } = await signInWithGoogle(idToken);
      if (googleError) {
        setError(googleError.message);
      }
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('User cancelled Google Sign-In');
      } else if (err.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In already in progress');
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services not available or outdated');
      } else {
        setError(err.message || 'An error occurred during Google Sign-In');
      }
    } finally {
      setLoading(false);
    }
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
            <Text style={[styles.welcomeText, { color: theme.text2 }]}>Welcome back 👋</Text>
          </View>

          <View style={styles.formBlock}>
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
            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <PrimaryButton 
            title="Sign in" 
            onPress={handleSignIn} 
            loading={loading}
            iconRight={<ArrowRight size={18} color={theme.primaryText} strokeWidth={2.5} />}
            disabled={loading}
          />

          {error && (
            <Text style={[styles.errorText, { color: theme.owe }]}>{error}</Text>
          )}

          <Divider text="or" />

          <SocialButton title="Continue with Google" icon="G" onPress={handleGoogleSignIn} />

          <PinDots />

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.text3 }]}>
              No account?{' '}
            </Text>
            <Link href="/(auth)/signup" asChild>
              <Text style={StyleSheet.flatten([styles.footerLink, { color: theme.primary }])}>Sign up free</Text>
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
  welcomeText: {
    fontFamily: Typography.body,
    fontSize: 11,
  },
  formBlock: {
    marginBottom: 20,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -10,
    marginBottom: 10,
    paddingVertical: 5,
  },
  forgotText: {
    fontFamily: Typography.bodyMedium,
    fontSize: 11,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
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

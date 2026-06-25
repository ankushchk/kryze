import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, ArrowLeft } from 'lucide-react-native';
import { AuthInput, PrimaryButton } from '@/components/auth-ui';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { ThemedView } from '@/components/themed-view';

export default function PhoneAuthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sendPhoneOTP, verifyPhoneOTP } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: sendError } = await sendPhoneOTP(phoneNumber.trim());

    if (sendError) {
      setError(sendError.message || 'Failed to send OTP code');
    } else {
      setStep('otp');
    }
    setLoading(false);
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: verifyError } = await verifyPhoneOTP(phoneNumber.trim(), otpCode.trim());

    if (verifyError) {
      setError(verifyError.message || 'Invalid or expired OTP code');
    } else {
      // Success is handled by AuthProvider (session state updates & app redirects to tabs)
      router.replace('/(tabs)');
    }
    setLoading(false);
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setOtpCode('');
    setError(null);
  };

  const handleBackToLogin = () => {
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Back button */}
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={step === 'otp' ? handleBackToPhone : handleBackToLogin}
          >
            <ArrowLeft size={20} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.logoBlock}>
            <Text style={[styles.logo, { color: theme.primary }]}>Splikaro</Text>
            <Text style={[styles.welcomeText, { color: theme.text2 }]}>
              {step === 'phone' ? 'Log in with phone number 📱' : 'Enter 6-digit code 🔑'}
            </Text>
          </View>

          {step === 'phone' ? (
            // STEP 1: Phone number entry
            <View style={styles.contentBlock}>
              <View style={styles.formBlock}>
                <AuthInput 
                  label="Phone Number" 
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder="+919876543210"
                  autoComplete="tel"
                />
              </View>

              <PrimaryButton 
                title="Send Code" 
                onPress={handleSendOTP} 
                loading={loading}
                iconRight={<ArrowRight size={18} color={theme.primaryText} strokeWidth={2.5} />}
                disabled={loading}
              />
            </View>
          ) : (
            // STEP 2: OTP verification code entry
            <View style={styles.contentBlock}>
              <Text style={[styles.infoText, { color: theme.text3 }]}>
                We sent a verification code to <Text style={{ color: theme.text, fontFamily: Typography.uiBold }}>{phoneNumber}</Text>
              </Text>

              <View style={styles.formBlock}>
                <AuthInput 
                  label="OTP Code" 
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  maxLength={6}
                />
              </View>

              <PrimaryButton 
                title="Verify & Log In" 
                onPress={handleVerifyOTP} 
                loading={loading}
                iconRight={<ArrowRight size={18} color={theme.primaryText} strokeWidth={2.5} />}
                disabled={loading}
              />

              <TouchableOpacity style={styles.resendButton} onPress={handleSendOTP} disabled={loading}>
                <Text style={[styles.resendText, { color: theme.primary }]}>Resend Code</Text>
              </TouchableOpacity>
            </View>
          )}

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
    paddingTop: 80,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 10,
    marginLeft: -10,
    marginBottom: 20,
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
  infoText: {
    fontFamily: Typography.body,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  formBlock: {
    marginBottom: 20,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 20,
    padding: 10,
  },
  resendText: {
    fontFamily: Typography.uiBold,
    fontSize: 13,
  }
});

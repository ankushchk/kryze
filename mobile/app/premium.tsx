import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Crown, CheckCircle2, FileText, BarChart3, Sparkles } from 'lucide-react-native';
import { apiRequest } from '@/lib/api';
import { redeemCoinsForPremium, fetchCoinBalance } from '@/lib/coins';
import { useTheme } from '@/hooks/use-theme';

export default function PremiumScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [loading, setLoading] = useState<boolean>(true);
  const [redeeming, setRedeeming] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [userCoins, setUserCoins] = useState<number>(0);

  const loadPremiumStatus = async () => {
    try {
      setLoading(true);
      const [subRes, coinsRes] = await Promise.all([
        apiRequest('/api/premium/status').catch(() => ({ status: 'INACTIVE' })),
        fetchCoinBalance().catch(() => ({ balance: 0 })),
      ]);
      setSubscription(subRes);
      setUserCoins(coinsRes.balance || 0);
    } catch (err: any) {
      console.error('Failed to load premium status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPremiumStatus();
  }, []);

  const handleRedeem = async () => {
    if (userCoins < 50) {
      Alert.alert('Insufficient Balance', `You need 50 coins to unlock Premium. Your balance is ${userCoins} coins.`);
      return;
    }

    Alert.alert(
      'Unlock Premium',
      'Redeem 50 coins for 1 month of Splitx Premium?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock Now',
          onPress: async () => {
            try {
              setRedeeming(true);
              const res = await redeemCoinsForPremium();
              Alert.alert('Unlocked! 👑', res.message || 'Welcome to Splitx Premium!');
              loadPremiumStatus();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not process redemption.');
            } finally {
              setRedeeming(false);
            }
          },
        },
      ]
    );
  };

  const isActive = subscription?.status === 'ACTIVE';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Splitx Premium</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Banner */}
          <View style={[styles.banner, { backgroundColor: isActive ? '#059669' : '#1E1B4B' }]}>
            <Crown size={44} color="#F59E0B" />
            <Text style={styles.bannerTitle}>
              {isActive ? 'Splitx Premium Active' : 'Upgrade to Splitx Premium'}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {isActive
                ? `Expires on ${new Date(subscription.expiresAt).toLocaleDateString()}`
                : 'Unlock multi-page OCR scans, WhatsApp receipt bot, & detailed analytics'}
            </Text>

            {!isActive && (
              <TouchableOpacity
                style={[styles.actionBtn, { opacity: redeeming ? 0.7 : 1 }]}
                onPress={handleRedeem}
                disabled={redeeming}
              >
                <Sparkles size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>
                  {redeeming ? 'Unlocking...' : `Redeem with Coins (50 Coins)`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Features List */}
          <Text style={[styles.sectionHeader, { color: theme.text }]}>Premium Perks & Features</Text>

          <View style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.featureIconContainer, { backgroundColor: '#EEF2FF' }]}>
              <FileText size={24} color="#4F46E5" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Multi-Page & Long Bill OCR</Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                Scan tall restaurant receipts and multi-page bills seamlessly without truncating items.
              </Text>
            </View>
          </View>

          <View style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.featureIconContainer, { backgroundColor: '#ECFDF5' }]}>
              <Sparkles size={24} color="#059669" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>2x Coin Multiplier</Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                Earn double coins on all settled group balances as an active Premium subscriber.
              </Text>
            </View>
          </View>

          <View style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.featureIconContainer, { backgroundColor: '#FEF3C7' }]}>
              <BarChart3 size={24} color="#D97706" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Detailed Analytics</Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                In-depth spending trends, category breakdowns, and individual group debt insights.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
  },
  banner: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 10,
  },
  bannerSubtitle: {
    color: '#E0E7FF',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  actionBtn: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  featureCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
});

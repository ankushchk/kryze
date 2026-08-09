import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Coins as CoinsIcon, Award, ArrowUpRight, ArrowDownLeft, Sparkles } from 'lucide-react-native';
import { fetchCoinBalance, fetchCoinHistory, redeemCoinsForPremium, CoinLedgerItem } from '@/lib/coins';
import { useTheme } from '@/hooks/use-theme';

export default function CoinsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [balance, setBalance] = useState<number>(0);
  const [history, setHistory] = useState<CoinLedgerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [redeeming, setRedeeming] = useState<boolean>(false);

  const loadCoinsData = async () => {
    try {
      setLoading(true);
      const [balRes, histRes] = await Promise.all([
        fetchCoinBalance(),
        fetchCoinHistory(),
      ]);
      setBalance(balRes.balance || 0);
      setHistory(histRes.history || []);
    } catch (err: any) {
      console.error('Failed to load coins data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoinsData();
  }, []);

  const handleRedeem = async () => {
    if (balance < 50) {
      Alert.alert('Insufficient Balance', `You need 50 coins to redeem 1 month of Premium (Current balance: ${balance} coins).`);
      return;
    }

    Alert.alert(
      'Redeem Coins',
      'Use 50 coins to unlock 1 month of Splitx Premium?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem Now',
          onPress: async () => {
            try {
              setRedeeming(true);
              const res = await redeemCoinsForPremium();
              Alert.alert('Success 🎉', res.message || 'Premium unlocked!');
              loadCoinsData();
            } catch (err: any) {
              Alert.alert('Redemption Failed', err.message || 'Could not redeem coins.');
            } finally {
              setRedeeming(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Splitx Coins</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e6a23c" />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={
            <View>
              {/* Balance Card */}
              <View style={[styles.balanceCard, { backgroundColor: '#1E293B' }]}>
                <View style={styles.coinBadgeIcon}>
                  <CoinsIcon size={32} color="#F59E0B" />
                </View>
                <Text style={styles.balanceLabel}>YOUR COIN BALANCE</Text>
                <Text style={styles.balanceValue}>{balance} <Text style={styles.balanceUnit}>Coins</Text></Text>
                <Text style={styles.earnInfo}>Earn 1 coin for every ₹100 settled in Splitx</Text>

                <TouchableOpacity
                  style={[styles.redeemButton, { opacity: redeeming ? 0.7 : 1 }]}
                  onPress={handleRedeem}
                  disabled={redeeming}
                >
                  <Sparkles size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.redeemButtonText}>
                    {redeeming ? 'Redeeming...' : 'Redeem 50 Coins for Premium'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { color: theme.text }]}>Coin Activity History</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Award size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No coin activity yet. Settle up bills to earn coins!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isEarned = item.amount > 0;
            return (
              <View style={[styles.historyRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.historyIcon, { backgroundColor: isEarned ? '#DEF7EC' : '#FDE8E8' }]}>
                  {isEarned ? (
                    <ArrowDownLeft size={20} color="#0E9F6E" />
                  ) : (
                    <ArrowUpRight size={20} color="#F05252" />
                  )}
                </View>
                <View style={styles.historyDetails}>
                  <Text style={[styles.historyReason, { color: theme.text }]}>
                    {item.reason === 'SETTLEMENT' ? 'Settlement Reward' : item.reason === 'REDEEMED_PREMIUM' ? 'Redeemed for Premium' : item.reason}
                  </Text>
                  <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <Text style={[styles.historyAmount, { color: isEarned ? '#10B981' : '#EF4444' }]}>
                  {isEarned ? `+${item.amount}` : item.amount}
                </Text>
              </View>
            );
          }}
        />
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
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  coinBadgeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
  },
  balanceUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F59E0B',
  },
  earnInfo: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 20,
  },
  redeemButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  redeemButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  historyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyDetails: {
    flex: 1,
  },
  historyReason: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyDate: {
    fontSize: 12,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
});

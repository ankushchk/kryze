import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Share,
  Linking
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import * as Contacts from 'expo-contacts/legacy';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  DollarSign,
  Plus,
  User,
  Users,
  Check,
  X,
  CreditCard,
  UserPlus,
  Search,
  Share2,
  Utensils,
  Car,
  Home,
  Film,
  ShoppingBag,
  Package,
  Settings,
  Plane
} from 'lucide-react-native';

const getGroupIconComponent = (category: string | undefined | null) => {
  switch (category?.toLowerCase()) {
    case 'travel': return Plane;
    case 'home': return Home;
    case 'food': return Utensils;
    case 'shopping': return ShoppingBag;
    default: return Users;
  }
};
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { Typography, Spacing } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

type Member = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  upiId?: string | null;
  role: string;
  netBalance: number;
};

type ExpenseSplit = {
  id: string;
  amount: number;
  userId: string;
  user: {
    id: string;
    name: string;
  };
};

type GroupExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string | null;
  status?: string;
  paidById: string;
  paidBy: {
    id: string;
    name: string;
  };
  splits: ExpenseSplit[];
};

type SimplifiedDebt = {
  from: string;
  fromName: string;
  fromPhone?: string | null;
  to: string;
  toName: string;
  toPhone?: string | null;
  toUpiId?: string | null;
  amount: number;
};

type GroupDetails = {
  id: string;
  name: string;
  description: string | null;
  icon?: string;
};

const getCategoryIconAndColor = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes('food') || desc.includes('dinner') || desc.includes('lunch') || desc.includes('restaurant') || desc.includes('swiggy') || desc.includes('zomato') || desc.includes('cafe')) {
    return { icon: Utensils, label: 'Food & Drinks', color: '#FF9500' };
  }
  if (desc.includes('fuel') || desc.includes('uber') || desc.includes('ola') || desc.includes('cab') || desc.includes('transport') || desc.includes('travel') || desc.includes('flight') || desc.includes('train')) {
    return { icon: Car, label: 'Travel & Cab', color: '#5AC8FA' };
  }
  if (desc.includes('stay') || desc.includes('hotel') || desc.includes('room') || desc.includes('airbnb') || desc.includes('rent')) {
    return { icon: Home, label: 'Stay & Rent', color: '#5856D6' };
  }
  if (desc.includes('movie') || desc.includes('show') || desc.includes('netflix') || desc.includes('ticket') || desc.includes('game') || desc.includes('bar') || desc.includes('pub')) {
    return { icon: Film, label: 'Entertainment', color: '#FF2D55' };
  }
  if (desc.includes('shop') || desc.includes('grocer') || desc.includes('zepto') || desc.includes('blinkit') || desc.includes('clothes') || desc.includes('mall')) {
    return { icon: ShoppingBag, label: 'Shopping', color: '#4CD964' };
  }
  return { icon: Package, label: 'Others', color: '#8E8E93' };
};

export default function GroupDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams() as { id: string };
  const { user: currentUser, session } = useAuth();

  // Screen Data States
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [debts, setDebts] = useState<SimplifiedDebt[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<'EXPENSES' | 'BALANCES'>('EXPENSES');

  // Add Expense Modal States
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Food');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitEqually, setSplitEqually] = useState(true);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({}); // userId -> amount
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [monthFilter, setMonthFilter] = useState('All');

  // Add Member Modal States
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [memberIdentifier, setMemberIdentifier] = useState('');
  const [submittingMember, setSubmittingMember] = useState(false);
  const [reSplitPast, setReSplitPast] = useState(false);
  
  // Real-time search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Settle Modal States
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<SimplifiedDebt | null>(null);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [inputUpi, setInputUpi] = useState('');
  const [submittingUpi, setSubmittingUpi] = useState(false);
  const [localContacts, setLocalContacts] = useState<any[]>([]);
  const [filteredLocalContacts, setFilteredLocalContacts] = useState<any[]>([]);



  const fetchGroupDetails = async (showIndicator = true) => {
    if (!session || !groupId) return;
    if (showIndicator) setLoading(true);

    try {
      const response = await apiRequest(`/api/groups/${groupId}`);
      if (response) {
        setGroup(response.group);
        setMembers(response.members);
        setExpenses(response.expenses);
        setDebts(response.simplifiedDebts);
        
        // Default paidById to current user if not set
        if (currentUser && !paidById) {
          setPaidById(currentUser.id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching group details:', err);
      Alert.alert('Error', err.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId, session]);

  const loadLocalContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        });
        setLocalContacts(data || []);
      }
    } catch (err) {
      console.warn('Failed to load local contacts:', err);
    }
  };

  useEffect(() => {
    if (memberModalVisible) {
      loadLocalContacts();
      setReSplitPast(false);
      setSearchQuery('');
    }
  }, [memberModalVisible]);

  const handleSearchUsers = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredLocalContacts([]);
      return;
    }

    // Filter local device contacts
    const query = text.toLowerCase();
    const matches = localContacts.filter(c => {
      const nameMatch = c.name?.toLowerCase().includes(query);
      const phoneMatch = c.phoneNumbers?.some((p: any) => p.number?.includes(query));
      const emailMatch = c.emails?.some((e: any) => e.email?.toLowerCase().includes(query));
      return nameMatch || phoneMatch || emailMatch;
    });
    setFilteredLocalContacts(matches.slice(0, 10));
  };

  // Handle Add Member
  const handleAddMember = async (customIdentifier?: string) => {
    const ident = customIdentifier || memberIdentifier;
    if (!ident.trim()) {
      Alert.alert('Required', 'Please enter email or phone number');
      return;
    }
    executeAddMember(ident, reSplitPast);
  };

  const executeAddMember = async (ident: string, reSplitPastExpenses: boolean) => {
    setSubmittingMember(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: { 
          identifier: ident.trim(),
          reSplitPastExpenses
        },
      });

      if (response && response.member) {
        setMemberModalVisible(false);
        setMemberIdentifier('');
        setSearchQuery('');
        fetchGroupDetails(false);

        if (response.inviteLink) {
          Alert.alert(
            'Invited!',
            `${response.member.name} has been added. Send invitation details via your favorite sharing app?`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Send Invite Link',
                onPress: () => {
                  Share.share({
                    message: `Hey! Join my group "${group?.name || 'Kryze'}" on Splikaro to split expenses: ${response.inviteLink}`,
                  });
                },
              },
            ]
          );
        } else {
          Alert.alert('Added', `${response.member.name} has been added to the group!`);
        }
      }
    } catch (err: any) {
      Alert.alert('Failed to Add Member', err.message || 'Check identifier');
    } finally {
      setSubmittingMember(false);
    }
  };

  // Handle Add Expense
  const handleAddExpense = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please enter a description');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Required', 'Please enter a valid amount');
      return;
    }

    setSubmittingExpense(true);
    try {
      let splits: Array<{ userId: string; amount: number }> = [];

      if (splitEqually) {
        // Equal split math
        const count = members.length;
        const equalShare = Math.round((parsedAmount / count) * 100) / 100;
        
        // To handle floating point remainders, make the last person pay the difference
        let sum = 0;
        members.forEach((m, idx) => {
          const share = idx === count - 1 ? parsedAmount - sum : equalShare;
          sum += share;
          splits.push({ userId: m.id, amount: Math.round(share * 100) / 100 });
        });
      } else {
        // Custom split mapping
        let sum = 0;
        members.forEach((m) => {
          const shareStr = customSplits[m.id] || '0';
          const share = parseFloat(shareStr) || 0;
          sum += share;
          splits.push({ userId: m.id, amount: share });
        });

        const diff = Math.abs(sum - parsedAmount);
        if (diff > 0.05) {
          Alert.alert(
            'Sum Mismatch',
            `The sum of custom splits (₹${sum}) must equal the total amount (₹${parsedAmount})`
          );
          setSubmittingExpense(false);
          return;
        }
      }

      const response = await apiRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        body: {
          description: description.trim(),
          amount: parsedAmount,
          paidById,
          splits,
          category: expenseCategory,
          date: expenseDate,
        },
      });

      if (response && response.expense) {
        setExpenseModalVisible(false);
        setDescription('');
        setAmount('');
        setCustomSplits({});
        setExpenseCategory('Food');
        setExpenseDate(new Date().toISOString().split('T')[0]);
        fetchGroupDetails(false);
        Alert.alert('Logged', 'Expense logged successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error Logging Expense', err.message || 'Verification failure');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleSendReminder = async (debt: SimplifiedDebt) => {
    try {
      const message = `Hi ${debt.fromName}! Just a friendly reminder that you owe ₹${debt.amount} to ${debt.toName} in our Split Group "${group?.name || 'Splikaro'}". You can settle this directly in the app!`;
      await Share.share({ message });
    } catch (err: any) {
      console.error('Failed to send reminder:', err);
    }
  };

  // Handle UPI Deep Linking
  const handleUPIPayment = async (overrideUpi?: string) => {
    if (!selectedDebt) return;
    const payeeMember = members.find((m) => m.id === selectedDebt.to);
    const payeeUpi = overrideUpi || payeeMember?.upiId;
    if (!payeeUpi) {
      Alert.alert('UPI ID Missing', `Ask ${selectedDebt.toName} to enter their UPI ID in settings to pay instantly.`);
      return;
    }
    const upiUrl = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(selectedDebt.toName)}&am=${selectedDebt.amount}&cu=INR&tn=${encodeURIComponent(`Settlement in ${group?.name || 'Group'}`)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(upiUrl);
      if (canOpen) {
        await Linking.openURL(upiUrl);
        // Automatically prompt to record settlement since user opened payment app
        Alert.alert(
          'Payment Initiated',
          'Did you complete the payment inside your UPI app? Select Confirm to record the split settlement.',
          [
            { text: 'No, Cancel', style: 'cancel' },
            { text: 'Yes, Confirm', onPress: () => handleSettleUp('PENDING_VERIFICATION') }
          ]
        );
      } else {
        Alert.alert(
          'UPI Apps Not Found',
          'No UPI payment apps (like GPay, PhonePe, Paytm) are installed or registered to open this link. Would you like to record a manual payment anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Manually', onPress: () => handleSettleUp('APPROVED') }
          ]
        );
      }
    } catch (err) {
      console.warn('Failed to launch UPI link:', err);
      // Fallback
      Alert.alert(
        'UPI Error',
        'Could not redirect to UPI app. Record manual settlement?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Manually', onPress: () => handleSettleUp('APPROVED') }
        ]
      );
    }
  };

  const handleSaveUpiAndPay = async () => {
    if (!selectedDebt || !inputUpi.trim()) {
      Alert.alert('Error', 'Please enter a valid UPI ID');
      return;
    }

    setSubmittingUpi(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}/members/${selectedDebt.to}/upi`, {
        method: 'PATCH',
        body: { upiId: inputUpi.trim() }
      });
      
      if (response) {
        setInputUpi('');
        fetchGroupDetails(false);
        handleUPIPayment(inputUpi.trim());
      }
    } catch (err: any) {
      Alert.alert('Failed to Save UPI ID', err.message || 'Could not update database record');
    } finally {
      setSubmittingUpi(false);
    }
  };

  const handleSettleUp = async (status = 'APPROVED') => {
    if (!selectedDebt) return;

    setSubmittingSettle(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        body: {
          description: `Settlement: ${selectedDebt.fromName} to ${selectedDebt.toName}`,
          amount: selectedDebt.amount,
          paidById: selectedDebt.from, // Debtor pays
          splits: [
            { userId: selectedDebt.to, amount: selectedDebt.amount } // Creditor receives
          ],
          status
        },
      });

      if (response && response.expense) {
        setSettleModalVisible(false);
        setSelectedDebt(null);
        fetchGroupDetails(false);
        Alert.alert('Settled', 'Settlement recorded successfully!');
      }
    } catch (err: any) {
      Alert.alert('Settle Failed', err.message || 'Verification failure');
    } finally {
      setSubmittingSettle(false);
    }
  };

  const handleVerifyReceipt = async (expenseId: string) => {
    try {
      const response = await apiRequest(`/api/groups/${groupId}/expenses/${expenseId}/verify`, {
        method: 'PATCH',
      });
      if (response && response.expense) {
        fetchGroupDetails(false);
        Alert.alert('Verified', 'Settlement verified successfully!');
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Could not verify payment');
    }
  };

  if (loading && !group) {
    return (
      <ThemedView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  // Spend stats calculations
  const totalGroupSpend = expenses.reduce((sum, exp) => sum + (exp.description.startsWith('Settlement:') ? 0 : exp.amount), 0);
  const myTotalPaid = expenses.reduce((sum, exp) => sum + (exp.paidById === currentUser?.id ? exp.amount : 0), 0);

  // Category breakdown calculations
  const categoryTotals: Record<string, { amount: number; color: string; icon: any }> = {};
  expenses.forEach((exp) => {
    if (exp.description.startsWith('Settlement:')) return;
    const cat = getCategoryIconAndColor(exp.description);
    if (!categoryTotals[cat.label]) {
      categoryTotals[cat.label] = { amount: 0, color: cat.color, icon: cat.icon };
    }
    categoryTotals[cat.label].amount += exp.amount;
  });

  return (
    <ThemedView style={styles.container}>
      {/* Top Navigation */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <View style={[styles.headerIconCircle, { backgroundColor: theme.surface2, marginRight: 8 }]}>
            {(() => {
              const IconComp = getGroupIconComponent(group?.icon);
              return <IconComp size={16} color={theme.primary} />;
            })()}
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.groupTitle} numberOfLines={1}>{group?.name}</ThemedText>
            {group?.description && (
              <ThemedText style={[styles.groupSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {group.description}
              </ThemedText>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.surface2, marginRight: 8 }]}
            onPress={() => setMemberModalVisible(true)}
          >
            <UserPlus size={18} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.surface2 }]}
            onPress={() => {
              router.push({
                pathname: '/group-settings',
                params: { id: groupId }
              });
            }}
          >
            <Settings size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs Menu */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'EXPENSES' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('EXPENSES')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'EXPENSES' ? theme.primary : theme.text3 }]}>
            Expenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'BALANCES' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('BALANCES')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'BALANCES' ? theme.primary : theme.text3 }]}>
            Balances & Debts
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month Filter Chips */}
      {activeTab === 'EXPENSES' && expenses.length > 0 && (
        <View style={{ marginBottom: 12, marginTop: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {(() => {
              const months = new Set<string>();
              expenses.forEach(e => {
                const date = new Date(e.date);
                const name = date.toLocaleDateString('en-US', { month: 'short' });
                months.add(name);
              });
              const items = ['All', ...Array.from(months)];
              return items.map((month) => {
                const isSelected = monthFilter === month;
                return (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.filterChip,
                      { borderColor: theme.border, backgroundColor: theme.surface },
                      isSelected && { backgroundColor: theme.primary, borderColor: theme.primary }
                    ]}
                    onPress={() => setMonthFilter(month)}
                  >
                    <Text style={[styles.filterChipText, { color: isSelected ? '#FFF' : theme.textSecondary }]}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                );
              });
            })()}
          </ScrollView>
        </View>
      )}

      {activeTab === 'EXPENSES' ? (
        /* Tab 1: Expenses Timeline */
        <FlatList
          data={expenses.filter(e => {
            if (monthFilter === 'All') return true;
            const monthName = new Date(e.date).toLocaleDateString('en-US', { month: 'short' });
            return monthName === monthFilter;
          })}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            expenses.length > 0 ? (
              <View style={[styles.spendSummaryCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.summaryCardTitle, { color: theme.textSecondary }]}>
                  Spend Analysis
                </Text>
                
                {/* Spend stats row */}
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      ₹{totalGroupSpend.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.text3 }]}>Total Spend</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={[styles.statValue, { color: theme.lent }]}>
                      ₹{myTotalPaid.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.text3 }]}>Paid By You</Text>
                  </View>
                </View>

                {/* Progress bar breakdown */}
                <View style={styles.categoriesBreakdown}>
                  {Object.entries(categoryTotals).map(([label, cat]) => {
                    const pct = totalGroupSpend > 0 ? (cat.amount / totalGroupSpend) * 100 : 0;
                    const IconComponent = cat.icon as any;
                    return (
                      <View key={label} style={styles.categoryProgressRow}>
                        <View style={styles.categoryLabelRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <IconComponent size={14} color={cat.color} style={{ marginRight: 6 }} />
                            <Text style={[styles.categoryName, { color: theme.text }]}>
                              {label}
                            </Text>
                          </View>
                          <Text style={[styles.categoryAmt, { color: theme.textSecondary }]}>
                            ₹{cat.amount.toLocaleString('en-IN')} ({Math.round(pct)}%)
                          </Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: theme.surface2 }]}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { backgroundColor: cat.color, width: `${pct}%` },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: exp }) => {
            const isSettlement = exp.description.startsWith('Settlement:');
            const getCategoryIconComponent = (cat: string | null | undefined) => {
              switch (cat?.toLowerCase()) {
                case 'food': return Utensils;
                case 'stay': return Home;
                case 'travel': return Plane;
                case 'shopping': return ShoppingBag;
                default: return Package;
              }
            };

            return (
              <View style={[styles.expenseCard, { backgroundColor: theme.surface }]}>
                <View style={styles.expHeader}>
                  <View style={[styles.expAvatar, { backgroundColor: theme.surface2, justifyContent: 'center', alignItems: 'center' }]}>
                    {isSettlement ? (
                      <Users size={16} color={theme.primary} />
                    ) : (() => {
                      const IconComp = getCategoryIconComponent(exp.category);
                      return <IconComp size={16} color={theme.primary} />;
                    })()}
                  </View>
                  <View style={styles.expMeta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.expDesc, { color: theme.text }]}>{exp.description}</Text>
                      {exp.status === 'PENDING_VERIFICATION' && (
                        <View style={{
                          backgroundColor: theme.oweDim,
                          borderColor: theme.owe,
                          borderWidth: 1,
                          borderRadius: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          marginLeft: 8,
                          marginBottom: 2
                        }}>
                          <Text style={{ fontSize: 9, color: theme.owe, fontFamily: Typography.uiBold }}>PENDING</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.expPaidBy, { color: theme.textSecondary }]}>
                      {exp.paidById === currentUser?.id ? 'You' : exp.paidBy.name} paid ₹{exp.amount.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.expDate, { color: theme.text3 }]}>
                      {new Date(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </Text>

                    {/* Overlapping avatar circles of split partners */}
                    {!isSettlement && exp.splits && exp.splits.length > 0 && (
                      <View style={styles.overlappingAvatarsContainer}>
                        {exp.splits.slice(0, 4).map((s: any, idx: number) => (
                          <View
                            key={s.userId}
                            style={[
                              styles.overlapAvatar,
                              {
                                left: idx * 14,
                                backgroundColor: theme.surface2,
                                borderColor: theme.surface,
                                zIndex: 10 - idx
                              }
                            ]}
                          >
                            <Text style={{ fontSize: 7, fontWeight: 'bold', color: theme.textSecondary }}>
                              {(s.user?.name || 'U').substring(0, 2).toUpperCase()}
                            </Text>
                          </View>
                        ))}
                        {exp.splits.length > 4 && (
                          <View
                            style={[
                              styles.overlapAvatar,
                              {
                                left: 4 * 14,
                                backgroundColor: theme.border,
                                borderColor: theme.surface,
                                zIndex: 5
                              }
                            ]}
                          >
                            <Text style={{ fontSize: 7, color: theme.textSecondary }}>
                              +{exp.splits.length - 4}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                  <View style={styles.expDetails}>
                    {/* Share statement */}
                    {(() => {
                      const mySplit = exp.splits?.find((s: any) => s.userId === currentUser?.id);
                      if (exp.paidById === currentUser?.id) {
                        // User paid the bill
                        const otherSplitsSum = exp.amount - (mySplit?.amount || 0);
                        return (
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={[styles.shareBadge, { backgroundColor: theme.lentDim }]}>
                              <Text style={[styles.shareBadgeText, { color: theme.lent }]}>YOU LENT</Text>
                            </View>
                            <Text style={[styles.shareValue, { color: theme.lent }]}>
                              ₹{otherSplitsSum.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        );
                      } else {
                        // Someone else paid, did you split?
                        if (mySplit) {
                          return (
                            <View style={{ alignItems: 'flex-end' }}>
                              <View style={[styles.shareBadge, { backgroundColor: theme.oweDim }]}>
                                <Text style={[styles.shareBadgeText, { color: theme.owe }]}>YOU BORROWED</Text>
                              </View>
                              <Text style={[styles.shareValue, { color: theme.owe }]}>
                                ₹{mySplit.amount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                          );
                        } else {
                          return (
                            <View style={[styles.shareBadge, { backgroundColor: theme.surface2 }]}>
                              <Text style={[styles.shareBadgeText, { color: theme.textSecondary }]}>NO SHARE</Text>
                            </View>
                          );
                        }
                      }
                    })()}
                  </View>
                </View>
                {/* Pending Verification Row */}
                {exp.status === 'PENDING_VERIFICATION' && (
                  <View style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, fontStyle: 'italic' }}>
                      {exp.paidById === currentUser?.id ? 'Waiting for approval' : 'Waiting for your verification'}
                    </Text>
                    {isSettlement && exp.splits?.some((s: any) => s.userId === currentUser?.id) && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: theme.primary,
                          borderRadius: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                        onPress={() => handleVerifyReceipt(exp.id)}
                      >
                        <Text style={{ color: '#FFF', fontSize: 11, fontFamily: Typography.uiBold }}>Confirm Receipt</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <CreditCard size={48} color={theme.text3} style={{ marginBottom: 12 }} />
              <ThemedText style={styles.emptyTitle}>No expenses logged yet</ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Add bills, grocery logs, or stay receipts split with group mates.
              </ThemedText>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                onPress={() => setExpenseModalVisible(true)}
              >
                <Text style={styles.emptyAddBtnText}>Add your first expense</Text>
              </TouchableOpacity>
            </View>
          }
        />
      ) : (
        /* Tab 2: Balances & Simplified Debts */
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* Members Balances List */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Members Status</Text>
          <View style={[styles.sectionBox, { backgroundColor: theme.surface }]}>
            {(() => {
              const maxBal = Math.max(...members.map((m) => Math.abs(m.netBalance)), 1);
              return members.map((m) => {
                const isOwed = m.netBalance > 0;
                const isOwe = m.netBalance < 0;
                const ratio = Math.abs(m.netBalance) / maxBal;
                const barWidth = `${Math.min(ratio * 45, 45)}%`;

                return (
                  <View key={m.id} style={[styles.memberRowVisual, { borderBottomColor: theme.border }]}>
                    <View style={styles.memberMetaRow}>
                      <View style={[styles.memberAvatarCircle2, { backgroundColor: theme.surface2 }]}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: theme.textSecondary }}>
                          {(m.name || 'U').substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.memberNameText, { color: theme.text }]} numberOfLines={1}>
                        {m.id === currentUser?.id ? 'You' : m.name}
                      </Text>
                    </View>

                    {/* Proportional Balance Bar Chart */}
                    <View style={styles.balanceChartWrapper}>
                      <View style={[styles.balanceBarTrack, { backgroundColor: theme.border }]}>
                        {/* Red bar extending left (owes) */}
                        {isOwe && (
                          <View
                            style={[
                              styles.balanceBarFillOwe,
                              { backgroundColor: theme.owe, width: barWidth as any, right: '50%' }
                            ]}
                          />
                        )}
                        {/* Center anchor line */}
                        <View style={[styles.balanceBarCenterAnchor, { backgroundColor: theme.text3 }]} />
                        
                        {/* Green bar extending right (owed) */}
                        {isOwed && (
                          <View
                            style={[
                              styles.balanceBarFillOwed,
                              { backgroundColor: theme.lent, width: barWidth as any, left: '50%' }
                            ]}
                          />
                        )}
                      </View>
                    </View>

                    <View style={styles.memberBalValueBox}>
                      {isOwed && (
                        <Text style={[styles.memberBalVal, { color: theme.lent }]}>
                          +₹{m.netBalance.toLocaleString('en-IN')}
                        </Text>
                      )}
                      {isOwe && (
                        <Text style={[styles.memberBalVal, { color: theme.owe }]}>
                          -₹{Math.abs(m.netBalance).toLocaleString('en-IN')}
                        </Text>
                      )}
                      {!isOwed && !isOwe && (
                        <Text style={[styles.memberBalValSettled2, { color: theme.text3 }]}>
                          settled
                        </Text>
                      )}
                    </View>
                  </View>
                );
              });
            })()}
          </View>

          {/* Simplified Debt Settlements */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 24 }]}>
            Simplified Debt Settlements
          </Text>
          {debts.length === 0 ? (
            <View style={[styles.settledRowCard, { backgroundColor: theme.surface }]}>
              <Check size={20} color={theme.lent} />
              <Text style={[styles.settledRowText, { color: theme.textSecondary }]}>
                Everyone is fully settled in this group!
              </Text>
            </View>
          ) : (
            <View style={[styles.sectionBox, { backgroundColor: theme.surface }]}>
              {debts.map((d, index) => {
                const canISettle = d.from === currentUser?.id;
                const canIRemind = d.to === currentUser?.id || d.from !== currentUser?.id;
                return (
                  <View key={index} style={[styles.debtRow, { borderBottomColor: theme.border }]}>
                    {/* Visual initials flow avatars: Debtor -> Creditor */}
                    <View style={styles.debtVisualFlow}>
                      <View style={[styles.avatarCircleSmall, { backgroundColor: theme.oweDim }]}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: theme.owe }}>
                          {d.fromName.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <ArrowRight size={10} color={theme.text3} style={{ marginHorizontal: 4 }} />
                      <View style={[styles.avatarCircleSmall, { backgroundColor: theme.lentDim }]}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: theme.lent }}>
                          {d.toName.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.debtInstruction, { color: theme.text }]} numberOfLines={1}>
                        <Text style={{ fontFamily: Typography.uiBold }}>
                          {d.from === currentUser?.id ? 'You' : d.fromName}
                        </Text>{' '}
                        owe{' '}
                        <Text style={{ fontFamily: Typography.uiBold }}>
                          {d.to === currentUser?.id ? 'You' : d.toName}
                        </Text>
                      </Text>
                      <Text style={[styles.debtAmount, { color: theme.owe }]}>
                        ₹{d.amount.toLocaleString('en-IN')}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {canISettle && (
                        <TouchableOpacity
                          style={[styles.settleBtn, { backgroundColor: theme.primary, marginRight: 6 }]}
                          onPress={() => {
                            setSelectedDebt(d);
                            setSettleModalVisible(true);
                          }}
                        >
                          <Text style={styles.settleBtnText}>Settle</Text>
                        </TouchableOpacity>
                      )}

                      {canIRemind && (
                        <TouchableOpacity
                          style={[styles.settleBtn, { backgroundColor: theme.surface2 }]}
                          onPress={() => handleSendReminder(d)}
                        >
                          <Text style={[styles.settleBtnText, { color: theme.textSecondary }]}>Remind</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating Bottom Add Expense Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.floatingActionBtn, { backgroundColor: theme.primary }]}
          onPress={() => setExpenseModalVisible(true)}
        >
          <Plus size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.floatingActionText}>Add Group Expense</Text>
        </TouchableOpacity>
      </View>

      {/* Add Expense Modal */}
      <Modal
        visible={expenseModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setExpenseModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <ThemedView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Add Expense Split
                </ThemedText>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setExpenseModalVisible(false)}
                >
                  <X size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Horizontal Member list / Add Friends trigger */}
                <View style={styles.addFriendsHeaderRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addFriendsScroll}>
                    {/* [+] Add Friends Button */}
                    <TouchableOpacity
                      style={styles.addFriendAvatarBtn}
                      onPress={() => {
                        setExpenseModalVisible(false);
                        setTimeout(() => {
                          setMemberModalVisible(true);
                        }, 300);
                      }}
                    >
                      <View style={[styles.avatarPlusCircle, { backgroundColor: theme.surface2 }]}>
                        <Plus size={20} color={theme.primary} />
                      </View>
                      <Text style={[styles.avatarLabel, { color: theme.textSecondary }]}>Add Friends</Text>
                    </TouchableOpacity>

                    {/* Member Avatars */}
                    {members.map((m) => (
                      <View key={m.id} style={styles.memberAvatarCol}>
                        <View style={[styles.memberAvatarCircle, { backgroundColor: theme.primaryDim }]}>
                          <Text style={[styles.memberAvatarInitials, { color: theme.primary }]}>
                            {(m.name || 'U').substring(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.avatarLabel, { color: theme.text }]} numberOfLines={1}>
                          {m.id === currentUser?.id ? 'You' : m.name}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Description</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Fuel, Dinner"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Amount (INR)</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholder="e.g. 1500"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Category</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                    {[
                      { id: 'Food', icon: Utensils, label: 'Food' },
                      { id: 'Stay', icon: Home, label: 'Stay' },
                      { id: 'Travel', icon: Plane, label: 'Travel' },
                      { id: 'Shopping', icon: ShoppingBag, label: 'Shop' },
                      { id: 'Other', icon: Package, label: 'Other' },
                    ].map((item) => {
                      const IconComponent = item.icon;
                      const isSelected = expenseCategory === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.categoryChoiceBtn,
                            { borderColor: theme.border, backgroundColor: theme.surface2 },
                            isSelected && { borderColor: theme.primary, backgroundColor: theme.primaryDim }
                          ]}
                          onPress={() => setExpenseCategory(item.id)}
                        >
                          <IconComponent size={20} color={isSelected ? theme.primary : theme.textSecondary} />
                          <Text style={{ fontSize: 9, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={expenseDate}
                    onChangeText={(val) => {
                      let cleaned = val.replace(/[^0-9]/g, '');
                      if (cleaned.length > 4) {
                        cleaned = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
                      }
                      if (cleaned.length > 7) {
                        cleaned = cleaned.slice(0, 7) + '-' + cleaned.slice(7, 9);
                      }
                      setExpenseDate(cleaned.slice(0, 10));
                    }}
                    placeholder="e.g. 2026-07-01"
                    placeholderTextColor={theme.text3}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Paid By</Text>
                  <View style={styles.dropdownContainer}>
                    {members.map((m) => {
                      const isSelected = paidById === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.dropdownItem,
                            { borderColor: theme.border },
                            isSelected && { backgroundColor: theme.primaryDim, borderColor: theme.primary },
                          ]}
                          onPress={() => setPaidById(m.id)}
                        >
                          <Text style={[styles.dropdownItemText, { color: isSelected ? theme.primary : theme.text }]}>
                            {m.id === currentUser?.id ? 'You' : m.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Split selection toggle */}
                <View style={styles.splitToggleContainer}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, splitEqually && { backgroundColor: theme.surface2 }]}
                    onPress={() => setSplitEqually(true)}
                  >
                    <Text style={[styles.toggleBtnText, { color: splitEqually ? theme.primary : theme.text3 }]}>
                      Split Equally
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !splitEqually && { backgroundColor: theme.surface2 }]}
                    onPress={() => setSplitEqually(false)}
                  >
                    <Text style={[styles.toggleBtnText, { color: !splitEqually ? theme.primary : theme.text3 }]}>
                      Custom Splits
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Custom Split Inputs */}
                {!splitEqually && (
                  <View style={styles.customSplitsContainer}>
                    {members.map((m) => (
                      <View key={m.id} style={styles.customSplitRow}>
                        <Text style={[styles.customSplitName, { color: theme.text }]}>
                          {m.id === currentUser?.id ? 'You' : m.name}
                        </Text>
                        <TextInput
                          style={[styles.customSplitInput, { color: theme.text, borderColor: theme.border }]}
                          value={customSplits[m.id] || ''}
                          onChangeText={(text) => {
                            // Strip any characters that are NOT digits or dot
                            const cleaned = text.replace(/[^0-9.]/g, '');
                            setCustomSplits((prev) => ({ ...prev, [m.id]: cleaned }));
                          }}
                          keyboardType="numeric"
                          placeholder="₹0"
                          placeholderTextColor={theme.text3}
                        />
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: theme.primary }]}
                  onPress={handleAddExpense}
                  disabled={submittingExpense}
                >
                  {submittingExpense ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Log Split Expense</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </ThemedView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={memberModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMemberModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <ThemedView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Add Group Member
                </ThemedText>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setMemberModalVisible(false)}
                >
                  <X size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>
                  Search users or type email/phone
                </Text>
                <View style={[styles.searchBarWrapper, { borderColor: theme.border }]}>
                  <Search size={18} color={theme.text3} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.searchInputField, { color: theme.text }]}
                    value={searchQuery}
                    onChangeText={handleSearchUsers}
                    placeholder="Search name, email, or phone"
                    placeholderTextColor={theme.text3}
                    autoCapitalize="none"
                  />
                  {searching && <ActivityIndicator size="small" color={theme.primary} />}
                </View>
              </View>

              {/* Re-split split options visual card selection */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 8 }]}>
                  Split Setting for Past Expenses
                </Text>
                <TouchableOpacity
                  style={[
                    styles.splitOptionCard,
                    { borderColor: theme.border },
                    reSplitPast && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
                  ]}
                  onPress={() => setReSplitPast(!reSplitPast)}
                >
                  <View style={[
                    styles.splitCheckboxCircle,
                    { borderColor: theme.border },
                    reSplitPast && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}>
                    {reSplitPast && <Check size={10} color="#FFF" />}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: theme.text }}>
                      Re-split past group bills equally ⚡
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                      Redistributes share of all past expenses to include the new member.
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.searchResultsScroll} showsVerticalScrollIndicator={false}>
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.inviteDirectCard, { backgroundColor: theme.primaryDim, borderColor: theme.primary }]}
                    onPress={() => handleAddMember(searchQuery)}
                    disabled={submittingMember}
                  >
                    <UserPlus size={18} color={theme.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inviteDirectTitle, { color: theme.primary }]}>
                        Invite "{searchQuery}"
                      </Text>
                      <Text style={[styles.inviteDirectDesc, { color: theme.textSecondary }]}>
                        Tap to add them & share a join link via SMS/Share Sheet
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Local Phone Contacts */}
                {filteredLocalContacts.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.searchResultsHeader, { color: theme.textSecondary }]}>
                      Phone Contacts
                    </Text>
                    {filteredLocalContacts.map((contact, idx) => {
                      const primaryPhone = contact.phoneNumbers?.[0]?.number;
                      const primaryEmail = contact.emails?.[0]?.email;
                      const identifier = primaryPhone || primaryEmail || contact.name;

                      return (
                        <TouchableOpacity
                          key={contact.id || idx}
                          style={[styles.searchResultRow, { borderBottomColor: theme.border }]}
                          onPress={() => handleAddMember(identifier)}
                          disabled={submittingMember}
                        >
                          <View style={[styles.searchResultAvatar, { backgroundColor: theme.surface2 }]}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: theme.textSecondary }}>
                              {(contact.name || 'U').substring(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.searchResultName, { color: theme.text }]}>
                              {contact.name}
                            </Text>
                            {identifier && (
                              <Text style={[styles.searchResultDetail, { color: theme.textSecondary }]}>
                                {identifier}
                              </Text>
                            )}
                          </View>
                          <View style={[styles.addInlineBtn, { backgroundColor: theme.primary }]}>
                            <Plus size={14} color="#FFF" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {searchQuery.trim().length > 0 && filteredLocalContacts.length === 0 && !searching && (
                  <Text style={[styles.noResultsText, { color: theme.text3 }]}>
                    No matching users found. Tap the "Invite" card above to add them directly anyway.
                  </Text>
                )}
              </ScrollView>
            </ThemedView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Settle Up Debt Confirmation Modal */}
      <Modal
        visible={settleModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
          <ThemedView style={[styles.settleModalBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.settleModalTitle, { color: theme.text }]}>Settle Up Debt</Text>
            {(() => {
              if (!selectedDebt) return null;
              const payeeMember = members.find((m) => m.id === selectedDebt.to);
              const payeeUpi = payeeMember?.upiId;
              
              return (
                <>
                  <Text style={[styles.settleModalDesc, { color: theme.textSecondary }]}>
                    Would you like to settle your debt of{' '}
                    <Text style={{ fontFamily: Typography.uiBold, color: theme.text }}>
                      ₹{selectedDebt.amount}
                    </Text>{' '}
                    to{' '}
                    <Text style={{ fontFamily: Typography.uiBold, color: theme.text }}>
                      {selectedDebt.toName}
                    </Text>
                    ?
                  </Text>                  
                  {payeeUpi ? (
                    <View style={{ marginBottom: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: theme.lent, fontWeight: '600' }}>
                        ⚡ UPI settlement available at {payeeUpi}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 8, textAlign: 'center' }}>
                        No UPI ID registered. Enter {selectedDebt.toName}'s UPI ID to pay instantly:
                      </Text>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 8,
                          padding: 10,
                          color: theme.text,
                          fontSize: 14,
                          backgroundColor: theme.surface2,
                          textAlign: 'center',
                          fontFamily: Typography.ui
                        }}
                        placeholder="e.g. name@upi"
                        placeholderTextColor={theme.text3}
                        value={inputUpi}
                        onChangeText={setInputUpi}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  )}

                  <View style={styles.settleModalActions}>
                    <TouchableOpacity
                      style={[styles.settleCancelBtn, { borderColor: theme.border }]}
                      onPress={() => {
                        setInputUpi('');
                        setSettleModalVisible(false);
                      }}
                    >
                      <Text style={[styles.settleCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    
                    {payeeUpi ? (
                      <TouchableOpacity
                        style={[styles.settleConfirmBtn, { backgroundColor: theme.primary, flex: 0.6 }]}
                        onPress={() => handleUPIPayment()}
                        disabled={submittingSettle}
                      >
                        <Text style={styles.settleConfirmBtnText}>Pay via UPI App</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.settleConfirmBtn, 
                          { 
                            backgroundColor: inputUpi.trim() ? theme.primary : theme.surface2, 
                            flex: 0.6 
                          }
                        ]}
                        onPress={handleSaveUpiAndPay}
                        disabled={submittingUpi || !inputUpi.trim()}
                      >
                        {submittingUpi ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={[
                            styles.settleConfirmBtnText, 
                            { color: inputUpi.trim() ? '#FFF' : theme.text3 }
                          ]}>
                            Save & Pay via UPI
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={{ marginTop: 14, alignSelf: 'center', padding: 4 }}
                    onPress={() => handleSettleUp('APPROVED')}
                    disabled={submittingSettle}
                  >
                    <Text style={{ fontSize: 12, color: theme.textSecondary, textDecorationLine: 'underline' }}>
                      or log manual cash payment
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  groupMeta: {
    flex: 1,
  },
  groupTitle: {
    fontSize: 18,
    fontFamily: Typography.uiBold,
  },
  groupSubtitle: {
    fontSize: 11,
    fontFamily: Typography.body,
    marginTop: 2,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: Spacing.three,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 120,
  },
  expenseCard: {
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  expHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expMeta: {
    flex: 1,
    marginLeft: 12,
  },
  expDesc: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  expPaidBy: {
    fontSize: 11,
    marginTop: 2,
  },
  expDate: {
    fontSize: 10,
    marginTop: 2,
  },
  expDetails: {
    justifyContent: 'center',
  },
  shareLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  shareValue: {
    fontSize: 13,
    fontFamily: Typography.uiBold,
    marginTop: 2,
  },
  noShare: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: Typography.uiBold,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBox: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '500',
  },
  memberBal: {
    fontSize: 13,
    fontFamily: Typography.uiBold,
  },
  memberBalSettled: {
    fontSize: 12,
  },
  settledRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: Spacing.three,
    gap: 8,
  },
  settledRowText: {
    fontSize: 12,
    fontWeight: '500',
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  debtInstruction: {
    fontSize: 13,
  },
  debtAmount: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
    marginTop: 4,
  },
  settleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  settleBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 20,
    left: Spacing.three,
    right: Spacing.three,
  },
  floatingActionBtn: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  floatingActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
  },
  closeBtn: {
    padding: 4,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: Typography.uiBold,
    marginBottom: 6,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Typography.body,
  },
  dropdownContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dropdownItem: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownItemText: {
    fontSize: 12,
    fontWeight: '500',
  },
  splitToggleContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  customSplitsContainer: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  customSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  customSplitName: {
    fontSize: 13,
    fontWeight: '500',
  },
  customSplitInput: {
    width: 80,
    height: 34,
    borderWidth: 1,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  submitButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  settleModalBox: {
    borderRadius: 20,
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  settleModalTitle: {
    fontSize: 18,
    fontFamily: Typography.uiBold,
    marginBottom: Spacing.two,
  },
  settleModalDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: Spacing.three,
  },
  settleModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  settleCancelBtn: {
    flex: 0.48,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settleCancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  settleConfirmBtn: {
    flex: 0.48,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settleConfirmBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInputField: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.body,
    height: '100%',
  },
  searchResultsScroll: {
    maxHeight: 250,
    marginTop: 10,
  },
  inviteDirectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: 12,
  },
  inviteDirectTitle: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  inviteDirectDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  searchResultsHeader: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  addInlineBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  addFriendsHeaderRow: {
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginBottom: Spacing.three,
  },
  addFriendsScroll: {
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  addFriendAvatarBtn: {
    alignItems: 'center',
    marginRight: 16,
    width: 64,
  },
  avatarPlusCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    marginBottom: 6,
  },
  memberAvatarCol: {
    alignItems: 'center',
    marginRight: 16,
    width: 60,
  },
  memberAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  memberAvatarInitials: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  avatarLabel: {
    fontSize: 11,
    textAlign: 'center',
    width: '100%',
  },
  spendSummaryCard: {
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryCardTitle: {
    fontSize: 10,
    fontFamily: Typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    paddingBottom: Spacing.three,
    marginBottom: Spacing.three,
  },
  statCol: {
    flex: 0.46,
  },
  statValue: {
    fontSize: 20,
    fontFamily: Typography.uiBold,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  categoriesBreakdown: {
    marginTop: Spacing.one,
  },
  categoryProgressRow: {
    marginBottom: Spacing.three,
  },
  categoryLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryAmt: {
    fontSize: 11,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  memberRowVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  memberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.35,
  },
  memberAvatarCircle2: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  memberNameText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  balanceChartWrapper: {
    flex: 0.38,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  balanceBarTrack: {
    height: 5,
    borderRadius: 2.5,
    position: 'relative',
    justifyContent: 'center',
  },
  balanceBarFillOwe: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2.5,
  },
  balanceBarFillOwed: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2.5,
  },
  balanceBarCenterAnchor: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: 8,
    zIndex: 2,
  },
  memberBalValueBox: {
    flex: 0.27,
    alignItems: 'flex-end',
  },
  memberBalVal: {
    fontSize: 13,
    fontFamily: Typography.uiBold,
  },
  memberBalValSettled2: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  splitOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: 4,
  },
  splitCheckboxCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChoiceBtn: {
    width: 58,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 2,
  },
  shareBadgeText: {
    fontSize: 7,
    fontWeight: 'bold',
  },
  overlappingAvatarsContainer: {
    flexDirection: 'row',
    height: 18,
    marginTop: 6,
    position: 'relative',
  },
  overlapAvatar: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debtVisualFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  avatarCircleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyAddBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

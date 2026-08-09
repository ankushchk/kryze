import React, { useState, useEffect, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import {
  StyleSheet,
  View,
  Text,
  Image,
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
  Linking,
  Animated,
  RefreshControl,
  TouchableWithoutFeedback,
  Keyboard,
  useWindowDimensions
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
  AlertTriangle,
  Edit2,
  Trash2,
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
  Plane,
  Camera
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
import { apiRequest, getAuthToken } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { Typography, Spacing } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ConfettiCannon } from '@/components/confetti-cannon';
import { CoinSplashOverlay, CoinSplashData } from '@/components/coin-splash-overlay';

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
  expenseId: string;
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
  receiptUrl?: string | null;
  items?: string | null;
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

interface ItemCardProps {
  item: { name: string; quantity: number; price: number };
  itemIdx: number;
  shares: Record<string, number>;
  members: Member[];
  currentUser: any;
  theme: any;
  onToggleMember: (itemIdx: number, memberId: string) => void;
  onAdjustMemberShare: (itemIdx: number, memberId: string, delta: number) => void;
  onToggleAll: (itemIdx: number) => void;
}

const ItemCard = React.memo(({
  item,
  itemIdx,
  shares,
  members,
  currentUser,
  theme,
  onToggleMember,
  onAdjustMemberShare,
  onToggleAll
}: ItemCardProps) => {
  let hasAnyActive = false;
  members.forEach((m) => {
    if ((shares[m.id] || 0) > 0) {
      hasAnyActive = true;
    }
  });
  
  let isAllSelected = true;
  members.forEach((m) => {
    if ((shares[m.id] || 0) === 0) {
      isAllSelected = false;
    }
  });

  const totalShares = members.reduce((sum, m) => sum + (shares[m.id] || 0), 0);
  const isOverAllocated = totalShares > item.quantity;
  const isFullyAllocated = totalShares === item.quantity;

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isFullyAllocated) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.15, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true })
      ]).start();
    }
  }, [isFullyAllocated]);
  
  const isDark = theme.background === '#141210';
  const greenBg = isDark ? '#122B1E' : '#EDF3ED';
  const greenBorder = isDark ? '#1E5A38' : '#C8DCD0';
  const greenText = isDark ? '#48B87A' : '#059669';

  const redBg = isDark ? '#2D1612' : '#F7EEEC';
  const redBorder = isDark ? '#8A2B1E' : '#EAD0CC';
  const redText = isDark ? '#E86050' : '#DC2626';

  return (
    <View style={[
      styles.itemCard, 
      { 
        borderColor: isFullyAllocated ? greenBorder : isOverAllocated ? redBorder : theme.border,
        backgroundColor: isFullyAllocated ? greenBg : isOverAllocated ? redBg : theme.surface2
      }
    ]}>
      <View style={styles.itemCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemNameText, { color: theme.text }]}>{item.name}</Text>
          <Text style={[styles.itemPriceLabel, { color: theme.text3 }]}>
            {item.quantity} x ₹{(item.price / item.quantity).toFixed(2)}
          </Text>
          <Animated.View style={[
            styles.allocationRow,
            { transform: [{ scale: scaleAnim }] }
          ]}>
            {isFullyAllocated && (
              <Check size={12} color={greenText} style={{ marginRight: 4 }} />
            )}
            {isOverAllocated && (
              <AlertTriangle size={12} color={redText} style={{ marginRight: 4 }} />
            )}
            <Text style={[
              styles.allocationBadgeText, 
              isFullyAllocated && { color: greenText, fontWeight: 'bold' },
              isOverAllocated && { color: redText, fontWeight: 'bold' },
              !isFullyAllocated && !isOverAllocated && { color: theme.text3 }
            ]}>
              {totalShares} of {item.quantity} split
            </Text>
          </Animated.View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.itemPriceText, { color: theme.primary }]}>
            ₹{item.price.toFixed(2)}
          </Text>
          <TouchableOpacity 
            style={[styles.itemToggleAllBtn, { backgroundColor: theme.surface2 }]}
            onPress={() => onToggleAll(itemIdx)}
          >
            <Text style={[styles.itemToggleAllText, { color: theme.primary }]}>
              {!hasAnyActive ? "Select All" : isAllSelected ? "Clear All" : "Select All"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.itemMembersRow}>
        {members.map((m) => {
          const count = shares[m.id] || 0;
          const isSelected = count > 0;
          const initial = m.name ? m.name.charAt(0).toUpperCase() : '?';
          const memberCost = totalShares > 0 ? (item.price * (count / totalShares)) : 0;
          
          return (
            <View key={m.id} style={styles.itemMemberColumn}>
              <TouchableOpacity
                style={[
                  styles.itemMemberAvatarContainer,
                  isSelected && { borderColor: theme.primary, backgroundColor: theme.primaryDim }
                ]}
                onPress={() => onToggleMember(itemIdx, m.id)}
              >
                <View style={[
                  styles.itemAvatarCircle,
                  { backgroundColor: isSelected ? theme.primary : theme.border }
                ]}>
                  <Text style={[styles.itemAvatarText, { color: isSelected ? '#FFF' : theme.text3 }]}>
                    {initial}
                  </Text>
                </View>
                <Text 
                  numberOfLines={1} 
                  style={[
                    styles.itemMemberNameText, 
                    { color: isSelected ? theme.primary : theme.text3 }
                  ]}
                >
                  {m.id === currentUser?.id ? 'You' : m.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>

              <View style={[styles.counterRow, { borderColor: isSelected ? theme.primary : theme.border }]}>
                <TouchableOpacity 
                  style={[styles.counterBtn, { backgroundColor: theme.surface2 }]} 
                  onPress={() => onAdjustMemberShare(itemIdx, m.id, -1)}
                  disabled={count === 0}
                >
                  <Text style={[styles.counterBtnText, { color: count === 0 ? theme.text3 : theme.primary }]}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.counterValText, { color: theme.text }]}>{count}</Text>
                <TouchableOpacity 
                  style={[styles.counterBtn, { backgroundColor: theme.surface2 }]} 
                  onPress={() => onAdjustMemberShare(itemIdx, m.id, 1)}
                >
                  <Text style={[styles.counterBtnText, { color: theme.primary }]}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.memberCostText, { color: isSelected ? theme.primary : theme.text3 }]}>
                ₹{memberCost.toFixed(2)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
  const [splitMode, setSplitMode] = useState<'EQUALLY' | 'CUSTOM' | 'ITEMS'>('EQUALLY');
  const [parsedItems, setParsedItems] = useState<Array<{ name: string; quantity: number; price: number }>>([]);
  const [itemShares, setItemShares] = useState<Record<number, Record<string, number>>>({}); // itemIndex -> { userId: shareCount }
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({}); // userId -> amount
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [monthFilter, setMonthFilter] = useState('All');
  const [scanning, setScanning] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [selectedReceiptImage, setSelectedReceiptImage] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<GroupExpense | null>(null);
  const [detailExpense, setDetailExpense] = useState<GroupExpense | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [splashData, setSplashData] = useState<CoinSplashData | null>(null);

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
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [processingStep, setProcessingStep] = useState<'SENDING' | 'SECURING' | 'SUCCESS'>('SENDING');
  const pulseAnim = React.useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const [localContacts, setLocalContacts] = useState<any[]>([]);
  const [filteredLocalContacts, setFilteredLocalContacts] = useState<any[]>([]);

  useEffect(() => {
    if (isProcessingPayment) {
      pulseAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isProcessingPayment]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchGroupDetails(false);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
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
                    message: `Hey! Join my group "${group?.name || 'SplitX'}" on SplitX to split expenses: ${response.inviteLink}`,
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
  // Trigger Image Picker Options & OCR Scan
  const handleScanReceipt = async () => {
    Alert.alert(
      'Scan Receipt',
      'Choose source to scan your bill:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => performImageScan(true) },
        { text: 'Choose from Gallery', onPress: () => performImageScan(false) },
      ]
    );
  };

  const performImageScan = async (useCamera: boolean) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permissions are required to scan bills.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Gallery access is required to choose a bill image.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      }
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setScanning(true);

      const filename = asset.uri.split('/').pop() || 'receipt.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const formData = new FormData();
      formData.append('image', {
        uri: asset.uri,
        name: filename,
        type,
      } as any);

      const token = await getAuthToken();
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl}/api/ocr`);
      
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.onload = () => {
        try {
          const responseData = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            if (responseData.success && responseData.data) {
              const { merchant, amount, date, category, items, receiptUrl: parsedUrl } = responseData.data;
              if (merchant) setDescription(merchant);
              if (amount) setAmount(amount.toString());
              if (date) setExpenseDate(date);
              if (category) setExpenseCategory(category);
              if (parsedUrl) setReceiptUrl(parsedUrl);

              if (Array.isArray(items) && items.length > 0) {
                setParsedItems(items);
                const defaultShares: Record<number, Record<string, number>> = {};
                items.forEach((_, idx) => {
                  const sharesObj: Record<string, number> = {};
                  members.forEach((m) => {
                    sharesObj[m.id] = 0;
                  });
                  defaultShares[idx] = sharesObj;
                });
                setItemShares(defaultShares);
                setSplitEqually(false);
                setSplitMode('ITEMS');
                recalculateItemSplits(items, defaultShares, amount ? amount.toString() : '0');
                Alert.alert('Scan Success', 'Receipt scanned! Itemized splitting mode active.');
              } else {
                setParsedItems([]);
                setItemShares({});
                setSplitEqually(true);
                setSplitMode('EQUALLY');
                Alert.alert('Scan Success', 'Receipt parsed successfully! Details pre-filled.');
              }
            } else {
              Alert.alert('Scan Failed', 'Failed to parse receipt details.');
            }
          } else {
            Alert.alert('Scan Failed', responseData.error || 'Failed to process receipt OCR');
          }
        } catch (parseErr) {
          Alert.alert('Scan Failed', 'Invalid server response format.');
        }
        setScanning(false);
      };

      xhr.onerror = (e) => {
        console.error('XHR OCR scan failed:', e);
        Alert.alert('Scan Failed', 'Could not connect to OCR server.');
        setScanning(false);
      };

      xhr.send(formData);
    } catch (err: any) {
      console.error('OCR scan failed:', err);
      Alert.alert('Scan Failed', err.message || 'Could not parse the receipt image.');
      setScanning(false);
    }
  };
  // Recalculate itemized split shares and set customSplits
  const recalculateItemSplits = useCallback((
    itemsList: Array<{ name: string; quantity: number; price: number }>,
    sharesMap: Record<number, Record<string, number>>,
    totalExpAmount: string
  ) => {
    const totalAmountNum = parseFloat(totalExpAmount) || 0;
    if (totalAmountNum <= 0 || itemsList.length === 0) return;

    const rawShares: Record<string, number> = {};
    members.forEach((m) => {
      rawShares[m.id] = 0;
    });

    itemsList.forEach((item, index) => {
      const userShares = sharesMap[index] || {};
      let totalSharesForItem = 0;
      members.forEach((m) => {
        totalSharesForItem += userShares[m.id] || 0;
      });

      if (totalSharesForItem > 0) {
        members.forEach((m) => {
          const userShareCount = userShares[m.id] || 0;
          if (userShareCount > 0) {
            const shareAmount = item.price * (userShareCount / totalSharesForItem);
            rawShares[m.id] += shareAmount;
          }
        });
      }
    });

    const subtotal = itemsList.reduce((acc, item) => acc + item.price, 0);
    const factor = subtotal > 0 ? totalAmountNum / subtotal : 1;

    const newCustomSplits: Record<string, string> = {};
    let runningSum = 0;
    const activeMembers = members.filter((m) => rawShares[m.id] > 0);

    members.forEach((m) => {
      const rawShare = rawShares[m.id] || 0;
      if (rawShare > 0) {
        const roundedShare = Math.round(rawShare * factor * 100) / 100;
        newCustomSplits[m.id] = roundedShare.toString();
        runningSum += roundedShare;
      } else {
        newCustomSplits[m.id] = '0';
      }
    });

    const diff = totalAmountNum - runningSum;
    if (Math.abs(diff) > 0.001 && activeMembers.length > 0) {
      let maxMemberId = activeMembers[0].id;
      let maxVal = parseFloat(newCustomSplits[maxMemberId]) || 0;
      activeMembers.forEach((m) => {
        const val = parseFloat(newCustomSplits[m.id]) || 0;
        if (val > maxVal) {
          maxVal = val;
          maxMemberId = m.id;
        }
      });
      const adjustedShare = parseFloat(newCustomSplits[maxMemberId]) + diff;
      newCustomSplits[maxMemberId] = (Math.round(adjustedShare * 100) / 100).toString();
    }

    setCustomSplits(newCustomSplits);
  }, [members]);

  const toggleMemberForItem = useCallback((itemIndex: number, memberId: string) => {
    setItemShares((prev) => {
      const currentShares = prev[itemIndex] ? { ...prev[itemIndex] } : {};
      const currentVal = currentShares[memberId] || 0;
      if (currentVal > 0) {
        currentShares[memberId] = 0;
      } else {
        const totalShares = members.reduce((sum, m) => sum + (currentShares[m.id] || 0), 0);
        const itemQuantity = parsedItems[itemIndex]?.quantity || 1;
        if (totalShares < itemQuantity) {
          currentShares[memberId] = 1;
        } else {
          Alert.alert('Limit Reached', `You can only allocate up to ${itemQuantity} of this item.`);
          return prev;
        }
      }
      const updatedShares = { ...prev, [itemIndex]: currentShares };
      recalculateItemSplits(parsedItems, updatedShares, amount);
      return updatedShares;
    });
  }, [parsedItems, amount, recalculateItemSplits, members]);

  const adjustMemberShare = useCallback((itemIndex: number, memberId: string, delta: number) => {
    setItemShares((prev) => {
      const currentShares = prev[itemIndex] ? { ...prev[itemIndex] } : {};
      const currentVal = currentShares[memberId] || 0;
      
      if (delta > 0) {
        const totalShares = members.reduce((sum, m) => sum + (currentShares[m.id] || 0), 0);
        const itemQuantity = parsedItems[itemIndex]?.quantity || 1;
        if (totalShares >= itemQuantity) {
          Alert.alert('Limit Reached', `You can only allocate up to ${itemQuantity} of this item.`);
          return prev;
        }
      }
      
      const newVal = Math.max(0, currentVal + delta);
      currentShares[memberId] = newVal;
      const updatedShares = { ...prev, [itemIndex]: currentShares };
      recalculateItemSplits(parsedItems, updatedShares, amount);
      return updatedShares;
    });
  }, [parsedItems, amount, recalculateItemSplits, members]);

  const toggleAllMembersForItem = useCallback((itemIndex: number) => {
    setItemShares((prev) => {
      const currentShares = prev[itemIndex] || {};
      let hasAnyActive = false;
      members.forEach((m) => {
        if ((currentShares[m.id] || 0) > 0) {
          hasAnyActive = true;
        }
      });

      const nextShares: Record<string, number> = {};
      if (hasAnyActive) {
        members.forEach((m) => {
          nextShares[m.id] = 0;
        });
      } else {
        members.forEach((m) => {
          nextShares[m.id] = 1;
        });
      }

      const nextSharesMap = { ...prev, [itemIndex]: nextShares };
      recalculateItemSplits(parsedItems, nextSharesMap, amount);
      return nextSharesMap;
    });
  }, [members, parsedItems, amount, recalculateItemSplits]);

  // Handle Add Expense
  const resetExpenseModal = () => {
    setDescription('');
    setAmount('');
    setPaidById(currentUser?.id || '');
    setReceiptUrl(null);
    setCustomSplits({});
    setExpenseCategory('Food');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setSplitEqually(true);
    setSplitMode('EQUALLY');
    setParsedItems([]);
    setItemShares({});
    setEditingExpense(null);
    setExpenseModalVisible(false);
  };

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

      if (splitMode === 'EQUALLY') {
        const count = members.length;
        const equalShare = Math.round((parsedAmount / count) * 100) / 100;
        let sum = 0;
        members.forEach((m, idx) => {
          const share = idx === count - 1 ? parsedAmount - sum : equalShare;
          sum += share;
          splits.push({ userId: m.id, amount: Math.round(share * 100) / 100 });
        });
      } else {
        let sum = 0;
        members.forEach((m) => {
          const shareStr = customSplits[m.id] || '0';
          const share = parseFloat(shareStr) || 0;
          sum += share;
          splits.push({ userId: m.id, amount: share });
        });
        const diff = Math.abs(sum - parsedAmount);
        if (diff > 0.05) {
          Alert.alert('Sum Mismatch', `The sum of custom splits (₹${sum}) must equal the total amount (₹${parsedAmount})`);
          setSubmittingExpense(false);
          return;
        }
      }

      let itemsPayload: string | null = null;
      if (splitMode === 'ITEMS') {
        const itemsWithShares = parsedItems.map((item, idx) => ({
          ...item,
          shares: itemShares[idx] || {}
        }));
        itemsPayload = JSON.stringify(itemsWithShares);
      }

      const isEditing = editingExpense !== null;
      const url = isEditing
        ? `/api/groups/${groupId}/expenses/${editingExpense!.id}`
        : `/api/groups/${groupId}/expenses`;

      // Optimistic UI: prepend/update immediately
      const tempId = `temp_${Date.now()}`;
      const optimisticExpense: GroupExpense = {
        id: isEditing ? editingExpense!.id : tempId,
        description: description.trim(),
        amount: parsedAmount,
        date: expenseDate,
        category: expenseCategory,
        status: 'OPTIMISTIC',
        receiptUrl: receiptUrl ?? null,
        items: itemsPayload,
        paidById: paidById,
        paidBy: { id: paidById, name: members.find(m => m.id === paidById)?.name || 'You' },
        splits: splits.map(s => ({ id: '', expenseId: isEditing ? editingExpense!.id : tempId, userId: s.userId, amount: s.amount, user: { id: s.userId, name: members.find(m => m.id === s.userId)?.name || '' } })),
      };

      if (isEditing) {
        setExpenses(prev => prev.map(e => e.id === editingExpense!.id ? optimisticExpense : e));
      } else {
        setExpenses(prev => [optimisticExpense, ...prev]);
      }

      const response = await apiRequest(url, {
        method: isEditing ? 'PATCH' : 'POST',
        body: {
          description: description.trim(),
          amount: parsedAmount,
          paidById,
          splits,
          category: expenseCategory,
          date: expenseDate,
          receiptUrl,
          items: itemsPayload,
        },
      });

      if (response && (response.expense || isEditing)) {
        resetExpenseModal();
        fetchGroupDetails(false);
        Alert.alert(isEditing ? 'Updated' : 'Logged', isEditing ? 'Expense updated!' : 'Expense logged successfully!');
      }
    } catch (err: any) {
      // Roll back optimistic update
      fetchGroupDetails(false);
      Alert.alert(editingExpense ? 'Error Updating Expense' : 'Error Logging Expense', err.message || 'Something went wrong');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleEditExpense = (exp: GroupExpense) => {
    setEditingExpense(exp);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setPaidById(exp.paidById);
    setExpenseCategory(exp.category || 'Food');
    setExpenseDate(new Date(exp.date).toISOString().split('T')[0]);
    setReceiptUrl(exp.receiptUrl ?? null);
    if (exp.items) {
      try {
        const savedItems = JSON.parse(exp.items);
        if (Array.isArray(savedItems) && savedItems.length > 0) {
          setParsedItems(savedItems.map((item: any) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price
          })));

          const loadedShares: Record<number, Record<string, number>> = {};
          savedItems.forEach((item: any, idx: number) => {
            if (item.shares) {
              loadedShares[idx] = item.shares;
            } else if (Array.isArray(item.sharedWith)) {
              const sharesObj: Record<string, number> = {};
              item.sharedWith.forEach((uid: string) => {
                sharesObj[uid] = 1;
              });
              loadedShares[idx] = sharesObj;
            } else {
              loadedShares[idx] = {};
            }
          });
          setItemShares(loadedShares);
          setSplitEqually(false);
          setSplitMode('ITEMS');
          recalculateItemSplits(savedItems, loadedShares, exp.amount.toString());
        } else {
          setParsedItems([]);
          setItemShares({});
          setSplitEqually(false);
          setSplitMode('CUSTOM');
          const splitMap: Record<string, string> = {};
          exp.splits.forEach((s: any) => { splitMap[s.userId] = s.amount.toString(); });
          setCustomSplits(splitMap);
        }
      } catch (err) {
        console.error('Failed to parse saved expense items:', err);
        setParsedItems([]);
        setItemShares({});
        setSplitEqually(false);
        setSplitMode('CUSTOM');
        const splitMap: Record<string, string> = {};
        exp.splits.forEach((s: any) => { splitMap[s.userId] = s.amount.toString(); });
        setCustomSplits(splitMap);
      }
    } else {
      setParsedItems([]);
      setItemShares({});
      setSplitMode('CUSTOM');
      setSplitEqually(false);
      const splitMap: Record<string, string> = {};
      exp.splits.forEach((s: any) => { splitMap[s.userId] = s.amount.toString(); });
      setCustomSplits(splitMap);
    }
    setExpenseModalVisible(true);
  };

  const handleDeleteExpense = (exp: GroupExpense) => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${exp.description}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic: remove from list immediately
            setExpenses(prev => prev.filter(e => e.id !== exp.id));
            try {
              await apiRequest(`/api/groups/${groupId}/expenses/${exp.id}`, { method: 'DELETE' });
              fetchGroupDetails(false);
            } catch (err: any) {
              // Roll back on failure
              fetchGroupDetails(false);
              Alert.alert('Error', err.message || 'Failed to delete expense');
            }
          },
        },
      ]
    );
  };

  const handleSendReminder = async (debt: SimplifiedDebt) => {
    try {
      const message = `Hi ${debt.fromName}! Just a friendly reminder that you owe ₹${debt.amount} to ${debt.toName} in our Split Group "${group?.name || 'SplitX'}". You can settle this directly in the app!`;
      await Share.share({ message });
    } catch (err: any) {
      console.error('Failed to send reminder:', err);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!selectedDebt) return;
    setSubmittingSettle(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}/settlement/pay`, {
        method: 'POST',
        body: {
          amount: selectedDebt.amount,
          toUserId: selectedDebt.to
        }
      });
      if (response && response.paymentUrl) {
        setSettleModalVisible(false);
        
        // Track the current list of expenses before payment
        const previousExpenses = [...expenses];

        // Opens the checkout overlay inside the app itself!
        await WebBrowser.openBrowserAsync(response.paymentUrl);
        
        // Query fresh group details directly to verify payment success (using a retry loop to handle transient network drops)
        let retries = 3;
        let success = false;
        while (retries > 0 && !success) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const freshData = await apiRequest(`/api/groups/${groupId}`);
            if (freshData) {
              setGroup(freshData.group);
              setMembers(freshData.members);
              setExpenses(freshData.expenses);
              setDebts(freshData.simplifiedDebts);

              // If there's a new settled expense that wasn't in previousExpenses, celebrate!
              const hasNewSettlement = freshData.expenses.some((e: any) => {
                const isNew = !previousExpenses.some(pe => pe.id === e.id);
                const isSettlement = e.description.startsWith('Settlement:');
                return isNew && isSettlement;
              });

              if (hasNewSettlement) {
                // Read the coins this settlement awarded from the user's own coin
                // ledger (latest SETTLEMENT credit), so the splash always shows
                // the true, server-awarded amount.
                let coinsEarned = Math.max(1, Math.floor(selectedDebt.amount / 100));
                try {
                  const hist = await apiRequest('/api/coins/history');
                  const newestEarn = hist?.history?.find(
                    (entry: any) => entry.reason === 'SETTLEMENT' && entry.amount > 0
                  );
                  if (newestEarn && newestEarn.amount) {
                    coinsEarned = newestEarn.amount;
                  }
                } catch (histErr) {
                  console.warn('Failed to read coins from ledger, using local calc', histErr);
                }

                // Pull the user's (fresh) coin balance from their profile data so the
                // splash can show the updated total alongside what was just earned.
                let totalBalance = coinsEarned;
                try {
                  const bal = await apiRequest('/api/coins/balance');
                  totalBalance = (bal && bal.balance) || totalBalance;
                } catch (balErr) {
                  console.warn('Failed to fetch coin balance', balErr);
                }

                setSplashData((prev) =>
                  prev
                    ? prev
                    : {
                        coinsEarned,
                        totalBalance,
                        groupName: group?.name,
                        settledWith: selectedDebt.toName,
                      }
                );
              }
              success = true;
            }
          } catch (fetchErr) {
            retries--;
            console.warn(`Failed to sync details, retries remaining: ${retries}`, fetchErr);
            if (retries === 0) {
              Alert.alert('Sync Connection Lost', 'Could not auto-sync the latest balances. Please pull down to refresh manually.');
            }
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Payment Initialization Failed', err.message || 'Error communicating with server');
    } finally {
      setSubmittingSettle(false);
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
            { text: 'Log Manually', onPress: () => handleSettleUp('PENDING_VERIFICATION') }
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
          { text: 'Log Manually', onPress: () => handleSettleUp('PENDING_VERIFICATION') }
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

  const handleSettleUp = async (status = 'PENDING_VERIFICATION') => {
    if (!selectedDebt) return;

    setSubmittingSettle(true);
    setIsProcessingPayment(true);
    setProcessingStep('SENDING');

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

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
        setProcessingStep('SECURING');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        setProcessingStep('SUCCESS');
        await new Promise((resolve) => setTimeout(resolve, 1200));

        setIsProcessingPayment(false);
        setSettleModalVisible(false);
        setSelectedDebt(null);
        fetchGroupDetails(false);
        
        // Trigger Confetti Celebration!
        setShowConfetti(true);
        setTimeout(() => {
          setShowConfetti(false);
        }, 4500);
      } else {
        setIsProcessingPayment(false);
        Alert.alert('Settle Failed', 'Could not record settlement');
      }
    } catch (err: any) {
      setIsProcessingPayment(false);
      Alert.alert('Settle Failed', err.message || 'Verification failure');
    } finally {
      setSubmittingSettle(false);
    }
  };

  const handleVerifyReceipt = async (expenseId: string) => {
    setIsProcessingPayment(true);
    setProcessingStep('SENDING');
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const response = await apiRequest(`/api/groups/${groupId}/expenses/${expenseId}/verify`, {
        method: 'PATCH',
      });
      if (response && response.expense) {
        setProcessingStep('SUCCESS');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        setIsProcessingPayment(false);
        fetchGroupDetails(false);
      } else {
        setIsProcessingPayment(false);
        Alert.alert('Verification Failed', 'Could not verify payment');
      }
    } catch (err: any) {
      setIsProcessingPayment(false);
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
          refreshing={refreshing}
          onRefresh={onRefresh}
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

            const canModify = exp.paidById === currentUser?.id || 
              members.find(m => m.id === currentUser?.id)?.role === 'ADMIN';

            return (
              <View style={[styles.expenseCard, { backgroundColor: theme.surface, opacity: exp.status === 'OPTIMISTIC' ? 0.6 : 1 }]}>
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => {
                    if (isSettlement) return;
                    setDetailExpense(exp);
                    setDetailModalVisible(true);
                  }}
                  onLongPress={() => {
                    if (!canModify || isSettlement) return;
                    Alert.alert(
                      exp.description,
                      'What would you like to do?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: '✏️  Edit', onPress: () => handleEditExpense(exp) },
                        { text: '🗑  Delete', style: 'destructive', onPress: () => handleDeleteExpense(exp) },
                      ]
                    );
                  }}
                >
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

                </TouchableOpacity>

                {/* Receipt Attachment Row */}
                {exp.receiptUrl && (
                  <View style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}>
                    <TouchableOpacity
                      onPress={() => setSelectedReceiptImage(exp.receiptUrl ?? null)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.primaryDim,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: theme.primary + '40'
                      }}
                    >
                      <Camera size={11} color={theme.primary} style={{ marginRight: 5 }} />
                      <Text style={{ fontSize: 10, color: theme.primary, fontFamily: Typography.uiBold }}>
                        View Receipt
                      </Text>
                    </TouchableOpacity>
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
        <ScrollView 
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        >
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
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => {
                Keyboard.dismiss();
                setExpenseModalVisible(false);
              }}
            />
            <ThemedView style={[styles.modalContent, { backgroundColor: theme.background }]}>
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <ThemedText type="subtitle" style={styles.modalTitle}>
                        {editingExpense ? "Edit Expense" : "Add Expense Split"}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.closeBtn}
                      onPress={resetExpenseModal}
                    >
                      <X size={20} color={theme.text} />
                    </TouchableOpacity>
                  </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Large Premium Scan Receipt Card */}
                {!editingExpense && (
                  <TouchableOpacity
                    onPress={handleScanReceipt}
                    disabled={scanning}
                    style={{
                      backgroundColor: theme.primaryDim,
                      borderColor: theme.primary + '30',
                      borderWidth: 1,
                      borderRadius: 14,
                      padding: 16,
                      marginHorizontal: 16,
                      marginTop: 10,
                      marginBottom: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      shadowColor: theme.primary,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      elevation: 2,
                    }}
                  >
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: theme.primary + '18',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 14
                    }}>
                      <Camera size={22} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: Typography.uiBold, color: theme.primary }}>
                        Scan Bill Receipt
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 3 }}>
                        Autofill description, amount, date & splits instantly
                      </Text>
                    </View>
                    <ArrowRight size={16} color={theme.primary} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                )}

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

                {receiptUrl && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    backgroundColor: theme.primaryDim,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.primary + '40',
                    marginHorizontal: 16,
                    marginBottom: 14
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: theme.primary + '20',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 8
                      }}>
                        <Check size={12} color={theme.primary} />
                      </View>
                      <Text style={{ fontSize: 13, color: theme.primary, flex: 1, fontFamily: Typography.uiBold }} numberOfLines={1}>
                        Receipt Attached
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setReceiptUrl(null)}
                      style={{ padding: 4 }}
                    >
                      <X size={16} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                )}

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
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9.]/g, '');
                      setAmount(cleaned);
                      if (splitMode === 'ITEMS') {
                        recalculateItemSplits(parsedItems, itemShares, cleaned);
                      }
                    }}
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
                    style={[styles.toggleBtn, splitMode === 'EQUALLY' && { backgroundColor: theme.surface2 }]}
                    onPress={() => {
                      setSplitMode('EQUALLY');
                      setSplitEqually(true);
                    }}
                  >
                    <Text style={[styles.toggleBtnText, { color: splitMode === 'EQUALLY' ? theme.primary : theme.text3 }]}>
                      Split Equally
                    </Text>
                  </TouchableOpacity>

                  {parsedItems.length > 0 && (
                    <TouchableOpacity
                      style={[styles.toggleBtn, splitMode === 'ITEMS' && { backgroundColor: theme.surface2 }]}
                      onPress={() => {
                        setSplitMode('ITEMS');
                        setSplitEqually(false);
                        recalculateItemSplits(parsedItems, itemShares, amount);
                      }}
                    >
                      <Text style={[styles.toggleBtnText, { color: splitMode === 'ITEMS' ? theme.primary : theme.text3 }]}>
                        Split by Items
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.toggleBtn, splitMode === 'CUSTOM' && { backgroundColor: theme.surface2 }]}
                    onPress={() => {
                      setSplitMode('CUSTOM');
                      setSplitEqually(false);
                    }}
                  >
                    <Text style={[styles.toggleBtnText, { color: splitMode === 'CUSTOM' ? theme.primary : theme.text3 }]}>
                      Custom Splits
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Itemized Split Inputs */}
                {splitMode === 'ITEMS' && parsedItems.length > 0 && (
                  <View style={styles.itemizedSplitsContainer}>
                    <Text style={[styles.itemizedHeader, { color: theme.text }]}>Allocated Items</Text>
                    <Text style={[styles.itemizedSubtitle, { color: theme.text3 }]}>
                      Click members to allocate items. Any tax/tip will be split proportionally.
                    </Text>
                    {parsedItems.map((item, itemIdx) => (
                      <ItemCard
                        key={itemIdx}
                        item={item}
                        itemIdx={itemIdx}
                        shares={itemShares[itemIdx] || {}}
                        members={members}
                        currentUser={currentUser}
                        theme={theme}
                        onToggleMember={toggleMemberForItem}
                        onAdjustMemberShare={adjustMemberShare}
                        onToggleAll={toggleAllMembersForItem}
                      />
                    ))}

                    {/* Proportional Split Result Summary */}
                    <View style={[styles.summaryContainer, { backgroundColor: theme.surface2 }]}>
                      <Text style={[styles.summaryTitle, { color: theme.text }]}>Splits Summary</Text>
                      {members.map((m) => {
                        const amt = customSplits[m.id] || '0';
                        if (parseFloat(amt) <= 0) return null;
                        return (
                          <View key={m.id} style={styles.summaryRow}>
                            <Text style={[styles.summaryName, { color: theme.text }]}>
                              {m.id === currentUser?.id ? 'You' : m.name}
                            </Text>
                            <Text style={[styles.summaryAmount, { color: theme.text, fontFamily: Typography.uiBold }]}>
                              ₹{parseFloat(amt).toFixed(2)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Custom Split Inputs */}
                {!splitEqually && splitMode === 'CUSTOM' && (
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
                    <Text style={styles.submitButtonText}>{editingExpense ? "Save Changes" : "Log Split Expense"}</Text>
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
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  </Modal>
      {/* Expense Details Summary Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => setDetailModalVisible(false)}
            />
            <ThemedView style={[styles.modalContent, { backgroundColor: theme.background }]}>
              {detailExpense && (() => {
                const isCreator = detailExpense.paidById === currentUser?.id || 
                  members.find(m => m.id === currentUser?.id)?.role === 'ADMIN';
                const formattedDate = new Date(detailExpense.date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                });
                
                let parsedReceiptItems: any[] = [];
                if (detailExpense.items) {
                  try {
                    parsedReceiptItems = JSON.parse(detailExpense.items);
                  } catch (e) {
                    console.warn(e);
                  }
                }

                return (
                  <View style={{ maxHeight: '100%' }}>
                    <View style={styles.modalHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <ThemedText type="subtitle" style={styles.modalTitle}>
                          Expense Summary
                        </ThemedText>
                      </View>
                      <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={() => setDetailModalVisible(false)}
                      >
                        <X size={20} color={theme.text} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                      {/* Main Header Info Card */}
                      <View style={[styles.detailHeaderCard, { backgroundColor: theme.surface2 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                          <View style={[styles.detailCategoryCircle, { backgroundColor: theme.primaryDim }]}>
                            {(() => {
                              const IconComp = getCategoryIconAndColor(detailExpense.description).icon;
                              return <IconComp size={24} color={theme.primary} />;
                            })()}
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.detailDescText, { color: theme.text }]} numberOfLines={2}>
                              {detailExpense.description}
                            </Text>
                            <Text style={[styles.detailDateText, { color: theme.text3 }]}>
                              {formattedDate}
                            </Text>
                          </View>
                        </View>

                        <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }}>
                          <Text style={[styles.detailPaidLabel, { color: theme.text2 }]}>
                            Paid by <Text style={{ fontFamily: Typography.uiBold }}>{detailExpense.paidById === currentUser?.id ? 'You' : detailExpense.paidBy?.name}</Text>
                          </Text>
                          <Text style={[styles.detailAmountText, { color: theme.primary }]}>
                            ₹{detailExpense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Text>
                        </View>
                      </View>

                      {/* Split Breakdown Section */}
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailSectionTitle, { color: theme.text }]}>How it's Split</Text>
                        <View style={[styles.detailBreakdownList, { borderColor: theme.border }]}>
                          {members.map((m, idx) => {
                            const split = detailExpense.splits?.find((s: any) => s.userId === m.id);
                            const amountOwed = split ? split.amount : 0;
                            const didPay = detailExpense.paidById === m.id;
                            
                            // Net balance math
                            let netBalance = 0;
                            if (didPay) {
                              netBalance = detailExpense.amount - amountOwed;
                            } else if (split) {
                              netBalance = -amountOwed;
                            }

                            return (
                              <View 
                                key={m.id} 
                                style={[
                                  styles.detailBreakdownRow, 
                                  { 
                                    borderBottomWidth: idx === members.length - 1 ? 0 : 1,
                                    borderBottomColor: theme.border 
                                  }
                                ]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <View style={[styles.detailAvatarIcon, { backgroundColor: theme.border }]}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: theme.text2 }}>
                                      {m.name.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={{ marginLeft: 8 }}>
                                    <Text style={[styles.detailMemberName, { color: theme.text }]}>
                                      {m.id === currentUser?.id ? 'You' : m.name}
                                    </Text>
                                    <Text style={[styles.detailMemberSub, { color: theme.text3 }]}>
                                      {didPay ? `Paid ₹${detailExpense.amount.toFixed(0)}` : 'Owes split'}
                                    </Text>
                                  </View>
                                </View>

                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={[styles.detailMemberAmount, { color: theme.text }]}>
                                    ₹{amountOwed.toFixed(2)}
                                  </Text>
                                  {netBalance !== 0 && (
                                    <Text style={{ 
                                      fontSize: 10, 
                                      color: netBalance > 0 ? theme.lent : theme.owe,
                                      fontWeight: '600'
                                    }}>
                                      {netBalance > 0 ? `gets back ₹${netBalance.toFixed(2)}` : `owes ₹${Math.abs(netBalance).toFixed(2)}`}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      {/* Items Breakdown list if itemized splits exist */}
                      {parsedReceiptItems.length > 0 && (
                        <View style={styles.detailSection}>
                          <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Receipt Items Breakdown</Text>
                          {parsedReceiptItems.map((item: any, idx: number) => {
                            let itemTotalShares = 0;
                            const itemUserShares = item.shares || {};
                            members.forEach(m => {
                              itemTotalShares += itemUserShares[m.id] || 0;
                            });

                            return (
                              <View key={idx} style={[styles.detailItemRow, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <Text style={[styles.detailItemName, { color: theme.text }]}>{item.name}</Text>
                                  <Text style={[styles.detailItemPrice, { color: theme.primary }]}>₹{item.price.toFixed(2)}</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: theme.text3, marginBottom: 6 }}>
                                  Qty: {item.quantity} • ₹{(item.price / item.quantity).toFixed(2)} each
                                </Text>

                                {/* Shared with details */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
                                  {members.map(m => {
                                    const shareCount = itemUserShares[m.id] || 0;
                                    if (shareCount === 0) return null;
                                    const memberCost = itemTotalShares > 0 ? (item.price * (shareCount / itemTotalShares)) : 0;
                                    return (
                                      <View key={m.id} style={[styles.detailItemShareTag, { backgroundColor: theme.background }]}>
                                        <Text style={{ fontSize: 9, color: theme.text, fontWeight: '500' }}>
                                          {m.id === currentUser?.id ? 'You' : m.name.split(' ')[0]}: {shareCount} share{shareCount > 1 ? 's' : ''} (₹{memberCost.toFixed(0)})
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Receipt Photo Section */}
                      {detailExpense.receiptUrl && (
                        <View style={styles.detailSection}>
                          <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Receipt Photo</Text>
                          <TouchableOpacity 
                            style={styles.detailReceiptBtn}
                            onPress={() => Linking.openURL(detailExpense.receiptUrl!)}
                          >
                            <Image 
                              source={{ uri: detailExpense.receiptUrl }} 
                              style={[styles.detailReceiptThumbnail, { borderColor: theme.border }]} 
                              resizeMode="cover"
                            />
                            <View style={styles.detailReceiptOverlay}>
                              <Camera size={20} color="#FFF" />
                              <Text style={styles.detailReceiptOverlayText}>Tap to view receipt full screen</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Action Triggers */}
                      {isCreator && (
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                          <TouchableOpacity
                            style={[styles.detailEditBtn, { borderColor: theme.primary, flexDirection: 'row', gap: 6 }]}
                            onPress={() => {
                              setDetailModalVisible(false);
                              handleEditExpense(detailExpense);
                            }}
                          >
                            <Edit2 size={14} color={theme.primary} />
                            <Text style={[styles.detailEditBtnText, { color: theme.primary }]}>Edit Split</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.detailDeleteBtn, { backgroundColor: theme.owe, flexDirection: 'row', gap: 6 }]}
                            onPress={() => {
                              Alert.alert(
                                'Delete Expense',
                                'Are you sure you want to delete this expense? This cannot be undone.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { 
                                    text: 'Delete', 
                                    style: 'destructive', 
                                    onPress: async () => {
                                      setDetailModalVisible(false);
                                      await handleDeleteExpense(detailExpense);
                                    }
                                  }
                                ]
                              );
                            }}
                          >
                            <Trash2 size={14} color="#FFF" />
                            <Text style={styles.detailDeleteBtnText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                );
              })()}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
              <TouchableWithoutFeedback onPress={() => {}}>
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

                  <View style={{ gap: 10 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#3399cc',
                        height: 44,
                        borderRadius: 10,
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 6
                      }}
                      onPress={handleRazorpayPayment}
                      disabled={submittingSettle}
                    >
                      <CreditCard size={14} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: 'bold' }}>
                        Pay via Razorpay (Demo Sandbox)
                      </Text>
                    </TouchableOpacity>

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
                          style={[styles.settleConfirmBtn, { backgroundColor: theme.primary }]}
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
                              backgroundColor: inputUpi.trim() ? theme.primary : theme.surface2 
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
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 14, alignSelf: 'center', padding: 4 }}
                    onPress={() => handleSettleUp('PENDING_VERIFICATION')}
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  </Modal>
      {/* Transaction Processing Overlay Modal */}
      <Modal
        visible={isProcessingPayment}
        transparent={true}
        animationType="fade"
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24
        }}>
          <View style={{
            width: 260,
            backgroundColor: theme.surface,
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 5
          }}>
            {/* Animated Pulse Loop Container */}
            <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              {processingStep !== 'SUCCESS' ? (
                <>
                  <Animated.View style={{
                    position: 'absolute',
                    width: 90,
                    height: 90,
                    borderRadius: 45,
                    borderWidth: 2,
                    borderColor: theme.primary,
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 0]
                    }),
                    transform: [{
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.4]
                      })
                    }]
                  }} />
                  <Animated.View style={{
                    position: 'absolute',
                    width: 70,
                    height: 70,
                    borderRadius: 35,
                    borderWidth: 2,
                    borderColor: theme.owe,
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 0]
                    }),
                    transform: [{
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1.6]
                      })
                    }]
                  }} />
                  <View style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: theme.surface2,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.border
                  }}>
                    <DollarSign size={24} color={theme.primary} />
                  </View>
                </>
              ) : (
                <View style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: theme.lentDim,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.lent
                }}>
                  <Check size={36} color={theme.lent} />
                </View>
              )}
            </View>

            {/* Dynamic Status Text */}
            <Text style={{
              fontSize: 16,
              fontFamily: Typography.uiBold,
              color: theme.text,
              textAlign: 'center',
              marginBottom: 8
            }}>
              {processingStep === 'SENDING' ? 'Sending Request...' : 
               processingStep === 'SECURING' ? 'Securing Ledger...' : 
               processingStep === 'SUCCESS' ? 'Settlement Logged!' : ''}
            </Text>

            <Text style={{
              fontSize: 12,
              fontFamily: Typography.ui,
              color: theme.textSecondary,
              textAlign: 'center'
            }}>
              {processingStep === 'SENDING' ? 'Posting transaction to server' : 
               processingStep === 'SECURING' ? 'Awaiting peer-to-peer verification' : 
               processingStep === 'SUCCESS' ? 'Waiting for peer confirmation' : ''}
            </Text>
          </View>
        </View>
      </Modal>

      {/* OCR Scanning Overlay Modal */}
      <Modal
        visible={scanning}
        transparent={true}
        animationType="fade"
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            width: 280,
            backgroundColor: theme.surface,
            borderRadius: 24,
            padding: 30,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 5
          }}>
            <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
            <Text style={{
              fontSize: 16,
              fontFamily: Typography.uiBold,
              color: theme.text,
              textAlign: 'center',
              marginBottom: 8
            }}>
              Receipt Parsing
            </Text>
            <Text style={{
              fontSize: 12,
              fontFamily: Typography.ui,
              color: theme.textSecondary,
              textAlign: 'center'
            }}>
              Extracting items, merchant and totals from bill
            </Text>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Receipt Viewer Modal */}
      <Modal
        visible={!!selectedReceiptImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedReceiptImage(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <TouchableOpacity
            onPress={() => setSelectedReceiptImage(null)}
            style={{
              position: 'absolute',
              top: 56,
              right: 20,
              zIndex: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: 8,
            }}
          >
            <X size={22} color="#FFF" />
          </TouchableOpacity>

          <Text style={{
            position: 'absolute',
            top: 62,
            left: 20,
            color: 'rgba(255,255,255,0.7)',
            fontFamily: Typography.uiBold,
            fontSize: 14,
          }}>
            Receipt
          </Text>

          {selectedReceiptImage && (
            <Image
              source={{ uri: selectedReceiptImage }}
              style={{
                width: windowWidth * 0.9,
                height: windowHeight * 0.7,
                borderRadius: 16,
              }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
      <ConfettiCannon active={showConfetti} />
      {splashData ? (
        <CoinSplashOverlay data={splashData} onFinish={() => setSplashData(null)} />
      ) : null}
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
  detailHeaderCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  detailCategoryCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailDescText: {
    fontSize: 16,
    fontFamily: Typography.uiBold,
  },
  detailDateText: {
    fontSize: 12,
    marginTop: 2,
  },
  detailPaidLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailAmountText: {
    fontSize: 24,
    fontFamily: Typography.uiBold,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
    marginBottom: 8,
  },
  detailBreakdownList: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  detailAvatarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailMemberName: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailMemberSub: {
    fontSize: 10,
    marginTop: 1,
  },
  detailMemberAmount: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailItemRow: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  detailItemName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  detailItemPrice: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  detailItemShareTag: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  detailReceiptBtn: {
    position: 'relative',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailReceiptThumbnail: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
  },
  detailReceiptOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailReceiptOverlayText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 4,
  },
  detailEditBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailEditBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailDeleteBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  itemizedSplitsContainer: {
    marginBottom: Spacing.three,
  },
  itemizedHeader: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
    marginBottom: 4,
  },
  itemizedSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: Spacing.three,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  itemNameText: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  itemPriceLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  itemPriceText: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  itemToggleAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  itemToggleAllText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemMembersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  itemMemberColumn: {
    alignItems: 'center',
    marginBottom: 10,
    width: 76,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    width: 70,
    height: 24,
    paddingHorizontal: 2,
  },
  counterBtn: {
    width: 20,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  counterValText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  allocationBadgeText: {
    fontSize: 10,
  },
  memberCostText: {
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  itemMemberAvatarContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    padding: 6,
    width: 70,
  },
  itemAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemAvatarText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemMemberNameText: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    width: 60,
  },
  summaryContainer: {
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  summaryTitle: {
    fontSize: 13,
    fontFamily: Typography.uiBold,
    marginBottom: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryName: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 12,
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

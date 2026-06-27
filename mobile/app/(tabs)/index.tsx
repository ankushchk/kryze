import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  NativeModules,
  DeviceEventEmitter,
  FlatList,
  UIManager,
  LayoutAnimation,
  Animated
} from 'react-native';
import { useNavigation } from 'expo-router';
import {
  checkIfHasSMSPermission,
  requestReadSMSPermission,
  startReadSMS,
  stopReadSMS
} from '@maniac-tech/react-native-expo-read-sms';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';
import { isTransactionSms, parseTransactionSms } from '@/lib/smsParser';
import { Typography, Spacing } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '@/hooks/use-theme';
import {
  RefreshCw,
  Info,
  Check,
  X,
  ListFilter,
  TrendingDown,
  Calendar,
  Layers,
  ArrowRight,
  History
} from 'lucide-react-native';



type TransactionDraft = {
  id: string;
  sender: string;
  messageBody: string;
  merchant: string;
  amount: number;
  date: string;
  status: 'PENDING' | 'ADDED' | 'IGNORED';
  createdAt: string;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function SkeletonCard() {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.draftCard, { backgroundColor: theme.surface, opacity, marginBottom: 12, borderWidth: 1, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: theme.border }]} />
        <View style={styles.cardMeta}>
          <View style={{ width: 120, height: 14, backgroundColor: theme.border, borderRadius: 4, marginBottom: 6 }} />
          <View style={{ width: 80, height: 10, backgroundColor: theme.border, borderRadius: 4 }} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ width: 60, height: 16, backgroundColor: theme.border, borderRadius: 4, marginBottom: 6 }} />
          <View style={{ width: 45, height: 12, backgroundColor: theme.border, borderRadius: 4 }} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { user, signOut, session } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();

  // Data States
  const [dbTransactions, setDbTransactions] = useState<TransactionDraft[]>([]);
  const [localDrafts, setLocalDrafts] = useState<TransactionDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'ADDED' | 'IGNORED' | 'ALL'>('PENDING');

  // Computed combined drafts list
  const drafts = [...localDrafts, ...dbTransactions];

  // Toast Notification States
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'info' | 'success' | 'error'>('info');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setToastMessage(null);
    });
  };

  // Paste Raw SMS Input
  const [rawSmsInput, setRawSmsInput] = useState('');
  const [isPastingExpanded, setIsPastingExpanded] = useState(false);

  // Review & Edit Modal State
  const [selectedDraft, setSelectedDraft] = useState<TransactionDraft | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Fetch all transaction drafts from backend
  const fetchDrafts = async (showIndicator = true) => {
    if (!session) return;
    if (showIndicator) {
      setLoading(true);
      showToast('Refreshing transaction history...', 'info');
    }
    try {
      const response = await apiRequest('/api/drafts');
      if (response && response.drafts) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDbTransactions(response.drafts);

        if (showIndicator) {
          showToast('Transactions updated!', 'success');
        }

        // Silently scan local SMS to find unprocessed drafts matching these DB transactions
        if (Platform.OS === 'android') {
          triggerLocalSmsScan(response.drafts);
        }
      }
    } catch (err: any) {
      console.error('Error fetching drafts:', err);
      if (session) {
        showToast(err.message || 'Failed to load transactions', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Silent local SMS scan check to compute PENDING drafts on-device
  const triggerLocalSmsScan = async (dbTxList: TransactionDraft[]) => {
    try {
      const { RNExpoReadSms } = NativeModules;
      if (RNExpoReadSms && RNExpoReadSms.readSMSInbox) {
        RNExpoReadSms.readSMSInbox(
          500, // Check last 500 messages
          async (smsList: Array<{ sender: string; body: string; date: string }>) => {
            if (!smsList || smsList.length === 0) return;

            // Load last synced watermark
            let lastSyncedDate = 0;
            try {
              const stored = await SecureStore.getItemAsync('last_synced_sms_date');
              if (stored) {
                lastSyncedDate = parseInt(stored, 10);
              }
            } catch (e) {
              console.error('Failed to get last synced SMS date:', e);
            }

            // Create comparison key set from dbTransactions
            const existingKeys = new Set(
              dbTxList.map((t: any) => `${t.sender.trim()}_${t.messageBody.trim()}_${new Date(t.date).getTime()}`)
            );

            const computedDrafts: TransactionDraft[] = [];

            for (const item of smsList) {
              const msgDateVal = parseInt(item.date, 10);
              const msgDate = !isNaN(msgDateVal) ? new Date(msgDateVal) : new Date();

              // Skip if older than watermark
              if (!isNaN(msgDateVal) && msgDateVal <= lastSyncedDate) {
                continue;
              }

              if (isTransactionSms(item.body)) {
                const key = `${item.sender.trim()}_${item.body.trim()}_${msgDate.getTime()}`;
                
                // Skip if this SMS already has a matching finalized/ignored transaction in DB
                if (existingKeys.has(key)) {
                  continue;
                }

                const { merchant, amount } = parseTransactionSms(item.body);
                computedDrafts.push({
                  id: `local-scan-${item.date}-${Math.random()}`,
                  sender: item.sender.trim(),
                  messageBody: item.body.trim(),
                  merchant,
                  amount,
                  date: msgDate.toISOString() as any,
                  status: 'PENDING',
                  createdAt: msgDate.toISOString()
                });
              }
            }

            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLocalDrafts(computedDrafts);
          },
          (err: any) => {
            console.error('Silent SMS check failed:', err);
          }
        );
      }
    } catch (err) {
      console.error('Error in triggerLocalSmsScan:', err);
    }
  };

  useEffect(() => {
    if (!session) return;
    // Initial sync/load when component mounts
    const timer = setTimeout(() => {
      fetchDrafts();
    }, 0);

    // Sync/load whenever the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDrafts();
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation, session]);

  // Android background SMS listener
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!session) return;

    let isListenerActive = false;
    let eventSubscription: any = null;

    const setupAndroidSmsListener = async () => {
      try {
        let hasPermission = false;
        
        // Request permissions using standard React Native API
        if (Platform.OS === 'android') {
          const checkReceive = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
          const checkRead = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
          
          if (!checkReceive || !checkRead) {
            const status = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
              PermissionsAndroid.PERMISSIONS.READ_SMS,
            ]);
            hasPermission =
              status[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
              status[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
          } else {
            hasPermission = true;
          }
        }

        if (!hasPermission) {
          console.log('Android SMS permissions not granted via PermissionsAndroid. Trying fallback.');
          // Try library fallback as backup
          const libPermission = await checkIfHasSMSPermission();
          if (!libPermission || !libPermission.hasReceiveSmsPermission || !libPermission.hasReadSmsPermission) {
            await requestReadSMSPermission();
          }
        }

        // Re-check permission before starting
        const granted = await checkIfHasSMSPermission();
        if (!granted || !granted.hasReceiveSmsPermission || !granted.hasReadSmsPermission) {
          console.log('Android SMS read/receive permissions not granted.');
          return;
        }

        const { RNExpoReadSms } = NativeModules;
        if (RNExpoReadSms) {
          RNExpoReadSms.startReadSMS(
            (msg: string) => {
              console.log('Native RNExpoReadSms start success:', msg);
              isListenerActive = true;
            },
            (err: any) => {
              console.error('Native RNExpoReadSms start error:', err);
            }
          );

          // Register a direct global event listener to receive sms events reliably and parse locally
          eventSubscription = DeviceEventEmitter.addListener('received_sms', async (sms: string) => {
            console.log('received_sms event captured globally:', sms);
            if (!sms) return;

            // Parse library's array string format: "[sender, messageBody]"
            const match = sms.match(/^\[([^,]+),\s*(.*)\]$/);
            let sender = 'ANDROID_AUTO';
            let messageBody = sms;
            if (match) {
              sender = match[1].trim();
              messageBody = match[2].trim();
            }

            console.log('Extracted SMS details - Sender:', sender, 'Body:', messageBody);

            if (isTransactionSms(messageBody)) {
              const { merchant, amount } = parseTransactionSms(messageBody);
              const localDraft: TransactionDraft = {
                id: `local-received-${Date.now()}-${Math.random()}`,
                sender,
                messageBody,
                merchant,
                amount,
                date: new Date().toISOString(),
                status: 'PENDING',
                createdAt: new Date().toISOString()
              };


              setLocalDrafts(prev => {
                const exists = prev.some(d => d.sender === sender && d.messageBody === messageBody);
                if (exists) return prev;
                return [localDraft, ...prev];
              });
            }
          });
        }
      } catch (err) {
        console.error('Error starting Android SMS listener:', err);
      }
    };

    setupAndroidSmsListener();

    return () => {
      if (eventSubscription) {
        eventSubscription.remove();
      }
      if (isListenerActive) {
        try {
          stopReadSMS();
        } catch (err) {
          console.warn('Error stopping SMS listener:', err);
        }
      }
    };
  }, [session]);

  const syncPastTransactions = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Inbox syncing is only supported on Android devices.');
      return;
    }
    
    // Check/request SMS permission first
    let hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!hasPermission) {
      const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
      hasPermission = status === PermissionsAndroid.RESULTS.GRANTED;
    }
    
    if (!hasPermission) {
      Alert.alert('Permission Required', 'SMS permission is required to scan your inbox. Please grant permissions.');
      return;
    }

    setSyncingInbox(true);
    showToast('Scanning local SMS inbox...', 'info');
    try {
      // Use existing dbTransactions state for immediate matching to prevent network latency
      const dbTxList = dbTransactions;

      const { RNExpoReadSms } = NativeModules;
      if (RNExpoReadSms && RNExpoReadSms.readSMSInbox) {
        RNExpoReadSms.readSMSInbox(
          500, // Scan the last 500 inbox messages
          async (smsList: Array<{ sender: string; body: string; date: string }>) => {
            console.log('Inbox messages fetched for manual sync:', smsList?.length || 0);
            if (!smsList || smsList.length === 0) {
              showToast('No SMS messages found.', 'info');
              setSyncingInbox(false);
              return;
            }

            // Retrieve last synced watermark
            let lastSyncedDate = 0;
            try {
              const stored = await SecureStore.getItemAsync('last_synced_sms_date');
              if (stored) {
                lastSyncedDate = parseInt(stored, 10);
              }
            } catch (e) {
              console.error('Failed to get last synced SMS date:', e);
            }

            const existingKeys = new Set(
              dbTxList.map((t: any) => `${t.sender.trim()}_${t.messageBody.trim()}_${new Date(t.date).getTime()}`)
            );

            const computedDrafts: TransactionDraft[] = [];

            for (const item of smsList) {
              const msgDateVal = parseInt(item.date, 10);
              const msgDate = !isNaN(msgDateVal) ? new Date(msgDateVal) : new Date();

              if (isTransactionSms(item.body)) {
                const key = `${item.sender.trim()}_${item.body.trim()}_${msgDate.getTime()}`;
                
                // Skip if this SMS already exists as a finalized/ignored transaction in DB
                if (existingKeys.has(key)) {
                  continue;
                }

                // If not in DB, it is a local draft candidate
                const { merchant, amount } = parseTransactionSms(item.body);
                computedDrafts.push({
                  id: `local-scan-${item.date}-${Math.random()}`,
                  sender: item.sender.trim(),
                  messageBody: item.body.trim(),
                  merchant,
                  amount,
                  date: msgDate.toISOString() as any,
                  status: 'PENDING',
                  createdAt: msgDate.toISOString()
                });
              }
            }

            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLocalDrafts(computedDrafts);

            // Update watermark
            const maxDate = Math.max(...smsList.map(item => parseInt(item.date, 10) || 0));
            if (maxDate > lastSyncedDate) {
              await SecureStore.setItemAsync('last_synced_sms_date', String(maxDate));
            }

            showToast(`Found ${computedDrafts.length} unprocessed drafts!`, 'success');
            setSyncingInbox(false);
          },
          (err: any) => {
            console.error('Error reading SMS inbox:', err);
            showToast('Failed to read SMS inbox.', 'error');
            setSyncingInbox(false);
          }
        );
      } else {
        showToast('SMS scan not configured in this build.', 'error');
        setSyncingInbox(false);
      }
    } catch (err: any) {
      console.error('Inbox sync error:', err);
      showToast(err.message || 'Failed to start inbox scan.', 'error');
      setSyncingInbox(false);
    }
  };

  // Import single SMS locally
  const handleImportSmsText = async (textToImport: string) => {
    if (!textToImport.trim()) {
      showToast('Please paste an SMS text message', 'error');
      return;
    }

    const isTx = isTransactionSms(textToImport);
    if (!isTx) {
      showToast('Text does not look like a transaction SMS.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { merchant, amount } = parseTransactionSms(textToImport);
      const newLocalDraft: TransactionDraft = {
        id: `local-manual-${Date.now()}-${Math.random()}`,
        sender: 'MANUAL_IMPORT',
        messageBody: textToImport.trim(),
        merchant,
        amount,
        date: new Date().toISOString() as any,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLocalDrafts(prev => [newLocalDraft, ...prev]);
      setRawSmsInput('');
      setIsPastingExpanded(false);
      showToast('SMS imported successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not parse SMS', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update transaction status & details (Create or Patch)
  const handleUpdateDraft = async (status: 'ADDED' | 'IGNORED') => {
    if (!selectedDraft) return;
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    const draftToUpdate = { ...selectedDraft };
    const newMerchant = editMerchant.trim() || draftToUpdate.merchant;
    const isLocal = draftToUpdate.id.startsWith('local-');

    // 1. Immediately dismiss modal for instant UI feedback
    setShowReviewModal(false);
    setSelectedDraft(null);

    // 2. Backup states in case of rollback
    const backupDb = [...dbTransactions];
    const backupLocal = [...localDrafts];

    // 3. Optimistically update states with layout animation
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (isLocal) {
      setLocalDrafts(prev => prev.filter(d => d.id !== draftToUpdate.id));
      
      const optimisticTx: TransactionDraft = {
        ...draftToUpdate, 
        id: `optimistic-${Date.now()}`,
        merchant: newMerchant,
        amount: parsedAmount,
        status,
      };
      setDbTransactions(prev => [optimisticTx, ...prev]);
    } else {
      setDbTransactions(prev => 
        prev.map(d => d.id === draftToUpdate.id
          ? { ...d, status, merchant: newMerchant, amount: parsedAmount }
          : d
        )
      );
    }

    // Show toast for action instantly
    showToast(status === 'ADDED' ? 'Expense logged!' : 'Draft ignored', 'success');

    // 4. Fire API call in the background
    try {
      if (isLocal) {
        await apiRequest('/api/drafts', {
          method: 'POST',
          body: {
            sender: draftToUpdate.sender,
            messageBody: draftToUpdate.messageBody,
            merchant: newMerchant,
            amount: parsedAmount,
            date: draftToUpdate.date,
            status,
          },
        });
      } else {
        await apiRequest(`/api/drafts/${draftToUpdate.id}`, {
          method: 'PATCH',
          body: {
            status,
            merchant: newMerchant,
            amount: parsedAmount,
          },
        });
      }
      // Silently sync correct server state in background
      fetchDrafts(false);
    } catch (err: any) {
      console.error('Background update failed:', err);
      showToast('Could not sync with server. Reverting...', 'error');
      // Rollback to previous state with animation
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDbTransactions(backupDb);
      setLocalDrafts(backupLocal);
    }
  };

  // Open details review modal for a specific transaction draft
  const openReviewModal = (draft: TransactionDraft) => {
    setSelectedDraft(draft);
    setEditMerchant(draft.merchant);
    setEditAmount(draft.amount.toString());
    setShowReviewModal(true);
  };

  const handleTabPress = (tab: 'PENDING' | 'ADDED' | 'IGNORED' | 'ALL') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  };

  // Calculation stats from drafts
  const getStats = () => {
    const today = new Date();
    const todayStr = today.toDateString();
    
    let todaySpent = 0;
    let monthSpent = 0;

    drafts.forEach((draft) => {
      if (draft.status !== 'ADDED') return;
      
      const draftDate = new Date(draft.date);
      // Today spent
      if (draftDate.toDateString() === todayStr) {
        todaySpent += draft.amount;
      }
      // Month spent
      if (
        draftDate.getMonth() === today.getMonth() &&
        draftDate.getFullYear() === today.getFullYear()
      ) {
        monthSpent += draft.amount;
      }
    });

    return { todaySpent, monthSpent };
  };

  const { todaySpent, monthSpent } = getStats();

  // Filtered drafts list
  const filteredDrafts = drafts.filter((draft) => {
    if (activeTab === 'ALL') return true;
    return draft.status === activeTab;
  });

  const pendingCount = drafts.filter((d) => d.status === 'PENDING').length;



  return (
    <ThemedView style={styles.container}>
      {/* Dynamic Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.greetingText}>
            {(() => {
              const hr = new Date().getHours();
              if (hr < 12) return 'Good morning';
              if (hr < 17) return 'Good afternoon';
              return 'Good evening';
            })()}
            ,
          </ThemedText>
          <ThemedText type="subtitle" style={styles.userName}>
            {user?.name || 'Guest'} 👋
          </ThemedText>
        </View>
        <View style={styles.headerActions}>
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.surface2, marginRight: 8 }]}
              onPress={syncPastTransactions}
              disabled={syncingInbox}
            >
              {syncingInbox ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <History size={18} color={theme.primary} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.surface2 }]}
            onPress={() => {
              fetchDrafts(true);
            }}
          >
            <RefreshCw size={18} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: theme.border }]}
            onPress={signOut}
          >
            <ThemedText style={{ fontSize: 13, color: theme.primary, fontFamily: Typography.uiBold }}>
              Logout
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredDrafts}
        keyExtractor={(item) => item.id}
        renderItem={({ item: draft }) => {
          const isPending = draft.status === 'PENDING';
          const isAdded = draft.status === 'ADDED';
          return (
            <TouchableOpacity
              style={[styles.draftCard, { backgroundColor: theme.surface }]}
              onPress={() => openReviewModal(draft)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primaryDim }]}>
                  <ThemedText style={{ color: theme.primary, fontFamily: Typography.uiBold }}>
                    {draft.merchant.slice(0, 2).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.cardMeta}>
                  <ThemedText style={styles.merchantName}>{draft.merchant}</ThemedText>
                  <ThemedText style={[styles.draftDate, { color: theme.textSecondary }]}>
                    {new Date(draft.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText style={styles.amountText}>
                    ₹{draft.amount.toLocaleString('en-IN')}
                  </ThemedText>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          isPending
                            ? theme.primaryDim
                            : isAdded
                            ? theme.lentDim
                            : theme.inputBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color:
                            isPending
                              ? theme.primary
                              : isAdded
                              ? theme.lent
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {draft.status}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={
          <>
            {/* Statistics Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
                <View style={[styles.statIconContainer, { backgroundColor: theme.primaryDim }]}>
                  <TrendingDown size={18} color={theme.primary} />
                </View>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Today&apos;s Spent
                </ThemedText>
                <ThemedText style={[styles.statValue, { color: theme.text }]}>
                  ₹{todaySpent.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={[styles.statSubtitle, { color: theme.text3 }]}>
                  From added drafts
                </ThemedText>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
                <View style={[styles.statIconContainer, { backgroundColor: theme.lentDim }]}>
                  <Calendar size={18} color={theme.lent} />
                </View>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  This Month
                </ThemedText>
                <ThemedText style={[styles.statValue, { color: theme.text }]}>
                  ₹{monthSpent.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={[styles.statSubtitle, { color: theme.text3 }]}>
                  Active cycle
                </ThemedText>
              </View>
            </View>

            {/* Warning Alert Banner */}
            {pendingCount > 0 && (
              <TouchableOpacity
                style={[styles.pendingAlertBanner, { backgroundColor: theme.primaryDim }]}
                onPress={() => handleTabPress('PENDING')}
              >
                <View style={styles.alertContent}>
                  <View style={styles.alertCircle}>
                    <Info size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <ThemedText style={[styles.alertTitle, { color: theme.text }]}>
                      {pendingCount} Transaction{pendingCount > 1 ? 's' : ''} Pending
                    </ThemedText>
                    <ThemedText style={[styles.alertDesc, { color: theme.textSecondary }]}>
                      We found unprocessed SMS alerts. Review to split or log.
                    </ThemedText>
                  </View>
                  <ArrowRight size={16} color={theme.primary} />
                </View>
              </TouchableOpacity>
            )}

            {/* Expandable Manual Text Box */}
            <View style={[styles.expandableBox, { backgroundColor: theme.surface }]}>
              <TouchableOpacity
                style={styles.expandableHeader}
                onPress={() => setIsPastingExpanded(!isPastingExpanded)}
              >
                <Layers size={18} color={theme.primary} />
                <ThemedText style={styles.expandableTitle}>
                  Paste Real SMS Text
                </ThemedText>
                <ThemedText style={{ color: theme.primary, fontSize: 13, fontFamily: Typography.uiBold }}>
                  {isPastingExpanded ? 'Collapse' : 'Expand'}
                </ThemedText>
              </TouchableOpacity>

              {isPastingExpanded && (
                <View style={styles.expandableBody}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    placeholder="Paste transaction text here (e.g. Rs 500 debited from Acct...)"
                    placeholderTextColor={theme.text3}
                    multiline
                    numberOfLines={3}
                    value={rawSmsInput}
                    onChangeText={setRawSmsInput}
                  />
                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: theme.primary }]}
                    onPress={() => handleImportSmsText(rawSmsInput)}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>Parse & Import Draft</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Tabs filters */}
            <View style={styles.tabsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {(['PENDING', 'ADDED', 'IGNORED', 'ALL'] as const).map((tab) => {
                  const isActive = activeTab === tab;
                  const tabLabels = {
                    PENDING: `Unprocessed (${drafts.filter((d) => d.status === 'PENDING').length})`,
                    ADDED: 'Added',
                    IGNORED: 'Ignored',
                    ALL: 'All History',
                  };
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.tabItem,
                        isActive && { backgroundColor: theme.primary },
                      ]}
                      onPress={() => handleTabPress(tab)}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          { color: isActive ? '#FFF' : theme.textSecondary },
                        ]}
                      >
                        {tabLabels[tab]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {loading && drafts.length === 0 && (
              <View style={{ marginTop: 16 }}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          (!loading || drafts.length > 0) && filteredDrafts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ListFilter size={48} color={theme.text3} />
              <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
                No transactions found here
              </ThemedText>
              <ThemedText style={[styles.emptySub, { color: theme.text3 }]}>
                Copy a transaction SMS and return to check.
              </ThemedText>
            </View>
          ) : null
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Review & Add/Ignore Modal Details Sheet */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Review Transaction
              </ThemedText>
              <TouchableOpacity onPress={() => setShowReviewModal(false)} style={styles.closeBtn}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedDraft && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Raw Message Info bubble */}
                <View style={[styles.rawMsgContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                  <ThemedText style={[styles.rawMsgHeader, { color: theme.textSecondary }]}>
                    RAW SMS RECEIVED:
                  </ThemedText>
                  <ThemedText style={[styles.rawMsgText, { color: theme.text }]}>
                    &quot;{selectedDraft.messageBody}&quot;
                  </ThemedText>
                </View>

                {/* Edit Form */}
                <View style={styles.formGroup}>
                  <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    Merchant / Payee Name
                  </ThemedText>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    value={editMerchant}
                    onChangeText={setEditMerchant}
                    placeholder="E.g. Zomato, Spotify"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    Transaction Amount (₹)
                  </ThemedText>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                {/* Actions button */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.lent }]}
                    onPress={() => handleUpdateDraft('ADDED')}
                    disabled={loading}
                  >
                    <Check size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Add Expense</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.owe }]}
                    onPress={() => handleUpdateDraft('IGNORED')}
                    disabled={loading}
                  >
                    <X size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Ignore Draft</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </ThemedView>
        </View>
      </Modal>
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastOpacity,
              backgroundColor:
                toastType === 'success'
                  ? theme.lent
                  : toastType === 'error'
                  ? theme.owe
                  : theme.primary,
            },
          ]}
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999,
  },
  toastText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: Typography.uiBold,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  greetingText: {
    fontSize: 14,
    fontFamily: Typography.body,
    opacity: 0.8,
  },
  userName: {
    fontSize: 22,
    fontFamily: Typography.uiBold,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 80,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  statCard: {
    flex: 0.48,
    borderRadius: 16,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Typography.bodyMedium,
  },
  statValue: {
    fontSize: 22,
    fontFamily: Typography.uiBold,
    marginVertical: 4,
  },
  statSubtitle: {
    fontSize: 10,
    fontFamily: Typography.body,
  },
  pendingAlertBanner: {
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  alertDesc: {
    fontSize: 12,
    fontFamily: Typography.body,
    marginTop: 1,
  },
  clipboardBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  clipboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clipboardTitle: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  clipboardDesc: {
    fontSize: 13,
    fontFamily: Typography.body,
    marginBottom: 12,
  },
  clipboardActions: {
    flexDirection: 'row',
  },
  clipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  clipBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clipBtnCancel: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },
  clipBtnCancelText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  expandableBox: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandableTitle: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontFamily: Typography.uiBold,
  },
  expandableBody: {
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    fontFamily: Typography.body,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  submitButton: {
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  guideText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  stepBox: {
    marginBottom: 10,
  },
  stepTitle: {
    fontSize: 11,
    fontFamily: Typography.uiBold,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stepDetail: {
    fontSize: 12,
    opacity: 0.8,
  },
  codeBlock: {
    backgroundColor: '#0000000d',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  codeText: {
    fontFamily: Typography.mono,
    fontSize: 10,
    color: '#333',
  },
  tokenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
    marginTop: 4,
  },
  tokenInput: {
    flex: 1,
    fontFamily: Typography.mono,
    fontSize: 11,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.three,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#00000008',
  },
  tabText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Typography.uiBold,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
  },
  draftCard: {
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMeta: {
    flex: 1,
    marginLeft: 12,
  },
  merchantName: {
    fontSize: 15,
    fontFamily: Typography.uiBold,
  },
  draftDate: {
    fontSize: 11,
    fontFamily: Typography.body,
    marginTop: 2,
  },
  amountText: {
    fontSize: 16,
    fontFamily: Typography.uiBold,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
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
  rawMsgContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  rawMsgHeader: {
    fontSize: 10,
    fontFamily: Typography.uiBold,
    marginBottom: 4,
  },
  rawMsgText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  actionBtn: {
    flex: 0.48,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

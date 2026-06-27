import { useState, useEffect, useRef } from 'react';
import {
  Platform,
  PermissionsAndroid,
  NativeModules,
  DeviceEventEmitter,
  LayoutAnimation,
  Animated,
  Alert
} from 'react-native';
import { useNavigation } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';
import { isTransactionSms, parseTransactionSms } from '@/lib/smsParser';
import * as SecureStore from 'expo-secure-store';

export type TransactionDraft = {
  id: string;
  sender: string;
  messageBody: string;
  merchant: string;
  amount: number;
  date: string;
  status: 'PENDING' | 'ADDED' | 'IGNORED';
  createdAt: string;
};

export function useHomeScreen() {
  const { user, signOut, session } = useAuth();
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

  // Paste Raw SMS Input
  const [rawSmsInput, setRawSmsInput] = useState('');
  const [isPastingExpanded, setIsPastingExpanded] = useState(false);

  // Review & Edit Modal State
  const [selectedDraft, setSelectedDraft] = useState<TransactionDraft | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

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
      const { NativeModules: modules } = require('react-native');
      const { RNExpoReadSms } = modules;
      if (RNExpoReadSms && RNExpoReadSms.readSMSInbox) {
        RNExpoReadSms.readSMSInbox(
          500, // Check last 500 messages
          async (smsList: Array<{ sender: string; body: string; date: string }>) => {
            if (!smsList || smsList.length === 0) return;

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

              if (!isNaN(msgDateVal) && msgDateVal <= lastSyncedDate) {
                continue;
              }

              if (isTransactionSms(item.body)) {
                const key = `${item.sender.trim()}_${item.body.trim()}_${msgDate.getTime()}`;
                
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
    const timer = setTimeout(() => {
      fetchDrafts();
    }, 0);

    const unsubscribe = navigation.addListener('focus', () => {
      fetchDrafts();
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation, session]);

  // Android background SMS listener setup
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!session) return;

    let isListenerActive = false;
    let eventSubscription: any = null;

    const setupAndroidSmsListener = async () => {
      try {
        const { checkIfHasSMSPermission, requestReadSMSPermission, startReadSMS, stopReadSMS } = require('@maniac-tech/react-native-expo-read-sms');
        let hasPermission = false;
        
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

        if (!hasPermission) {
          const libPermission = await checkIfHasSMSPermission();
          if (!libPermission || !libPermission.hasReceiveSmsPermission || !libPermission.hasReadSmsPermission) {
            await requestReadSMSPermission();
          }
        }

        const granted = await checkIfHasSMSPermission();
        if (!granted || !granted.hasReceiveSmsPermission || !granted.hasReadSmsPermission) {
          return;
        }

        const { NativeModules: modules } = require('react-native');
        const { RNExpoReadSms } = modules;
        if (RNExpoReadSms) {
          RNExpoReadSms.startReadSMS(
            (msg: string) => {
              isListenerActive = true;
            },
            (err: any) => {
              console.error('Native RNExpoReadSms start error:', err);
            }
          );

          eventSubscription = DeviceEventEmitter.addListener('received_sms', async (sms: string) => {
            if (!sms) return;

            const match = sms.match(/^\[([^,]+),\s*(.*)\]$/);
            let sender = 'ANDROID_AUTO';
            let messageBody = sms;
            if (match) {
              sender = match[1].trim();
              messageBody = match[2].trim();
            }

            if (isTransactionSms(messageBody)) {
              const { merchant, amount } = parseTransactionSms(messageBody);
              const localDraft: TransactionDraft = {
                id: `local-received-${Date.now()}-${Math.random()}`,
                sender,
                messageBody,
                merchant,
                amount,
                date: new Date().toISOString() as any,
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
          const { stopReadSMS } = require('@maniac-tech/react-native-expo-read-sms');
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
      const dbTxList = dbTransactions;
      const { NativeModules: modules } = require('react-native');
      const { RNExpoReadSms } = modules;
      if (RNExpoReadSms && RNExpoReadSms.readSMSInbox) {
        RNExpoReadSms.readSMSInbox(
          500,
          async (smsList: Array<{ sender: string; body: string; date: string }>) => {
            if (!smsList || smsList.length === 0) {
              showToast('No SMS messages found.', 'info');
              setSyncingInbox(false);
              return;
            }

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

    setShowReviewModal(false);
    setSelectedDraft(null);

    const backupDb = [...dbTransactions];
    const backupLocal = [...localDrafts];

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

    showToast(status === 'ADDED' ? 'Expense logged!' : 'Draft ignored', 'success');

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
      fetchDrafts(false);
    } catch (err: any) {
      console.error('Background update failed:', err);
      showToast('Could not sync with server. Reverting...', 'error');
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDbTransactions(backupDb);
      setLocalDrafts(backupLocal);
    }
  };

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

  const getStats = () => {
    const today = new Date();
    let todaySpent = 0;
    let monthSpent = 0;

    drafts.forEach((draft) => {
      if (draft.status !== 'ADDED') return;
      
      const draftDate = new Date(draft.date);
      if (draftDate.toDateString() === today.toDateString()) {
        todaySpent += draft.amount;
      }
      
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
  const pendingCount = drafts.filter((d) => d.status === 'PENDING').length;
  
  const filteredDrafts = drafts.filter((draft) => {
    if (activeTab === 'ALL') return true;
    return draft.status === activeTab;
  });

  return {
    user,
    signOut,
    drafts,
    loading,
    syncingInbox,
    activeTab,
    toastMessage,
    toastType,
    toastOpacity,
    rawSmsInput,
    setRawSmsInput,
    isPastingExpanded,
    setIsPastingExpanded,
    selectedDraft,
    editMerchant,
    setEditMerchant,
    editAmount,
    setEditAmount,
    showReviewModal,
    setShowReviewModal,
    fetchDrafts,
    syncPastTransactions,
    handleImportSmsText,
    handleUpdateDraft,
    openReviewModal,
    handleTabPress,
    todaySpent,
    monthSpent,
    pendingCount,
    filteredDrafts
  };
}

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  FlatList,
  Modal,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Alert,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

import {
  TrendingDown,
  RefreshCw,
  ListFilter,
  Check,
  X,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  History,
  User,
  Users,
  MessageCircle,
  Coins as CoinsIcon,
  Mic,
  Square,
  Sparkles,
  AudioLines,
  ArrowUpRight
} from 'lucide-react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useHomeScreen, TransactionDraft } from '@/hooks/useHomeScreen';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { styles } from '@/styles/index.styles';
import { fetchCoinBalance } from '@/lib/coins';
import {
  fetchWhatsAppLinkStatus,
  sendWhatsAppCode,
  linkWhatsApp,
  unlinkWhatsApp,
} from '@/lib/whatsapp';
import { apiRequest, apiUpload } from '@/lib/api';
import { CallReminder, cancelCallReminder, fetchCallReminders, scheduleCallReminder } from '@/lib/callReminders';

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

type VoiceResult = {
  transcript: string;
  interpretation: {
    intent: 'expense_draft' | 'group_proposal' | 'question';
    merchant: string | null;
    amount: number | null;
    category: string | null;
    date: string | null;
    groupId: string | null;
    splitHint: string | null;
    groupName: string | null;
    memberNames: string[];
    reply: string;
  };
};

export default function HomeScreen() {
  const theme = useTheme();
  const {
    user,
    signOut,
    updateProfile,
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
    filteredDrafts,
    groups,
    selectedGroupId,
    setSelectedGroupId
  } = useHomeScreen();

  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [profileName, setProfileName] = React.useState(user?.name || '');
  const [profileEmail, setProfileEmail] = React.useState(user?.email || '');
  const [profileUpi, setProfileUpi] = React.useState(user?.upiId || '');
  const [submittingProfile, setSubmittingProfile] = React.useState(false);
  const [totalCoins, setTotalCoins] = React.useState<number | null>(null);
  const [whatsappStatus, setWhatsappStatus] = React.useState<{ linked: boolean; phone: string | null }>({
    linked: false,
    phone: null,
  });
  const [whatsappPhone, setWhatsappPhone] = React.useState('');
  const [whatsappCode, setWhatsappCode] = React.useState('');
  const [waLoading, setWaLoading] = React.useState(false);
  const [waCodeSent, setWaCodeSent] = React.useState(false);
  const [waWorking, setWaWorking] = React.useState(false);
  const [callReminders, setCallReminders] = React.useState<CallReminder[]>([]);
  const [callsEnabled, setCallsEnabled] = React.useState(false);
  const [callReminderMessage, setCallReminderMessage] = React.useState('');
  const [callReminderTime, setCallReminderTime] = React.useState<'hour' | 'tomorrowMorning' | 'tomorrowEvening'>('tomorrowMorning');
  const [callConsent, setCallConsent] = React.useState(false);
  const [callReminderWorking, setCallReminderWorking] = React.useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [voiceBusy, setVoiceBusy] = React.useState(false);
  const [voiceResult, setVoiceResult] = React.useState<VoiceResult | null>(null);
  const [voiceDraftSaved, setVoiceDraftSaved] = React.useState(false);
  const [voiceSavedDestination, setVoiceSavedDestination] = React.useState<string | null>(null);
  const [voiceClarification, setVoiceClarification] = React.useState<string | null>(null);
  const voicePulse = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    voicePulse.stopAnimation();
    if (!recorderState.isRecording) {
      voicePulse.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulse, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(voicePulse, { toValue: 0, duration: 760, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [recorderState.isRecording, voicePulse]);

  const handleOpenProfile = () => {
    setShowProfileModal(true);
    fetchCoinBalance()
      .then((res) => setTotalCoins(res.totalCollected ?? 0))
      .catch((err) => {
        console.warn('Failed to load total coins collected', err);
        setTotalCoins(0);
      });
    setWaLoading(true);
    fetchWhatsAppLinkStatus()
      .then((res) => {
        setWhatsappStatus({ linked: res.linked, phone: res.phone });
        if (res.phone) setWhatsappPhone(res.phone);
      })
      .catch((err) => {
        console.warn('Failed to load WhatsApp link status', err);
      })
      .finally(() => setWaLoading(false));
    fetchCallReminders()
      .then((res) => {
        setCallReminders(res.reminders);
        setCallsEnabled(res.callsEnabled);
      })
      .catch((err) => console.warn('Failed to load call reminders', err));
  };

  const getCallReminderDate = () => {
    const due = new Date();
    if (callReminderTime === 'hour') {
      due.setHours(due.getHours() + 1);
      return due;
    }
    due.setDate(due.getDate() + 1);
    due.setHours(callReminderTime === 'tomorrowMorning' ? 9 : 19, 0, 0, 0);
    return due;
  };

  const handleScheduleCallReminder = async () => {
    if (!callReminderMessage.trim()) {
      Alert.alert('Add a reminder', 'Tell Kryze what you would like the call to remind you about.');
      return;
    }
    if (!callConsent) {
      Alert.alert('Confirm call permission', 'Please confirm that Kryze may call your verified phone number.');
      return;
    }
    setCallReminderWorking(true);
    try {
      const dueAt = getCallReminderDate();
      const result = await scheduleCallReminder({ message: callReminderMessage.trim(), scheduledFor: dueAt, callConsent: true });
      setCallReminders((current) => [...current, result.reminder].sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()));
      setCallReminderMessage('');
      setCallConsent(false);
      Alert.alert('Call reminder scheduled', `Kryze will call your verified number ${dueAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`);
    } catch (error: any) {
      Alert.alert('Could not schedule call', error.message || 'Please try again.');
    } finally {
      setCallReminderWorking(false);
    }
  };

  const handleCancelCallReminder = async (id: string) => {
    setCallReminderWorking(true);
    try {
      await cancelCallReminder(id);
      setCallReminders((current) => current.map((reminder) => reminder.id === id ? { ...reminder, status: 'CANCELLED' } : reminder));
    } catch (error: any) {
      Alert.alert('Could not cancel call', error.message || 'Please try again.');
    } finally {
      setCallReminderWorking(false);
    }
  };

  React.useEffect(() => {
    if (showProfileModal && user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfileUpi(user.upiId || '');
    }
  }, [showProfileModal, user]);

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    setSubmittingProfile(true);
    const { error } = await updateProfile(
      profileName.trim(),
      profileEmail.trim() || undefined,
      profileUpi.trim() || undefined
    );
    setSubmittingProfile(false);
    if (error) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } else {
      setShowProfileModal(false);
      Alert.alert('Success', 'Profile updated successfully');
    }
  };

  const handleSendWaCode = async () => {
    if (!whatsappPhone.trim()) {
      Alert.alert('Error', 'Enter your WhatsApp number first');
      return;
    }
    setWaWorking(true);
    try {
      await sendWhatsAppCode(whatsappPhone.trim());
      setWaCodeSent(true);
      Alert.alert('Code sent', 'Check WhatsApp for your 6-digit verification code.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send the code');
    } finally {
      setWaWorking(false);
    }
  };

  const handleLinkWhatsApp = async () => {
    if (!whatsappCode.trim()) {
      Alert.alert('Error', 'Enter the 6-digit code from WhatsApp');
      return;
    }
    setWaWorking(true);
    try {
      await linkWhatsApp(whatsappPhone.trim(), whatsappCode.trim());
      setWhatsappStatus({ linked: true, phone: whatsappPhone.trim() });
      setWaCodeSent(false);
      setWhatsappCode('');
      Alert.alert('Success!', 'Your WhatsApp is now linked to Splitx.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not link WhatsApp');
    } finally {
      setWaWorking(false);
    }
  };

  const handleUnlinkWhatsApp = async () => {
    setWaWorking(true);
    try {
      await unlinkWhatsApp();
      setWhatsappStatus({ linked: false, phone: null });
      Alert.alert('Unlinked', 'Your WhatsApp is no longer connected.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not unlink WhatsApp');
    } finally {
      setWaWorking(false);
    }
  };

  const startVoiceCapture = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to tell Kryze about an expense.');
        return;
      }
      // Preserve the first note while the user gives Kryze its one permitted
      // follow-up detail (usually just the amount).
      if (!voiceClarification) {
        setVoiceResult(null);
        setVoiceDraftSaved(false);
        setVoiceSavedDestination(null);
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error: any) {
      Alert.alert('Could not start recording', error.message || 'Please try again.');
    }
  };

  const stopAndInterpretVoice = async () => {
    try {
      setVoiceBusy(true);
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording was empty. Try speaking for a moment before stopping.');

      const formData = new FormData();
      // Expo's fetch accepts File (a Blob implementation), not React Native's
      // legacy { uri, name, type } FormData object.
      formData.append('audio', new File(uri));
      if (voiceClarification) {
        formData.append('previousTranscript', voiceClarification);
        formData.append('followUpAttempted', 'true');
      }
      const result = await apiUpload('/api/voice/interpret', formData) as VoiceResult;
      setVoiceResult(result);
      setVoiceDraftSaved(false);
      setVoiceSavedDestination(null);

      if (result.interpretation.intent === 'question') {
        // Keep enough context for a concise answer such as “five hundred” to
        // complete the original note. A second incomplete reply clears this
        // context, so Kryze cannot trap the user in a question loop.
        setVoiceClarification((current) => current ? null : result.transcript);
      } else {
        setVoiceClarification(null);
      }

      const canRunVoiceAction =
        (result.interpretation.intent === 'expense_draft' && result.interpretation.amount !== null) ||
        (result.interpretation.intent === 'group_proposal' && result.interpretation.groupName);
      if (canRunVoiceAction) {
        try {
          const destination = await persistVoiceAction(result);
          setVoiceDraftSaved(true);
          setVoiceSavedDestination(destination);
        } catch (saveError: any) {
          Alert.alert('Voice captured', saveError.message || 'Kryze understood you, but could not complete the group action. Tap Retry to try again.');
        }
      }
    } catch (error: any) {
      Alert.alert('Kryze missed that', error.message || 'Could not understand the voice note.');
    } finally {
      setVoiceBusy(false);
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  };

  const splitEqually = (memberIds: string[], amount: number) => {
    const share = Math.round((amount / memberIds.length) * 100) / 100;
    return memberIds.map((userId, index) => ({
      userId,
      amount: index === memberIds.length - 1 ? Math.round((amount - share * index) * 100) / 100 : share,
    }));
  };

  const createVoiceGroup = async (name: string, memberNames: string[]) => {
    const response = await apiRequest('/api/groups', {
      method: 'POST',
      body: {
        name,
        description: 'Created by Kryze Voice',
        memberIdentifiers: memberNames,
        icon: '🎙️',
      },
    });
    if (!response?.group?.id) throw new Error('Kryze could not create the shared group.');
    return response.group as { id: string; name: string; addedMembers: Array<{ id: string }> };
  };

  const addVoiceExpenseToGroup = async (groupId: string, groupName: string, memberIds: string[], result: VoiceResult) => {
    const proposal = result.interpretation;
    if (proposal.amount === null || !user?.id) throw new Error('The voice note did not contain a complete expense.');
    const participants = Array.from(new Set([user.id, ...memberIds]));
    await apiRequest(`/api/groups/${groupId}/expenses`, {
      method: 'POST',
      body: {
        description: proposal.merchant || 'Voice expense',
        amount: proposal.amount,
        date: proposal.date || new Date().toISOString(),
        category: proposal.category || undefined,
        paidById: user.id,
        splits: splitEqually(participants, proposal.amount),
      },
    });
    return `Split in ${groupName}`;
  };

  const persistVoiceAction = async (result: VoiceResult): Promise<string> => {
    const proposal = result.interpretation;

    if (proposal.intent === 'group_proposal') {
      if (!proposal.groupName) throw new Error('Kryze needs a name for the new group.');
      const group = await createVoiceGroup(proposal.groupName, proposal.memberNames);
      return `Created ${group.name}`;
    }

    if (proposal.amount === null || !user?.id) throw new Error('The voice note did not contain a complete expense.');

    if (proposal.groupId) {
      const group = groups.find((item: any) => item.id === proposal.groupId);
      if (group) {
        return addVoiceExpenseToGroup(
          group.id,
          group.name,
          (group.members || []).map((member: any) => member.id),
          result,
        );
      }
    }

    if (proposal.groupName) {
      const group = await createVoiceGroup(proposal.groupName, proposal.memberNames);
      return addVoiceExpenseToGroup(group.id, group.name, group.addedMembers.map((member) => member.id), result);
    }

    await apiRequest('/api/drafts', {
      method: 'POST',
      body: {
        sender: 'Kryze Voice',
        messageBody: result.transcript,
        merchant: proposal.merchant || 'Voice expense',
        amount: proposal.amount,
        date: proposal.date || new Date().toISOString(),
        // Voice is intentionally hands-free: clear notes land directly in the
        // personal ledger rather than waiting in the review inbox.
        status: 'ADDED',
      },
    });
    fetchDrafts(false);
    return 'Logged to personal spending';
  };

  const saveVoiceDraft = async () => {
    if (!voiceResult) return;
    try {
      setVoiceBusy(true);
      const destination = await persistVoiceAction(voiceResult);
      setVoiceDraftSaved(true);
      setVoiceSavedDestination(destination);
      Alert.alert('Done', destination);
    } catch (error: any) {
      Alert.alert('Could not save draft', error.message || 'Please try again.');
    } finally {
      setVoiceBusy(false);
    }
  };

  const recordingSeconds = Math.floor(recorderState.durationMillis / 1000);
  const recordingClock = `${Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;
  const voiceStatus = voiceBusy
    ? 'Kryze is understanding you'
    : recorderState.isRecording
      ? `Listening live · ${recordingClock}`
      : voiceClarification
        ? 'One quick detail needed'
      : 'Ready to listen';
  const voicePulseScale = voicePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const voicePulseOpacity = voicePulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

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
            style={[styles.headerBtn, { backgroundColor: theme.surface2, marginRight: 8 }]}
            onPress={handleOpenProfile}
          >
            <User size={18} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.surface2, marginRight: 8 }]}
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
                  <ThemedText numberOfLines={1} style={{ color: theme.text3, fontSize: 11, marginTop: 3 }}>
                    {draft.sender} · {draft.messageBody}
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
            {/* Voice-first hero: Kryze opens with a moment, not a spreadsheet. */}
            <View style={{ marginBottom: 18, borderRadius: 28, overflow: 'hidden', backgroundColor: '#18273B', padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Sparkles size={15} color="#F7C873" />
                  <Text style={{ color: '#F7C873', marginLeft: 7, fontSize: 12, letterSpacing: 1.2, fontFamily: Typography.uiBold }}>
                    KRYZE VOICE
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#22364D', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }}>
                  {recorderState.isRecording && (
                    <Animated.View style={{ position: 'absolute', left: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E97062', opacity: voicePulseOpacity, transform: [{ scale: voicePulseScale }] }} />
                  )}
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: voiceBusy || recorderState.isRecording ? '#E97062' : '#75D6A3' }} />
                  <Text style={{ color: '#D7E2EC', marginLeft: 6, fontSize: 11, fontFamily: Typography.uiBold }}>{voiceStatus}</Text>
                </View>
              </View>

              <TouchableOpacity
                disabled={voiceBusy}
                onPress={recorderState.isRecording ? stopAndInterpretVoice : startVoiceCapture}
                activeOpacity={0.84}
                style={{ marginTop: 18, minHeight: 94, borderRadius: 22, backgroundColor: recorderState.isRecording ? '#C95449' : '#F7C873', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: voiceBusy ? 0.72 : 1 }}
              >
                {voiceBusy ? (
                  <>
                    <ActivityIndicator color="#18273B" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ color: '#18273B', fontFamily: Typography.uiBold, fontSize: 16 }}>Turning it into a draft</Text>
                      <Text style={{ color: '#31475E', marginTop: 3, fontSize: 12, fontFamily: Typography.ui }}>Just a moment</Text>
                    </View>
                  </>
                ) : recorderState.isRecording ? (
                  <>
                    <Animated.View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#E97062', alignItems: 'center', justifyContent: 'center', transform: [{ scale: voicePulseScale }] }}>
                      <Square size={18} fill="#FFFFFF" color="#FFFFFF" />
                    </Animated.View>
                    <View style={{ marginLeft: 13, flex: 1 }}>
                      <Text style={{ color: '#FFFFFF', fontFamily: Typography.uiBold, fontSize: 17 }}>I’m listening</Text>
                      <Text style={{ color: '#FFE0DB', marginTop: 3, fontSize: 12, fontFamily: Typography.ui }}>Tap anywhere here to finish</Text>
                    </View>
                    <AudioLines size={22} color="#FFE0DB" />
                  </>
                ) : (
                  <>
                    <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#18273B', alignItems: 'center', justifyContent: 'center' }}>
                      <Mic size={23} color="#F7C873" />
                    </View>
                    <View style={{ marginLeft: 13, flex: 1 }}>
                      <Text style={{ color: '#18273B', fontFamily: Typography.uiBold, fontSize: 17 }}>{voiceClarification ? 'Say the amount' : 'Tap to speak'}</Text>
                      <Text style={{ color: '#31475E', marginTop: 3, fontSize: 12, fontFamily: Typography.ui }}>{voiceClarification ? 'One answer and I’ll log it' : 'Say an expense in your own words'}</Text>
                    </View>
                    <ArrowUpRight size={21} color="#18273B" />
                  </>
                )}
              </TouchableOpacity>
              <Text style={{ color: '#8EA2B6', marginTop: 10, textAlign: 'center', fontSize: 11, fontFamily: Typography.ui }}>
                {recorderState.isRecording
                  ? 'Kryze will stop when you tap the card.'
                  : voiceClarification
                    ? 'Kryze asks only once when the amount is missing.'
                    : 'Clear expenses are logged automatically.'}
              </Text>
            </View>

            {voiceResult && (
              <View style={{ marginBottom: 18, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.primary, backgroundColor: theme.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.primary, fontFamily: Typography.uiBold }}>KRYZE HEARD</Text>
                  <Sparkles size={16} color={theme.primary} />
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>“{voiceResult.transcript}”</Text>
                <Text style={{ color: theme.text, fontSize: 16, lineHeight: 23, marginTop: 12, fontFamily: Typography.uiBold }}>{voiceResult.interpretation.reply}</Text>
                {((voiceResult.interpretation.intent === 'expense_draft' && voiceResult.interpretation.amount !== null) ||
                  (voiceResult.interpretation.intent === 'group_proposal' && voiceResult.interpretation.groupName)) && (voiceDraftSaved ? (
                  <View style={{ marginTop: 14, backgroundColor: theme.primaryDim, borderRadius: 14, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                    <Check size={17} color={theme.primary} />
                    <Text style={{ color: theme.primary, marginLeft: 8, fontFamily: Typography.uiBold }}>{voiceSavedDestination || 'Kryze completed it'}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={saveVoiceDraft} disabled={voiceBusy} style={{ marginTop: 14, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                    <Text style={{ color: '#FFF', fontFamily: Typography.uiBold }}>Retry Kryze action</Text>
                    <ArrowUpRight size={16} color="#FFF" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

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

      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
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
                  Review Transaction
                </ThemedText>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setShowReviewModal(false)}
                >
                  <X size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {selectedDraft && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[styles.rawMsgContainer, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                    <Text style={[styles.rawMsgHeader, { color: theme.primary }]}>
                      SMS SENDER: {selectedDraft.sender}
                    </Text>
                    <Text style={[styles.rawMsgText, { color: theme.textSecondary }]}>
                      &ldquo;{selectedDraft.messageBody}&rdquo;
                    </Text>
                  </View>

                  {/* Form fields */}
                  <View style={styles.formGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Log To / Split In</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChipsContainer}>
                      <TouchableOpacity
                        style={[
                          styles.groupChip,
                          { borderColor: theme.border },
                          selectedGroupId === 'personal' && { backgroundColor: theme.primaryDim, borderColor: theme.primary }
                        ]}
                        onPress={() => setSelectedGroupId('personal')}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <User size={13} color={selectedGroupId === 'personal' ? theme.primary : theme.textSecondary} style={{ marginRight: 6 }} />
                          <Text style={[styles.groupChipText, { color: selectedGroupId === 'personal' ? theme.primary : theme.text }]}>
                            Personal
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {groups.map((g) => (
                        <TouchableOpacity
                          key={g.id}
                          style={[
                            styles.groupChip,
                            { borderColor: theme.border },
                            selectedGroupId === g.id && { backgroundColor: theme.primaryDim, borderColor: theme.primary }
                          ]}
                          onPress={() => setSelectedGroupId(g.id)}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Users size={13} color={selectedGroupId === g.id ? theme.primary : theme.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={[styles.groupChipText, { color: selectedGroupId === g.id ? theme.primary : theme.text }]}>
                              {g.name}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Merchant Name</Text>
                    <TextInput
                      style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                      value={editMerchant}
                      onChangeText={setEditMerchant}
                      placeholder="e.g. Zomato, Gas Fuel"
                      placeholderTextColor={theme.text3}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Amount (INR)</Text>
                    <TextInput
                      style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="numeric"
                      placeholder="e.g. 500"
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  </Modal>
      {/* Profile Settings Modal */}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProfileModal(false)}
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
                  Profile Settings
                </ThemedText>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setShowProfileModal(false)}
                >
                  <X size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.coinsCard, { backgroundColor: theme.primaryDim, borderColor: theme.border }]}>
                  <View style={[styles.coinsIconWrap, { backgroundColor: theme.surface }]}>
                    <CoinsIcon size={22} color={theme.primary} />
                  </View>
                  <View style={styles.coinsCopy}>
                    <Text style={[styles.coinsLabel, { color: theme.textSecondary }]}>
                      Total coins collected
                    </Text>
                    <View style={styles.coinsValueRow}>
                      {totalCoins == null ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <>
                          <Text style={[styles.coinsValue, { color: theme.primary }]}>{totalCoins}</Text>
                          <Text style={[styles.coinsUnit, { color: theme.textSecondary }]}>coins</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>

                {/* WhatsApp Bot */}
                <View style={[styles.waCard, { backgroundColor: theme.primaryDim, borderColor: theme.border }]}>
                  <View style={[styles.waIconWrap, { backgroundColor: theme.surface }]}>
                    {waLoading ? (
                      <ActivityIndicator size="small" color="#25D366" />
                    ) : (
                      <MessageCircle size={22} color="#25D366" />
                    )}
                  </View>
                  <View style={styles.waCopy}>
                    <Text style={[styles.waLabel, { color: theme.textSecondary }]}>WhatsApp Bot</Text>
                    <Text style={[styles.waStatus, { color: whatsappStatus.linked ? '#25D366' : theme.text }]}>
                      {waLoading
                        ? 'Checking…'
                        : whatsappStatus.linked
                        ? `Linked • ${whatsappStatus.phone}`
                        : 'Not linked — send receipts & get splits on WhatsApp'}
                    </Text>
                  </View>
                  {!waLoading && whatsappStatus.linked && (
                    <TouchableOpacity
                      style={[styles.waMiniBtn, { borderColor: theme.border }]}
                      onPress={handleUnlinkWhatsApp}
                      disabled={waWorking}
                    >
                      <Text style={[styles.waMiniBtnText, { color: theme.primary }]}>
                        {waWorking ? '…' : 'Unlink'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!whatsappStatus.linked && !waCodeSent && !waLoading && (
                  <View style={styles.waForm}>
                    <TextInput
                      style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                      value={whatsappPhone}
                      onChangeText={setWhatsappPhone}
                      placeholder="WhatsApp number (+91 XXXXX XXXXX)"
                      placeholderTextColor={theme.text3}
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={[styles.waActionBtn, { backgroundColor: '#25D366' }]}
                      onPress={handleSendWaCode}
                      disabled={waWorking}
                    >
                      <Text style={styles.waActionBtnText}>{waWorking ? 'Sending…' : 'Send code on WhatsApp'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!whatsappStatus.linked && waCodeSent && !waLoading && (
                  <View style={styles.waLinkRow}>
                    <TextInput
                      style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                      value={whatsappCode}
                      onChangeText={setWhatsappCode}
                      placeholder="Enter 6-digit code"
                      placeholderTextColor={theme.text3}
                      keyboardType="number-pad"
                    />
                    <View style={styles.waBtnRow}>
                      <TouchableOpacity
                        style={[styles.waActionBtn, { backgroundColor: '#25D366', flex: 1 }]}
                        onPress={handleLinkWhatsApp}
                        disabled={waWorking}
                      >
                        <Text style={styles.waActionBtnText}>{waWorking ? 'Linking…' : 'Link WhatsApp'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.waActionBtn, { backgroundColor: theme.border, flex: 1, marginLeft: 8 }]}
                        onPress={() => {
                          setWaCodeSent(false);
                          setWhatsappCode('');
                        }}
                        disabled={waWorking}
                      >
                        <Text style={[styles.waActionBtnText, { color: theme.text }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={{ marginTop: 18, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primaryDim, alignItems: 'center', justifyContent: 'center' }}>
                        <AudioLines size={18} color={theme.primary} />
                      </View>
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ color: theme.text, fontFamily: Typography.uiBold }}>Kryze call reminders</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                          {callsEnabled ? 'Opt in to a personal voice reminder.' : 'Coming soon — the calling service is being set up.'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: callsEnabled ? theme.lent : theme.text3 }} />
                  </View>

                  {callsEnabled && (
                    <>
                      <TextInput
                        style={[styles.formInput, { marginTop: 14, color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                        value={callReminderMessage}
                        onChangeText={setCallReminderMessage}
                        placeholder="e.g. Review the Goa Trip balance"
                        placeholderTextColor={theme.text3}
                        maxLength={500}
                      />
                      <View style={{ flexDirection: 'row', marginTop: 10 }}>
                        {([
                          ['hour', 'In 1 hour'],
                          ['tomorrowMorning', 'Tomorrow 9 AM'],
                          ['tomorrowEvening', 'Tomorrow 7 PM'],
                        ] as const).map(([value, label]) => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => setCallReminderTime(value)}
                            style={{ flex: 1, marginRight: value === 'tomorrowEvening' ? 0 : 6, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', backgroundColor: callReminderTime === value ? theme.primaryDim : theme.surface, borderWidth: 1, borderColor: callReminderTime === value ? theme.primary : theme.border }}
                          >
                            <Text style={{ color: callReminderTime === value ? theme.primary : theme.textSecondary, fontSize: 10, textAlign: 'center', fontFamily: Typography.uiBold }}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity onPress={() => setCallConsent((current) => !current)} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 13 }}>
                        <View style={{ width: 19, height: 19, borderRadius: 5, borderWidth: 1, borderColor: callConsent ? theme.primary : theme.border, backgroundColor: callConsent ? theme.primary : theme.surface, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                          {callConsent && <Check size={13} color="#FFF" />}
                        </View>
                        <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>I agree that Kryze may call my verified phone number for this reminder.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleScheduleCallReminder}
                        disabled={callReminderWorking}
                        style={{ marginTop: 14, borderRadius: 12, backgroundColor: theme.primary, paddingVertical: 12, alignItems: 'center', opacity: callReminderWorking ? 0.7 : 1 }}
                      >
                        {callReminderWorking ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: Typography.uiBold }}>Schedule voice call</Text>}
                      </TouchableOpacity>
                    </>
                  )}

                  {callReminders.filter((reminder) => reminder.status === 'SCHEDULED').map((reminder) => (
                    <View key={reminder.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontFamily: Typography.uiBold }}>{reminder.message}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>{new Date(reminder.scheduledFor).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                      </View>
                      <TouchableOpacity disabled={callReminderWorking} onPress={() => handleCancelCallReminder(reminder.id)}>
                        <Text style={{ color: theme.owe, fontSize: 12, fontFamily: Typography.uiBold }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Full Name</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={profileName}
                    onChangeText={setProfileName}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Email (Optional)</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={profileEmail}
                    onChangeText={setProfileEmail}
                    keyboardType="email-address"
                    placeholder="name@example.com"
                    placeholderTextColor={theme.text3}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>UPI ID (for group settlements)</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={profileUpi}
                    onChangeText={setProfileUpi}
                    placeholder="username@okhdfcbank"
                    placeholderTextColor={theme.text3}
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitProfileBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveProfile}
                  disabled={submittingProfile}
                >
                  {submittingProfile ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitProfileBtnText}>Save Profile Settings</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </ThemedView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
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

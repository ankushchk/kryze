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
  Alert
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
  User
} from 'lucide-react-native';
import { useHomeScreen, TransactionDraft } from '@/hooks/useHomeScreen';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { styles } from '@/styles/index.styles';

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
            onPress={() => setShowProfileModal(true)}
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
          <View style={styles.modalOverlay}>
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
                        <Text style={[styles.groupChipText, { color: selectedGroupId === 'personal' ? theme.primary : theme.text }]}>
                          👤 Personal
                        </Text>
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
                          <Text style={[styles.groupChipText, { color: selectedGroupId === g.id ? theme.primary : theme.text }]}>
                            👥 {g.name}
                          </Text>
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
          </View>
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
          <View style={styles.modalOverlay}>
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
          </View>
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

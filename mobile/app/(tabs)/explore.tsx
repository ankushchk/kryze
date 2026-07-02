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
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import {
  Plus,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ChevronRight,
  Search,
  User,
  Check,
  Plane,
  Home,
  Utensils,
  ShoppingBag,
  Package
} from 'lucide-react-native';
import * as Contacts from 'expo-contacts/legacy';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { Typography, Spacing } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

const getGroupIconComponent = (category: string | undefined | null) => {
  switch (category?.toLowerCase()) {
    case 'travel': return Plane;
    case 'home': return Home;
    case 'food': return Utensils;
    case 'shopping': return ShoppingBag;
    default: return Users;
  }
};

const formatRelativeActivity = (timestamp: string | null | undefined) => {
  if (!timestamp) return 'no activity yet';
  const diff = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours <= 0) return 'last activity just now';
    return `last activity ${hours}h ago`;
  }
  if (days === 1) return 'last activity yesterday';
  return `last activity ${days} days ago`;
};

type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  netBalance: number;
  memberCount: number;
  icon?: string;
  lastActivity?: string | null;
  members: Array<{ id: string; name: string }>;
};

export default function GroupsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { session, user } = useAuth();
  const params = useLocalSearchParams();
  const createDraftId = params.createDraftId as string | undefined;

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // Modal States
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('friends');
  const [submitting, setSubmitting] = useState(false);

  // Contact search and selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [localContacts, setLocalContacts] = useState<any[]>([]);
  const [filteredLocalContacts, setFilteredLocalContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Array<{ name: string; identifier: string }>>([]);

  const fetchGroups = async (showIndicator = true) => {
    if (!session) return;
    if (showIndicator) setLoading(true);

    try {
      const response = await apiRequest('/api/groups');
      if (response && response.groups) {
        setGroups(response.groups);
      }
    } catch (err: any) {
      console.error('Error fetching groups list:', err);
      Alert.alert('Error', err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        });
        setLocalContacts(data || []);
        setFilteredLocalContacts((data || []).slice(0, 5));
      }
    } catch (err) {
      console.warn('Failed to load local contacts:', err);
    }
  };

  useEffect(() => {
    if (createModalVisible) {
      loadLocalContacts();
      setSelectedContacts([]);
      setSearchQuery('');
      setSelectedEmoji('friends');
    }
  }, [createModalVisible]);

  useEffect(() => {
    if (createDraftId && session) {
      const loadDraftInfo = async () => {
        try {
          const response = await apiRequest('/api/drafts');
          if (response && response.drafts) {
            const draft = response.drafts.find((d: any) => d.id === createDraftId);
            if (draft) {
              setName(`${draft.merchant} Split`);
              setDescription(`Splitting ${draft.merchant} bill of ₹${draft.amount}`);
              setCreateModalVisible(true);
            } else {
              setName("New Split Group");
              setCreateModalVisible(true);
            }
          } else {
            setName("New Split Group");
            setCreateModalVisible(true);
          }
        } catch (err) {
          setName("New Split Group");
          setCreateModalVisible(true);
        }
      };
      loadDraftInfo();
    }
  }, [createDraftId, session]);

  useEffect(() => {
    if (!session) return;
    fetchGroups();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchGroups(false);
    });

    return unsubscribe;
  }, [navigation, session]);

  const handleSearchUsers = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredLocalContacts(localContacts.slice(0, 5));
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

  const toggleContactSelection = (name: string, identifier: string) => {
    setSelectedContacts((prev) => {
      const exists = prev.some((c) => c.identifier === identifier);
      if (exists) {
        return prev.filter((c) => c.identifier !== identifier);
      } else {
        return [...prev, { name, identifier }];
      }
    });
  };

  const handleCreateGroup = async () => {
    if (!name.trim()) {
      Alert.alert('Required field', 'Please enter a group name.');
      return;
    }

    setSubmitting(true);
    try {
      const memberIdentifiers = selectedContacts.map((c) => c.identifier);

      const response = await apiRequest('/api/groups', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          memberIdentifiers,
          icon: selectedEmoji,
        },
      });

      if (response && response.group) {
        // Auto split draft if present
        if (createDraftId && user) {
          try {
            const draftResponse = await apiRequest('/api/drafts');
            if (draftResponse && draftResponse.drafts) {
              const draft = draftResponse.drafts.find((d: any) => d.id === createDraftId);
              if (draft) {
                const allMemberIds = [user.id, ...response.group.addedMembers.map((m: any) => m.id)];
                const equalAmount = parseFloat((draft.amount / allMemberIds.length).toFixed(2));
                const splits = allMemberIds.map(userId => ({
                  userId,
                  amount: equalAmount
                }));

                await apiRequest(`/api/groups/${response.group.id}/expenses`, {
                  method: 'POST',
                  body: {
                    description: draft.merchant || 'Split Expense',
                    amount: draft.amount,
                    paidById: user.id,
                    splits
                  }
                });

                await apiRequest(`/api/drafts/${createDraftId}`, {
                  method: 'PATCH',
                  body: { status: 'ADDED' }
                });
              }
            }
          } catch (splitErr) {
            console.warn('Failed to auto-create split expense:', splitErr);
          }
        }

        setCreateModalVisible(false);
        setName('');
        setDescription('');
        setSelectedContacts([]);
        fetchGroups(true);
        Alert.alert('Success', 'Group created successfully and expense split! 🎉');
      }
    } catch (err: any) {
      console.error('Create group failed:', err);
      Alert.alert('Failed to Create Group', err.message || 'Verification error');
    } finally {
      setSubmitting(false);
    }
  };

  // Compute Total Balances
  const totalYouAreOwed = groups
    .filter((g) => g.netBalance > 0)
    .reduce((sum, g) => sum + g.netBalance, 0);

  const totalYouOwe = Math.abs(
    groups.filter((g) => g.netBalance < 0).reduce((sum, g) => sum + g.netBalance, 0)
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          Groups
        </ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.surface2 }]}
            onPress={() => fetchGroups(true)}
          >
            <RefreshCw size={18} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.primary }]}
            onPress={() => setCreateModalVisible(true)}
          >
            <Plus size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Widgets */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.iconBox, { backgroundColor: theme.lentDim }]}>
            <ArrowUpRight size={18} color={theme.lent} />
          </View>
          <View style={styles.statMeta}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              You are owed
            </ThemedText>
            <ThemedText style={[styles.statValue, { color: theme.lent }]}>
              ₹{totalYouAreOwed.toLocaleString('en-IN')}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.iconBox, { backgroundColor: theme.oweDim }]}>
            <ArrowDownLeft size={18} color={theme.owe} />
          </View>
          <View style={styles.statMeta}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              You owe
            </ThemedText>
            <ThemedText style={[styles.statValue, { color: theme.owe }]}>
              ₹{totalYouOwe.toLocaleString('en-IN')}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Groups Search Bar */}
      <View style={[styles.listSearchWrapper, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
        <Search size={16} color={theme.text3} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.listSearchInput, { color: theme.text }]}
          value={groupSearchQuery}
          onChangeText={setGroupSearchQuery}
          placeholder="Search groups..."
          placeholderTextColor={theme.text3}
          autoCapitalize="none"
        />
      </View>

      {/* Groups List */}
      {loading && groups.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: group }) => {
            const isOwed = group.netBalance > 0;
            const isOwe = group.netBalance < 0;
            return (
              <TouchableOpacity
                style={[styles.groupCard, { backgroundColor: theme.surface }]}
                onPress={() => {
                  router.push({
                    pathname: '/group-details',
                    params: { id: group.id },
                  });
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.groupAvatar, { backgroundColor: theme.surface2 }]}>
                    {(() => {
                      const IconComp = getGroupIconComponent(group.icon);
                      return <IconComp size={18} color={theme.primary} />;
                    })()}
                  </View>
                  <View style={styles.groupInfo}>
                    <ThemedText style={styles.groupName}>{group.name}</ThemedText>
                    <ThemedText style={[styles.groupDesc, { color: theme.textSecondary }]}>
                      {group.memberCount} member{group.memberCount > 1 ? 's' : ''} • {formatRelativeActivity(group.lastActivity)}
                    </ThemedText>
                  </View>
                  <View style={styles.balanceInfo}>
                    {isOwed && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.balanceSubText, { color: theme.text3 }]}>
                          you are owed
                        </Text>
                        <Text style={[styles.balanceText, { color: theme.lent }]}>
                          ₹{group.netBalance.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    {isOwe && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.balanceSubText, { color: theme.text3 }]}>
                          you owe
                        </Text>
                        <Text style={[styles.balanceText, { color: theme.owe }]}>
                          ₹{Math.abs(group.netBalance).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                    {!isOwe && !isOwed && (
                      <Text style={[styles.settledText, { color: theme.text3 }]}>
                        settled up
                      </Text>
                    )}
                    <ChevronRight size={16} color={theme.text3} style={{ marginLeft: 8 }} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={48} color={theme.text3} />
              <ThemedText style={styles.emptyText}>No groups found</ThemedText>
              <ThemedText style={[styles.emptySubText, { color: theme.text3 }]}>
                Create a group to split trip expenses, bills, or rent with roommates.
              </ThemedText>
              <TouchableOpacity
                style={[styles.createBtnInline, { backgroundColor: theme.primary }]}
                onPress={() => setCreateModalVisible(true)}
              >
                <Text style={styles.createBtnInlineText}>Create Group</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <ThemedView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Create New Group
                </ThemedText>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setCreateModalVisible(false)}
                >
                  <X size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Group Name</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Goa Trip, Flatmates"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Description (Optional)</Text>
                  <TextInput
                    style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Shared trip expenses"
                    placeholderTextColor={theme.text3}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 8 }]}>Category Icon</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                    {[
                      { id: 'travel', icon: Plane, label: 'Travel' },
                      { id: 'home', icon: Home, label: 'Stay' },
                      { id: 'food', icon: Utensils, label: 'Food' },
                      { id: 'shopping', icon: ShoppingBag, label: 'Shop' },
                      { id: 'friends', icon: Users, label: 'Friends' },
                    ].map((item) => {
                      const IconComponent = item.icon;
                      const isSelected = selectedEmoji === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.emojiSelectBtn,
                            { borderColor: theme.border, backgroundColor: theme.surface2 },
                            isSelected && { borderColor: theme.primary, backgroundColor: theme.primaryDim }
                          ]}
                          onPress={() => setSelectedEmoji(item.id)}
                        >
                          <IconComponent size={22} color={isSelected ? theme.primary : theme.textSecondary} />
                          <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>
                    Add Members to Group
                  </Text>

                  {/* Selected members horizontal chips scroll */}
                  {selectedContacts.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.selectedChipsContainer}
                      style={{ marginBottom: 10 }}
                    >
                      {selectedContacts.map((c) => (
                        <TouchableOpacity
                          key={c.identifier}
                          style={[styles.selectedChip, { backgroundColor: theme.primaryDim, borderColor: theme.primary }]}
                          onPress={() => toggleContactSelection(c.name, c.identifier)}
                        >
                          <Text style={[styles.selectedChipText, { color: theme.primary }]}>
                            {c.name}
                          </Text>
                          <X size={12} color={theme.primary} style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* Real-time search bar */}
                  <View style={[styles.searchBarWrapper, { borderColor: theme.border }]}>
                    <Search size={16} color={theme.text3} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.searchInputField, { color: theme.text }]}
                      value={searchQuery}
                      onChangeText={handleSearchUsers}
                      placeholder="Search name, phone, or email"
                      placeholderTextColor={theme.text3}
                      autoCapitalize="none"
                    />
                    {searching && <ActivityIndicator size="small" color={theme.primary} />}
                  </View>
                </View>

                {/* Search / Suggestions list */}
                <View style={styles.contactListContainer}>
                  {/* Local contacts results */}
                  {filteredLocalContacts.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.searchResultsHeader, { color: theme.textSecondary }]}>
                        {searchQuery.trim().length > 0 ? 'Phone Contacts' : 'Suggested Contacts'}
                      </Text>
                      {filteredLocalContacts.map((contact, idx) => {
                        const primaryPhone = contact.phoneNumbers?.[0]?.number;
                        const primaryEmail = contact.emails?.[0]?.email;
                        const id = primaryPhone || primaryEmail || contact.name;
                        const isSelected = selectedContacts.some((c) => c.identifier === id);

                        return (
                          <TouchableOpacity
                            key={contact.id || idx}
                            style={[styles.contactRow, { borderBottomColor: theme.border }]}
                            onPress={() => toggleContactSelection(contact.name, id)}
                          >
                            <View style={[styles.contactAvatar, { backgroundColor: theme.surface2 }]}>
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: theme.textSecondary }}>
                                {(contact.name || 'U').substring(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={[styles.contactName, { color: theme.text }]}>
                                {contact.name}
                              </Text>
                              {id && (
                                <Text style={[styles.contactDetail, { color: theme.textSecondary }]}>
                                  {id}
                                </Text>
                              )}
                            </View>
                            <View style={[styles.checkboxCircle, isSelected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                              {isSelected && <Check size={12} color="#FFF" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  
                  {searchQuery.trim().length > 0 && filteredLocalContacts.length === 0 && (
                    <TouchableOpacity
                      style={[styles.inviteCustomCard, { backgroundColor: theme.primaryDim, borderColor: theme.primary }]}
                      onPress={() => toggleContactSelection(searchQuery, searchQuery)}
                    >
                      <Plus size={16} color={theme.primary} style={{ marginRight: 8 }} />
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: 'bold' }}>
                        Invite "{searchQuery}"
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: theme.primary }]}
                  onPress={handleCreateGroup}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Create Group</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </ThemedView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

// X Import from Lucide react icon list
const X = (props: any) => <Plus {...props} style={[{ transform: [{ rotate: '45deg' }] }, props.style]} />;

const styles = StyleSheet.create({
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
  headerTitle: {
    fontSize: 22,
    fontFamily: Typography.uiBold,
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
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  statCard: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statMeta: {
    marginLeft: 10,
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Typography.bodyMedium,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontFamily: Typography.uiBold,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 100,
  },
  groupCard: {
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
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 12,
  },
  groupName: {
    fontSize: 15,
    fontFamily: Typography.uiBold,
  },
  groupDesc: {
    fontSize: 12,
    fontFamily: Typography.body,
    marginTop: 2,
  },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceSubText: {
    fontSize: 9,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  balanceText: {
    fontSize: 14,
    fontFamily: Typography.uiBold,
    marginTop: 2,
  },
  settledText: {
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Typography.uiBold,
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
  createBtnInline: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  createBtnInlineText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
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
  helperText: {
    fontSize: 10,
    marginTop: 4,
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
  selectedChipsContainer: {
    paddingVertical: 4,
    flexDirection: 'row',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  selectedChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 4,
  },
  searchInputField: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.body,
    height: '100%',
  },
  contactListContainer: {
    maxHeight: 220,
    marginBottom: Spacing.two,
  },
  searchResultsHeader: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 13,
    fontWeight: '600',
  },
  contactDetail: {
    fontSize: 11,
    marginTop: 1,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteCustomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.three,
    marginTop: 4,
  },
  listSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    height: 40,
  },
  listSearchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.body,
    height: '100%',
  },
  emojiSelectBtn: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Share
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Trash2,
  Download,
  XCircle,
  Save,
  Users,
  Plane,
  Home,
  Utensils,
  ShoppingBag
} from 'lucide-react-native';
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

type Member = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  role: string;
  netBalance: number;
};

type GroupExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string | null;
  paidBy: { name: string };
  splits: Array<{ user: { name: string }; amount: number }>;
};

type GroupDetails = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
};

export default function GroupSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams() as { id: string };
  const { user: currentUser } = useAuth();

  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('friends');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchGroupDetails = async () => {
    try {
      const response = await apiRequest(`/api/groups/${groupId}`);
      if (response) {
        setGroup(response.group);
        setName(response.group.name);
        setDescription(response.group.description || '');
        setIcon(response.group.icon || '👥');
        setMembers(response.members);
        setExpenses(response.expenses || []);
      }
    } catch (err: any) {
      console.error('Error fetching settings details:', err);
      Alert.alert('Error', err.message || 'Failed to load settings details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (groupId) {
      fetchGroupDetails();
    }
  }, [groupId]);

  const handleUpdateSettings = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Group name is required.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/groups/${groupId}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          description: description.trim() || null,
          icon,
        },
      });
      Alert.alert('Success', 'Group settings updated successfully!');
      fetchGroupDetails();
    } catch (err: any) {
      Alert.alert('Failed to Save', err.message || 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      'Are you absolutely sure you want to delete this group? All expenses and splits will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiRequest(`/api/groups/${groupId}`, {
                method: 'DELETE',
              });
              Alert.alert('Deleted', 'Group deleted successfully.');
              router.replace('/explore');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete group');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/api/groups/${groupId}/members/${memberId}`, {
                method: 'DELETE',
              });
              Alert.alert('Success', `${memberName} has been removed.`);
              fetchGroupDetails();
            } catch (err: any) {
              Alert.alert('Failed', err.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleExportCSV = async () => {
    if (expenses.length === 0) {
      Alert.alert('No Expenses', 'There are no expenses logged in this group.');
      return;
    }
    try {
      let csvContent = 'Date,Description,Amount,Paid By,Category,Splits\n';
      expenses.forEach((e) => {
        const dateStr = new Date(e.date).toLocaleDateString('en-IN');
        const desc = e.description.replace(/"/g, '""');
        const category = e.category || 'Other';
        const paidBy = e.paidBy.name;
        const splitsStr = e.splits.map((s) => `${s.user.name}: ₹${s.amount}`).join('; ');
        csvContent += `"${dateStr}","${desc}",${e.amount},"${paidBy}","${category}","${splitsStr}"\n`;
      });

      await Share.share({
        title: `${group?.name || 'Group'} Expenses Report`,
        message: csvContent,
      });
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Failed to export CSV');
    }
  };

  const isAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'ADMIN';

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle} type="subtitle">
            Group Settings
          </ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Group Details Settings Form */}
          <View style={[styles.sectionBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>Edit Details</Text>
            
            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Group Name</Text>
              <TextInput
                style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Group Name"
                placeholderTextColor={theme.text3}
                editable={isAdmin}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor={theme.text3}
                editable={isAdmin}
              />
            </View>

            {isAdmin && (
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 8 }]}>Category Icon</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {[
                    { id: 'travel', icon: Plane, label: 'Travel' },
                    { id: 'home', icon: Home, label: 'Stay' },
                    { id: 'food', icon: Utensils, label: 'Food' },
                    { id: 'shopping', icon: ShoppingBag, label: 'Shop' },
                    { id: 'friends', icon: Users, label: 'Friends' },
                  ].map((item) => {
                    const IconComponent = item.icon;
                    const isSelected = icon === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.emojiSelectBtn,
                          { borderColor: theme.border, backgroundColor: theme.surface2 },
                          isSelected && { borderColor: theme.primary, backgroundColor: theme.primaryDim }
                        ]}
                        onPress={() => setIcon(item.id)}
                      >
                        <IconComponent size={22} color={isSelected ? theme.primary : theme.textSecondary} />
                        <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 4 }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {isAdmin && (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={handleUpdateSettings}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Save size={16} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>Save Settings</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Members List */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Group Members</Text>
          <View style={[styles.sectionBox, { backgroundColor: theme.surface }]}>
            {members.map((m) => {
              const isMe = m.id === currentUser?.id;
              const canRemove = isAdmin && !isMe;
              return (
                <View key={m.id} style={[styles.memberRow, { borderBottomColor: theme.border }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: theme.primaryDim }]}>
                    <Text style={[styles.avatarText, { color: theme.primary }]}>
                      {(m.name || 'U').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.memberName, { color: theme.text }]}>
                      {m.name} {isMe && '(You)'}
                    </Text>
                    <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                      {m.role} • {m.phoneNumber || m.email || 'No Contact'}
                    </Text>
                  </View>
                  {canRemove && (
                    <TouchableOpacity
                      style={styles.removeMemberBtn}
                      onPress={() => handleRemoveMember(m.id, m.name)}
                    >
                      <XCircle size={20} color={theme.owe} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* Actions & Export */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Actions</Text>
          <View style={[styles.sectionBox, { backgroundColor: theme.surface }]}>
            <TouchableOpacity style={styles.actionRowBtn} onPress={handleExportCSV}>
              <Download size={20} color={theme.primary} />
              <Text style={[styles.actionRowText, { color: theme.text }]}>Export Expenses report (CSV)</Text>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={[styles.actionRowBtn, { borderBottomWidth: 0 }]} onPress={handleDeleteGroup}>
                <Trash2 size={20} color={theme.owe} />
                <Text style={[styles.actionRowText, { color: theme.owe }]}>Delete Group</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionBox: {
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.four,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  formGroup: {
    marginBottom: Spacing.four,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  emojiSelectBtn: {
    width: 58,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberRole: {
    fontSize: 11,
    marginTop: 2,
  },
  removeMemberBtn: {
    padding: 8,
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  actionRowText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
});

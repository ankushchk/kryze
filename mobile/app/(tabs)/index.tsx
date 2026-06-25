import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { StyleSheet, Button } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function HomeScreen() {
  const { signOut } = useAuth();
  
  const handleLogout = async () => {
    await signOut();
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={{ fontSize: 24, marginBottom: 20 }}>Dashboard</ThemedText>
      <Button title="Log out" onPress={handleLogout} color="#ff3b30" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

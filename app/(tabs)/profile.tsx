import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Paragraph, Text, Title } from 'react-native-paper';
import { supabase } from '../../src/lib/supabase';

export default function ProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError(userError?.message ?? 'Sign in to view your account.');
      return;
    }
    setEmail(userData.user.email ?? '');
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('full_name,role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError) {
      setError(profileError.message);
      return;
    }
    setFullName(data?.full_name ?? '');
    setRole(data?.role ?? 'user');
    setError('');
  }, []);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      router.replace('/login');
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>My Profile</Title>
          <Paragraph>{fullName || 'Account'}</Paragraph>
          <Text style={styles.meta}>{email}</Text>
          <Text style={styles.meta}>Role: {role}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {role === 'admin' ? <Link href="/admin" asChild><Button mode="outlined" style={styles.button}>Administration</Button></Link> : null}
          <Button mode="contained" style={styles.button} onPress={handleLogout}>Log out</Button>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f7fb',
  },
  card: {
    borderRadius: 18,
  },
  meta: {
    marginTop: 8,
    color: '#475569',
  },
  button: {
    marginTop: 20,
  },
  error: { color: '#b3261e', marginTop: 8 },
});

import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Paragraph, Text, TextInput, Title } from 'react-native-paper';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { SchoolBrand } from '../src/components/SchoolBrand';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Enter both email and password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your project URL and anon key to .env.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (authError) {
      setError(authError.message || 'Unable to log in right now.');
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <SchoolBrand />
          <Title style={styles.title}>HCCCI Room Availability</Title>
          <Paragraph style={styles.subtitle}>Campus access for students, faculty, and administrators.</Paragraph>

          <TextInput
            mode="outlined"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />

          <TextInput
            mode="outlined"
            label="Password"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            right={<TextInput.Icon icon={passwordVisible ? 'eye-off' : 'eye'} onPress={() => setPasswordVisible((visible) => !visible)} accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} />}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button mode="contained" loading={loading} onPress={handleLogin} style={styles.button}>
            Log In
          </Button>

          <Link href="/forgot-password" asChild>
            <Button mode="text">Forgot password?</Button>
          </Link>

          <View style={styles.footerRow}>
            <Text>Need an account?</Text>
            <Link href="/register" asChild>
              <Button mode="text">Create one</Button>
            </Link>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f7fb',
  },
  card: {
    borderRadius: 18,
    elevation: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 18,
    color: '#5b6472',
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
    marginBottom: 8,
  },
  error: {
    color: '#b3261e',
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});

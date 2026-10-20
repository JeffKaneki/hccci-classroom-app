import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Paragraph, Text, TextInput, Title } from 'react-native-paper';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';
import { SchoolBrand } from '../src/components/SchoolBrand';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email) {
      setError('Enter your email address.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your project URL and anon key to .env.');
      return;
    }

    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setLoading(false);

    if (authError) {
      setError(authError.message || 'Unable to send reset email.');
      return;
    }

    setMessage('Check your inbox for the password reset email.');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <SchoolBrand />
          <Title style={styles.title}>Reset password</Title>
          <Paragraph style={styles.subtitle}>We will send a recovery link to your email.</Paragraph>

          <TextInput
            mode="outlined"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <Button mode="contained" loading={loading} onPress={handleReset} style={styles.button}>
            Send reset link
          </Button>

          <View style={styles.footerRow}>
            <Link href="/login" asChild>
              <Button mode="text">Back to login</Button>
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
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#5b6472',
  },
  input: {
    marginTop: 16,
    marginBottom: 12,
  },
  button: {
    marginTop: 10,
  },
  footerRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  error: {
    color: '#b3261e',
    marginBottom: 10,
  },
  success: {
    color: '#0b6d42',
    marginBottom: 10,
  },
});

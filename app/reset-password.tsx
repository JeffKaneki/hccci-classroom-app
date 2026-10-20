import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Paragraph, Text, TextInput, Title } from 'react-native-paper';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';
import { SchoolBrand } from '../src/components/SchoolBrand';

export default function ResetPasswordScreen() {
  const { code: codeParam } = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  const handledCode = useRef('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setError('This password reset link is missing its recovery code. Request a new link and open it on this device.');
      setLoading(false);
      return;
    }
    if (handledCode.current === code) return;
    handledCode.current = code;

    void (async () => {
      setLoading(true);
      try {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw new Error(exchangeError.message);
        setReady(true);
        setError('');
      } catch (exchangeError) {
        setError(exchangeError instanceof Error ? exchangeError.message : 'This recovery link is invalid or expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  const handleSave = async () => {
    setError('');
    if (!ready || !isSupabaseConfigured) {
      setError('The recovery session is unavailable. Request a new password reset link.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      await supabase.auth.signOut();
      setComplete(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <SchoolBrand />
          {complete ? <>
            <Title style={styles.title}>Password updated</Title>
            <Paragraph style={styles.subtitle}>Your password has been changed. Sign in with your new password.</Paragraph>
            <Link href="/login" asChild><Button mode="contained" style={styles.button}>Back to login</Button></Link>
          </> : <>
            <Title style={styles.title}>Set a new password</Title>
            <Paragraph style={styles.subtitle}>We’ll verify your recovery link, then update your password.</Paragraph>
            {loading ? <View style={styles.loading}><ActivityIndicator /><Text style={styles.loadingText}>Verifying reset link…</Text></View> : null}
            {ready ? <>
              <TextInput label="New password" mode="outlined" secureTextEntry={!passwordVisible} autoComplete="new-password" value={password} onChangeText={setPassword} style={styles.input} right={<TextInput.Icon icon={passwordVisible ? 'eye-off' : 'eye'} onPress={() => setPasswordVisible((visible) => !visible)} accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} />} />
              <TextInput label="Confirm new password" mode="outlined" secureTextEntry={!confirmPasswordVisible} autoComplete="new-password" value={confirmPassword} onChangeText={setConfirmPassword} style={styles.input} right={<TextInput.Icon icon={confirmPasswordVisible ? 'eye-off' : 'eye'} onPress={() => setConfirmPasswordVisible((visible) => !visible)} accessibilityLabel={confirmPasswordVisible ? 'Hide confirmed password' : 'Show confirmed password'} />} />
            </> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {ready ? <Button mode="contained" loading={saving} disabled={saving} onPress={() => void handleSave()} style={styles.button}>Update password</Button> : null}
            {!ready && !loading ? <Link href="/forgot-password" asChild><Button mode="outlined" style={styles.button}>Request another reset link</Button></Link> : null}
            <View style={styles.footer}><Link href="/login" asChild><Button mode="text">Back to login</Button></Link></View>
          </>}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f7fb' },
  card: { borderRadius: 12 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', color: '#5b6472', marginVertical: 12 },
  input: { marginVertical: 6 },
  loading: { alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 8, color: '#5b6472' },
  button: { marginTop: 12 },
  error: { color: '#b3261e', marginTop: 8 },
  footer: { alignItems: 'center', marginTop: 12 },
});

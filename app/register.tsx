import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Menu, Paragraph, Text, TextInput, Title } from 'react-native-paper';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';
import { isAllowedRegistrationEmail } from '../src/lib/authValidation';
import { SchoolBrand } from '../src/components/SchoolBrand';
import type { Course } from '../src/lib/availability';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCourses = async () => {
      const { data, error: courseError } = await supabase.from('courses').select('id,code,year,active').eq('active', true).order('code').order('year');
      if (courseError) setError(courseError.message);
      setCourses((data ?? []) as Course[]);
      setCoursesLoading(false);
    };
    void loadCourses();
  }, []);

  const handleRegister = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || !password || !confirmPassword || !courseId) {
      setError('Complete all required fields.');
      return;
    }

    if (!isAllowedRegistrationEmail(normalizedEmail)) {
      setError('Registration is limited to email addresses ending in @hccci.edu.ph.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your project URL and anon key to .env.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: emailAvailable, error: availabilityError } = await supabase.rpc('is_registration_email_available', {
        target_email: normalizedEmail,
      });
      if (availabilityError) throw new Error(`Unable to verify email availability: ${availabilityError.message}`);
      if (!emailAvailable) {
        setError('An account with this email already exists. Sign in or use a different email address.');
        return;
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: name.trim(), course_id: courseId },
        },
      });

      if (authError) {
        setError(authError.message || 'Unable to create your account.');
        return;
      }
      if (!data.user || data.user.identities?.length === 0) {
        setError('An account with this email already exists. Sign in or use a different email address.');
        return;
      }

      if (data.session) {
        router.replace('/(tabs)');
        return;
      }

      Alert.alert(
        'Account created',
        `A confirmation link was sent to ${normalizedEmail}. Open that link to verify your email, then sign in.`,
        [{ text: 'Go to login', onPress: () => router.replace('/login') }]
      );
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <SchoolBrand />
          <Title style={styles.title}>Create account</Title>
          <Paragraph style={styles.subtitle}>Use your HCCCI school email. Regular accounts default to the user role.</Paragraph>

          <TextInput label="Full name" mode="outlined" value={name} onChangeText={setName} style={styles.input} />
          <TextInput label="HCCCI email" mode="outlined" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} style={styles.input} />
          {coursesLoading ? <ActivityIndicator style={styles.input} /> : <Menu
            visible={courseMenuOpen}
            onDismiss={() => setCourseMenuOpen(false)}
            anchor={<Button mode="outlined" onPress={() => setCourseMenuOpen(true)} style={styles.input}>
              {courses.find((course) => course.id === courseId)?.code ?? 'Choose course and year'}
              {courseId ? `-${courses.find((course) => course.id === courseId)?.year ?? ''}` : ''}
            </Button>}
          >
            {courses.map((course) => <Menu.Item key={course.id} title={`${course.code}-${course.year}`} onPress={() => { setCourseId(course.id); setCourseMenuOpen(false); }} />)}
          </Menu>}
          <TextInput label="Password" mode="outlined" secureTextEntry={!passwordVisible} value={password} onChangeText={setPassword} style={styles.input} right={<TextInput.Icon icon={passwordVisible ? 'eye-off' : 'eye'} onPress={() => setPasswordVisible((visible) => !visible)} accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} />} />
          <TextInput label="Confirm password" mode="outlined" secureTextEntry={!confirmPasswordVisible} value={confirmPassword} onChangeText={setConfirmPassword} style={styles.input} right={<TextInput.Icon icon={confirmPasswordVisible ? 'eye-off' : 'eye'} onPress={() => setConfirmPasswordVisible((visible) => !visible)} accessibilityLabel={confirmPasswordVisible ? 'Hide confirmed password' : 'Show confirmed password'} />} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button mode="contained" loading={loading} disabled={loading} onPress={() => void handleRegister()} style={styles.button}>
            Register
          </Button>

          <View style={styles.footerRow}>
            <Text>Already have an account?</Text>
            <Link href="/login" asChild><Button mode="text">Sign in</Button></Link>
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
    marginBottom: 18,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  footerRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
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

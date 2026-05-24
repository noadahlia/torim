import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../lib/auth';

const TIMEZONES = [
  'Asia/Jerusalem',
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

export default function SignupScreen({ navigation }: any) {
  const { signup, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jerusalem');
  const [error, setError] = useState('');

  const handleSignup = async () => {
    try {
      setError('');
      await signup(email, password, fullName, timezone);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    }
  };

  const isValid = email && password && fullName && password.length >= 8;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <Text style={styles.label}>Timezone</Text>
      {TIMEZONES.map((tz) => (
        <TouchableOpacity
          key={tz}
          style={[styles.option, timezone === tz && styles.optionSelected]}
          onPress={() => setTimezone(tz)}
          disabled={loading}
        >
          <Text style={[styles.optionText, timezone === tz && styles.optionTextSelected]}>
            {tz}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={!isValid || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    fontSize: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  option: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  optionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  optionText: {
    color: '#333',
    fontSize: 14,
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  error: {
    color: '#e74c3c',
    marginBottom: 16,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    color: '#007AFF',
    textAlign: 'center',
    fontSize: 14,
  },
});

// File: app/(tabs)/LockScreen.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

const PASSWORD_STORAGE_KEY = 'SecureFolderPassword';

type LockScreenMode = 'set_password' | 'enter_password' | 'loading';

export default function LockScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<LockScreenMode>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const checkPasswordExists = useCallback(async () => {
    try {
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_STORAGE_KEY);
      if (storedPassword) {
        setMode('enter_password');
      } else {
        setMode('set_password');
      }
    } catch (e) {
      console.error("Failed to check password storage", e);
      Alert.alert("Error", "Could not initialize lock screen.");
      setMode('set_password'); // Default to set password on error
    }
  }, []);

  useEffect(() => {
    checkPasswordExists();
  }, [checkPasswordExists]);

  const handleSetPassword = async () => {
    if (!password) {
      setError('Password cannot be empty.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await SecureStore.setItemAsync(PASSWORD_STORAGE_KEY, password);
      Alert.alert("Password Set", "Your Secure Folder password has been set.");
      router.replace('/secure/SecureFolderBrowser'); // Use replace to prevent going back to set password
    } catch (e) {
      console.error("Failed to save password", e);
      setError('Failed to save password. Please try again.');
    }
  };

  const handleEnterPassword = async () => {
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    try {
      const storedPassword = await SecureStore.getItemAsync(PASSWORD_STORAGE_KEY);
      if (password === storedPassword) {
        router.replace('/secure/SecureFolderBrowser'); // Use replace to prevent going back to lock screen
      } else {
        setError('Incorrect password. Please try again.');
        setPassword(''); // Clear password field on incorrect attempt
      }
    } catch (e) {
      console.error("Failed to verify password", e);
      setError('An error occurred. Please try again.');
    }
  };

  if (mode === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ThemedText>Initializing...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: mode === 'set_password' ? 'Set Secure Folder Password' : 'Enter Password' }} />
      <Ionicons name="lock-closed-outline" size={64} color={styles.icon.color} style={{ marginBottom: 30 }} />
      
      <ThemedText type="subtitle" style={styles.instructionText}>
        {mode === 'set_password' ? 'Create a password for your Secure Folder.' : 'Enter your password to access Secure Folder.'}
      </ThemedText>

      <TextInput
        style={styles.input}
        placeholder={mode === 'set_password' ? "Enter new password" : "Password"}
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
      />
      {mode === 'set_password' && (
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#888"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
        />
      )}
      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
      <TouchableOpacity
        style={styles.button}
        onPress={mode === 'set_password' ? handleSetPassword : handleEnterPassword}>
        <ThemedText style={styles.buttonText}>
          {mode === 'set_password' ? 'Set Password' : 'Unlock'}
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  instructionText: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#555', // Darker border for better visibility on themed backgrounds
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#fff', // Assuming dark theme, adjust if needed or use ThemedInput
    backgroundColor: '#333' // Assuming dark theme
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  icon: { // Example color, adjust with theme if needed
    color: '#007AFF'
  }
});
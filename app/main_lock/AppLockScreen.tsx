// File: app/AppLockScreen.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

const APP_LOCK_PASSWORD_KEY = 'AppLockPassword';

type AppLockScreenMode = 'set_app_password' | 'enter_app_password' | 'loading';

interface AppLockScreenProps {
  onUnlockSuccess: () => void;
}

export default function AppLockScreen({ onUnlockSuccess }: AppLockScreenProps) {
  const [mode, setMode] = useState<AppLockScreenMode>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  const checkBiometricSupport = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    setIsBiometricAvailable(compatible);
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (compatible && enrolled && mode === 'enter_app_password') {
      // If biometrics are available and a password is set, try biometric auth first
      handleBiometricAuth();
    }
  };

  const checkPasswordExists = useCallback(async () => {
    try {
      const storedPassword = await SecureStore.getItemAsync(APP_LOCK_PASSWORD_KEY);
      if (storedPassword) {
        setMode('enter_app_password');
      } else {
        setMode('set_app_password');
      }
    } catch (e) {
      console.error("Failed to check app password storage", e);
      Alert.alert("Error", "Could not initialize app lock screen.");
      setMode('set_app_password'); // Default to set password on error
    }
  }, []);

  useEffect(() => {
    checkPasswordExists();
  }, [checkPasswordExists]);

  useEffect(() => {
    if (mode === 'enter_app_password') {
      checkBiometricSupport();
    }
  }, [mode]);


  const handleBiometricAuth = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock App',
        disableDeviceFallback: true, // Set to true to not allow device passcode as fallback
        cancelLabel: 'Enter Password', // User can cancel to enter password manually
      });
      if (result.success) {
        onUnlockSuccess();
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') {
        // Don't show error if user explicitly cancelled to enter password
        setError('Biometric authentication failed. Please try your password.');
      }
    } catch (e) {
      console.error("Biometric auth error", e);
      setError('Biometric authentication is not available or failed.');
    }
  };

  const handleSetPassword = async () => {
    setError('');
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
      await SecureStore.setItemAsync(APP_LOCK_PASSWORD_KEY, password); // Use the new key
      Alert.alert("App Password Set", "Your app password has been set.");
      onUnlockSuccess();
    } catch (e) {
      console.error("Failed to save app password", e);
      setError('Failed to save app password. Please try again.');
    }
  };

  const handleEnterPassword = async () => {
    setError('');
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    try {
      const storedPassword = await SecureStore.getItemAsync(APP_LOCK_PASSWORD_KEY); // Use the new key
      if (password === storedPassword) {
        onUnlockSuccess();
      } else {
        setError('Incorrect password. Please try again.');
        setPassword('');
      }
    } catch (e) {
      console.error("Failed to verify app password", e);
      setError('An error occurred. Please try again.');
    }
  };

  if (mode === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Initializing App Lock...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
<Ionicons name="shield-checkmark-outline" size={64} color="#007AFF" />
      <ThemedText type="title" style={{ marginBottom: 10 }}>
        {mode === 'set_app_password' ? 'Set App Password' : 'App Locked'}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.instructionText}>
        {mode === 'set_app_password' ? 'Create a password to secure your app.' : 'Enter your password to unlock.'}
      </ThemedText>

      <TextInput
        style={styles.input}
        placeholder={mode === 'set_app_password' ? "Enter new app password" : "App Password"}
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
      />
      {mode === 'set_app_password' && (
        <TextInput
          style={styles.input}
          placeholder="Confirm new app password"
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
        onPress={mode === 'set_app_password' ? handleSetPassword : handleEnterPassword}>
        <ThemedText style={styles.buttonText}>
          {mode === 'set_app_password' ? 'Set & Unlock' : 'Unlock App'}
        </ThemedText>
      </TouchableOpacity>
      {mode === 'enter_app_password' && isBiometricAvailable && (
        <TouchableOpacity onPress={handleBiometricAuth} style={styles.biometricButton}>
          <Ionicons name="finger-print" size={28} color="#fff" />
          <ThemedText style={styles.biometricButtonText}>Use Biometrics</ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

// Styles are similar to LockScreen.tsx, you can adjust them
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
    borderColor: '#555',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#fff', 
    backgroundColor: '#333' 
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
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
  icon: { 
    color: '#007AFF'
  },
  biometricButton: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#555', // A different color for biometric button
  },
  biometricButtonText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 16,
  }
});
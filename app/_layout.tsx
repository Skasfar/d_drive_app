import { ThemeProvider as CustomThemeProvider } from '@/context/ThemeContext'; // Import your custom ThemeProvider
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar'; // Import StatusBar
import React, { useEffect, useState } from 'react'; // Import React, useEffect, and useState
import { useColorScheme as useSystemColorScheme } from 'react-native'; // Import AppState
import 'react-native-reanimated';
import AppLockScreenComponent from './main_lock/AppLockScreen'; // Import the new AppLockScreen

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isAppUnlocked, setIsAppUnlocked] = useState(false); // State to track app unlock status
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  // If the app is not unlocked, render the AppLockScreen
  if (!isAppUnlocked) {
    return (
      <CustomThemeProvider>
        <AppLockScreenComponent onUnlockSuccess={() => setIsAppUnlocked(true)} />
        <StatusBar style="auto" /> {/* Or based on theme, but auto is fine for lock screen */}
      </CustomThemeProvider>
    );
  }

  // If the app is unlocked, render the main content
  return (
    // Wrap with your custom ThemeProvider first
    <CustomThemeProvider>
      {/* Then, if needed, the navigation ThemeProvider */}
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} /> {/* Your main tabs */}
          <Stack.Screen name="+not-found" /> {/* Your not-found screen */}
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </CustomThemeProvider>
  );
}

// Helper hook from original template, can be kept or removed if ThemeContext handles system color scheme
// This local one might conflict or not be what ThemeContext expects if it uses the react-native one.
function useColorScheme() {
  return useSystemColorScheme() ?? 'light'; // Use the imported hook from react-native
}

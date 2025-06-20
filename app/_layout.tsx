import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react'; // Import React and useEffect
import 'react-native-reanimated';
import { ThemeProvider as CustomThemeProvider } from '@/context/ThemeContext'; // Import your custom ThemeProvider
import { useColorScheme as useSystemColorScheme } from 'react-native'; // Import the hook from react-native

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    // Wrap with your custom ThemeProvider first
    <CustomThemeProvider>
      {/* Then, if needed, the navigation ThemeProvider */}
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
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

import React, { createContext, ReactNode, useContext, useEffect, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // For saving theme preference

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isSystemTheme: boolean; // New state to indicate if system theme is active
  setManualTheme: (theme: Theme) => void; // Set a specific theme manually
  setUseSystemTheme: (useSystem: boolean) => void; // Toggle following system theme
  backgroundImageUri: string | null; // URI for the background image
  setBackgroundImageUri: (uri: string | null) => void; // Function to set it
  blurIntensity: number; // Blur intensity for the background image (0-100)
  setBlurIntensity: (intensity: number) => void; // Function to set blur intensity
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_PREFERENCE_KEY = 'userThemePreference'; // Key for AsyncStorage
const SYSTEM_THEME_VALUE = 'system';
const LIGHT_THEME_VALUE = 'light';
const DARK_THEME_VALUE = 'dark';
const BACKGROUND_IMAGE_URI_KEY = 'appBackgroundImageUri'; 
const BLUR_INTENSITY_KEY = 'appBlurIntensity'; // Key for AsyncStorage

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme(); // 'light', 'dark', or null
  const [theme, setThemeState] = useState<Theme>(systemColorScheme || 'light'); // Current active theme
  const [isSystemTheme, setIsSystemTheme] = useState(true); // Whether we are following system theme
  const [backgroundImageUri, setBackgroundImageUriState] = useState<string | null>(null);
  const [blurIntensity, setBlurIntensityState] = useState<number>(10); // Default blur intensity

  useEffect(() => {
    // Load saved preference on mount
    const loadThemePreference = async () => {
      const savedPreference = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
      if (savedPreference === DARK_THEME_VALUE) {
        setManualTheme('dark'); // Apply saved manual dark theme
        setIsSystemTheme(false);
      } else if (savedPreference === LIGHT_THEME_VALUE) {
        setManualTheme('light'); // Apply saved manual light theme
        setIsSystemTheme(false);
      } else { // Default or 'system' saved
        setIsSystemTheme(true);
        setThemeState(systemColorScheme || 'light'); // Apply current system theme
      }

      const savedBgImageUri = await AsyncStorage.getItem(BACKGROUND_IMAGE_URI_KEY);
      if (savedBgImageUri) {
        setBackgroundImageUriState(savedBgImageUri);
      }

      const savedBlurIntensity = await AsyncStorage.getItem(BLUR_INTENSITY_KEY);
      if (savedBlurIntensity !== null) {
        setBlurIntensityState(parseInt(savedBlurIntensity, 10));
      }
    };
    loadThemePreference();
  }, []); // Run only on mount

  useEffect(() => {
    // Update theme state if system theme changes AND we are set to follow system theme
    if (isSystemTheme) {
      setThemeState(systemColorScheme || 'light');
    }
  }, [systemColorScheme]);

  const setManualTheme = useCallback(async (newTheme: Theme) => {
    setIsSystemTheme(false);
    setThemeState(newTheme);
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, newTheme === 'light' ? LIGHT_THEME_VALUE : DARK_THEME_VALUE);
  }, []);

  const setUseSystemTheme = useCallback(async (useSystem: boolean) => {
    setIsSystemTheme(useSystem);
    if (useSystem) {
      setThemeState(systemColorScheme || 'light');
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, SYSTEM_THEME_VALUE);
      setBackgroundImageUri(null); // Clear background image when switching to system theme
      setBlurIntensity(0); // Reset blur when switching to system theme
    } else {
      // When switching OFF system theme, default to current active theme or a specific one
      // For simplicity, let's default to light if no manual theme was set before.
      // A more complex approach would save the *last manual theme* used.
      const currentActiveTheme = theme; // Capture current theme before state update
      setThemeState(currentActiveTheme); // Stay on the theme that was active
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, currentActiveTheme === 'light' ? LIGHT_THEME_VALUE : DARK_THEME_VALUE);
    }
  }, [systemColorScheme, theme, setBackgroundImageUri]); // Added setBackgroundImageUri dependency

  const setBackgroundImageUri = useCallback(async (uri: string | null) => {
    setBackgroundImageUriState(uri);
    if (uri) {
      await AsyncStorage.setItem(BACKGROUND_IMAGE_URI_KEY, uri);
    } else {
      await AsyncStorage.removeItem(BACKGROUND_IMAGE_URI_KEY);
    }
  }, []);

  const setBlurIntensity = useCallback(async (intensity: number) => {
    const newIntensity = Math.max(0, Math.min(100, intensity)); // Clamp between 0 and 100
    setBlurIntensityState(newIntensity);
    await AsyncStorage.setItem(BLUR_INTENSITY_KEY, newIntensity.toString());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, isSystemTheme, setManualTheme, setUseSystemTheme, backgroundImageUri, setBackgroundImageUri, blurIntensity, setBlurIntensity }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  };
  return context;
};
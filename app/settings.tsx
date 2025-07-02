import { Alert, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

import { Collapsible } from '@/components/Collapsible';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol'; // Assuming IconSymbol is used for header image
import { Colors } from '@/constants/Colors'; // Import Colors for explicit background
import { useTheme } from '@/context/ThemeContext'; // Import useTheme context
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider'; // Import Slider
import * as ImagePicker from 'expo-image-picker'; // Import ImagePicker
import React, { useEffect, useState } from 'react'; // Import useState and useEffect

const BACKGROUND_IMAGE_KEY = 'appBackgroundImage';

export default function SettingsScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
        // You might want a different icon for settings, e.g., 'settings'
        // <Ionicons size={310} name="settings-outline" style={styles.headerImage} />
      }>
      <View style={styles.contentContainer}>
        <ThemedView style={styles.titleContainer}>
          {/* 
            If a global background is set, this ThemedView might also become transparent.
            We might want to give it an explicit background or wrap the text differently.
          */}
          <ThemedText type="title">Settings</ThemedText> 
        </ThemedView>

        {/* Appearance Settings */}
        <ThemedView style={styles.sectionContainer}>
          <ThemedText type="subtitle">Appearance</ThemedText>
          
          {/* Option: Use System Theme */}
          <ThemeToggleOption />

          {/* Option: Change Background Image */}
          <ChangeBackgroundImageOption />

          {/* Option: Remove Background Image */}
          <RemoveBackgroundImageOption />

          {/* Option: Adjust Blur Intensity */}
          <BlurIntensitySliderOption />

        </ThemedView>

        {/* Other Settings Sections (Placeholder) */}
        <ThemedView 
          style={styles.sectionContainer}
          lightColor={Colors.light.background} // Explicit background
          darkColor={Colors.dark.background}   // Explicit background
        >
          <ThemedText type="subtitle">General</ThemedText>
          {/* Add other settings options here */}
          <ThemedText>Other settings will go here.</ThemedText>
        </ThemedView>

        {/* Example Collapsible (can keep or remove) */}
        <Collapsible title="About App">
          <ThemedText>
            This template has light and dark mode support. The{' '}
            <ThemedText type="defaultSemiBold">useColorScheme()</ThemedText> hook lets you inspect
            what the user&apos;s current color scheme is, and so you can adjust UI colors accordingly.
          </ThemedText>
        </Collapsible>
      </View>
    </ParallaxScrollView>
  );
}

// Component for the "Use System Theme" toggle
function ThemeToggleOption() {
  const { theme, isSystemTheme, setUseSystemTheme } = useTheme();
  // Local switch state, initialized from context
  const [isSwitchEnabled, setIsSwitchEnabled] = useState(isSystemTheme);

  useEffect(() => {
    // Sync local switch state if context's isSystemTheme changes (e.g., on initial load)
    setIsSwitchEnabled(isSystemTheme);
  }, [isSystemTheme]);

  const handleToggle = (value: boolean) => {
    setIsSwitchEnabled(value); // Update local switch state immediately for responsiveness
    setUseSystemTheme(value); // Update context and save preference

    if (value) {
      // ThemeContext's setUseSystemTheme(true) will handle reverting to system theme
      console.log("Switched to: Use System Theme");
    } else {
      // When toggling off system theme, ThemeContext's setUseSystemTheme(false)
      // will keep the current theme as the manual theme.
      // If you want to explicitly set it to 'light' or 'dark' here, you could call setManualTheme(theme).
      console.log("Switched to: Use Manual Theme (currently " + theme + ")");
    }
  };

  return (
    <ThemedView style={styles.optionRow}>
      {/* 
        This ThemedView will also get the global background if not given explicit colors.
        The text might be hard to read. Consider styling optionRow with explicit background.
      */}
      <ThemedText>Use System Theme</ThemedText> 
      <Switch value={isSwitchEnabled} onValueChange={handleToggle} />
    </ThemedView>
  );
}

// Component for the "Change Background Image" option
function ChangeBackgroundImageOption() {
  const { setBackgroundImageUri } = useTheme(); // Get the setter from context
  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access media library is required to set a background image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, // Set to true if you want to allow cropping
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedImageUri = result.assets[0].uri;
      console.log("Selected Image URI:", selectedImageUri);
      // Set and save the URI using the context function
      setBackgroundImageUri(selectedImageUri); 
      Alert.alert("Background Set", "Background image has been updated!");
      // To remove the background, you could add another button that calls setBackgroundImageUri(null)
    }
  };

  return (
    <TouchableOpacity onPress={handleImagePick} style={styles.optionRow}>
      <ThemedText>Change Background Image</ThemedText>
      <Ionicons name="image-outline" size={24} color={styles.icon.color} />
    </TouchableOpacity>
  );
}

// Component for removing background image
function RemoveBackgroundImageOption() {
  const { backgroundImageUri, setBackgroundImageUri } = useTheme();

  if (!backgroundImageUri) {
    return null; // Don't show if no background is set
  }

  return (
    <TouchableOpacity onPress={() => setBackgroundImageUri(null)} style={styles.optionRow}>
      <ThemedText>Remove Background Image</ThemedText>
      <Ionicons name="trash-outline" size={24} color={styles.icon.color} />
    </TouchableOpacity>
  );
}

// Component for adjusting blur intensity
function BlurIntensitySliderOption() {
  const { backgroundImageUri, blurIntensity, setBlurIntensity } = useTheme();

  if (!backgroundImageUri) {
    return null; // Don't show if no background image is set
  }

  return (
    <View style={styles.optionRow}>
      <ThemedText>Background Blur: {blurIntensity.toFixed(0)}%</ThemedText>
      <Slider
        style={{ width: 150, height: 40 }}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={blurIntensity}
        onValueChange={(value) => setBlurIntensity(value)} // Updates continuously
        // onSlidingComplete={(value) => setBlurIntensity(value)} // Updates when slider is released
        minimumTrackTintColor={Colors.light.tint} // Example color
        maximumTrackTintColor="#d3d3d3" // Example color
        thumbTintColor={Colors.light.tint} // Example color
      />
    </View>
  );
}


const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16, 
    paddingTop: 16, 
  },
  contentContainer: {
    gap: 16,
  },
  sectionContainer: {
    // marginTop: 20, // Replaced by gap in contentContainer
    paddingHorizontal: 16, 
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    // If optionRow is a ThemedView, it will also get the global background.
    // To give it a solid background on top of the global one:
    // backgroundColor: useThemeColor({}, 'card'), // Example: use card color
    // borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor: '#ccc', 
  },
  icon: { 
    color: '#007AFF' // Example color, consider using themed colors
  }
});

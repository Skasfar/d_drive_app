import { ImageBackground, View, type ViewProps } from 'react-native';

import { useTheme } from '@/context/ThemeContext'; // Import useTheme to get background URI
import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) { // Ensure flex: 1 if it's a root view
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const { backgroundImageUri, blurIntensity } = useTheme(); // Get the background image URI and blur intensity

  if (backgroundImageUri) { // Only apply image background if URI exists
 return (
      <ImageBackground
        source={{ uri: backgroundImageUri }}
        style={[
          { flex: 1 }, // Ensure it takes up space
          { backgroundColor }, style
        ]} // Apply background color as well
        resizeMode="cover" // Or 'stretch', 'contain' as needed
        blurRadius={blurIntensity}
        {...otherProps}
      />
    );
  } else {
    return (
      <View style={[{ backgroundColor }, style]} {...otherProps} />);
  }
}

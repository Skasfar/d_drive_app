import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const TILE_SIZE = width / 2 - 24;

interface Tile {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  navigate?: string; // For simple navigation
  action?: () => void; // For custom actions
}

const tiles: Tile[] = [
  {
    id: '1',
    title: 'Accounts',
    icon: 'person-outline',
    color: '#007AFF',
    navigate: 'explore',
  },
  {
    id: '2',
    title: 'Dark Mode',
    icon: 'moon-outline',
    color: '#333333',
    // navigate: '', // Action will be handled by id or custom action property
  },
  {
    id: '3',
    title: 'Settings',
    icon: 'settings-outline',
    color: '#5856D6',
    navigate: 'settings',
  },
  {
    id: '4',
    title: 'Cloud Sync',
    icon: 'cloud-upload-outline',
    color: '#FF9500',
    // navigate: '', // Action will be handled by id or custom action property
  }, {
    id: '5',
    title: 'Secure Folder',
    icon: 'lock-closed-outline', // Changed icon
    color: '#BE1515',
    // No 'navigate' key, will be handled by id in onPress
  },
  {
  id: '6',
  title: 'File Manager',
  icon: 'folder-outline',
  color: '#2E6B15',
  navigate: 'FileManagerScreen', // Simple navigation
},

];

export default function HomeScreen() {
  const navigation = useNavigation();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">One Stop</ThemedText>
      </View>

      <FlatList
        data={tiles}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TileButton
            icon={item.icon} // Already typed by Tile[]
            
            title={item.title}
            color={item.color}
            onPress={() => {
              if (item.id === '5') { // Secure Folder
                // @ts-ignore - Ensure LockScreen is a valid route name
                navigation.navigate('secure/LockScreen'); 
              } else if (item.navigate) {
                // @ts-ignore
                navigation.navigate(item.navigate);
              } else if (item.action) {
                item.action();
              }
              // Example: Handle other non-navigating tiles if needed
              // else if (item.id === '2') { // Dark Mode tile
              //   console.log("Dark Mode tile pressed - implement action");
              // }
            }}
          />
        )}
      />
    </ThemedView>
  );
}
interface TileButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  color: string;
  onPress: () => void;
}
function TileButton({ icon, title, color, onPress }: TileButtonProps) {
  return (
    <TouchableOpacity style={[styles.tile, { backgroundColor: color }]} onPress={onPress}>
      <Ionicons name={icon} size={32} color="#fff" />
      <ThemedText type="defaultSemiBold" style={styles.tileText}>
        {title}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    // gap: 6, // Removed to prevent whitespace warning.
  },
  grid: {
    justifyContent: 'space-between',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 2,
    padding: 16,
    margin: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 8,
  },
});

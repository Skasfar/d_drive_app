import React from 'react';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { HelloWave } from '@/components/HelloWave';

const { width } = Dimensions.get('window');
const TILE_SIZE = width / 2 - 24;

const tiles = [
  {
    id: '1',
    title: 'Explore',
    icon: 'rocket-outline',
    color: '#007AFF',
    navigate: 'explore',
  },
  {
    id: '2',
    title: 'Dark Mode',
    icon: 'moon-outline',
    color: '#333333',
    navigate: '',
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
    title: 'Profile',
    icon: 'person-outline',
    color: '#FF9500',
    navigate: '',
  }, {
    id: '5',
    title: 'Profile',
    icon: 'person-outline',
    color: '#BE1515',
    navigate: 'explore',
  },
  {
  id: '6',
  title: 'File Manager',
  icon: 'folder-outline',
  color: '#2E6B15',
  navigate: 'FileManagerScreen',
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
            icon={item.icon}
            
            title={item.title}
            color={item.color}
            onPress={() => {
              if (item.navigate) navigation.navigate(item.navigate);
            }}
          />
        )}
      />
    </ThemedView>
  );
}

function TileButton({ icon, title, color, onPress }) {
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
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 6,
  },
  grid: {
    justifyContent: 'space-between',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 2,
    padding: 16,
    margin: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 8,
  },
});

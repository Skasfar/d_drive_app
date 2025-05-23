// File: screens/FileManagerScreen.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Foundation, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

interface FileSystemEntry {
  name: string;
  uri: string;
  isDirectory: boolean;
}

interface PathHistoryEntry {
  path: string;
  name: string;
}

const APP_DOCS_NAME = 'Xplorer';

const getFileIconName = (fileName: string, isDirectory: boolean): keyof typeof Ionicons.glyphMap => {
  if (isDirectory) {
    return "folder-outline";
  }
  const extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'bmp': case 'webp':
      return "image-outline";
    case 'pdf':
      return "document-text-outline";
    case 'mp3': case 'wav': case 'aac': case 'm4a':
      return "musical-notes-outline";
    // Add more cases for other common file types (video, archive, etc.)
    default:
      return "document-outline";
  }
};
export default function FileManagerScreen() {
  const [directoryContents, setDirectoryContents] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const initialPath = FileSystem.documentDirectory || '';
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [currentPathName, setCurrentPathName] = useState<string>(APP_DOCS_NAME);
  const [pathHistory, setPathHistory] = useState<PathHistoryEntry[]>([]);
  const [isPickingDirectory, setIsPickingDirectory] = useState<boolean>(false);

  const loadFiles = useCallback(async (pathToLoad: string, pathNameToLoad: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!pathToLoad) {
        setError("No directory selected or available.");
        setDirectoryContents([]);
        return;
      }

      let entries: FileSystemEntry[] = [];

      if (pathToLoad.startsWith('content://')) { // SAF URI
        const filesInDirectory = await FileSystem.StorageAccessFramework.readDirectoryAsync(pathToLoad);
        for (const fileUri of filesInDirectory) {
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            console.log(`[SAF Load] URI: ${fileUri}, isDirectory: ${info.isDirectory}, Exists: ${info.exists}, Name: ${info.name}`);
            if (info.exists) {
              entries.push({
                name: info.name || decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1)), // Prefer info.name if available
                uri: fileUri,
                isDirectory: info.isDirectory,
              });
            } else {
              console.warn(`[SAF Load] URI ${fileUri} was listed but getInfoAsync reports it does not exist. Adding as file.`);
              entries.push({
                name: decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1)),
                uri: fileUri,
                isDirectory: false, // Fallback assumption
              });
            }
          } catch (itemError: any) {
            console.error(`[SAF Load] Error getting info for URI ${fileUri}: ${itemError.message}. Adding as file.`);
            // If getInfoAsync throws (e.g., "Function not implemented"), make a best guess.
            entries.push({
              name: decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1)),
              uri: fileUri,
              isDirectory: false, // Default to file if info cannot be retrieved
            });
          }
        }
      } else { // Regular file system path
        const filesInDirectory = await FileSystem.readDirectoryAsync(pathToLoad);
        for (const fileName of filesInDirectory) {
          // Ensure correct path joining
          const fileUri = `${pathToLoad.endsWith('/') ? pathToLoad : pathToLoad + '/'}${fileName}`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists) {
            entries.push({
              name: fileName,
              uri: fileUri,
              isDirectory: info.isDirectory,
            });
          }
        }
      }
      // Sort entries: directories first, then files, all alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setDirectoryContents(entries);
    } catch (e: any) {
      console.error(`Failed to read directory ${pathToLoad}:`, e);
      setError(`Failed to load files from ${pathNameToLoad}: ${e.message}`);
      setDirectoryContents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPath) {
      loadFiles(currentPath, currentPathName);
    }
  }, [currentPath, currentPathName, loadFiles]);

  const navigateUp = useCallback(() => {
    if (pathHistory.length > 0) {
      const previousPathEntry = pathHistory[pathHistory.length - 1];
      setPathHistory(prevHistory => prevHistory.slice(0, -1));
      setCurrentPath(previousPathEntry.path);
      setCurrentPathName(previousPathEntry.name);
    } else {
      Alert.alert("Top Level", "You are at the highest level for the current view. Use 'Select Folder' to choose a different root.");
    }
  }, [pathHistory]);

  useEffect(() => {
    const backAction = () => {
      if (pathHistory.length > 0) {
        navigateUp();
        return true; // Prevent default behavior (exit screen)
      }
      return false; // Allow default behavior (exit screen or navigate back in stack)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove(); // Cleanup listener on unmount
  }, [pathHistory, navigateUp]);


  const pickDirectory = async () => {
    if (isPickingDirectory) return; // Prevent multiple requests

    if (Platform.OS !== 'android') {
      Alert.alert("Feature not available", "Directory picking via SAF is for Android.");
      return;
    }
    setIsPickingDirectory(true);
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        setPathHistory([]); // Reset history when a new root is picked
        setCurrentPath(permissions.directoryUri);
        const lastSegment = permissions.directoryUri.substring(permissions.directoryUri.lastIndexOf('/') + 1);
        setCurrentPathName(decodeURIComponent(lastSegment) || 'Selected Folder');
      } else {
        Alert.alert("Permission Denied", "Could not access the directory.");
      }
    } catch (err: any) {
      console.error("Error picking directory:", err);
      Alert.alert("Error", `An error occurred while picking the directory: ${err.message}`);
    } finally {
      setIsPickingDirectory(false);
    }
  };

  const getLocalUriForSharing = async (uri: string): Promise<string> => {
    console.log(`[getLocalUriForSharing] Received URI: ${uri}`);
    if (uri.startsWith('file://')) {
      console.log(`[getLocalUriForSharing] URI is already file://: ${uri}`);
      return uri; // Already a local file URI
    }

    if (uri.startsWith('content://')) {
      console.log(`[getLocalUriForSharing] URI is content://: ${uri}`);
      // For content URIs, copy to a temporary local file to share
      // Ensure cacheDirectory ends with a slash, though Expo docs say it does.
      const cacheDir = FileSystem.cacheDirectory!.endsWith('/') ? FileSystem.cacheDirectory! : `${FileSystem.cacheDirectory!}/`;
      
      let decodedName = `file_${Date.now()}`; // Fallback name with timestamp
      try {
        const lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
        decodedName = decodeURIComponent(lastSegment);
      } catch (e) {
        console.warn(`[getLocalUriForSharing] Could not decode segment from URI ${uri}`, e);
      }
      // Sanitize filename
      const sanitizedFileName = decodedName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
      // Ensure uniqueness for cache, even if original names are similar after sanitization
      const uniqueCacheFileName = `${Date.now()}_${sanitizedFileName}`;
      const localCacheUri = `${cacheDir}${uniqueCacheFileName}`;

      console.log(`[getLocalUriForSharing] Attempting to copy to local cache: ${localCacheUri}`);
      try {
        await FileSystem.copyAsync({ from: uri, to: localCacheUri });
        console.log(`[getLocalUriForSharing] Copied successfully. Returning local URI: ${localCacheUri}`);
        return localCacheUri;
      } catch (copyError: any) {
        console.error(`[getLocalUriForSharing] Error copying content URI to local cache (from: ${uri}, to: ${localCacheUri}):`, copyError.message, copyError.code, copyError);
        throw new Error(`Failed to prepare '${sanitizedFileName}' for sharing. Copy to cache failed: ${copyError.message}`);
      }
    }

    // If URI scheme is neither file:// nor content://
    console.warn(`[getLocalUriForSharing] Unsupported URI scheme: ${uri}`);
    throw new Error("Unsupported URI scheme for sharing.");
  };

  const openFile = async (item: FileSystemEntry) => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Uh oh", "Sharing isn't available on your platform");
      return;
    }
    try {
      const localUriToShare = await getLocalUriForSharing(item.uri);
      await Sharing.shareAsync(localUriToShare);
    } catch (error: any) {
      console.error("Error sharing file:", error);
      Alert.alert("Error", `Could not open file: ${error.message}`);
    }
  };

  const navigateToDirectory = (item: FileSystemEntry) => {
    if (item.isDirectory) {
      setPathHistory(prevHistory => [...prevHistory, { path: currentPath, name: currentPathName }]);
      setCurrentPath(item.uri);
      setCurrentPathName(item.name);
    } else {
      // This is a file, attempt to open it
      openFile(item);
    }
  };

  // Conceptual delete function - can be expanded and triggered via UI (e.g., long press)
  const handleDelete = async (itemToDelete: FileSystemEntry) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete "${itemToDelete.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              if (itemToDelete.uri.startsWith('content://')) {
                await FileSystem.StorageAccessFramework.deleteAsync(itemToDelete.uri);
              } else if (itemToDelete.uri.startsWith('file://')) {
                await FileSystem.deleteAsync(itemToDelete.uri, { idempotent: true });
              } else {
                throw new Error("Unsupported URI scheme for deletion.");
              }
              Alert.alert("Success", `"${itemToDelete.name}" has been deleted.`);
              loadFiles(currentPath, currentPathName); // Refresh list
            } catch (deleteError: any) {
              console.error(`Error deleting ${itemToDelete.name}:`, deleteError);
              Alert.alert("Error", `Could not delete "${itemToDelete.name}": ${deleteError.message}`);
              setLoading(false);
            }
          },
        },
      ]
    );
  };

interface FileListItemProps {
  item: FileSystemEntry;
  onPress: (item: FileSystemEntry) => void;
  onLongPress: (item: FileSystemEntry) => void;
}

const FileListItem: React.FC<FileListItemProps> = ({ item, onPress, onLongPress }) => {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  const isImageFile = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(item.name);

  useEffect(() => {
    let isMounted = true;
    const generateThumbnail = async () => {
      // Reset states for new item, especially when item.uri changes
      if (isMounted) {
        setThumbnailUri(null);
        setThumbnailError(false);
      }

      // Reset states for new item
      if (isMounted) {
        setThumbnailUri(null);
        setThumbnailError(false);
      }

      if (isImageFile && !item.isDirectory) {
        if (item.uri.startsWith('content://')) {
          try {
            // Use a similar caching logic as getLocalUriForSharing, but maybe a different sub-folder or naming
            const cacheDir = FileSystem.cacheDirectory!.endsWith('/') ? FileSystem.cacheDirectory! : `${FileSystem.cacheDirectory!}/`;
            const fileName = `thumb_${Date.now()}_${item.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0,50)}`;
            const localUri = `${cacheDir}${fileName}`;
            await FileSystem.copyAsync({ from: item.uri, to: localUri });
            if (isMounted) setThumbnailUri(localUri);
          } catch (e) {
            console.error("Error caching image for thumbnail:", item.uri, e);
            if (isMounted) setThumbnailError(true);
          }
        } else if (item.uri.startsWith('file://')) {
          if (isMounted) setThumbnailUri(item.uri); // Direct use for local files
        }
      }
    };

    generateThumbnail();
    return () => { 
      isMounted = false; 
      // Optional: Advanced cleanup of thumbnailUri if it's a cached file
      // if (thumbnailUri && thumbnailUri.startsWith(FileSystem.cacheDirectory!)) {
      //   FileSystem.deleteAsync(thumbnailUri, { idempotent: true }).catch(e => console.log("Error cleaning up thumb", e));
      // }
    };
  }, [item.uri]); // item.uri is the primary dependency that should trigger this. Other item props are derived or constant for a given URI.

  return (
    <TouchableOpacity 
      style={styles.fileItem} 
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <View style={styles.fileInfoContainer}>
        {isImageFile && thumbnailUri && !thumbnailError ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} onError={() => { if(isMounted) setThumbnailError(true); }} />
        ) : (
          <Ionicons 
            name={thumbnailError && isImageFile ? "image-outline" : getFileIconName(item.name, item.isDirectory)} 
            size={24} 
            color={item.isDirectory ? "#FFC107" : "#555"} // Example: Make folder icons yellow
            style={styles.fileIcon} />
        )}
        <ThemedText style={styles.fileName} numberOfLines={1}>{item.name}</ThemedText>
      </View>
    </TouchableOpacity>
  );
};


  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10 }}>Loading files...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerContainer}>
        {pathHistory.length > 0 && (
          <TouchableOpacity onPress={navigateUp} style={styles.upButton}>
            <Ionicons name="arrow-up-circle-outline" size={28} color="#007AFF" />
            <ThemedText style={styles.upButtonText}>Up</ThemedText>
          </TouchableOpacity>
        )}
        <ThemedText type="title" style={styles.title} numberOfLines={1} ellipsizeMode="middle">
           {currentPathName}
        </ThemedText>
        {Platform.OS === 'android' && (
          <Foundation name="folder-add" size={44} color="blue" onPress={pickDirectory} disabled={isPickingDirectory}  />
          
          
        )}
      </View>
      {directoryContents.length === 0 && !loading && (
        <ThemedText style={styles.emptyText}>No files found in this directory.</ThemedText>
      )}
      <FlatList
        data={directoryContents}
        keyExtractor={(item) => item.uri} // URI should be unique
        renderItem={({ item }) => (
          <FileListItem 
            item={item} 
            onPress={navigateToDirectory} 
            onLongPress={handleDelete} 
          />
        )}
        // Performance optimizations for FlatList (optional but recommended for long lists)
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={21}
        removeClippedSubviews={true} // Can have caveats, test thoroughly
        getItemLayout={(_data, index) => (
          // Assuming a fixed height for items, adjust if dynamic
          // This helps with performance by avoiding onLayout measurements
          { length: 60, offset: 60 * index, index } 
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40, 
    
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginStart:0,
    marginEnd:0,
    paddingHorizontal: 8,
  },
  upButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  upButtonText: {
    marginLeft: 4,
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', 
    // Ensure a consistent height for getItemLayout to work accurately
    height: 60, 
    paddingVertical: 10, // Adjust padding if height is fixed
    paddingHorizontal: 8,
    borderBottomColor: '#ccc',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileInfoContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Allow this container to take up available space before any potential options icon
  },
  fileIcon: {
    marginRight: 10,
  },
  fileName: {
    fontSize: 16,
    flexShrink: 1, // Allow text to shrink if too long
    flex: 1, // Allow filename to take available space within fileInfoContainer
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  thumbnail: { 
    width: 40,
    height: 40,
    marginRight: 10,
    resizeMode: 'cover',
    borderRadius: 4, // Optional: for rounded corners
  },
});

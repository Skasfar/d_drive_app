// File: screens/FileManagerScreen.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Foundation, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router'; // Import useRouter and useLocalSearchParams
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

const APP_DOCS_NAME = 'File Manager';
const LAST_PATH_KEY = 'FileManager_LastPath';
const LAST_PATH_NAME_KEY = 'FileManager_LastPathName';
// AsyncStorage key for imported folder metadata
const SECURE_FOLDER_METADATA_KEY = 'SecureFolderMetadata';

// Interface for metadata of a single imported folder
interface SecureFolderMeta {
  originalUri: string;    // The URI of the folder in its original location (e.g., content://...)
  originalName: string;   // User-friendly name of the original folder
  importedDate: string;   // ISO date string of when it was imported
}
interface SecureFolderMetadataStore {
  [secureFolderBasename: string]: SecureFolderMeta; // Keyed by the folder's name within .SecureVault
}
// Constants for the Secure Folder feature
const PRIVATE_SECURE_FOLDER_BASENAME = '.SecureVault'; // Dot prefix for convention, stored in app's documentDirectory
const PRIVATE_SECURE_FOLDER_DISPLAY_NAME = 'Secure Vault';


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
    case 'mp4': case 'mov': case 'mkv': case 'webm': // Video files
      return "videocam-outline";
    case 'mp3': case 'wav': case 'aac': case 'm4a':
      return "musical-notes-outline";
    // Add more cases for other common file types (video, archive, etc.)
    default:
      return "document-outline";
  }
};

const getMimeType = (fileName: string): string => {
  const extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'pdf': return 'application/pdf';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'mp4': return 'video/mp4';
    case 'txt': return 'text/plain';
    // Add more common types
    default: return 'application/octet-stream'; // Generic binary
  }
};
export default function FileManagerScreen() {
  const defaultDocPath = FileSystem.documentDirectory || '';
  const routeParams = useLocalSearchParams<{ openPrivateFolder?: string }>(); // For expo-router
  const defaultDocName = APP_DOCS_NAME;

  const [directoryContents, setDirectoryContents] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(''); // Will be set by initial load effect
  const [currentPathName, setCurrentPathName] = useState<string>(''); // Will be set by initial load effect
  const [pathHistory, setPathHistory] = useState<PathHistoryEntry[]>([]);
  const [isPickingDirectory, setIsPickingDirectory] = useState<boolean>(false);
  const [itemsToMove, setItemsToMove] = useState<FileSystemEntry[]>([]);
  const router = useRouter(); // For expo-router navigation
  const [isMoveModeActive, setIsMoveModeActive] = useState<boolean>(false);
  const [selectedItemUris, setSelectedItemUris] = useState<Set<string>>(new Set());
  const [isSelectionModeActive, setIsSelectionModeActive] = useState<boolean>(false);
  const [initialPathLoading, setInitialPathLoading] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const saveLastPath = async (path: string, name: string) => {
    try {
      await AsyncStorage.setItem(LAST_PATH_KEY, path);
      await AsyncStorage.setItem(LAST_PATH_NAME_KEY, name);
      console.log(`[Save Path] Saved: ${name} (${path})`);
    } catch (e) {
      console.error("Failed to save the last path.", e);
    }
  };

  // Function to load metadata for all imported folders
  const loadSecureFolderMetadata = async (): Promise<SecureFolderMetadataStore> => {
    try {
      const metaJson = await AsyncStorage.getItem(SECURE_FOLDER_METADATA_KEY);
      return metaJson ? JSON.parse(metaJson) : {};
    } catch (e) {
      console.error("Failed to load secure folder metadata", e);
      return {};
    }
  };

  // Function to save metadata for all imported folders
  const saveSecureFolderMetadata = async (metadata: SecureFolderMetadataStore) => {
    try {
      await AsyncStorage.setItem(SECURE_FOLDER_METADATA_KEY, JSON.stringify(metadata));
    } catch (e) {
      console.error("Failed to save secure folder metadata", e);
    }
  };


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
          const documentId = decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1));
          const lastSlashInDocId = documentId.lastIndexOf('/');
          const lastColonInDocId = documentId.lastIndexOf(':');
          const nameStartIndex = Math.max(lastSlashInDocId, lastColonInDocId) + 1;
          const leafName = documentId.substring(nameStartIndex);

          if (leafName.startsWith('.')) {
            console.log(`[SAF Load] Skipping hidden item by leaf name: '${leafName}' from docId: '${documentId}' (URI: ${fileUri})`);
            continue;
          }
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            const name = decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1));

            console.log(`[SAF Load] URI: ${fileUri}, isDirectory: ${info.isDirectory}, Exists: ${info.exists}, InfoName: ${name !== undefined ? name : "undefined"}`);
            if (info.exists) {
              entries.push({
                name: name || decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1)),
                uri: fileUri,
                isDirectory: info.isDirectory,
              });
            } else {
              console.warn(`[SAF Load] URI ${fileUri} was listed by readDirectoryAsync but getInfoAsync reports it does not exist. Treating as file.`);
              entries.push({
                name: decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1)),
                uri: fileUri,
                isDirectory: false,
              });
            }
          } catch (itemError: any) {
            const itemName = decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1));
            console.warn(`[SAF Load] getInfoAsync failed for ${itemName} (URI: ${fileUri}): ${itemError.message}. Attempting to determine type.`);
            try {
              await FileSystem.StorageAccessFramework.readDirectoryAsync(fileUri);
              console.log(`[SAF Load] Determined ${itemName} (URI: ${fileUri}) is a directory after getInfoAsync failed.`);
              entries.push({ name: itemName, uri: fileUri, isDirectory: true });
            } catch (readDirError: any) {
              console.log(`[SAF Load] Determined ${itemName} (URI: ${fileUri}) is a file after getInfoAsync and readDirectoryAsync failed.`);
              entries.push({ name: itemName, uri: fileUri, isDirectory: false });
            }
          }
        }
      } else { // Regular file system path
        const filesInDirectory = await FileSystem.readDirectoryAsync(pathToLoad);
        for (const fileName of filesInDirectory) {
          if (fileName.startsWith('.')) {
            // console.log(`[FS Load] Skipping hidden item: ${fileName}`); // Less verbose
            continue;
          }
          const fileUri = `${pathToLoad.endsWith('/') ? pathToLoad : pathToLoad + '/'}${fileName}`;
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists) {
              // Use the potentially unsanitized fileName for display if that's what's on disk,
              // but be aware this might be the source of truth for what's stored.
              // The key is that `fileUri` must be valid for `getInfoAsync`.
              entries.push({
                name: fileName, // This is the name as it exists on the file system
                uri: fileUri,
                isDirectory: info.isDirectory,
              });
            } else {
              console.warn(`[FS Load] File ${fileName} (URI: ${fileUri}) listed but getInfoAsync reports it does not exist. Skipping.`);
            }
          } catch (infoError: any) {
            // If getInfoAsync fails for a specific item, log it and skip that item.
            console.error(`[FS Load] Error getting info for ${fileUri} (original name: ${fileName}): ${infoError.message}. Skipping item.`);
          }
        }
      }
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
    const loadInitialPathFromStorage = async () => {
      setInitialPathLoading(true);
      try {
        if (routeParams.openPrivateFolder === 'true') {
          const docDir = FileSystem.documentDirectory;
          if (!docDir) {
            throw new Error("Application document directory is not available for Secure Folder.");
          }
          const privatePath = `${docDir.endsWith('/') ? docDir : docDir + '/'}${PRIVATE_SECURE_FOLDER_BASENAME}`;

          await FileSystem.makeDirectoryAsync(privatePath, { intermediates: true });
          console.log(`[Initial Load] Navigating to Secure Folder: ${PRIVATE_SECURE_FOLDER_DISPLAY_NAME} (${privatePath})`);

          setCurrentPath(privatePath);
          setCurrentPathName(PRIVATE_SECURE_FOLDER_DISPLAY_NAME);
          setPathHistory([]);
          // Optionally, save this path if you want the secure folder to be remembered
          // await saveLastPath(privatePath, PRIVATE_SECURE_FOLDER_DISPLAY_NAME);
        } else {
          const storedPath = await AsyncStorage.getItem(LAST_PATH_KEY);
          const storedPathName = await AsyncStorage.getItem(LAST_PATH_NAME_KEY);

          if (storedPath && storedPathName) {
            console.log(`[Initial Load] Found stored path: ${storedPathName} (${storedPath})`);
             try {
                const info = await FileSystem.getInfoAsync(storedPath);
                if (!info.exists || !info.isDirectory) {
                    throw new Error("Stored path no longer exists or is not a directory.");
                }
                setCurrentPath(storedPath);
                setCurrentPathName(storedPathName);
                setPathHistory([]);
            } catch (validationError: any) {
                console.warn(`[Initial Load] Stored path ${storedPathName} (${storedPath}) is invalid, falling back to default:`, validationError.message);
                setCurrentPath(defaultDocPath);
                setCurrentPathName(defaultDocName);
                setPathHistory([]);
                await AsyncStorage.removeItem(LAST_PATH_KEY);
                await AsyncStorage.removeItem(LAST_PATH_NAME_KEY);
            }
          } else {
            console.log('[Initial Load] No stored path found, using default.');
            setCurrentPath(defaultDocPath);
            setCurrentPathName(defaultDocName);
            setPathHistory([]);
          }
        }
      } catch (e: any) {
        console.error("Failed to load initial path:", e);
        setError(`Initialization Error: ${e.message}`);
        setCurrentPath(defaultDocPath);
        setCurrentPathName(defaultDocName);
        setPathHistory([]);
      } finally {
        setInitialPathLoading(false);
      }
    };
    loadInitialPathFromStorage();
  }, [defaultDocPath, defaultDocName, routeParams.openPrivateFolder]); // Added routeParams.openPrivateFolder

  useEffect(() => {
    if (!initialPathLoading && currentPath) {
      loadFiles(currentPath, currentPathName);
    }
  }, [initialPathLoading, currentPath, currentPathName, loadFiles]);

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
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [pathHistory, navigateUp]);


  const pickDirectory = async () => {
    if (isPickingDirectory) return;

    if (Platform.OS !== 'android') {
      Alert.alert("Feature not available", "Directory picking via SAF is for Android.");
      return;
    }
    setIsPickingDirectory(true);
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const newPath = permissions.directoryUri;
        setPathHistory([]);
        setCurrentPath(newPath);
        const lastSegment = newPath.substring(newPath.lastIndexOf('/') + 1);
        const newPathName = decodeURIComponent(lastSegment) || 'Selected Folder';
        setCurrentPathName(newPathName);
        await saveLastPath(newPath, newPathName);
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

  const copyDirectoryRecursively = async (
    sourceItemUri: string, // URI of the current item (file or folder) to copy
    destinationParentFileSystemPath: string, // file:// path of the parent directory in .SecureVault where this item should be copied
    onProgress: (message: string) => void
  ): Promise<void> => {
    const sourceInfo = await FileSystem.getInfoAsync(sourceItemUri);
  

    if (!sourceInfo.exists) {
      onProgress(`Skipped: ${sourceItemUri} (source does not exist)`);
      console.warn(`Source item ${sourceItemUri} does not exist. Skipping copy.`);
      return;
    }

    // Determine item name. For SAF URIs, getInfoAsync().name is preferred.
    const name = decodeURIComponent(sourceItemUri.substring(sourceItemUri.lastIndexOf('/') + 1));
    let itemName = name;

    if (!itemName) { // Fallback if sourceInfo.name is not available
      const uriSegment = sourceItemUri.substring(sourceItemUri.lastIndexOf('/') + 1);
      const decodedSegment = decodeURIComponent(uriSegment);
      // Basic extraction, trying to get the actual name part after any SAF-specific prefixes
      const lastSlash = decodedSegment.lastIndexOf('/');
      const lastColon = decodedSegment.lastIndexOf(':'); // Colon is often part of SAF prefixes
      itemName = decodedSegment.substring(Math.max(lastSlash, lastColon) + 1);
      if (!itemName) { // If still no name, use a generic placeholder
          itemName = `unknown_item_${Date.now()}`;
          console.warn(`Could not determine item name for URI: ${sourceItemUri}, using placeholder: ${itemName}`);
      }
    }

    // Sanitize the item name for the local file system: replace colons and other problematic characters.
    // Replace colons first, then any remaining non-standard characters.
    // Standard characters: alphanumeric, dot, underscore, hyphen, space.
    let sanitizedItemName = itemName.replace(/:/g, '_'); // Replace colons
    sanitizedItemName = sanitizedItemName.replace(/[^a-zA-Z0-9._\-\s]/g, '_'); // Replace other invalid chars
    sanitizedItemName = sanitizedItemName.replace(/\s+/g, ' ').trim(); // Normalize multiple spaces to one and trim

    if (!sanitizedItemName.trim()) { // Check if name is empty or only whitespace after sanitization
        onProgress(`Skipped: ${sourceItemUri} (invalid name after sanitization: original '${itemName}')`);
        console.warn(`Could not form a valid sanitized name for item from URI: ${sourceItemUri} (original name: '${itemName}', sanitized: '${sanitizedItemName}')`);
        return;
    }
    
    console.log(`[CopyRecursive] Original name: "${itemName}", Sanitized name: "${sanitizedItemName}"`);

    const destinationItemFileSystemPath = `${destinationParentFileSystemPath.endsWith('/') ? destinationParentFileSystemPath : destinationParentFileSystemPath + '/'}${sanitizedItemName}`;
    onProgress(`Processing: ${sanitizedItemName}`);

    if (sourceInfo.isDirectory) {
      onProgress(`Creating directory: ${sanitizedItemName}`);
      await FileSystem.makeDirectoryAsync(destinationItemFileSystemPath, { intermediates: true });
      
      let childUris: string[];
      if (sourceItemUri.startsWith('content://')) { // Source is SAF URI
        childUris = await FileSystem.StorageAccessFramework.readDirectoryAsync(sourceItemUri);
      } else { // Source is file:// URI
        const childNames = await FileSystem.readDirectoryAsync(sourceItemUri);
        childUris = childNames.map(name => `${sourceItemUri.endsWith('/') ? sourceItemUri : sourceItemUri + '/'}${name}`);
      }

      for (const childUri of childUris) {
        // childUri is the full URI of the child.
        // destinationItemFileSystemPath is the parent directory where this child will be copied.
        await copyDirectoryRecursively(childUri, destinationItemFileSystemPath, onProgress);
      }
    } else { // It's a file
      onProgress(`Copying file: ${sanitizedItemName}`);
      await FileSystem.copyAsync({ from: sourceItemUri, to: destinationItemFileSystemPath });
    }
  };
  
  // Deletes a directory and its contents using SAF. SAF's deleteAsync is recursive.
  const deleteDirectoryRecursivelySAF = async (
    directoryUri: string,
    onProgress: (message: string) => void
  ): Promise<void> => {
    onProgress(`Deleting original: ${directoryUri}`);
    await FileSystem.StorageAccessFramework.deleteAsync(directoryUri); // This is recursive
    onProgress(`Deleted original: ${directoryUri}`);
  };

  const handleImportFolder = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert("Not Supported", "Folder import is currently Android-only.");
      return;
    }

    try {
      // Let user pick a directory from external storage
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert("Permission Denied", "Cannot import folder without permissions.");
        return;
      }

      const sourceDirectoryUri = permissions.directoryUri;
      // Attempt to get a user-friendly name for the source directory
      const sourceDirectoryName = decodeURIComponent(sourceDirectoryUri.substring(sourceDirectoryUri.lastIndexOf('/') + 1)) || "ImportedFolder";
      
      Alert.alert(
        "Confirm Import",
        `Import "${sourceDirectoryName}" to Secure Vault?\n\nThis will COPY the folder into the app's private storage and then DELETE the original folder. This action is destructive to the original.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import & Delete Original",
            style: "destructive",
            onPress: async () => {
              setIsImporting(true);
              setImportProgress(`Starting import of "${sourceDirectoryName}"...`);
              try {
                const docDir = FileSystem.documentDirectory;
                if (!docDir) throw new Error("Application document directory is not available.");
                
                const secureVaultPath = `${docDir.endsWith('/') ? docDir : docDir + '/'}${PRIVATE_SECURE_FOLDER_BASENAME}`;
                await FileSystem.makeDirectoryAsync(secureVaultPath, { intermediates: true });

                // Sanitize the top-level destination folder name as well
                let sanitizedDestinationFolderName = sourceDirectoryName.replace(/:/g, '_');
                sanitizedDestinationFolderName = sanitizedDestinationFolderName.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
                sanitizedDestinationFolderName = sanitizedDestinationFolderName.replace(/\s+/g, ' ').trim();
                const finalDestinationPathForThisImport = `${secureVaultPath.endsWith('/') ? secureVaultPath : secureVaultPath + '/'}${sanitizedDestinationFolderName}`;

                const existingInfo = await FileSystem.getInfoAsync(finalDestinationPathForThisImport).catch(() => ({exists: false}));
                if (existingInfo.exists) {
                  throw new Error(`A folder named "${sanitizedDestinationFolderName}" already exists in the Secure Vault.`);
                }
                await FileSystem.makeDirectoryAsync(finalDestinationPathForThisImport, { intermediates: true });
                setImportProgress(`Copying contents of "${sourceDirectoryName}"...`);

                const childUrisOfSource = await FileSystem.StorageAccessFramework.readDirectoryAsync(sourceDirectoryUri);
                for (const childUri of childUrisOfSource) {
                    await copyDirectoryRecursively(childUri, finalDestinationPathForThisImport, setImportProgress);
                }
                setImportProgress(`Successfully copied "${sourceDirectoryName}". Now deleting original...`);
                await deleteDirectoryRecursivelySAF(sourceDirectoryUri, setImportProgress);
                
                const metadata = await loadSecureFolderMetadata();
                metadata[sanitizedDestinationFolderName] = { originalUri: sourceDirectoryUri, originalName: sourceDirectoryName, importedDate: new Date().toISOString() };
                await saveSecureFolderMetadata(metadata);

                setImportProgress(`Import of "${sourceDirectoryName}" complete!`);
                Alert.alert("Import Complete", `"${sourceDirectoryName}" has been imported to Secure Vault and the original deleted.`);
                if (currentPath === secureVaultPath || currentPath === finalDestinationPathForThisImport) loadFiles(currentPath, currentPathName);
              } catch (importError: any) {
                Alert.alert("Import Error", `Failed to import folder: ${importError.message}`);
                setImportProgress(`Error: ${importError.message}`);
              } finally { setIsImporting(false); setTimeout(() => setImportProgress(''), 7000); }
            },
          },
        ]
      );
    } catch (e: any) { Alert.alert("Error", `Could not start import: ${e.message}`); }
  };

  const getLocalUriForSharing = async (uri: string): Promise<string> => {
    console.log(`[getLocalUriForSharing] Received URI: ${uri}`);
    if (uri.startsWith('file://')) {
      console.log(`[getLocalUriForSharing] URI is already file://: ${uri}`);
      return uri;
    }

    if (uri.startsWith('content://')) {
      console.log(`[getLocalUriForSharing] URI is content://: ${uri}`);
      const cacheDir = FileSystem.cacheDirectory!.endsWith('/') ? FileSystem.cacheDirectory! : `${FileSystem.cacheDirectory!}/`;

      let decodedName = `file_${Date.now()}`;
      try {
        const lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
        decodedName = decodeURIComponent(lastSegment);
      } catch (e) {
        console.warn(`[getLocalUriForSharing] Could not decode segment from URI ${uri}`, e);
      }
      const sanitizedFileName = decodedName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
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

  const isViewableMedia = (fileName: string): boolean => {
    const extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'mp4', 'mov', 'mkv', 'webm'].includes(extension);
  };

  const isAudioFile = (fileName: string): boolean => {
    const extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
    return ['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(extension);
  }

const navigateToDirectory = async (item: FileSystemEntry) => {
  if (item.isDirectory) {
    setPathHistory(prevHistory => [...prevHistory, { path: currentPath, name: currentPathName }]);
    setCurrentPath(item.uri);
    setCurrentPathName(item.name);
    await saveLastPath(item.uri, item.name);
  } else if (isViewableMedia(item.name) || isAudioFile(item.name)) {
    try {
      const info = await FileSystem.getInfoAsync(item.uri);
      if (!info.exists) {
        Alert.alert("Error", "File not found.");
        return;
      }

      // Force copy to local cache
      const localUri = `${FileSystem.cacheDirectory}${Date.now()}_${item.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await FileSystem.copyAsync({ from: item.uri, to: localUri });

      router.push({
        pathname: '/media-viewer',
        params: { uri: localUri, name: item.name },
      });

    } catch (e) {
      Alert.alert("Error", `Unable to open file: ${e.message}`);
    }
  } else {
    openFile(item);
  }
};


  const confirmSingleItemDelete = async (itemToDelete: FileSystemEntry) => {
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
              loadFiles(currentPath, currentPathName);
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

  const confirmBatchDelete = async () => {
    if (selectedItemUris.size === 0) {
      Alert.alert("No items selected", "Please select items to delete.");
      return;
    }
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete ${selectedItemUris.size} selected item(s)? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            let successCount = 0;
            let errorCount = 0;
            for (const uri of selectedItemUris) {
              const itemToDelete = directoryContents.find(item => item.uri === uri);
              if (itemToDelete) {
                try {
                  if (itemToDelete.uri.startsWith('content://')) {
                    await FileSystem.StorageAccessFramework.deleteAsync(itemToDelete.uri);
                  } else if (itemToDelete.uri.startsWith('file://')) {
                    await FileSystem.deleteAsync(itemToDelete.uri, { idempotent: true });
                  }
                  successCount++;
                } catch (deleteError: any) {
                  console.error(`Error deleting ${itemToDelete.name}:`, deleteError);
                  errorCount++;
                }
              }
            }
            setLoading(false);
            Alert.alert("Delete Complete", `${successCount} item(s) deleted. ${errorCount > 0 ? errorCount + ' errors.' : ''}`);
            setSelectedItemUris(new Set());
            setIsSelectionModeActive(false);
            loadFiles(currentPath, currentPathName);
          },
        },
      ]
    );
  };

  const initiateMoveOperation = (items: FileSystemEntry[]) => {
    if (items.length === 0) return;
    setItemsToMove(items);
    setIsMoveModeActive(true);
    setIsSelectionModeActive(false);
    setSelectedItemUris(new Set());
    Alert.alert(`Move ${items.length} Item(s)`, `Navigate to the destination folder and tap "Move Here".`);
  };

  const cancelMoveOperation = () => {
    setItemsToMove([]);
    setIsMoveModeActive(false);
  };

  const executeMove = async () => {
    if (itemsToMove.length === 0 || !currentPath) {
      Alert.alert("Error", "No file selected to move or destination not clear.");
      cancelMoveOperation();
      return;
    }

    setLoading(true);
    const destinationDirUri = currentPath;
    const destinationDirName = currentPathName;
    let successCount = 0;
    let errorCount = 0;

    for (const sourceItem of itemsToMove) {
      const newFileName = sourceItem.name;
      const mimeType = getMimeType(newFileName);
      try {
        let finalDestinationFileUri: string;

        if (destinationDirUri.startsWith('content://')) {
          console.log(`[Move] Creating file in SAF: ${destinationDirUri}, name: ${newFileName}, mime: ${mimeType}`);
          const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(destinationDirUri, newFileName, mimeType);
          if (!createdUri) {
            const dirContents = await FileSystem.StorageAccessFramework.readDirectoryAsync(destinationDirUri);
            const existingFileUri = dirContents.find(uri => decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1)) === newFileName);
            if (existingFileUri) {
              console.warn(`[Move] File "${newFileName}" might already exist or could not be created in SAF. Skipping.`);
              throw new Error(`File "${newFileName}" might already exist or could not be created.`);
            } else {
              throw new Error("Could not create destination file in SAF directory.");
            }
          }
          finalDestinationFileUri = createdUri;
        } else {
          finalDestinationFileUri = `${destinationDirUri.endsWith('/') ? destinationDirUri : destinationDirUri + '/'}${newFileName}`;
          const destInfo = await FileSystem.getInfoAsync(finalDestinationFileUri).catch(() => ({ exists: false }));
          if (destInfo.exists) {
            throw new Error(`File "${newFileName}" already exists at the local destination.`);
          }
        }
        console.log(`[Move] Final destination URI for ${sourceItem.name}: ${finalDestinationFileUri}`);

        console.log(`[Move] Attempting copy from ${sourceItem.uri} to ${finalDestinationFileUri}`);
        await FileSystem.copyAsync({ from: sourceItem.uri, to: finalDestinationFileUri });
        console.log(`[Move] Copy successful for ${sourceItem.name}.`);

        console.log(`[Move] Deleting original file: ${sourceItem.uri}`);
        if (sourceItem.uri.startsWith('content://')) {
          await FileSystem.StorageAccessFramework.deleteAsync(sourceItem.uri);
        } else {
          await FileSystem.deleteAsync(sourceItem.uri, { idempotent: true });
        }
        console.log(`[Move] Original file ${sourceItem.name} deleted.`);
        successCount++;
      } catch (moveError: any) {
        console.error(`Error moving file ${sourceItem.name}:`, moveError);
        errorCount++;
      }
    }

    setLoading(false);
    cancelMoveOperation();
    Alert.alert(
      "Move Complete",
      `${successCount} item(s) moved to "${destinationDirName}".\n${errorCount > 0 ? errorCount + ' item(s) failed to move.' : ''}`
    );
    if (successCount > 0 || errorCount > 0) {
      loadFiles(currentPath, currentPathName);
    }
  };

  const toggleSelectItem = (itemUri: string) => {
    const newSelectedItems = new Set(selectedItemUris);
    if (newSelectedItems.has(itemUri)) {
      newSelectedItems.delete(itemUri);
    } else {
      newSelectedItems.add(itemUri);
    }
    setSelectedItemUris(newSelectedItems);

    if (newSelectedItems.size === 0 && isSelectionModeActive) {
      setIsSelectionModeActive(false);
    } else if (newSelectedItems.size > 0 && !isSelectionModeActive) {
      setIsSelectionModeActive(true);
    }
  };

  const handleItemPress = (item: FileSystemEntry) => {
    if (isSelectionModeActive) {
      toggleSelectItem(item.uri);
    } else {
      navigateToDirectory(item);
    }
  };

  const handleItemLongPress = (item: FileSystemEntry) => {
    if (!isSelectionModeActive) {
      setIsSelectionModeActive(true);
    }
    toggleSelectItem(item.uri);
  };

  const cancelSelectionMode = () => {
    setIsSelectionModeActive(false);
    setSelectedItemUris(new Set());
  };

interface FileListItemProps {
  item: FileSystemEntry;
  onPress: (item: FileSystemEntry) => void;
  onLongPress: (item: FileSystemEntry) => void;
  isSelected: boolean;
  isSelectionModeActive: boolean;
}

const FileListItem: React.FC<FileListItemProps> = ({ item, onPress, onLongPress, isSelected, isSelectionModeActive }) => {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  const isImageFile = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(item.name);

  useEffect(() => {
    let isMounted = true;
    const generateThumbnail = async () => {
      if (isMounted) {
        setThumbnailUri(null);
        setThumbnailError(false);
      }

      if (isImageFile && !item.isDirectory) {
        if (item.uri.startsWith('content://')) {
          try {
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
          if (isMounted) setThumbnailUri(item.uri);
        }
      }
    };

    generateThumbnail();
    return () => {
      isMounted = false;
    };
  }, [item.uri, isImageFile, item.isDirectory]); // Added isImageFile and item.isDirectory as they influence logic

  return (
    <TouchableOpacity
      style={styles.fileItem}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <View style={[styles.itemContentWrapper, isSelected && styles.selectedItem]}>
      {isSelectionModeActive && (
        <Ionicons
          name={isSelected ? "checkbox" : "square-outline"}
          size={24}
          color={isSelected ? "#007AFF" : "#ccc"}
          style={styles.checkbox} />
      )}
      <View style={styles.fileInfoContainer}>
        {isImageFile && thumbnailUri && !thumbnailError ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} onError={() => setThumbnailError(true)} />
        ) : (
          <Ionicons
            name={thumbnailError && isImageFile ? "image-outline" : getFileIconName(item.name, item.isDirectory)}
            size={24}
            color={item.isDirectory ? "#FFC107" : "#555"}
            style={styles.fileIcon} />
        )}
        <ThemedText style={styles.fileName} numberOfLines={1}>{item.name}</ThemedText>
      </View>
      </View>
    </TouchableOpacity>
  );
};

  if (isImporting) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10, fontWeight: 'bold' }}>Importing Folder...</ThemedText>
        <ThemedText style={{ marginTop: 8, fontSize: 12, textAlign: 'center' }}>{importProgress}</ThemedText>
      </ThemedView>
    );
  }
  if (initialPathLoading || (loading && !isImporting)) { // Don't show main loading if importing
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10 }}>
          {initialPathLoading ? 'Initializing...' : 'Loading files...'}
        </ThemedText>
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

        {isSelectionModeActive ? (
          <View style={styles.selectionHeader}>
            <TouchableOpacity onPress={cancelSelectionMode} style={styles.headerButton}>
              <Ionicons name="close-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
            <ThemedText style={styles.selectionCountText}>{selectedItemUris.size} selected</ThemedText>
            <View style={styles.selectionActions}>
              <TouchableOpacity onPress={() => initiateMoveOperation(directoryContents.filter(item => selectedItemUris.has(item.uri)))} style={styles.headerButton} disabled={selectedItemUris.size === 0}>
                <Ionicons name="move-outline" size={28} color={selectedItemUris.size === 0 ? "#ccc" : "#007AFF"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmBatchDelete} style={styles.headerButton} disabled={selectedItemUris.size === 0}>
                <Ionicons name="trash-outline" size={28} color={selectedItemUris.size === 0 ? "#ccc" : "red"} />
              </TouchableOpacity>
            </View>
          </View>
        ) : isMoveModeActive && itemsToMove.length > 0 ? (
          <ThemedText type="subtitle" style={styles.title} numberOfLines={2} ellipsizeMode="middle">
            Move {itemsToMove.length} item(s) to: {currentPathName}
          </ThemedText>
        ) : (
          <ThemedText type="title" style={styles.title} numberOfLines={1} ellipsizeMode="middle">
            {currentPathName}
          </ThemedText>
        )}

        {isMoveModeActive && !isSelectionModeActive ? (
          <View style={styles.moveActionButtons}>
            <TouchableOpacity onPress={executeMove} style={[styles.headerButton, styles.moveHereButton]}><ThemedText style={styles.headerButtonText}>Move Here</ThemedText></TouchableOpacity>
            <TouchableOpacity onPress={cancelMoveOperation} style={[styles.headerButton, styles.cancelMoveButton]}><ThemedText style={styles.headerButtonText}>Cancel</ThemedText></TouchableOpacity>
          </View>
        ) : !isSelectionModeActive && (
          <View style={styles.headerActions}>
            {Platform.OS === 'android' && (
              <TouchableOpacity onPress={pickDirectory} disabled={isPickingDirectory || loading || isImporting} style={styles.headerIconButton}>
                <Foundation name="folder-add" size={38} color="dodgerblue" />
              </TouchableOpacity>
            )}
            {Platform.OS === 'android' && ( // Import Folder Button
              <TouchableOpacity onPress={handleImportFolder} disabled={isImporting || loading} style={styles.headerIconButton}>
                <Ionicons name="cloud-download-outline" size={34} color="green" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {directoryContents.length === 0 && !loading && (
        <ThemedText style={styles.emptyText}>No files found in this directory.</ThemedText>
      )}
      <FlatList
        data={directoryContents}
        keyExtractor={(item) => item.uri}
        renderItem={({ item }) => (
          <FileListItem
            item={item}
            onPress={handleItemPress}
            onLongPress={handleItemLongPress}
            isSelected={selectedItemUris.has(item.uri)}
            isSelectionModeActive={isSelectionModeActive}
          />
        )}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={21}
        removeClippedSubviews={true}
        getItemLayout={(_data, index) => (
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    paddingHorizontal: 8,
  },
  selectionHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCountText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectionActions: {
    flexDirection: 'row',
  },
  moveActionButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 8,
  },
  moveHereButton: {
    backgroundColor: 'green',
  },
  cancelMoveButton: {
    backgroundColor: 'gray',
  },
  headerButtonText: {
    color: 'white',
    fontWeight: 'bold',
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
    height: 60,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomColor: '#ccc',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedItem: {
    backgroundColor: '#e0f3ff',
  },
  fileInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileIcon: {
    marginRight: 10,
  },
  checkbox: {
    marginRight: 15,
  },
  fileName: {
    fontSize: 16,
    flexShrink: 1,
    flex: 1,
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
    borderRadius: 4,
  },
});

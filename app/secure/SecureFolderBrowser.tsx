// File: app/(tabs)/SecureFolderBrowser.tsx
import ParallaxScrollView from '@/components/ParallaxScrollView'; // Import ParallaxScrollView
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

interface FileSystemEntry {
  name: string;
  uri: string;
  isDirectory: boolean;
}

interface PathHistoryEntry {
  path: string;
  name: string;
}

const SECURE_VAULT_BASENAME = '.SecureVault';
const SECURE_VAULT_DISPLAY_NAME = 'Secure Vault';
// AsyncStorage key for imported folder metadata (same as in FileManagerScreen)
const SECURE_FOLDER_METADATA_KEY = 'SecureFolderMetadata';

// Interface for metadata (same as in FileManagerScreen)
interface SecureFolderMeta {
  originalUri: string;
  originalName: string;
  importedDate: string;
}
interface SecureFolderMetadataStore {
  [secureFolderBasename: string]: SecureFolderMeta;
}

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
    case 'mp4': case 'mov': case 'mkv': case 'webm':
      return "videocam-outline";
    case 'mp3': case 'wav': case 'aac': case 'm4a':
      return "musical-notes-outline";
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
    default: return 'application/octet-stream';
  }
};

export default function SecureFolderBrowserScreen() {
  const secureVaultRootPath = `${FileSystem.documentDirectory || ''}${SECURE_VAULT_BASENAME}`;

  const [directoryContents, setDirectoryContents] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(secureVaultRootPath);
  const [currentPathName, setCurrentPathName] = useState<string>(SECURE_VAULT_DISPLAY_NAME);
  const [pathHistory, setPathHistory] = useState<PathHistoryEntry[]>([]);
  
  const router = useRouter();
  const [isMoveModeActive, setIsMoveModeActive] = useState<boolean>(false);
  const [itemsToMove, setItemsToMove] = useState<FileSystemEntry[]>([]);
  const [selectedItemUris, setSelectedItemUris] = useState<Set<string>>(new Set());
  const [isSelectionModeActive, setIsSelectionModeActive] = useState<boolean>(false);
  const [initialPathLoading, setInitialPathLoading] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [secureMetadata, setSecureMetadata] = useState<SecureFolderMetadataStore>({});

  const loadFiles = useCallback(async (pathToLoad: string, pathNameToLoad: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!pathToLoad || !pathToLoad.startsWith(FileSystem.documentDirectory || '')) {
        // Safety check: Ensure we are always within the app's document directory.
        // For Secure Vault, it should always be within FileSystem.documentDirectory + SECURE_VAULT_BASENAME
        const correctedPath = `${FileSystem.documentDirectory || ''}${SECURE_VAULT_BASENAME}`;
        console.warn(`[SecureVault] Attempted to load path outside secure vault: ${pathToLoad}. Correcting to: ${correctedPath}`);
        setCurrentPath(correctedPath);
        setCurrentPathName(SECURE_VAULT_DISPLAY_NAME);
        setPathHistory([]); // Reset history if path was invalid
        pathToLoad = correctedPath;
        pathNameToLoad = SECURE_VAULT_DISPLAY_NAME;
      }

      // Ensure the Secure Vault base directory exists
      await FileSystem.makeDirectoryAsync(secureVaultRootPath, { intermediates: true });

      let entries: FileSystemEntry[] = [];
      const filesInDirectory = await FileSystem.readDirectoryAsync(pathToLoad);
      for (const fileName of filesInDirectory) {
        if (fileName.startsWith('.')) { // Skip hidden files within the vault too
          continue;
        }
        const fileUri = `${pathToLoad.endsWith('/') ? pathToLoad : pathToLoad + '/'}${fileName}`;
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists) {
            entries.push({
              name: fileName,
              uri: fileUri,
              isDirectory: info.isDirectory,
            });
          } else {
            console.warn(`[SecureVault Load] File ${fileName} (URI: ${fileUri}) listed but getInfoAsync reports it does not exist. Skipping.`);
          }
        } catch (infoError: any) {
          console.error(`[SecureVault Load] Error getting info for ${fileUri} (original name: ${fileName}): ${infoError.message}. Skipping item.`);
        }
      }
      
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setDirectoryContents(entries);
    } catch (e: any) {
      console.error(`[SecureVault] Failed to read directory ${pathToLoad}:`, e);
      setError(`Failed to load files from ${pathNameToLoad}: ${e.message}`);
      setDirectoryContents([]);
    } finally {
      setLoading(false);
      setInitialPathLoading(false); // Mark initial loading as complete
    }
  }, [secureVaultRootPath]);

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

  useEffect(() => {
    // This effect now simply ensures the initial path is set and loads files.
    // The `openPrivateFolder` logic is inherent to this screen.
    const initialize = async () => {
      setInitialPathLoading(true);
      // Ensure the base directory exists before attempting to load from it
      try {
        await FileSystem.makeDirectoryAsync(secureVaultRootPath, { intermediates: true });
        setCurrentPath(secureVaultRootPath);
        setCurrentPathName(SECURE_VAULT_DISPLAY_NAME);
        const meta = await loadSecureFolderMetadata();
        setSecureMetadata(meta);
        setPathHistory([]); // Start with a fresh history for the vault
        // setInitialPathLoading(false) will be handled by loadFiles or if currentPath doesn't trigger loadFiles
      } catch (initError: any) {
        console.error("[SecureVault] Error ensuring root directory exists:", initError);
        setError(`Failed to initialize Secure Vault: ${initError.message}`);
        setInitialPathLoading(false); // Ensure loading stops on error
      }
    };
    initialize();
  }, [secureVaultRootPath]); // Rerun if secureVaultRootPath changes (e.g. on app start if doc dir was null)

  useEffect(() => {
    // Load files whenever currentPath changes, but only after initial path is set.
    if (currentPath && FileSystem.documentDirectory) { // Check if documentDirectory is available
      // If initialPathLoading is still true, it means the first effect just set currentPath.
      // loadFiles will set initialPathLoading to false.
      loadFiles(currentPath, currentPathName);
    }
  }, [initialPathLoading, currentPath, currentPathName, loadFiles]);

  const navigateUp = useCallback(() => {
    if (pathHistory.length > 0) {
      const previousPathEntry = pathHistory[pathHistory.length - 1];
      // Ensure we don't navigate above the secure vault root
      if (previousPathEntry.path.startsWith(secureVaultRootPath)) {
        setPathHistory(prevHistory => prevHistory.slice(0, -1));
        setCurrentPath(previousPathEntry.path);
        setCurrentPathName(previousPathEntry.name);
      } else {
        console.warn("[SecureVault] Attempted to navigate above secure vault root. Resetting to root.");
        setCurrentPath(secureVaultRootPath);
        setCurrentPathName(SECURE_VAULT_DISPLAY_NAME);
        setPathHistory([]);
      }
    } else {
      // If at the root of the secure vault, back press should ideally exit this screen.
      // This is handled by the router's default behavior or can be customized.
      if (router.canGoBack()) router.back();
      else Alert.alert("Secure Vault", "You are at the root of the Secure Vault.");
    }
  }, [pathHistory, secureVaultRootPath, router]);

  useEffect(() => {
    const backAction = () => {
      if (currentPath !== secureVaultRootPath && pathHistory.length > 0) {
        navigateUp();
        return true; // Prevent default back behavior
      }
      // If at the root of secure vault, let the default router behavior handle back (e.g., go to previous screen)
      return false; 
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [pathHistory, navigateUp, currentPath, secureVaultRootPath]);

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

    // Derive item name from the URI, as getInfoAsync does not provide it.
    const uriSegment = sourceItemUri.substring(sourceItemUri.lastIndexOf('/') + 1);
    const decodedSegment = decodeURIComponent(uriSegment);
    const lastSlash = decodedSegment.lastIndexOf('/');
    const lastColon = decodedSegment.lastIndexOf(':'); 
    let itemName = decodedSegment.substring(Math.max(lastSlash, lastColon) + 1);
    if (!itemName) { 
        itemName = `unknown_item_${Date.now()}`;
        console.warn(`Could not determine item name for URI: ${sourceItemUri}, using placeholder: ${itemName}`);
    }

    let sanitizedItemName = itemName.replace(/:/g, '_'); 
    sanitizedItemName = sanitizedItemName.replace(/[^a-zA-Z0-9._\-\s]/g, '_'); 
    sanitizedItemName = sanitizedItemName.replace(/\s+/g, ' ').trim(); 

    if (!sanitizedItemName.trim()) { 
        onProgress(`Skipped: ${sourceItemUri} (invalid name after sanitization: original '${itemName}')`);
        console.warn(`Could not form a valid sanitized name for item from URI: ${sourceItemUri} (original name: '${itemName}', sanitized: '${sanitizedItemName}')`);
        return;
    }
    
    console.log(`[SecureVault Import-CopyRecursive] Original name: "${itemName}", Sanitized name: "${sanitizedItemName}"`);

    const destinationItemFileSystemPath = `${destinationParentFileSystemPath.endsWith('/') ? destinationParentFileSystemPath : destinationParentFileSystemPath + '/'}${sanitizedItemName}`;
    onProgress(`Processing: ${sanitizedItemName}`);

    if (sourceInfo.isDirectory) {
      onProgress(`Creating directory: ${sanitizedItemName}`);
      await FileSystem.makeDirectoryAsync(destinationItemFileSystemPath, { intermediates: true });
      
      let childUris: string[];
      if (sourceItemUri.startsWith('content://')) { 
        childUris = await FileSystem.StorageAccessFramework.readDirectoryAsync(sourceItemUri);
      } else { 
        const childNames = await FileSystem.readDirectoryAsync(sourceItemUri);
        childUris = childNames.map(name => `${sourceItemUri.endsWith('/') ? sourceItemUri : sourceItemUri + '/'}${name}`);
      }

      for (const childUri of childUris) {
        await copyDirectoryRecursively(childUri, destinationItemFileSystemPath, onProgress);
      }
    } else { 
      onProgress(`Copying file: ${sanitizedItemName}`);
      await FileSystem.copyAsync({ from: sourceItemUri, to: destinationItemFileSystemPath });
    }
  };
  
  const deleteDirectoryRecursivelySAF = async (
    directoryUri: string,
    onProgress: (message: string) => void
  ): Promise<void> => {
    onProgress(`Deleting original: ${directoryUri}`);
    await FileSystem.StorageAccessFramework.deleteAsync(directoryUri); 
    onProgress(`Deleted original: ${directoryUri}`);
  };

  const handleImportFolder = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert("Not Supported", "Folder import is currently Android-only.");
      return;
    }

    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert("Permission Denied", "Cannot import folder without permissions.");
        return;
      }

      const sourceDirectoryUri = permissions.directoryUri;
      const sourceDirectoryName = decodeURIComponent(sourceDirectoryUri.substring(sourceDirectoryUri.lastIndexOf('/') + 1)) || "ImportedFolder";
      
      Alert.alert(
        "Confirm Import to Secure Vault",
        `Import "${sourceDirectoryName}"?\n\nThis will COPY the folder into Secure Vault and then DELETE the original. This action is destructive to the original.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import & Delete Original",
            style: "destructive",
            onPress: async () => {
              setIsImporting(true);
              setImportProgress(`Starting import of "${sourceDirectoryName}"...`);
              try {
                await FileSystem.makeDirectoryAsync(secureVaultRootPath, { intermediates: true });

                let sanitizedDestinationFolderName = sourceDirectoryName.replace(/:/g, '_');
                sanitizedDestinationFolderName = sanitizedDestinationFolderName.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
                sanitizedDestinationFolderName = sanitizedDestinationFolderName.replace(/\s+/g, ' ').trim();
                const finalDestinationPathForThisImport = `${secureVaultRootPath.endsWith('/') ? secureVaultRootPath : secureVaultRootPath + '/'}${sanitizedDestinationFolderName}`;

                const existingInfo = await FileSystem.getInfoAsync(finalDestinationPathForThisImport).catch(() => ({exists: false}));
                if (existingInfo.exists) {
                  throw new Error(`A folder named "${sanitizedDestinationFolderName}" already exists in Secure Vault.`);
                }
                await FileSystem.makeDirectoryAsync(finalDestinationPathForThisImport, { intermediates: true });
                setImportProgress(`Copying contents of "${sourceDirectoryName}"...`);

                const childUrisOfSource = await FileSystem.StorageAccessFramework.readDirectoryAsync(sourceDirectoryUri);
                for (const childUri of childUrisOfSource) {
                    await copyDirectoryRecursively(childUri, finalDestinationPathForThisImport, setImportProgress);
                }
                setImportProgress(`Successfully copied "${sourceDirectoryName}". Now deleting original...`);
                await deleteDirectoryRecursivelySAF(sourceDirectoryUri, setImportProgress);
                
                const currentMeta = await loadSecureFolderMetadata();
                currentMeta[sanitizedDestinationFolderName] = { originalUri: sourceDirectoryUri, originalName: sourceDirectoryName, importedDate: new Date().toISOString() };
                await saveSecureFolderMetadata(currentMeta);
                setSecureMetadata(currentMeta); // Update local state

                setImportProgress(`Import of "${sourceDirectoryName}" complete!`);
                Alert.alert("Import Complete", `"${sourceDirectoryName}" has been imported and the original deleted.`);
                if (currentPath === secureVaultRootPath || currentPath === finalDestinationPathForThisImport) loadFiles(currentPath, currentPathName);
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

  const copyToSAFRecursively = async (
    sourceFileSystemPath: string, // file:// path of current item in .SecureVault
    destinationParentSAFUri: string, // content:// URI of parent directory in original location
    itemName: string, // Name of the item to be created at destination
    onProgress: (message: string) => void
  ): Promise<void> => {
    const sourceInfo = await FileSystem.getInfoAsync(sourceFileSystemPath);
    if (!sourceInfo.exists) {
      onProgress(`Skipped: ${itemName} (source does not exist)`);
      return;
    }
    onProgress(`Restoring: ${itemName}`);
  
    if (sourceInfo.isDirectory) {
      let createdDirUri: string | null = null;
      try {
        // Attempt to create the directory. SAF might return null if it already exists.
        createdDirUri = await FileSystem.StorageAccessFramework.createFileAsync(destinationParentSAFUri, itemName, 'vnd.android.document/directory');
        if (!createdDirUri) {
          // If null, try to find it by listing the parent. This is a common SAF workaround.
          const parentContents = await FileSystem.StorageAccessFramework.readDirectoryAsync(destinationParentSAFUri);
          createdDirUri = parentContents.find(uri => decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1)) === itemName) || null;
        }
        if (!createdDirUri) {
            throw new Error(`Could not create or find directory ${itemName} at SAF destination.`);
        }
        onProgress(`Created/Verified directory: ${itemName}`);
      } catch (e: any) {
        onProgress(`Error with directory ${itemName}: ${e.message}. Skipping children.`);
        console.error(`Error creating/finding directory ${itemName} in SAF: `, e);
        return; 
      }
  
      const childrenNames = await FileSystem.readDirectoryAsync(sourceFileSystemPath);
      for (const childName of childrenNames) {
        await copyToSAFRecursively(
          `${sourceFileSystemPath.endsWith('/') ? sourceFileSystemPath : sourceFileSystemPath + '/'}${childName}`,
          createdDirUri, // Children are copied into the newly created/verified directory
          childName,
          onProgress
        );
      }
    } else { // It's a file
      const mimeType = getMimeType(itemName);
      let createdFileUri: string | null = null;
      try {
        createdFileUri = await FileSystem.StorageAccessFramework.createFileAsync(destinationParentSAFUri, itemName, mimeType);
        if (!createdFileUri) {
            // Attempt to find if it exists if creation returned null
            const parentContents = await FileSystem.StorageAccessFramework.readDirectoryAsync(destinationParentSAFUri);
            createdFileUri = parentContents.find(uri => decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1)) === itemName) || null;
        }
        if (!createdFileUri) {
            throw new Error(`Failed to create or find file ${itemName} at SAF destination.`);
        }
        
        // Read local file as base64 and write to SAF URI
        // For large files, consider streaming if supported by a native module, but Expo FS uses base64 for this.
        const fileContentBase64 = await FileSystem.readAsStringAsync(sourceFileSystemPath, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.writeAsStringAsync(createdFileUri, fileContentBase64, { encoding: FileSystem.EncodingType.Base64 });
        onProgress(`Restored file: ${itemName}`);
      } catch (e: any) {
        onProgress(`Error restoring file ${itemName}: ${e.message}`);
        console.error(`Error creating/writing file ${itemName} in SAF (URI: ${createdFileUri || 'unknown'}): `, e);
      }
    }
  };

  const handleRestoreFolder = async (folderNameInVault: string) => {
    const meta = secureMetadata[folderNameInVault];
    if (!meta) {
      Alert.alert("Error", "Metadata not found for this folder. Cannot restore.");
      return;
    }

    Alert.alert(
      "Confirm Restore",
      `Restore "${meta.originalName}" to its original location?\n\nThis will COPY the folder back and then DELETE it from Secure Vault. Ensure you have granted access to the correct original parent directory.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore & Delete from Vault",
          style: "destructive",
          onPress: async () => {
            setIsRestoring(true);
            setRestoreProgress(`Starting restore of "${meta.originalName}"...`);
            try {
              // Try to derive a sensible parent URI for the permission request.
              // This is heuristic and might need refinement based on typical originalUri structures.
              let parentPermissionUri = meta.originalUri;
              const originalNameEncoded = encodeURIComponent(meta.originalName);
              const lastSegmentIndex = meta.originalUri.lastIndexOf(originalNameEncoded);
              if (lastSegmentIndex > 0 && meta.originalUri.endsWith(originalNameEncoded)) {
                parentPermissionUri = meta.originalUri.substring(0, lastSegmentIndex -1); // -1 for the slash
              } else {
                 // If originalName is not the last segment, or URI is too short,
                 // it's harder to guess. Fallback to asking for the originalUri itself,
                 // or prompt user more explicitly. For now, use originalUri.
                 console.warn("Could not reliably determine parent URI for restore, requesting permission for original URI or its root.");
              }
              
              setRestoreProgress(`Requesting permission for: ${decodeURIComponent(parentPermissionUri)}...`);
              const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
                parentPermissionUri && parentPermissionUri.includes('/') ? parentPermissionUri : undefined
              );

              if (!permissions.granted) {
                throw new Error("Permission denied to access the original location.");
              }
              
              const grantedDestinationParentUri = permissions.directoryUri;
              setRestoreProgress(`Permissions granted for: ${decodeURIComponent(grantedDestinationParentUri)}. Copying files...`);

              const sourceFolderPathInVault = `${secureVaultRootPath.endsWith('/') ? secureVaultRootPath : secureVaultRootPath + '/'}${folderNameInVault}`;
              
              // The folder to be restored will be named meta.originalName inside the grantedDestinationParentUri
              await copyToSAFRecursively(sourceFolderPathInVault, grantedDestinationParentUri, meta.originalName, setRestoreProgress);

              setRestoreProgress(`Successfully restored "${meta.originalName}". Now deleting from Secure Vault...`);
              await FileSystem.deleteAsync(sourceFolderPathInVault, { idempotent: true });

              const updatedMetadata = { ...secureMetadata };
              delete updatedMetadata[folderNameInVault];
              await saveSecureFolderMetadata(updatedMetadata);
              setSecureMetadata(updatedMetadata); 

              Alert.alert("Restore Complete", `"${meta.originalName}" has been restored and removed from Secure Vault.`);
              loadFiles(currentPath, currentPathName); 
            } catch (restoreError: any) {
              Alert.alert("Restore Error", `Failed to restore folder: ${restoreError.message}`);
              console.error("[SecureVault Restore Error]", restoreError);
              setRestoreProgress(`Error: ${restoreError.message}`);
            } finally {
              setIsRestoring(false);
              setTimeout(() => setRestoreProgress(''), 7000);
            }
          },
        },
      ]
    );
  };

  const openFileWithSharing = async (item: FileSystemEntry) => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Uh oh", "Sharing isn't available on your platform");
      return;
    }
    try {
      // Since files in SecureVault are already file:// URIs, no need for getLocalUriForSharing
      await Sharing.shareAsync(item.uri);
    } catch (error: any) {
      console.error("[SecureVault] Error sharing file:", error);
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
  };

  const navigateToDirectoryOrOpenFile = async (item: FileSystemEntry) => {
    if (item.isDirectory) {
      // Ensure the new path is still within the secure vault
      if (item.uri.startsWith(secureVaultRootPath)) {
        setPathHistory(prevHistory => [...prevHistory, { path: currentPath, name: currentPathName }]);
        setCurrentPath(item.uri);
        setCurrentPathName(item.name);
      } else {
        console.error("[SecureVault] Attempt to navigate to a directory outside the secure vault:", item.uri);
        Alert.alert("Error", "Cannot navigate outside the Secure Vault.");
      }
    } else if (isViewableMedia(item.name) || isAudioFile(item.name)) {
      router.push({ pathname: '/media_player/media-viewer', params: { uri: item.uri, name: item.name } });
    } else {
      openFileWithSharing(item);
    }
  };

  const confirmSingleItemDelete = async (itemToDelete: FileSystemEntry) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete "${itemToDelete.name}" from Secure Vault? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              // All items in SecureVault are file:// URIs
              await FileSystem.deleteAsync(itemToDelete.uri, { idempotent: true });
              Alert.alert("Success", `"${itemToDelete.name}" has been deleted.`);
              loadFiles(currentPath, currentPathName); // Refresh
            } catch (deleteError: any) {
              console.error(`[SecureVault] Error deleting ${itemToDelete.name}:`, deleteError);
              Alert.alert("Error", `Could not delete "${itemToDelete.name}": ${deleteError.message}`);
            } finally {
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
      `Are you sure you want to delete ${selectedItemUris.size} selected item(s) from Secure Vault? This action cannot be undone.`,
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
                  await FileSystem.deleteAsync(itemToDelete.uri, { idempotent: true });
                  successCount++;
                } catch (deleteError: any) {
                  console.error(`[SecureVault] Error deleting ${itemToDelete.name}:`, deleteError);
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
    Alert.alert(`Move ${items.length} Item(s)`, `Navigate to the destination folder within Secure Vault and tap "Move Here".`);
  };

  const cancelMoveOperation = () => {
    setItemsToMove([]);
    setIsMoveModeActive(false);
  };

  const executeMove = async () => {
    if (itemsToMove.length === 0 || !currentPath || !currentPath.startsWith(secureVaultRootPath)) {
      Alert.alert("Error", "No file selected to move or destination is not within Secure Vault.");
      cancelMoveOperation();
      return;
    }

    setLoading(true);
    const destinationDirUri = currentPath;
    const destinationDirName = currentPathName;
    let successCount = 0;
    let errorCount = 0;

    for (const sourceItem of itemsToMove) {
      const newFileName = sourceItem.name; // Name should already be sanitized if it came from import
      const finalDestinationFileUri = `${destinationDirUri.endsWith('/') ? destinationDirUri : destinationDirUri + '/'}${newFileName}`;
      
      try {
        // Check if destination already exists (for files only, directories will merge if names clash)
        if (!sourceItem.isDirectory) {
            const destInfo = await FileSystem.getInfoAsync(finalDestinationFileUri).catch(() => ({ exists: false }));
            if (destInfo.exists) {
                throw new Error(`File "${newFileName}" already exists at the destination.`);
            }
        }

        console.log(`[SecureVault Move] Moving ${sourceItem.uri} to ${finalDestinationFileUri}`);
        await FileSystem.moveAsync({ from: sourceItem.uri, to: finalDestinationFileUri });
        console.log(`[SecureVault Move] Move successful for ${sourceItem.name}.`);
        successCount++;
      } catch (moveError: any) {
        console.error(`[SecureVault Move] Error moving file ${sourceItem.name}:`, moveError);
        // If it's a directory move and part of it failed, the original might be partially moved or gone.
        // For simplicity, we report error. More complex recovery might be needed for production.
        errorCount++;
      }
    }

    setLoading(false);
    cancelMoveOperation();
    Alert.alert(
      "Move Complete",
      `${successCount} item(s) moved within Secure Vault to "${destinationDirName}".\n${errorCount > 0 ? errorCount + ' item(s) failed to move.' : ''}`
    );
    if (successCount > 0 || errorCount > 0) {
      loadFiles(currentPath, currentPathName); // Refresh current directory
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
      navigateToDirectoryOrOpenFile(item);
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
      if (isImageFile && !item.isDirectory && item.uri.startsWith('file://')) { // Thumbnails for local files
        if (isMounted) setThumbnailUri(item.uri);
      }
    };
    generateThumbnail();
    return () => { isMounted = false; };
  }, [item.uri, isImageFile, item.isDirectory]);

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

  const selectedItemForRestore = directoryContents.find(item => selectedItemUris.has(item.uri));
  const canRestoreSelectedItem =
    isSelectionModeActive &&
    selectedItemUris.size === 1 &&
    selectedItemForRestore?.isDirectory &&
    currentPath === secureVaultRootPath && // Only allow restore from the root of the vault
    secureMetadata[selectedItemForRestore.name];

  if (isImporting) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Importing..." }} />
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10, fontWeight: 'bold' }}>Importing Folder...</ThemedText>
        <ThemedText style={{ marginTop: 8, fontSize: 12, textAlign: 'center' }}>{importProgress}</ThemedText>
      </ThemedView>
    );
  }
  if (isRestoring) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Restoring..." }} />
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10, fontWeight: 'bold' }}>Restoring Folder...</ThemedText>
        <ThemedText style={{ marginTop: 8, fontSize: 12, textAlign: 'center' }}>{restoreProgress}</ThemedText>
      </ThemedView>
    );
  }
  if (initialPathLoading || (loading && !isSelectionModeActive && !isMoveModeActive && !isImporting && !isRestoring)) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: SECURE_VAULT_DISPLAY_NAME }} />
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10 }}>
          {initialPathLoading ? 'Initializing Secure Vault...' : 'Loading files...'}
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Error" }} />
        <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    // ParallaxScrollView is now the root.
    // The styles.container might be redundant or its properties applied elsewhere.
    // If you need padding similar to styles.container, apply it to ParallaxScrollView's
    // contentContainerStyle or to the ThemedView style={styles.titleContainer} and
    // View style={styles.headerContainer} as needed.
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }} // Example colors
        headerImage={
          <Ionicons size={310} name="folder-open-outline" style={styles.headerImage} />
        }>
        <View style={styles.contentContainer}> 
          <ThemedView style={styles.titleContainer}>
            <ThemedText type="title">{currentPathName}</ThemedText>
          </ThemedView>
        <View style={styles.headerContainer}>
          {currentPath !== secureVaultRootPath && pathHistory.length > 0 && (
            <TouchableOpacity onPress={navigateUp} style={styles.upButton}>
              <Ionicons name="arrow-up-circle-outline" size={28} color="#007AFF" />
              <ThemedText style={styles.upButtonText}>Up</ThemedText>
            </TouchableOpacity>
          )}

          <View style={styles.spacedItem}>{isSelectionModeActive ? (
            <View style={styles.selectionHeader}>
              <TouchableOpacity onPress={cancelSelectionMode} style={styles.headerButton}>
                <Ionicons name="close-circle" size={28} color="#007AFF" />
              </TouchableOpacity>
              <ThemedText style={styles.selectionCountText}>{selectedItemUris.size} selected</ThemedText>
              <View style={styles.selectionActions}>
                <TouchableOpacity onPress={() => initiateMoveOperation(directoryContents.filter(item => selectedItemUris.has(item.uri)))} style={styles.headerButton} disabled={selectedItemUris.size === 0}>
                  <Ionicons name="move-outline" size={28} color={selectedItemUris.size === 0 ? "#ccc" : "#007AFF"} />
                </TouchableOpacity>
                {canRestoreSelectedItem && selectedItemForRestore && (
                  <TouchableOpacity onPress={() => handleRestoreFolder(selectedItemForRestore.name)} style={styles.headerButton}>
                    <Ionicons name="arrow-undo-outline" size={28} color={"#FF9500"} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={confirmBatchDelete} style={styles.headerButton} disabled={selectedItemUris.size === 0}>
                  <Ionicons name="trash-outline" size={28} color={selectedItemUris.size === 0 ? "#ccc" : "red"} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Title is now in ThemedView above
            <View style={styles.actionsContainer}> 
              {isMoveModeActive && itemsToMove.length > 0 ? (
                <ThemedText type="subtitle" style={styles.moveStatusText} numberOfLines={1} ellipsizeMode="middle">
                  Move to: {currentPathName}
                </ThemedText>
              ) : null}

              {isMoveModeActive && !isSelectionModeActive ? (
                <View style={styles.moveActionButtons}>
                  <TouchableOpacity onPress={executeMove} style={[styles.headerButton, styles.moveHereButton]}><ThemedText style={styles.headerButtonText}>Move Here</ThemedText></TouchableOpacity>
                  <TouchableOpacity onPress={cancelMoveOperation} style={[styles.headerButton, styles.cancelMoveButton]}><ThemedText style={styles.headerButtonText}>Cancel</ThemedText></TouchableOpacity>
                </View>
              ) : !isSelectionModeActive && ( 
                  Platform.OS === 'android' && (
                    <TouchableOpacity onPress={handleImportFolder} disabled={isImporting || loading} style={styles.headerIconButton}>
                      <Ionicons name="cloud-download-outline" size={30} color="green" />
                    </TouchableOpacity>
                  )
              )}
            </View>)}
          </View>
        </View>
        <View style={styles.spacedItem}>{directoryContents.length === 0 && !loading && (
          <ThemedText style={styles.emptyText}>Secure Vault is empty or this folder is empty.</ThemedText>
        )}
        {/* Replace FlatList with direct mapping if ParallaxScrollView handles scrolling of its children */}
        <View> 
          {directoryContents.map((item) => (
            <FileListItem
              key={item.uri} // Add key for mapped items
              item={item}
              onPress={handleItemPress}
              onLongPress={handleItemLongPress}
              isSelected={selectedItemUris.has(item.uri)}
              isSelectionModeActive={isSelectionModeActive}
            />
          ))}
        </View></View>
      </View>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16, // This padding might be desired on the content within ParallaxScrollView
    // paddingTop is handled by ParallaxScrollView or its content container
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  headerContainer: {
    // This container now holds actions below the Parallax title
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Adjust as needed
    paddingVertical: 8,
    // paddingHorizontal: 16, // This was in styles.container, apply to children if needed
    minHeight: 40, // Ensure header has some height
    width: '100%', // Ensure it takes full width
  },
  actionsContainer: { // New container for actions when not in selection mode
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end', // Align import button to the right
    alignItems: 'center',
  },
  moveStatusText: {
    flex: 1, // Allow text to take space
    textAlign: 'left',
    marginRight: 8, // Space before move buttons
    fontSize: 14,
    fontStyle: 'italic',
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
    marginHorizontal: 10,
  },
  selectionActions: {
    flexDirection: 'row',
  },
  moveActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingRight: 10, // Space before title
  },
  upButtonText: {
    marginLeft: 4,
    fontSize: 16,
    color: '#007AFF',
  },
  titleContainer: { // Copied from explore.tsx
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16, // Added padding, similar to original container
    paddingTop: 16, // Add some space from the parallax header image
  },
  contentContainer: {
    // gap: 16, // Removed to prevent whitespace warning. Using margins on children instead.
  },
  spacedItem: {
    marginTop: 16,
  },
  headerImage: { // Copied from explore.tsx, adjust icon and color
    // color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
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
    backgroundColor: '#e0f3ff', // Light blue for selected items
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
    flexShrink: 1, // Allow text to shrink if too long
    flex: 1, // Allow text to take available space
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    // marginTop: 20, // Replaced by spacedItem
    fontSize: 16,
    color: '#888', // Lighter color for empty text
  },
  thumbnail: {
    width: 40,
    height: 40,
    marginRight: 10,
    resizeMode: 'cover',
    borderRadius: 4,
    backgroundColor: '#eee', // Placeholder background for thumbnails
  },
});

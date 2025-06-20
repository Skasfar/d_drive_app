// File: app/media-viewer.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-audio';
import { ResizeMode, Video, AVPlaybackStatus } from 'expo-video';
import * as FileSystem from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, StyleSheet, TouchableOpacity, View } from 'react-native';

const getFileType = (fileName: string): 'image' | 'video' | 'audio' | 'unknown' => {
  const extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
    return 'image';
  }
  if (['mp4', 'mov', 'wmv', 'avi', 'mkv', 'webm'].includes(extension)) {
    return 'video';
  }
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(extension)) {
    return 'audio';
  }
  return 'unknown';
};

export default function MediaViewerScreen() { // Ensure this is the default export
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const { uri: initialUri, name } = params;

  const isMountedRef = useRef(true);

  const [internalLoading, _setInternalLoading] = useState(true);
  const [internalError, _setInternalError] = useState<string | null>(null);
  const [internalLocalMediaUri, _setInternalLocalMediaUri] = useState<string | null>(null);
  const [internalPlaybackStatus, _setInternalPlaybackStatus] = useState<AVPlaybackStatus | null>(null);
  
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const fileType = name ? getFileType(name) : 'unknown';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setIsLoading = useCallback((loading: boolean) => {
    if (isMountedRef.current) _setInternalLoading(loading);
  }, []);

  const setError = useCallback((err: string | null) => {
    if (isMountedRef.current) _setInternalError(err);
  }, []);

  const setLocalMediaUri = useCallback((uri: string | null) => {
    if (isMountedRef.current) _setInternalLocalMediaUri(uri);
  }, []);

  const setPlaybackStatus = useCallback((status: AVPlaybackStatus | null) => {
    if (isMountedRef.current) _setInternalPlaybackStatus(status);
  }, []);


  useEffect(() => {
    const prepareMedia = async () => {
      if (!initialUri) {
        setPlaybackStatus(null); // Reset status if no URI
        setError("Media URI not provided.");
        setIsLoading(false);
        return;
      }

      if (initialUri.startsWith('file://')) {
        setLocalMediaUri(initialUri);
        setPlaybackStatus(null); // Reset status for new file
        setIsLoading(false);
      } else if (initialUri.startsWith('content://')) {
        try {
          const cacheDirRoot = FileSystem.cacheDirectory;
          if (!cacheDirRoot) {
            throw new Error("Cache directory is not available.");
          }
          const cacheDir = cacheDirRoot.endsWith('/') ? cacheDirRoot : `${cacheDirRoot}/`;
          const safeName = name || `mediafile_${Date.now()}`;
          const fileName = `media_view_${Date.now()}_${safeName}`;
          const localUri = `${cacheDir}${fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100)}`;
          
          await FileSystem.copyAsync({ from: initialUri, to: localUri });
          setLocalMediaUri(localUri);
          setPlaybackStatus(null); // Reset status for new file
        } catch (e: any) {
          console.error("Error caching media for viewing:", e);
          setError(`Failed to load media. The file might be inaccessible or require different permissions: ${e.message}`);
          setPlaybackStatus(null);
        } finally {
          setIsLoading(false);
        }
      } else {
        setError("Unsupported media URI scheme.");
        setIsLoading(false);
      }
    };

    prepareMedia();
    return () => {
      // Cleanup for localMediaUri if it's a cached file and different from initialUri (if initialUri was already a cache path)
      // Use internalLocalMediaUri directly from state for cleanup, as it reflects the latest value set by this effect.
      // The closure will capture the value of internalLocalMediaUri at the time the effect ran.
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir && internalLocalMediaUri && internalLocalMediaUri.startsWith(cacheDir) && internalLocalMediaUri !== initialUri) {
        FileSystem.deleteAsync(internalLocalMediaUri, { idempotent: true })
          .then(() => console.log(`Cleaned up cached media: ${internalLocalMediaUri}`))
          .catch(e => console.warn("Error cleaning up media cache on unmount:", e));
      }
    };
  }, [initialUri, name, setIsLoading, setError, setLocalMediaUri, setPlaybackStatus]);

  useEffect(() => {
    let soundInstanceForThisEffect: Audio.Sound | null = null; // Local to this effect run

    const loadPlayableMedia = async () => {
      // 1. Stop and unload any sound currently in the global ref from a *previous* effect run.
      // Also, ensure soundInstanceForThisEffect (which is from the current or a rapidly previous effect run) is cleared if it exists.
      if (soundRef.current) {
        console.log('[MediaViewer] Pre-load: Unloading sound from soundRef.current.');
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) {
          console.warn("[MediaViewer] Pre-load: Error unloading soundRef.current:", e);
        }
        soundRef.current = null;
      }
      if (soundInstanceForThisEffect) { // Should ideally be null here unless rapid re-trigger
        soundInstanceForThisEffect = null; 
      }
      setPlaybackStatus(null); // Reset status for any new media

      if (!internalLocalMediaUri) {
        console.log('[MediaViewer] No localMediaUri available to load.');
        // If we were playing audio and now there's no URI, ensure error state is clear if not already set.
        // setError(prevError => prevError || "Media URI became unavailable."); // Optional: set error if not already set
        return;
      }
      if (fileType === 'audio') {
        console.log('[MediaViewer] Loading audio:', internalLocalMediaUri);
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true, // Important for iOS to play sound even in silent mode
            staysActiveInBackground: false, // Keep false if not needed for background play in this screen
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            shouldDuckAndroid: true,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: false, // Ensure playback through speaker
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: internalLocalMediaUri },
            { shouldPlay: false }, // IMPORTANT: Load without auto-playing
            (s) => setPlaybackStatus(s as AVPlaybackStatus)
          );
          soundInstanceForThisEffect = sound; // Assign to local variable for this effect's cleanup
          soundRef.current = sound; 

          if (isMountedRef.current) { // Check if still mounted before playing
            console.log('[MediaViewer] Sound loaded, attempting to play explicitly:', internalLocalMediaUri);
            await sound.playAsync(); 
          } else {
            console.log('[MediaViewer] Component unmounted before explicit play could start.');
            await sound.unloadAsync(); // Unload if component unmounted quickly
            soundInstanceForThisEffect = null;
            soundRef.current = null;
          }
        } catch (e: any) {
          console.error("[MediaViewer] Error loading audio:", e);
          setError(`Failed to load audio: ${e.message}`);
          // soundInstanceForThisEffect and soundRef.current should be null or will be handled by cleanup
        }
      } else if (fileType === 'video') {
        console.log('[MediaViewer] Video will be loaded by Video component:', internalLocalMediaUri);
      }
    };

    loadPlayableMedia();

    // This cleanup function will run when the component unmounts OR before the effect runs again
    // due to a change in its dependencies (localMediaUri, fileType).
    // It's crucial that this cleans up the sound instance associated with *this specific effect run*.
    // It uses 'soundInstanceForThisEffect', which is scoped to this specific effect run.
    return () => {
      if (soundInstanceForThisEffect) {
        console.log('[MediaViewer] Effect cleanup: Unloading sound instance specific to this effect run for URI:', internalLocalMediaUri); // Log with the URI it was for
        soundInstanceForThisEffect.unloadAsync().catch(e => {
          console.warn(`[MediaViewer] Error unloading sound (specific instance) during effect cleanup for ${internalLocalMediaUri}:`, e);
        });
        soundInstanceForThisEffect = null; // Ensure it's cleared
      }
    };
  }, [internalLocalMediaUri, fileType, setPlaybackStatus, setError]); // Effect runs when internalLocalMediaUri or fileType changes
  const togglePlayPauseAudio = async () => {
    if (soundRef.current && internalPlaybackStatus?.isLoaded) {
      internalPlaybackStatus.isPlaying ? await soundRef.current.pauseAsync() : await soundRef.current.playAsync();
    }
  };

  if (internalLoading) {
    return <ThemedView style={styles.centered}><ActivityIndicator size="large" /><ThemedText>Loading media...</ThemedText></ThemedView>;
  }
  if (internalError) {
    return <ThemedView style={styles.centered}><ThemedText style={styles.errorText}>Error: {internalError}</ThemedText></ThemedView>;
  }
  if (!internalLocalMediaUri) {
    return <ThemedView style={styles.centered}><ThemedText>Media could not be loaded.</ThemedText></ThemedView>;
  }

  const displayMedia = () => {
    switch(fileType) {
      case 'image': return <Image source={{ uri: internalLocalMediaUri }} style={styles.media} resizeMode="contain" />;
      case 'video': return (
        <Video
          ref={videoRef}
          style={styles.media}
          source={{ uri: internalLocalMediaUri }}
          shouldPlay
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
          onPlaybackStatusUpdate={(s) => setPlaybackStatus(s as AVPlaybackStatus)}
          onError={(errMessage) => {
            console.error("[MediaViewer] Video Error:", errMessage);
            Alert.alert("Video Error", typeof errMessage === 'string' ? errMessage : JSON.stringify(errMessage));
          }}
        />
      );
      case 'audio': return (
        <View style={styles.audioContainer}>
          <ThemedText style={styles.audioTitle}>{name || 'Audio Track'}</ThemedText>
          {internalPlaybackStatus?.isLoaded ? (
            <TouchableOpacity onPress={togglePlayPauseAudio} style={styles.playPauseButton}>
              <Ionicons name={internalPlaybackStatus.isPlaying ? "pause-circle" : "play-circle"} size={80} color="#fff" />
            </TouchableOpacity>
          ) : (
            <ActivityIndicator size="large" color="#fff" style={{ marginVertical: 20 }}/>
          )}
        </View>
      );
      case 'unknown': return <ThemedText style={{color: 'white'}}>Cannot preview this file type.</ThemedText>;
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: name || 'Media Viewer', headerStyle: { backgroundColor: '#000'}, headerTintColor: '#fff' }} />
      {displayMedia()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#000' },
  media: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.8 },
  errorText: { color: 'red', textAlign: 'center' },
  audioContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  audioTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center',
  },
  playPauseButton: {
    marginVertical: 20,
  },
});

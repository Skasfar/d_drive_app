import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS, ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
const getFileType = (fileName: string): 'image' | 'video' | 'audio' | 'unknown' => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'wmv', 'avi', 'mkv', 'webm'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(extension)) return 'audio';
  return 'unknown';
};

export default function MediaViewerScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const { uri: initialUri, name: rawName } = params;
  const name = rawName ? decodeURIComponent(rawName.split('/').pop() || rawName) : undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);

  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const fileType = name ? getFileType(name) : 'unknown';

  useEffect(() => {
    let isCancelled = false;

    const loadMedia = async () => {
      if (!initialUri) {
        setError("Media URI not provided");
        setLoading(false);
        return;
      }

      try {
        const cacheFile = `${FileSystem.cacheDirectory}${Date.now()}_${name?.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await FileSystem.copyAsync({ from: initialUri, to: cacheFile });
        if (!isCancelled) setMediaUri(cacheFile);
      } catch (e: any) {
        console.error("Failed to cache file:", e);
        setError(`Failed to prepare media: ${e.message}`);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadMedia();
    return () => {
      isCancelled = true;
    };
  }, [initialUri, name]);

  useEffect(() => {
    let localSound: Audio.Sound | null = null;
    const loadAudio = async () => {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      if (mediaUri && fileType === 'audio') {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            shouldDuckAndroid: true,
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: mediaUri },
            { shouldPlay: true },
            s => setStatus(s)
          );
          soundRef.current = sound;
          localSound = sound;
        } catch (e: any) {
          setError(`Failed to load audio: ${e.message}`);
        }
      }
    };

    loadAudio();

    return () => {
      if (localSound) {
        localSound.unloadAsync().catch(() => {});
      }
    };
  }, [mediaUri, fileType]);

  const togglePlayPause = async () => {
    if (soundRef.current && status && status.isLoaded) {
      status.isPlaying
        ? await soundRef.current.pauseAsync()
        : await soundRef.current.playAsync();
    }
  };

  const formatTime = (millis: number) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (loading) {
    return <ThemedView style={styles.centered}><ActivityIndicator size="large" /><ThemedText>Loading media...</ThemedText></ThemedView>;
  }
  if (error) {
    return <ThemedView style={styles.centered}><ThemedText style={styles.errorText}>Error: {error}</ThemedText></ThemedView>;
  }
  if (!mediaUri) {
    return <ThemedView style={styles.centered}><ThemedText>Media could not be loaded.</ThemedText></ThemedView>;
  }

  const renderMedia = () => {
    const duration = status?.isLoaded ? status.durationMillis ?? 0 : 0;
    const position = status?.isLoaded ? status.positionMillis ?? 0 : 0;

    switch (fileType) {
      case 'image':
        return <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="contain" />;
      case 'video':
        return (
          <Video
            ref={videoRef}
            style={styles.media}
            source={{ uri: mediaUri }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            onError={e => {
              console.error("Video error", e);
              Alert.alert("Video Error", JSON.stringify(e));
            }}
          />
        );
      case 'audio':
        return (
          <View style={styles.audioContainer}>
            <ThemedText style={styles.audioTitle}>{name?.split('/').pop() || 'Audio Track'}</ThemedText>

            <View style={styles.sliderWrapper}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                value={position}
                onSlidingComplete={async (value) => {
                  if (status && status.isLoaded && soundRef.current) {
                    await soundRef.current.setPositionAsync(value);
                  }
                }}
                minimumTrackTintColor="#1fb28a"
                maximumTrackTintColor="#fff"
                thumbTintColor="#fff"
              />
            </View>

            <View style={styles.timeLabels}>
              <ThemedText style={styles.timeText}>{formatTime(position)}</ThemedText>
              <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
            </View>

            <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseButton}>
              <Ionicons
                name={status?.isLoaded && status.isPlaying ? "pause-circle" : "play-circle"}
                size={80}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        );
      default:
        return <ThemedText>Unsupported file type.</ThemedText>;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
  options={{
    headerTitle: () => (
      <Text style={{ color: '#fff', fontSize: 18 }}>
        {name?.split('/').pop() || 'Media Viewer'}
      </Text>
    ),
    headerStyle: { backgroundColor: '#000' },
    headerTintColor: '#fff',
  }}
/>{renderMedia()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  media: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.75 },
  errorText: { color: 'red' },
  audioContainer: { justifyContent: 'center', alignItems: 'center', padding: 20, width: '100%' },
  audioTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  playPauseButton: { marginTop: 20 },
  timeLabels: {
    width: '90%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
  },
  sliderWrapper: {
    width: '90%',
    marginVertical: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});

/**
 * Media Message Display Component
 * Shows images, videos, audio, and documents in chat
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Linking,
    Alert,
    Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Audio, Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import type { MessageMedia } from '@/types';

interface MediaMessageProps {
    media: MessageMedia;
    isSender: boolean;
}

const MediaMessage: React.FC<MediaMessageProps> = ({ media, isSender }) => {
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    // Audio playback state
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioLoading, setAudioLoading] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);
    const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Video playback state
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoCurrentTime, setVideoCurrentTime] = useState(0);
    const [videoLoading, setVideoLoading] = useState(false);
    const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
    const videoRef = useRef<Video | null>(null);
    const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        console.log('[MediaMessage] Rendered with media:', {
            mediaType: media.mediaType,
            mimetype: media.mimetype,
            hasUrl: !!media.url,
            url: media.url?.substring(0, 50) + '...',
            name: media.name,
            filename: media.filename,
        });

        // Cleanup audio on unmount or media change
        return () => {
            if (audioIntervalRef.current) {
                clearInterval(audioIntervalRef.current);
                audioIntervalRef.current = null;
            }
            if (soundRef.current && isPlayingAudio) {
                soundRef.current.unloadAsync().catch(() => { });
                soundRef.current = null;
                setIsPlayingAudio(false);
            }
            if (videoIntervalRef.current) {
                clearInterval(videoIntervalRef.current);
                videoIntervalRef.current = null;
            }
            if (videoRef.current && isPlayingVideo) {
                videoRef.current.pauseAsync().catch(() => { });
                setIsPlayingVideo(false);
            }
        };
    }, [media]);

    // Helper to detect media type from filename
    const detectTypeByFilename = (): string | undefined => {
        const fileName = media.name || media.filename || '';
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext || '')) return 'audio';
        if (['mp4', 'webm', 'avi', 'mov'].includes(ext || '')) return 'video';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext || '')) return 'image';
        if (!media.mimetype || !media.mimetype.startsWith('text/')) return 'file';
        return undefined;
    };

    // If media.mediaType is 'file' but filename suggests it's audio/video/image, use the detected type
    const isMisdetectedFile = media.mediaType === 'file' && ['audio', 'video', 'image'].includes(detectTypeByFilename() || '');

    const resolvedMediaType =
        (!isMisdetectedFile && media.mediaType) ||
        (media.mimetype?.startsWith('image/') ? 'image' : undefined) ||
        (media.mimetype?.startsWith('video/') ? 'video' : undefined) ||
        (media.mimetype?.startsWith('audio/') ? 'audio' : undefined) ||
        detectTypeByFilename();

    const isImage = resolvedMediaType === 'image';
    const isAudio = resolvedMediaType === 'audio';
    const isVideo = resolvedMediaType === 'video';
    const isDocument = resolvedMediaType === 'document' || resolvedMediaType === 'file';

    const handleDownload = async () => {
        try {
            const canOpen = await Linking.canOpenURL(media.url);
            if (canOpen) {
                await Linking.openURL(media.url);
            } else {
                Alert.alert('Error', 'Cannot open this file');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to open file');
        }
    };

    const formatFileSize = (bytes?: number): string => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatTime = (milliseconds: number): string => {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const handleAudioPlayPause = async () => {
        try {
            setAudioLoading(true);

            if (isPlayingAudio && soundRef.current) {
                // Pause
                await soundRef.current.pauseAsync();
                setIsPlayingAudio(false);
                if (audioIntervalRef.current) {
                    clearInterval(audioIntervalRef.current);
                    audioIntervalRef.current = null;
                }
            } else {
                // Play
                if (!soundRef.current) {
                    // Create new sound
                    const { sound } = await Audio.Sound.createAsync({ uri: media.url }, { shouldPlay: true });
                    soundRef.current = sound;

                    // Get duration
                    const status = await sound.getStatusAsync();
                    if (status.isLoaded && status.durationMillis) {
                        setAudioDuration(status.durationMillis);
                    }

                    // Setup update interval
                    audioIntervalRef.current = setInterval(async () => {
                        const currentStatus = await sound.getStatusAsync();
                        if (currentStatus.isLoaded) {
                            setAudioCurrentTime(currentStatus.positionMillis || 0);
                            if (currentStatus.didJustFinish) {
                                setIsPlayingAudio(false);
                                setAudioCurrentTime(0);
                                if (audioIntervalRef.current) {
                                    clearInterval(audioIntervalRef.current);
                                    audioIntervalRef.current = null;
                                }
                            }
                        }
                    }, 100);
                } else {
                    // Resume existing sound
                    await soundRef.current.playAsync();
                    audioIntervalRef.current = setInterval(async () => {
                        const currentStatus = await soundRef.current?.getStatusAsync();
                        if (currentStatus?.isLoaded) {
                            setAudioCurrentTime(currentStatus.positionMillis || 0);
                            if (currentStatus.didJustFinish) {
                                setIsPlayingAudio(false);
                                setAudioCurrentTime(0);
                                if (audioIntervalRef.current) {
                                    clearInterval(audioIntervalRef.current);
                                    audioIntervalRef.current = null;
                                }
                            }
                        }
                    }, 100);
                }
                setIsPlayingAudio(true);
            }
        } catch (error) {
            console.error('[MediaMessage] Audio playback error:', error);
            Alert.alert('Error', 'Failed to play audio');
        } finally {
            setAudioLoading(false);
        }
    };

    const handleAudioSeek = async (value: number) => {
        try {
            if (soundRef.current) {
                await soundRef.current.setPositionAsync(value);
                setAudioCurrentTime(value);
            }
        } catch (error) {
            console.error('[MediaMessage] Audio seek error:', error);
        }
    };

    const handleVideoPlayPause = async () => {
        try {
            setVideoLoading(true);

            if (isPlayingVideo && videoRef.current) {
                // Pause
                await videoRef.current.pauseAsync();
                setIsPlayingVideo(false);
                if (videoIntervalRef.current) {
                    clearInterval(videoIntervalRef.current);
                    videoIntervalRef.current = null;
                }
            } else if (videoRef.current) {
                // Resume
                await videoRef.current.playAsync();
                videoIntervalRef.current = setInterval(async () => {
                    const status = await videoRef.current?.getStatusAsync();
                    if (status?.isLoaded) {
                        setVideoCurrentTime(status.positionMillis || 0);
                        if (status.didJustFinish) {
                            setIsPlayingVideo(false);
                            setVideoCurrentTime(0);
                            if (videoIntervalRef.current) {
                                clearInterval(videoIntervalRef.current);
                                videoIntervalRef.current = null;
                            }
                        }
                    }
                }, 100);
                setIsPlayingVideo(true);
            }
        } catch (error) {
            console.error('[MediaMessage] Video playback error:', error);
            Alert.alert('Error', 'Failed to play video');
        } finally {
            setVideoLoading(false);
        }
    };

    const handleVideoSeek = async (value: number) => {
        try {
            if (videoRef.current) {
                await videoRef.current.setPositionAsync(value);
                setVideoCurrentTime(value);
            }
        } catch (error) {
            console.error('[MediaMessage] Video seek error:', error);
        }
    };

    const handleVideoLoad = async (status: any) => {
        if (status.isLoaded && status.durationMillis) {
            setVideoDuration(status.durationMillis);
        }
        // Get video dimensions for proper aspect ratio
        if (status.isLoaded && status.videoDetails) {
            const { width, height } = status.videoDetails;
            if (width && height) {
                setVideoAspectRatio(width / height);
            }
        }
    };

    const getFileIcon = (): string => {
        const fileName = media.name || media.filename;
        if (!fileName) return '📎';

        const ext = fileName.split('.').pop()?.toLowerCase();
        const iconMap: Record<string, string> = {
            pdf: '📄',
            doc: '📝',
            docx: '📝',
            xls: '📊',
            xlsx: '📊',
            ppt: '📽️',
            pptx: '📽️',
            zip: '📦',
            txt: '📋',
            jpg: '🖼️',
            jpeg: '🖼️',
            png: '🖼️',
            gif: '🖼️',
            mp3: '🎵',
            wav: '🎵',
            m4a: '🎵',
            aac: '🎵',
            ogg: '🎵',
            mp4: '🎬',
            avi: '🎬',
            mov: '🎬',
        };

        return iconMap[ext || ''] || '📎';
    };

    // Image message
    if (isImage) {
        return (
            <View
                style={[
                    styles.container,
                    isSender && styles.senderContainer,
                ]}
            >
                {imageLoading && !imageError && (
                    <View style={[styles.imageContainer, styles.loadingContainer]}>
                        <ActivityIndicator size="small" color="#999" />
                    </View>
                )}

                {!imageError ? (
                    <Image
                        source={{ uri: media.url }}
                        style={[
                            styles.imageContainer,
                            {
                                aspectRatio:
                                    media.width && media.height
                                        ? media.width / media.height
                                        : 1,
                            },
                            imageLoading && styles.hiddenImage,
                        ]}
                        onLoadEnd={() => setImageLoading(false)}
                        onError={() => {
                            setImageLoading(false);
                            setImageError(true);
                        }}
                    />
                ) : (
                    <View style={[styles.imageContainer, styles.errorContainer]}>
                        <Text style={styles.errorText}>Failed to load image</Text>
                    </View>
                )}
            </View>
        );
    }

    // Video message
    if (isVideo) {
        const videoHeight = Math.min(300, Math.max(200, 300 / videoAspectRatio));

        return (
            <View
                style={[
                    styles.container,
                    isSender && styles.senderContainer,
                    styles.mediaItemContainer,
                ]}
            >
                <View style={[styles.videoPlayerContainer, { height: videoHeight, aspectRatio: videoAspectRatio }]}>
                    <Video
                        ref={videoRef}
                        source={{ uri: media.url }}
                        style={styles.videoPlayer}
                        onLoad={handleVideoLoad}
                        onPlaybackStatusUpdate={(status) => {
                            if (status.isLoaded && status.durationMillis) {
                                setVideoDuration(status.durationMillis);
                            }
                        }}
                        shouldPlay={isPlayingVideo}
                        isLooping={false}
                        useNativeControls={false}
                    />
                    {!isPlayingVideo && (
                        <TouchableOpacity
                            style={styles.videoPlayOverlay}
                            onPress={handleVideoPlayPause}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="play-circle" size={60} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.videoControlsContainer}>
                    <TouchableOpacity
                        onPress={handleVideoPlayPause}
                        disabled={videoLoading}
                        style={styles.videoPlayButton}
                        activeOpacity={0.7}
                    >
                        {videoLoading ? (
                            <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                            <Ionicons
                                name={isPlayingVideo ? 'pause' : 'play'}
                                size={20}
                                color="#007AFF"
                            />
                        )}
                    </TouchableOpacity>

                    <View style={styles.videoProgressContainer}>
                        <Slider
                            style={styles.videoProgressSlider}
                            minimumValue={0}
                            maximumValue={Math.max(videoDuration, 1)}
                            value={videoCurrentTime}
                            onValueChange={handleVideoSeek}
                            disabled={!videoRef.current}
                            minimumTrackTintColor="#007AFF"
                            maximumTrackTintColor="#ddd"
                            thumbTintColor="#007AFF"
                        />
                    </View>

                    <View style={styles.videoTimeContainer}>
                        <Text style={styles.videoTime}>
                            {formatTime(videoCurrentTime)}
                        </Text>
                        <Text style={styles.videoTimeSeparator}>/</Text>
                        <Text style={styles.videoTime}>
                            {formatTime(media.duration ? media.duration * 1000 : videoDuration)}
                        </Text>
                    </View>
                </View>
            </View>
        );
    }

    // Audio message
    if (isAudio) {
        return (
            <View
                style={[
                    styles.container,
                    styles.audioContainer,
                    isSender && styles.senderContainer,
                    styles.mediaItemContainer,
                    styles.audioItemContainer,
                    Platform.OS === 'web' ? styles.audioItemContainerWeb : styles.audioItemContainerMobile,
                ]}
            >
                <TouchableOpacity
                    onPress={handleAudioPlayPause}
                    disabled={audioLoading}
                    style={styles.audioPlayButton}
                    activeOpacity={0.7}
                >
                    {audioLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Ionicons
                            name={isPlayingAudio ? 'pause' : 'play'}
                            size={24}
                            color="#fff"
                        />
                    )}
                </TouchableOpacity>

                <View style={styles.audioInfoContainer}>
                    <View style={styles.audioProgressContainer}>
                        <Slider
                            style={styles.audioProgressSlider}
                            minimumValue={0}
                            maximumValue={Math.max(audioDuration, 1)}
                            value={audioCurrentTime}
                            onValueChange={handleAudioSeek}
                            disabled={!soundRef.current || !isPlayingAudio}
                            minimumTrackTintColor="#007AFF"
                            maximumTrackTintColor="#ddd"
                            thumbTintColor="#007AFF"
                        />
                    </View>
                    <View style={styles.audioTimeContainer}>
                        <Text style={styles.audioTime}>
                            {formatTime(audioCurrentTime)}
                        </Text>
                        <Text style={styles.audioTimeSeparator}>/</Text>
                        <Text style={styles.audioTime}>
                            {formatTime(media.duration ? media.duration * 1000 : audioDuration)}
                        </Text>
                    </View>
                </View>
            </View>
        );
    }

    // Document/File message
    if (isDocument) {
        return (
            <TouchableOpacity
                style={[
                    styles.container,
                    isSender && styles.senderContainer,
                    styles.mediaItemContainer,
                ]}
                onPress={handleDownload}
                activeOpacity={0.7}
            >
                <View style={styles.documentContainer}>
                    <Text style={styles.fileIcon}>{getFileIcon()}</Text>
                    <View style={styles.mediaInfo}>
                        <Text style={styles.mediaName} numberOfLines={2}>
                            {media.name || media.filename || 'Document'}
                        </Text>
                        {media.size && (
                            <Text style={styles.mediaSize}>
                                {formatFileSize(media.size)}
                            </Text>
                        )}
                    </View>
                    <Text style={styles.downloadIcon}>↓</Text>
                </View>
            </TouchableOpacity>
        );
    }

    // Fallback for unknown media type
    return (
        <TouchableOpacity
            style={[
                styles.container,
                isSender && styles.senderContainer,
                styles.mediaItemContainer,
            ]}
            onPress={handleDownload}
        >
            <View style={styles.unknownContainer}>
                <Text style={styles.fileIcon}>📎</Text>
                <Text style={styles.mediaName}>{media.name || media.filename || 'File'}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 4,
        marginHorizontal: 8,
        maxWidth: '85%',
    },
    audioContainer: {
        maxWidth: '100%',
    },
    senderContainer: {
        alignSelf: 'flex-end',
    },

    // Image styles
    imageContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        minHeight: 150,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    hiddenImage: {
        opacity: 0,
        height: 0,
    },
    errorContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#999',
        fontSize: 12,
    },

    // Video styles
    videoPlayerContainer: {
        width: '100%',
        backgroundColor: '#1c292e',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
    },
    videoPlayOverlay: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    videoControlsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: '#1c292e',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        gap: 8,
    },
    videoPlayButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoProgressContainer: {
        flex: 1,
        height: 20,
        justifyContent: 'center',
    },
    videoProgressSlider: {
        height: 4,
    },
    videoTimeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 4,
        minWidth: 55,
        justifyContent: 'flex-end',
    },
    videoTime: {
        fontSize: 10,
        color: '#999',
        lineHeight: 14,
    },
    videoTimeSeparator: {
        fontSize: 10,
        color: '#000000',
        marginHorizontal: 2,
    },

    // Audio/Document/File styles
    mediaItemContainer: {
        backgroundColor: '#1c292e',
        borderRadius: 12,
        overflow: 'hidden',
    },
    audioItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 0,
        paddingLeft: 12,
        paddingRight: 16,
        paddingVertical: 8,
        backgroundColor: '#1c292e',
        borderRadius: 16,
        minHeight: 60,
        width: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#1c292e',
    },
    audioItemContainerMobile: {
        minWidth: 220,
    },
    audioItemContainerWeb: {
        minWidth: 280,
    },
    audioPlayButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        backgroundColor: '#000000',
        borderRadius: 22,
    },
    audioInfoContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 8,
        paddingRight: 8,
    },
    audioProgressContainer: {
        marginBottom: 8,
    },
    audioProgressSlider: {
        height: 24,
    },
    audioTimeContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 6,
    },
    audioTime: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
        lineHeight: 16,
    },
    audioTimeSeparator: {
        fontSize: 11,
        color: '#ccc',
        marginHorizontal: 3,
    },
    documentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f5f5f5',
    },
    unknownContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f5f5f5',
    },

    // Common file styles
    fileIcon: {
        fontSize: 32,
        marginRight: 12,
    },
    mediaInfo: {
        flex: 1,
        marginRight: 8,
    },
    mediaName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#000',
    },
    mediaSize: {
        fontSize: 11,
        color: '#999',
        marginTop: 2,
    },
    mediaDuration: {
        fontSize: 11,
        color: '#999',
        marginTop: 2,
    },
    downloadIcon: {
        fontSize: 18,
        color: '#476380',
        marginLeft: 8,
    },
});

export default MediaMessage;

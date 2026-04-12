/**
 * Media Message Display Component
 * Shows images, videos, audio, and documents in chat
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Linking,
    Alert,
} from 'react-native';
import type { MessageMedia } from '@/types';

interface MediaMessageProps {
    media: MessageMedia;
    isSender: boolean;
}

const MediaMessage: React.FC<MediaMessageProps> = ({ media, isSender }) => {
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        console.log('[MediaMessage] Rendered with media:', {
            mediaType: media.mediaType,
            hasUrl: !!media.url,
            url: media.url?.substring(0, 50) + '...',
            name: media.name,
        });
    }, [media]);

    const isImage = media.mediaType === 'image';
    const isAudio = media.mediaType === 'audio';
    const isVideo = media.mediaType === 'video';
    const isDocument = media.mediaType === 'document' || media.mediaType === 'file';

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

    const getFileIcon = (): string => {
        if (!media.name) return '📎';

        const ext = media.name.split('.').pop()?.toLowerCase();
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
                <View style={styles.videoThumbnail}>
                    <Text style={styles.fileIcon}>🎬</Text>
                    <Text style={styles.playIcon}>▶️</Text>
                </View>
                <View style={styles.mediaInfo}>
                    <Text style={styles.mediaName} numberOfLines={1}>
                        {media.name || 'Video'}
                    </Text>
                    {media.size && (
                        <Text style={styles.mediaSize}>
                            {formatFileSize(media.size)}
                        </Text>
                    )}
                    {media.duration && (
                        <Text style={styles.mediaDuration}>
                            {Math.floor(media.duration)}s
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    }

    // Audio message
    if (isAudio) {
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
                <View style={styles.audioContainer}>
                    <Text style={styles.fileIcon}>🎵</Text>
                    <View style={styles.mediaInfo}>
                        <Text style={styles.mediaName} numberOfLines={1}>
                            {media.name || 'Audio'}
                        </Text>
                        {media.size && (
                            <Text style={styles.mediaSize}>
                                {formatFileSize(media.size)}
                            </Text>
                        )}
                        {media.duration && (
                            <Text style={styles.mediaDuration}>
                                {Math.floor(media.duration)}s
                            </Text>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
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
                            {media.name || 'Document'}
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
                <Text style={styles.mediaName}>{media.name || 'File'}</Text>
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
    videoThumbnail: {
        width: '100%',
        height: 180,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    playIcon: {
        fontSize: 48,
        color: 'white',
        opacity: 0.8,
        position: 'absolute',
    },

    // Audio/Document/File styles
    mediaItemContainer: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
    },
    audioContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f5f5f5',
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
        color: '#007AFF',
        marginLeft: 8,
    },
});

export default MediaMessage;

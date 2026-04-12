/**
 * Chat Media Service
 * Handles sending images, videos, audio, and files through chat
 */

import { SocketService } from './socketService';
import { uploadMedia } from './mediaService';
import type { MessageMedia, UploadProgressCallback } from "@/types";

class ChatMediaService {
    /**
     * Send message with media via Socket.IO
     */
    sendMessageWithMedia(
        conversationId: string,
        text: string | undefined,
        mediaArray: MessageMedia[],
        callback?: (response: any) => void
    ): void {
        try {
            SocketService.sendMessage(conversationId, text || '', mediaArray);

            console.log('[ChatMediaService] Message with media sent:', {
                conversationId,
                mediaCount: mediaArray.length,
                hasText: !!text,
            });

            if (callback) {
                callback({ success: true, message: 'Message sent' });
            }
        } catch (error: any) {
            console.error('[ChatMediaService] Error sending message:', error);
            if (callback) {
                callback({ success: false, error: error.message });
            }
        }
    }

    /**
     * Send image message
     */
    async sendImage(
        conversationId: string,
        imageFile: any,
        caption?: string,
        onProgress?: UploadProgressCallback
    ): Promise<void> {
        try {
            console.log('[ChatMediaService] Uploading image:', imageFile.name);

            // Upload image
            const uploadResult = await uploadMedia(imageFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media - use dimensions from file if available
            const media: MessageMedia = {
                url: uploadResult.url,
                mediaType: 'image',
                name: imageFile.name,
                size: imageFile.size,
                width: imageFile.width || 800,
                height: imageFile.height || 600,
            };

            console.log('[ChatMediaService] Image uploaded, sending message:', media);

            // Send via Socket.IO
            this.sendMessageWithMedia(conversationId, caption, [media]);

            if (onProgress) onProgress(100);
        } catch (error: any) {
            console.error('[ChatMediaService] Failed to send image:', error);
            throw error;
        }
    }

    /**
     * Send video message
     */
    async sendVideo(
        conversationId: string,
        videoFile: any,
        caption?: string,
        onProgress?: UploadProgressCallback
    ): Promise<void> {
        try {
            console.log('[ChatMediaService] Uploading video:', videoFile.name);

            // Upload video
            const uploadResult = await uploadMedia(videoFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = {
                url: uploadResult.url,
                mediaType: 'video',
                name: videoFile.name,
                size: videoFile.size,
                duration: videoFile.duration, // If available
            };

            console.log('[ChatMediaService] Video uploaded, sending message:', media);

            // Send via Socket.IO
            this.sendMessageWithMedia(conversationId, caption, [media]);

            if (onProgress) onProgress(100);
        } catch (error: any) {
            console.error('[ChatMediaService] Failed to send video:', error);
            throw error;
        }
    }

    /**
     * Send audio message
     */
    async sendAudio(
        conversationId: string,
        audioFile: any,
        caption?: string,
        onProgress?: UploadProgressCallback
    ): Promise<void> {
        try {
            console.log('[ChatMediaService] Uploading audio:', audioFile.name);

            // Upload audio
            const uploadResult = await uploadMedia(audioFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = {
                url: uploadResult.url,
                mediaType: 'audio',
                name: audioFile.name,
                size: audioFile.size,
                duration: audioFile.duration, // If available
            };

            console.log('[ChatMediaService] Audio uploaded, sending message:', media);

            // Send via Socket.IO
            this.sendMessageWithMedia(conversationId, caption, [media]);

            if (onProgress) onProgress(100);
        } catch (error: any) {
            console.error('[ChatMediaService] Failed to send audio:', error);
            throw error;
        }
    }

    /**
     * Send document message
     */
    async sendDocument(
        conversationId: string,
        documentFile: any,
        caption?: string,
        onProgress?: UploadProgressCallback
    ): Promise<void> {
        try {
            console.log('[ChatMediaService] Uploading document:', documentFile.name);

            // Upload document
            const uploadResult = await uploadMedia(documentFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = {
                url: uploadResult.url,
                mediaType: 'document',
                name: documentFile.name,
                size: documentFile.size,
            };

            console.log('[ChatMediaService] Document uploaded, sending message:', media);

            // Send via Socket.IO
            this.sendMessageWithMedia(conversationId, caption, [media]);

            if (onProgress) onProgress(100);
        } catch (error: any) {
            console.error('[ChatMediaService] Failed to send document:', error);
            throw error;
        }
    }

    /**
     * Send multiple media files
     */
    async sendMultipleMedia(
        conversationId: string,
        files: any[],
        caption?: string
    ): Promise<void> {
        const mediaArray: MessageMedia[] = [];

        for (const file of files) {
            try {
                const uploadResult = await uploadMedia(file);

                if (uploadResult?.url) {
                    const media: MessageMedia = {
                        url: uploadResult.url,
                        mediaType: this.detectMediaType(file.type),
                        name: file.name,
                        size: file.size,
                        width: file.width,
                        height: file.height,
                    };

                    mediaArray.push(media);
                }
            } catch (error) {
                console.error('[ChatMediaService] Failed to upload file:', file.name, error);
            }
        }

        if (mediaArray.length > 0) {
            this.sendMessageWithMedia(conversationId, caption, mediaArray);
            console.log('[ChatMediaService] Sent', mediaArray.length, 'media files');
        }
    }

    /**
     * Detect media type from MIME type
     */
    private detectMediaType(mimeType: string): MessageMedia['mediaType'] {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType === 'application/pdf') return 'document';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
        return 'file';
    }
}

export default new ChatMediaService();

/**
 * Chat Media Service
 * Handles sending images, videos, audio, and files through chat
 */

import { SocketService } from './socketService';
import { uploadMedia } from './mediaService';
import type { MessageMedia, UploadProgressCallback } from "@/types";

class ChatMediaService {
    private buildMessageMedia(
        file: any,
        mediaType: MessageMedia['mediaType'],
        uploadUrl: string,
        extra: Partial<MessageMedia> = {}
    ): MessageMedia {
        const filename = file?.fileName || file?.name || uploadUrl.split('/').pop() || 'file';
        const mimetype = file?.mimeType || file?.type || extra.mimetype || 'application/octet-stream';

        return {
            url: uploadUrl,
            filename,
            mimetype,
            name: filename,
            mediaType,
            size: file?.fileSize || file?.size,
            ...extra,
        };
    }

    /**
     * Send message with media via Socket.IO
     */
    async sendMessageWithMedia(
        conversationId: string,
        text: string | undefined,
        mediaArray: MessageMedia[],
        callback?: (response: any) => void
    ): Promise<any[]> {
        try {
            const messages = await SocketService.sendMessage(conversationId, text || '', mediaArray);

            console.log('[ChatMediaService] Message with media sent:', {
                conversationId,
                mediaCount: mediaArray.length,
                hasText: !!text,
            });

            if (callback) {
                callback({ success: true, messages });
            }

            return messages;
        } catch (error: any) {
            console.error('[ChatMediaService] Error sending message:', error);
            if (callback) {
                callback({ success: false, error: error.message });
            }
            return [];
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
    ): Promise<any[]> {
        try {
            console.log('[ChatMediaService] Uploading image:', imageFile.name);

            // Upload image
            const uploadResult = await uploadMedia(imageFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media - use dimensions from file if available
            const media: MessageMedia = this.buildMessageMedia(imageFile, 'image', uploadResult.url, {
                width: imageFile.width || 800,
                height: imageFile.height || 600,
            });

            console.log('[ChatMediaService] Image uploaded, sending message:', media);

            // Send via Socket.IO
            return await this.sendMessageWithMedia(conversationId, caption, [media]);

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
    ): Promise<any[]> {
        try {
            console.log('[ChatMediaService] Uploading video:', videoFile.name);

            // Upload video
            const uploadResult = await uploadMedia(videoFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = this.buildMessageMedia(videoFile, 'video', uploadResult.url, {
                duration: videoFile.duration, // If available
            });

            console.log('[ChatMediaService] Video uploaded, sending message:', media);

            // Send via Socket.IO
            return await this.sendMessageWithMedia(conversationId, caption, [media]);

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
    ): Promise<any[]> {
        try {
            console.log('[ChatMediaService] Uploading audio:', audioFile.name);

            // Upload audio
            const uploadResult = await uploadMedia(audioFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = this.buildMessageMedia(audioFile, 'audio', uploadResult.url, {
                duration: audioFile.duration, // If available
            });

            console.log('[ChatMediaService] Audio uploaded, sending message:', media);

            // Send via Socket.IO
            return await this.sendMessageWithMedia(conversationId, caption, [media]);

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
    ): Promise<any[]> {
        try {
            console.log('[ChatMediaService] Uploading document:', documentFile.name);

            // Upload document
            const uploadResult = await uploadMedia(documentFile);

            if (!uploadResult?.url) {
                throw new Error('No URL returned from upload');
            }

            // Create message media
            const media: MessageMedia = this.buildMessageMedia(documentFile, 'document', uploadResult.url);

            console.log('[ChatMediaService] Document uploaded, sending message:', media);

            // Send via Socket.IO
            return await this.sendMessageWithMedia(conversationId, caption, [media]);

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
    ): Promise<any[]> {
        const mediaArray: MessageMedia[] = [];

        for (const file of files) {
            try {
                const uploadResult = await uploadMedia(file);

                if (uploadResult?.url) {
                    const normalizedMimeType = file?.mimeType || file?.type || 'application/octet-stream';
                    const media: MessageMedia = {
                        url: uploadResult.url,
                        filename: file?.fileName || file?.name || 'file',
                        mimetype: normalizedMimeType,
                        name: file.name,
                        mediaType: this.detectMediaType(normalizedMimeType),
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
            return await this.sendMessageWithMedia(conversationId, caption, mediaArray);
            console.log('[ChatMediaService] Sent', mediaArray.length, 'media files');
        }

        return [];
    }

    /**
     * Detect media type from MIME type
     */
    private detectMediaType(mimeType: string): MessageMedia['mediaType'] {
        const normalized = (mimeType || '').toLowerCase();

        if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
        if (normalized === 'video' || normalized.startsWith('video/')) return 'video';
        if (normalized === 'audio' || normalized.startsWith('audio/')) return 'audio';
        if (normalized === 'application/pdf') return 'document';
        if (normalized.includes('word') || normalized.includes('document')) return 'document';
        return 'file';
    }
}

export default new ChatMediaService();

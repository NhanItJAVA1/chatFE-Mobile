/**
 * Media Upload & Chat Types
 */

/**
 * Media file type enum
 */
export enum MediaFileType {
    IMAGE = 'IMAGE',
    VIDEO = 'VIDEO',
    AUDIO = 'AUDIO',
    DOCUMENT = 'DOCUMENT',
}

/**
 * Presigned URL request payload
 */
export interface RequestPresignedUrlPayload {
    fileType: MediaFileType;
    mimeType: string;
    fileSize: number;
    originalName?: string;
    expiresIn?: number; // seconds, default 300 (5 min)
    conversationId?: string;
}

/**
 * Presigned URL response
 */
export interface PresignedUrlResponse {
    fileId: string;
    filename: string;
    presignedUrl: string;
    uploadMethod: 'PUT' | 'POST';
    expiresAt: string;
    headers: Record<string, string>;
}

/**
 * Media data in message
 */
export interface MessageMedia {
    url: string;
    mediaType: 'image' | 'file' | 'video' | 'audio' | 'document';
    filename?: string;
    mimetype?: string;
    name?: string;
    size?: number;
    width?: number; // For images only
    height?: number; // For images only
    duration?: number; // For audio/video
}

/**
 * Chat message with media
 */
export interface ChatMessageWithMedia {
    conversationId: string;
    text?: string;
    media?: MessageMedia[];
}

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Media upload response
 */
export interface MediaUploadResponse {
    url: string;
    fileId: string;
}

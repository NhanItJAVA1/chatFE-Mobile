/**
 * Message and conversation type definitions
 * Covers chat, messages, and conversation-related types
 */

export type ConversationItem = {
    id: number;
    type: "incoming" | "outgoing";
    text: string;
    time: string;
    edited?: boolean;
};

export type Chat = {
    id: number;
    name: string;
    message: string;
    time: string;
    unread: number;
    accent: string;
    initials: string;
    verified?: boolean;
    avatarUrl?: string;
    avatar?: string;
};

// =====================================================
// FILE UPLOAD TYPES (Presigned URL Flow)
// =====================================================

export type FileType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export type PresignedUrlRequestPayload = {
    fileType: FileType;
    mimeType: string;
    fileSize: number;
    originalName?: string;
    expiresIn?: number; // 60-3600 seconds
    conversationId?: string;
};

export type PresignedUrlResponse = {
    fileId: string;
    presignedUrl: string;
    expiresAt: string;
    headers?: Record<string, string>;
};

export type PresignedUrlData = {
    data: PresignedUrlResponse;
};

export type ConfirmUploadPayload = {
    fileId: string;
    uploadedUrl: string;
};

export type UploadProgressEvent = {
    loaded: number;
    total: number;
    percentage: number;
    status: "uploading" | "completed" | "error";
    error?: string;
};

export type FileValidationResult = {
    isValid: boolean;
    error?: string;
    warnings?: string[];
};

export type UploadSession = {
    fileId: string;
    presignedUrl: string;
    expiresAt: string;
    originalFile: any;
    originalName: string;
    fileType: FileType;
    mimeType: string;
    fileSize: number;
    compressedSize?: number;
    uploadStartTime?: number;
};

// =====================================================
// FRIENDSHIP TYPES
// =====================================================

export type FriendshipStatus = {
    isFriend: boolean;
    status: "ACCEPTED" | "PENDING" | "DECLINED" | "NONE";
};

export type FriendRequest = {
    _id: string;
    senderId?: string;
    receiverId?: string;
    senderInfo?: {
        displayName: string;
        phoneNumber: string;
        avatar: string;
        status: "online" | "offline";
    };
    receiverInfo?: {
        displayName: string;
        phoneNumber: string;
        avatar: string;
        status: "online" | "offline";
    };
    status: "PENDING" | "ACCEPTED" | "DECLINED";
    createdAt: string;
    acceptedAt?: string;
};

export type Friend = {
    _id: string;
    friendId: string;
    friendInfo: {
        displayName: string;
        phoneNumber: string;
        avatar: string;
        status: "online" | "offline";
    };
    status: "ACCEPTED";
    createdAt: string;
};


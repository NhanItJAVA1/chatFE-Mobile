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
    status: "accepted" | "pending" | "rejected" | "canceled" | "none";
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
    status: "pending" | "accepted" | "rejected" | "canceled";
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
    status: "accepted";
    createdAt: string;
};

// =====================================================
// GROUP CHAT TYPES
// =====================================================

export type GroupMemberRole = "owner" | "admin" | "member";
export type GroupMemberStatus = "pending" | "active" | "rejected";

export type GroupMember = {
    _id: string;
    userId: string;
    name?: string;
    avatar?: string;
    role: GroupMemberRole;
    status: GroupMemberStatus;
    joinedAt: string;
};

export type GroupSettings = {
    allowSendLink: boolean;
    requireApproval: boolean;
    allowMemberInvite: boolean;
};

export type Group = {
    _id: string;
    name: string;
    type: "group";
    avatarUrl?: string;
    ownerId: string;
    admins: string[];
    members?: GroupMember[];
    membersCount: number;
    settings: GroupSettings;
    createdAt: string;
    updatedAt: string;
};

export type GroupCreatePayload = {
    name: string;
    memberIds: string[]; // min 2 members
    avatarUrl?: string;
};

export type GroupUpdatePayload = {
    name?: string;
    avatarUrl?: string;
};

export type GroupResponse = {
    status: "success";
    msg: string;
    data: {
        conversation?: Group;
        group?: Group;
        members?: GroupMember[];
        systemMessage?: any;
    };
};


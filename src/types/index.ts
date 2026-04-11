/**
 * Central type exports
 * All types should be imported from this index file
 */

// User types
export type { User } from "./user";

// Auth types
export type {
    AuthResponse,
    AuthContextType,
    AuthProviderProps,
    AppContextType,
    AppProviderProps,
    LoginScreenProps,
    RegisterScreenProps,
    RegisterFormData,
} from "./auth";

// Component prop types
export type {
    AvatarProps,
    CardProps,
    PrimaryButtonProps,
    TextFieldProps,
    SectionTitleProps,
    BottomTabBarProps,
    TabItem,
    ChatScreenProps,
    EditData,
} from "./component";

// Message/Chat types
export type {
    ConversationItem,
    Chat,
    FileType,
    PresignedUrlRequestPayload,
    PresignedUrlResponse,
    PresignedUrlData,
    ConfirmUploadPayload,
    UploadProgressEvent,
    FileValidationResult,
    UploadSession,
    FriendshipStatus,
    FriendRequest,
    Friend,
} from "./message";

// Common utility types
export type { ApiCallOptions, UseFetchResult } from "./common";

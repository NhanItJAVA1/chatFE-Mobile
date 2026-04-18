/**
 * Component prop type definitions
 * All component props are centralized here for consistency
 */

import { ReactNode } from "react";
import { ViewStyle, TextInputProps } from "react-native";

// Avatar Component
export type AvatarProps = {
    label: string;
    size?: number;
    backgroundColor?: string;
    textSize?: number;
    imageUrl?: string;
    style?: ViewStyle | ViewStyle[];
};

// Card Component
export type CardProps = {
    style?: ViewStyle | ViewStyle[];
    children: ReactNode;
};

// PrimaryButton Component
export type PrimaryButtonProps = {
    label: string;
    onPress: () => void;
    loading?: boolean;
    variant?: "primary" | "secondary";
    style?: ViewStyle | ViewStyle[];
};

// TextField Component
export type TextFieldProps = TextInputProps & {
    label?: string;
    multiline?: boolean;
};

// SectionTitle Component
export type SectionTitleProps = {
    title: string;
    subtitle?: string;
    rightLabel?: string;
};

// BottomTabBar Component
export type BottomTabBarProps = {
    activeTab: string;
    onChangeTab: (tab: string) => void;
    friendRequestCount?: number;
};

export type TabItem = {
    key: string;
    label: string;
    icon: string;
};

// ChatScreen Component
export type ChatScreenProps = {
    onBackPress: () => void;
    chatUser?: any;
};

// FriendRequestsScreen Component
export type FriendRequestsScreenProps = {
    requests: any[];
    loading: boolean;
    error: string | null;
    acceptRequest: (requestId: string) => Promise<boolean>;
    declineRequest: (requestId: string) => Promise<boolean>;
    refresh: () => Promise<void>;
};

// ProfileScreen Types
export type EditData = {
    displayName: string;
    phone: string;
    email: string;
    bio: string;
    avatarUrl: string | null;
};

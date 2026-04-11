/**
 * User type definitions
 * Represents user data throughout the application
 */

export type User = {
    id: string;
    email: string;
    displayName?: string;
    name?: string;
    avatar?: string;
    avatarUrl?: string;
    phone?: string;
    bio?: string;
    verified?: boolean;
    [key: string]: any;
};

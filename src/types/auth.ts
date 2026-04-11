/**
 * Authentication type definitions
 * Covers auth responses, context types, and auth-related data
 */

import type { User } from "./user";
import { ReactNode } from "react";

export type AuthResponse = {
    access_token?: string;
    accessToken?: string;
    token?: string;
    refreshToken?: string;
    user?: User;
    data?: User;
    [key: string]: any;
};

export type AuthContextType = {
    user: User | null;
    token: string | null;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    login: (phone: string, password: string) => Promise<User>;
    register: (userData: any) => Promise<AuthResponse>;
    logout: () => Promise<void>;
    updateProfile: (profileData: any) => Promise<User>;
};

export type AuthProviderProps = {
    children: ReactNode;
};

export type AppContextType = {
    user: User | null;
    setUser: (user: User | null) => void;
    theme: string;
    setTheme: (theme: string) => void;
};

export type AppProviderProps = {
    children: ReactNode;
};

export type LoginScreenProps = {
    onSwitchToRegister: () => void;
};

export type RegisterScreenProps = {
    onSwitchToLogin: () => void;
};

export type RegisterFormData = {
    phone: string;
    password: string;
    confirmPassword: string;
    email: string;
    displayName: string;
};

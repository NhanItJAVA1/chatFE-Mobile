import React, { createContext, useEffect, useState, ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import { authService } from "../services/authService";
import { updateProfile as updateProfileAPI } from "../services/userService";
import type { User, AuthContextType, AuthProviderProps } from "@/types";

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isActive = true;

        const restoreSession = async () => {
            try {
                const savedToken = await authService.getToken();
                const savedUser = await authService.getUser();

                if (!isActive) return;

                if (savedToken) {
                    setToken(savedToken);

                    try {
                        const introspection = await authService.introspect(savedToken);
                        if (!introspection.active) {
                            await authService.logout();
                            setToken(null);
                            setUser(null);
                            return;
                        }

                        const profileResponse = await authService.getProfile(savedToken);
                        let profile = profileResponse;

                        if (!isActive) {
                            return;
                        }

                        if (!profile.avatarUrl && profile.avatar) {
                            profile.avatarUrl = profile.avatar;                        }

                        setUser(profile);
                        await authService.saveUser(profile);
                    } catch (err: any) {
                        if (!isActive) {
                            return;
                        }

                        console.error(
                            "[AuthContext] Profile fetch failed during restore:",
                            err.message
                        );

                        // If token is invalid or user not found, log out instead of falling back
                        if (err.message?.includes("401") || err.message?.includes("404") || err.message?.includes("403")) {
                            console.error("[AuthContext] Token invalid or user not found, logging out...");
                            await authService.logout();
                            setToken(null);
                            setUser(null);
                        } else if (savedUser) {                            setUser(savedUser);
                        }
                    }
                } else if (savedUser) {                    setUser(savedUser);
                }

                if (isActive) {
                    setLoading(false);
                }
            } catch (error: any) {
                console.error("[AuthContext] Session restore error:", error);
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        restoreSession();

        const logoutSub = DeviceEventEmitter.addListener("forceLogout", () => {            setToken(null);
            setUser(null);
        });

        return () => {
            isActive = false;
            logoutSub.remove();
        };
    }, []);

    const register = async (userData: any): Promise<any> => {
        try {
            setError(null);
            setLoading(true);
            return await authService.register(userData);
        } catch (err: any) {
            const errorMessage = err.message || "Registration failed";
            setError(errorMessage);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const login = async (phone: string | { phone?: string; email?: string; password?: string }, password?: string): Promise<User> => {
        try {
            setError(null);
            setLoading(true);
            const credentials = typeof phone === "object"
                ? phone
                : { phone, password };
            const loginPhone = credentials.phone?.trim();
            const loginEmail = credentials.email?.trim();
            const loginPassword = credentials.password;
            if ((!loginPhone && !loginEmail) || typeof loginPassword !== "string" || !loginPassword) {
                throw new Error("Phone/email and password are required");
            }

            const response = await authService.login({
                ...(loginPhone ? { phone: loginPhone } : {}),
                ...(loginEmail ? { email: loginEmail } : {}),
                password: loginPassword,
            });
            const token =
                response?.token ||
                response?.accessToken ||
                response?.data?.token;
            if (!token) {
                throw new Error("No token in login response");
            }

            const introspection = await authService.introspect(token);
            if (!introspection.active) {
                throw new Error("Access token is not active");
            }

            setToken(token);

            const profile = await authService.getProfile(token);            if (!profile.avatarUrl && profile.avatar) {
                profile.avatarUrl = profile.avatar;            }

            await authService.saveUser(profile);
            setUser(profile);

            return profile;
        } catch (err: any) {
            console.error("[AuthContext] Login error:", err);
            const errorMessage = err.message || "Login failed";
            setError(errorMessage);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async (): Promise<void> => {
        try {
            await authService.logout();
        } catch (err: any) {
            console.error("Logout error:", err);
        } finally {
            setUser(null);
            setToken(null);
            setError(null);
        }
    };

    const updateProfile = async (profileData: any): Promise<User> => {
        try {
            setLoading(true);
            const currentToken = await authService.getToken();
            if (!currentToken) {
                throw new Error("Not authenticated - please login again");
            }

            const updateResponse = await updateProfileAPI(profileData);
            const freshProfile = await authService.getProfile(currentToken);
            if (!freshProfile.avatarUrl && freshProfile.avatar) {
                freshProfile.avatarUrl = freshProfile.avatar;
            }

            setUser(freshProfile);
            await authService.saveUser(freshProfile);
            return freshProfile;
        } catch (err: any) {
            const errorMessage = err.message || "Update failed";
            setError(errorMessage);
            console.error("[AuthContext] updateProfile error:", err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const value: AuthContextType = {
        user,
        token,
        loading,
        error,
        login,
        register,
        logout,
        updateProfile,
        isAuthenticated: !!token,
    };

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};

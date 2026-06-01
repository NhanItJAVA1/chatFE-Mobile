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
                            profile.avatarUrl = profile.avatar;
                            console.log(
                                "[AuthContext] Set avatarUrl from avatar:",
                                profile.avatarUrl
                            );
                        }

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
                        } else if (savedUser) {
                            console.log("[AuthContext] Network or generic error, using saved user");
                            setUser(savedUser);
                        }
                    }
                } else if (savedUser) {
                    console.log("[AuthContext] No saved token, using saved user");
                    setUser(savedUser);
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

        const logoutSub = DeviceEventEmitter.addListener("forceLogout", () => {
            console.log("[AuthContext] forceLogout event received");
            setToken(null);
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

            console.log("[AuthContext] Logging in:", {
                hasPhone: !!loginPhone,
                hasEmail: !!loginEmail,
                hasPassword: typeof loginPassword === "string" && loginPassword.length > 0,
            });

            if ((!loginPhone && !loginEmail) || typeof loginPassword !== "string" || !loginPassword) {
                throw new Error("Phone/email and password are required");
            }

            const response = await authService.login({
                ...(loginPhone ? { phone: loginPhone } : {}),
                ...(loginEmail ? { email: loginEmail } : {}),
                password: loginPassword,
            });
            console.log("[AuthContext] Login response:", response);

            const token =
                response?.token ||
                response?.accessToken ||
                response?.data?.token;
            console.log(
                "[AuthContext] Extracted token:",
                token ? `${token.substring(0, 20)}...` : "missing"
            );

            if (!token) {
                throw new Error("No token in login response");
            }

            const introspection = await authService.introspect(token);
            if (!introspection.active) {
                throw new Error("Access token is not active");
            }

            setToken(token);

            const profile = await authService.getProfile(token);
            console.log(
                "[AuthContext] Profile JSON:",
                JSON.stringify(profile, null, 2)
            );
            console.log("[AuthContext] Profile keys:", Object.keys(profile || {}));

            if (!profile.avatarUrl && profile.avatar) {
                profile.avatarUrl = profile.avatar;
                console.log(
                    "[AuthContext] Set avatarUrl from avatar:",
                    profile.avatarUrl
                );
            }

            console.log(
                "[AuthContext] Final user object:",
                JSON.stringify(profile, null, 2)
            );
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
            console.log(
                "[AuthContext] updateProfile called with:",
                JSON.stringify(profileData, null, 2)
            );

            const currentToken = await authService.getToken();
            if (!currentToken) {
                throw new Error("Not authenticated - please login again");
            }

            const updateResponse = await updateProfileAPI(profileData);
            console.log(
                "[AuthContext] updateProfile API response:",
                JSON.stringify(updateResponse, null, 2)
            );

            const freshProfile = await authService.getProfile(currentToken);
            console.log(
                "[AuthContext] Fresh profile after update:",
                JSON.stringify(freshProfile, null, 2)
            );

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

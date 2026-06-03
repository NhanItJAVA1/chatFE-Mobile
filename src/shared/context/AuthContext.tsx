import React, { createContext, useEffect, useState, ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import { authService } from "../services/authService";
import { getDeviceInfo, getOrCreateDeviceId } from "../services/deviceInfo";
import { updateProfile as updateProfileAPI } from "../services/userService";
import type { User, AuthContextType, AuthProviderProps } from "@/types";

export const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_DEBUG_PREFIX = "[AUTH_DEBUG]";

const maskToken = (token?: string | null): string => {
    if (!token) {
        return "missing";
    }

    return `${token.slice(0, 8)}...${token.slice(-6)}`;
};

const readAccessToken = (payload: any): string => {
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    return data?.accessToken || data?.access_token || "";
};

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
                const savedRefreshToken = await authService.getRefreshToken();
                const savedUser = await authService.getUser();

                if (!isActive) return;

                console.log(`${AUTH_DEBUG_PREFIX} Restore session from storage`, {
                    accessToken: maskToken(savedToken),
                    hasRefreshToken: !!savedRefreshToken,
                    hasUser: !!savedUser,
                });

                let activeToken = savedToken;
                let didRefresh = false;

                if (!activeToken && savedRefreshToken) {
                    try {
                        activeToken = await authService.refreshAccessToken();
                        didRefresh = true;
                    } catch (err: any) {
                        console.error(`${AUTH_DEBUG_PREFIX} Restore refresh failed with no access token`, err?.message || err);
                        await authService.clearLocalSession();
                        setToken(null);
                        setUser(null);
                        return;
                    }
                }

                if (activeToken) {
                    try {
                        const introspection = await authService.introspect(activeToken);
                        if (!introspection.active) {
                            if (savedRefreshToken) {
                                activeToken = await authService.refreshAccessToken();
                                didRefresh = true;
                            } else {
                                await authService.clearLocalSession();
                                setToken(null);
                                setUser(null);
                                return;
                            }
                        }
                    } catch (err: any) {
                        if (savedRefreshToken) {
                            try {
                                activeToken = await authService.refreshAccessToken();
                                didRefresh = true;
                            } catch (refreshErr: any) {
                                console.error(`${AUTH_DEBUG_PREFIX} Restore refresh failed after introspection error`, refreshErr?.message || refreshErr);
                                await authService.clearLocalSession();
                                setToken(null);
                                setUser(null);
                                return;
                            }
                        } else {
                            throw err;
                        }
                    }

                    try {
                        setToken(activeToken);

                        const profileResponse = await authService.getProfile(activeToken);
                        let profile = profileResponse;

                        if (!isActive) {
                            return;
                        }

                        if (!profile.avatarUrl && profile.avatar) {
                            profile.avatarUrl = profile.avatar;
                        }

                        setUser(profile);
                        await authService.saveUser(profile);
                        console.log(`${AUTH_DEBUG_PREFIX} Restore session succeeded`, {
                            accessToken: maskToken(activeToken),
                            refreshed: didRefresh,
                            userId: profile?.id || (profile as any)?._id || (profile as any)?.userId,
                        });
                    } catch (err: any) {
                        if (!isActive) {
                            return;
                        }

                        console.error(`${AUTH_DEBUG_PREFIX} Profile fetch failed during restore`, err.message);

                        const isAuthProfileError =
                            err.status === 401 ||
                            err.status === 403 ||
                            err.status === 404 ||
                            err.message?.includes("401") ||
                            err.message?.includes("404") ||
                            err.message?.includes("403");

                        if (isAuthProfileError && savedRefreshToken && !didRefresh) {
                            try {
                                const refreshedToken = await authService.refreshAccessToken();
                                const profile = await authService.getProfile(refreshedToken);
                                if (!profile.avatarUrl && profile.avatar) {
                                    profile.avatarUrl = profile.avatar;
                                }
                                setToken(refreshedToken);
                                setUser(profile);
                                await authService.saveUser(profile);
                                console.log(`${AUTH_DEBUG_PREFIX} Restore profile succeeded after refresh`, {
                                    accessToken: maskToken(refreshedToken),
                                });
                            } catch (refreshErr: any) {
                                console.error(`${AUTH_DEBUG_PREFIX} Restore profile refresh failed`, refreshErr?.message || refreshErr);
                                await authService.clearLocalSession();
                                setToken(null);
                                setUser(null);
                            }
                        } else if (isAuthProfileError) {
                            await authService.clearLocalSession();
                            setToken(null);
                            setUser(null);
                        } else if (savedUser) {
                            setUser(savedUser);
                        }
                    }
                } else if (savedUser) {
                    setUser(savedUser);
                }

            } catch (error: any) {
                console.error(`${AUTH_DEBUG_PREFIX} Session restore error`, error?.message || error);
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        restoreSession();

        const logoutSub = DeviceEventEmitter.addListener("forceLogout", () => {
            console.log(`${AUTH_DEBUG_PREFIX} Force logout event received`);
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
            const response = await authService.register(userData);
            const responseData = response?.data && typeof response.data === "object" ? response.data : response;
            const accessToken =
                response?.accessToken ||
                response?.access_token ||
                response?.data?.accessToken ||
                response?.data?.access_token;

            if (!accessToken || responseData?.pendingVerification) {
                return response;
            }

            setToken(accessToken);

            const profile = await authService.getProfile(accessToken);

            if (!profile.avatarUrl && profile.avatar) {
                profile.avatarUrl = profile.avatar;
            }

            await authService.saveUser(profile);
            setUser(profile);

            return response;
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

            const deviceId = await getOrCreateDeviceId();
            const response = await authService.login({
                ...(loginPhone ? { phone: loginPhone } : {}),
                ...(loginEmail ? { email: loginEmail } : {}),
                password: loginPassword,
                deviceInfo: getDeviceInfo(deviceId),
            });
            const token = readAccessToken(response) || await authService.getToken();
            if (!token) {
                throw new Error("No token in login response");
            }

            const introspection = await authService.introspect(token);
            if (!introspection.active) {
                throw new Error("Access token is not active");
            }

            setToken(token);
            console.log(`${AUTH_DEBUG_PREFIX} Login set auth context token`, {
                accessToken: maskToken(token),
            });

            const profile = await authService.getProfile(token);
            if (!profile.avatarUrl && profile.avatar) {
                profile.avatarUrl = profile.avatar;
            }

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
            console.log(`${AUTH_DEBUG_PREFIX} Logout called from AuthContext`);
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

    const updateAvatar = async (avatarUrl: string): Promise<User> => {
        try {
            setLoading(true);
            const currentToken = await authService.getToken();
            if (!currentToken) {
                throw new Error("Not authenticated - please login again");
            }

            await authService.updateAvatar(avatarUrl);
            const freshProfile = await authService.getProfile(currentToken);
            if (!freshProfile.avatarUrl && freshProfile.avatar) {
                freshProfile.avatarUrl = freshProfile.avatar;
            }
            freshProfile.avatarUrl = freshProfile.avatarUrl || avatarUrl;

            setUser(freshProfile);
            await authService.saveUser(freshProfile);
            return freshProfile;
        } catch (err: any) {
            const errorMessage = err.message || "Avatar update failed";
            setError(errorMessage);
            console.error("[AuthContext] updateAvatar error:", err);
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
        updateAvatar,
        isAuthenticated: !!token,
    };

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};

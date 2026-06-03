import { api, tokenManager } from "./api";
import { authStorage } from "../runtime/storage";
import { getApiBaseUrl } from "../runtime/config";
import { getDeviceHeaders } from "./sessionService";
import { DeviceEventEmitter } from "react-native";
import type { AuthResponse, User } from "@/types";

const AUTH_DEBUG_PREFIX = "[AUTH_DEBUG]";

const maskToken = (token?: string | null): string => {
    if (!token) {
        return "missing";
    }

    return `${token.slice(0, 8)}...${token.slice(-6)}`;
};

const unwrapPayload = (payload: any): any => {
    return payload?.data && typeof payload.data === "object" ? payload.data : payload;
};

const readAccessToken = (payload: any): string => {
    const data = unwrapPayload(payload);
    return data?.accessToken || data?.access_token || "";
};

const readRefreshToken = (payload: any): string => {
    const data = unwrapPayload(payload);
    return data?.refreshToken || data?.refresh_token || "";
};

const readUserProfile = (payload: any): User | null => {
    const data = unwrapPayload(payload);
    return data?.user || data?.profile || null;
};

const publicAuthOptions = {
    skipAuth: true,
    skipRefresh: true,
};

export type TokenIntrospection = {
    active: boolean;
    payload?: {
        sub?: string;
        role?: string;
        type?: string;
        jti?: string;
        tokenVersion?: number;
        exp?: number;
        iat?: number;
        [key: string]: any;
    };
};

export const authService = {
    register: async (userData: any): Promise<AuthResponse> => {
        try {
            const response = await api.post("/auth/register", userData, {
                headers: await getDeviceHeaders(),
                ...publicAuthOptions,
            });
            const responseData = unwrapPayload(response);
            const pendingVerification = !!responseData?.pendingVerification;
            const accessToken = readAccessToken(response);
            const refreshToken = readRefreshToken(response);
            const userProfile = readUserProfile(response);

            if (accessToken && !pendingVerification) {
                await authStorage.setItem("token", accessToken);
                if (refreshToken) {
                    await authStorage.setItem("refreshToken", refreshToken);
                }
                console.log(`${AUTH_DEBUG_PREFIX} Register stored token`, {
                    accessToken: maskToken(accessToken),
                    hasRefreshToken: !!refreshToken,
                });
            }

            if (userProfile && !pendingVerification) {
                await authStorage.setItem("user", JSON.stringify(userProfile));
            }

            return response;
        } catch (error: any) {
            throw error;
        }
    },

    login: async (payload: any): Promise<AuthResponse> => {
        try {
            const phone = typeof payload?.phone === "string" ? payload.phone.trim() : undefined;
            const email = typeof payload?.email === "string" ? payload.email.trim() : undefined;
            const password = payload?.password;

            if ((!phone && !email) || typeof password !== "string" || !password) {
                throw new Error("Phone/email and password are required");
            }

            const loginPayload = {
                ...(phone ? { phone } : {}),
                ...(email ? { email } : {}),
                password,
                ...(payload?.deviceInfo ? { deviceInfo: payload.deviceInfo } : {}),
            };
            let authData = await api.post("/auth/login", loginPayload, {
                headers: await getDeviceHeaders(),
                ...publicAuthOptions,
            });

            if (authData?.data && !authData?.accessToken && !authData?.access_token) {
                authData = authData.data;
            }

            const accessToken = readAccessToken(authData);
            const refreshToken = readRefreshToken(authData);

            if (accessToken) {
                await authStorage.setItem("token", accessToken);
                if (refreshToken) {
                    await authStorage.setItem("refreshToken", refreshToken);
                }
                console.log(`${AUTH_DEBUG_PREFIX} Login stored token`, {
                    accessToken: maskToken(accessToken),
                    hasRefreshToken: !!refreshToken,
                });
            } else {
                console.warn(`${AUTH_DEBUG_PREFIX} Login response did not include access token`, authData);
            }

            const userProfile = readUserProfile(authData);
            if (userProfile) {
                await authStorage.setItem("user", JSON.stringify(userProfile));
            }

            return authData;
        } catch (error: any) {
            throw error;
        }
    },

    getUnverifiedEmail: async (phone: string): Promise<string> => {
        const response = await api.get("/auth/unverified-email", {
            params: { phone },
            ...publicAuthOptions,
        });
        const email = response?.data?.email || response?.email;
        if (!email) {
            throw new Error("No unverified email found for this phone number");
        }
        return email;
    },

    sendVerification: async (email: string): Promise<any> => {
        return api.post("/auth/send-verification", { email }, publicAuthOptions);
    },

    resendVerification: async (email: string): Promise<any> => {
        return api.post("/auth/resend-verification", { email }, publicAuthOptions);
    },

    verifyEmail: async (email: string, code: string): Promise<any> => {
        return api.post("/auth/verify-email", { email, code }, publicAuthOptions);
    },

    introspect: async (token: string): Promise<TokenIntrospection> => {
        try {
            const response = await fetch(`${getApiBaseUrl()}/auth/introspect`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ token }),
            });

            if (!response.ok) {
                return { active: false };
            }

            const result = await response.json();
            const data = result?.data || result;
            return {
                active: !!data?.active,
                payload: data?.payload,
            };
        } catch (error: any) {
            console.error("[authService] Introspect error:", error?.message || error);
            throw new Error("Token introspection failed");
        }
    },

    getProfile: async (token?: string): Promise<User> => {
        try {
            if (token) {
                const url = `${getApiBaseUrl()}/users/me/profile`;
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    const profileError: any = new Error(`Profile fetch failed: ${response.status}`);
                    profileError.status = response.status;
                    throw profileError;
                }

                const responseData = await response.json();
                const profile = responseData.data || responseData;
                return profile;
            }

            const response = await api.get("/users/me/profile");
            let profile = response;

            if (
                response.data &&
                typeof response.data === "object" &&
                (response.data.id || response.data.displayName)
            ) {
                profile = response.data;
            }
            return profile;
        } catch (error: any) {
            console.error("[authService] Get profile error:", error);
            const profileError: any = new Error(error?.message || "Failed to fetch profile");
            profileError.status = error?.status;
            throw profileError;
        }
    },

    saveToken: async (token: string): Promise<void> => {
        await authStorage.setItem("token", token);
        console.log(`${AUTH_DEBUG_PREFIX} Saved access token`, {
            accessToken: maskToken(token),
        });
    },

    getToken: async (): Promise<string | null> => {
        return await authStorage.getItem("token");
    },

    getRefreshToken: async (): Promise<string | null> => {
        return await authStorage.getItem("refreshToken");
    },

    saveUser: async (user: User): Promise<void> => {
        await authStorage.setItem("user", JSON.stringify(user));
    },

    getUser: async (): Promise<User | null> => {
        const user = await authStorage.getItem("user");
        return user ? JSON.parse(user) : null;
    },

    logout: async (): Promise<void> => {
        try {
            const refreshToken = await authStorage.getItem("refreshToken");
            console.log(`${AUTH_DEBUG_PREFIX} Logout requested`, {
                hasRefreshToken: !!refreshToken,
            });
            if (refreshToken) {
                await api.post("/auth/logout", { refreshToken }, {
                    headers: await getDeviceHeaders(),
                    skipAuth: true,
                    skipRefresh: true,
                });
            }
        } catch (error: any) {
            console.error("Logout failed:", error);
        } finally {
            console.log(`${AUTH_DEBUG_PREFIX} Clearing local auth session`);
            await authStorage.removeItem("token");
            await authStorage.removeItem("refreshToken");
            await authStorage.removeItem("user");
        }
    },

    forgotPassword: async (payload: any): Promise<any> => {
        const responseData = await api.post("/auth/forgot-password", payload, {
            ...publicAuthOptions,
        });
        return responseData;
    },

    verifyResetOtp: async (email: string, otp: string): Promise<any> => {
        return api.post("/auth/verify-reset-otp", { email, otp }, publicAuthOptions);
    },

    resendResetOtp: async (email: string): Promise<any> => {
        return api.post("/auth/resend-reset-otp", { email }, publicAuthOptions);
    },

    resetPassword: async (tempToken: string, newPassword: string): Promise<any> => {
        return api.post("/auth/reset-password", { tempToken, newPassword }, publicAuthOptions);
    },

    clearLocalSession: async (): Promise<void> => {
        console.log(`${AUTH_DEBUG_PREFIX} Clearing local auth session`);
        await authStorage.removeItem("token");
        await authStorage.removeItem("refreshToken");
        await authStorage.removeItem("user");
        DeviceEventEmitter.emit("forceLogout");
    },

    updatePassword: async (payload: any): Promise<any> => {
        const responseData = await api.post("/auth/change-password", payload);
        return responseData;
    },

    updateAvatar: async (avatarUrl: string): Promise<any> => {
        try {
            const response = await api.patch("/auth/avatar", {
                avatarUrl,
            });
            return response;
        } catch (error: any) {
            throw new Error(error.message || "Failed to update avatar");
        }
    },

    refreshAccessToken: async (): Promise<string> => {
        try {
            const currentRefreshToken = await tokenManager.getRefreshToken();
            if (!currentRefreshToken) {
                throw new Error("No refresh token available");
            }

            console.log(`${AUTH_DEBUG_PREFIX} AuthService attempting token refresh`, {
                refreshToken: maskToken(currentRefreshToken),
            });
            const refreshed = await tokenManager.refreshAccessToken();
            if (!refreshed) {
                throw new Error("Token refresh failed");
            }

            const newToken = await tokenManager.getAccessToken();
            if (!newToken) {
                throw new Error("No auth accessToken after refresh");
            }

            console.log(`${AUTH_DEBUG_PREFIX} Refresh token succeeded via authService`, {
                accessToken: maskToken(newToken),
            });
            return newToken;
        } catch (error: any) {
            console.error(`${AUTH_DEBUG_PREFIX} Refresh token failed via authService`, error?.message || error);
            throw new Error(error.message || "Token refresh failed");
        }
    },
};

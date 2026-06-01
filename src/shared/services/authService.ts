import { api } from "./api";
import { authStorage } from "../runtime/storage";
import { getApiBaseUrl } from "../runtime/config";
import { getDeviceHeaders } from "./sessionService";
import type { AuthResponse, User } from "@/types";

const readAccessToken = (payload: any): string => {
    return payload?.accessToken || payload?.token || "";
};

const readUserProfile = (payload: any): User | null => {
    return payload?.user || payload?.profile || null;
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
                skipAuth: true,
                skipRefresh: true,
            });
            return response;
        } catch (error: any) {
            throw new Error(error.message || "Registration failed");
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
            };
            let authData = await api.post("/auth/login", loginPayload, {
                headers: await getDeviceHeaders(),
                skipAuth: true,
                skipRefresh: true,
            });

            if (authData?.data && !authData?.token && !authData?.accessToken) {
                authData = authData.data;
            }

            const accessToken = readAccessToken(authData);

            if (accessToken) {                await authStorage.setItem("token", accessToken);
                if (authData.refreshToken) {
                    await authStorage.setItem("refreshToken", authData.refreshToken);
                }
            } else {
                console.warn("[AUTH] No token in login response:", authData);
            }

            const userProfile = readUserProfile(authData);
            if (userProfile) {
                await authStorage.setItem("user", JSON.stringify(userProfile));
            }

            return authData;
        } catch (error: any) {
            throw new Error(error.message || "Login failed");
        }
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

                if (!response.ok)
                    throw new Error(`Profile fetch failed: ${response.status}`);

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
            throw new Error("Failed to fetch profile");
        }
    },

    saveToken: async (token: string): Promise<void> => {
        await authStorage.setItem("token", token);
    },

    getToken: async (): Promise<string | null> => {
        return await authStorage.getItem("token");
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
            if (refreshToken) {
                await api.post("/auth/logout", { refreshToken });
            }
        } catch (error: any) {
            console.error("Logout failed:", error);
        } finally {
            await authStorage.removeItem("token");
            await authStorage.removeItem("refreshToken");
            await authStorage.removeItem("user");
        }
    },

    forgotPassword: async (payload: any): Promise<any> => {
        const responseData = await api.post("/auth/forgot-password", payload, {
            skipAuth: true,
            skipRefresh: true,
        });
        return responseData;
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
            const refreshToken = await authStorage.getItem("refreshToken");
            if (!refreshToken) {
                throw new Error("No refresh token available");
            }

            const response = await api.post("/auth/refresh", { refreshToken }, {
                skipAuth: true,
                skipRefresh: true,
            });
            const payload = response?.data || response;
            const newToken = payload?.accessToken || payload?.token;

            if (newToken) {
                await authStorage.setItem("token", newToken);
                if (payload?.refreshToken) {
                    await authStorage.setItem("refreshToken", payload.refreshToken);
                }
                return newToken;
            }

            throw new Error("No token in refresh response");
        } catch (error: any) {
            throw new Error(error.message || "Token refresh failed");
        }
    },
};

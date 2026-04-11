import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";
import type { ApiCallOptions } from "@/types";

const buildUrl = (endpoint: string): string => {
    const normalizedEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;
    return `${getApiBaseUrl()}${normalizedEndpoint}`;
};

const getAuthToken = async (): Promise<string | null> => {
    let token = await authStorage.getItem("token");
    if (token) {
        token = String(token).trim();
    }
    console.log(
        "[API] Token retrieved:",
        token ? "✅ exists (" + token.substring(0, 20) + "...)" : "❌ missing"
    );
    return token;
};

// ========== Auto-Refresh Token Logic ==========
let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

const getRefreshToken = async (): Promise<string | null> => {
    return await authStorage.getItem("refreshToken");
};

const setTokens = async (accessToken: string, refreshToken?: string): Promise<void> => {
    await authStorage.setItem("token", accessToken);
    if (refreshToken) {
        await authStorage.setItem("refreshToken", refreshToken);
    }
    console.log("[API] Tokens updated and saved");
};

const clearTokens = async (): Promise<void> => {
    await authStorage.removeItem("token");
    await authStorage.removeItem("refreshToken");
    await authStorage.removeItem("user");
    console.log("[API] Tokens cleared (logout)");
};

const refreshAccessToken = async (): Promise<boolean> => {
    try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
            console.error("[API] No refresh token available");
            await clearTokens();
            return false;
        }

        console.log("[API] Attempting to refresh access token...");

        // Call refresh endpoint WITHOUT auth header to avoid infinite loop
        const baseUrl = getApiBaseUrl();
        const response = await fetch(buildUrl("/auth/refresh"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
            const result = await response.json();
            const newAccessToken = result.data?.accessToken || result.accessToken;
            const newRefreshToken = result.data?.refreshToken || result.refreshToken;

            if (newAccessToken) {
                await setTokens(newAccessToken, newRefreshToken);
                console.log("[API] ✅ Access token refreshed successfully");
                return true;
            } else {
                console.error("[API] No token in refresh response:", result);
                return false;
            }
        } else {
            console.error("[API] Token refresh failed:", response.status);
            // 401 on refresh token endpoint = refresh token is expired
            await clearTokens();
            return false;
        }
    } catch (error: any) {
        console.error("[API] Token refresh error:", error);
        await clearTokens();
        return false;
    }
};

export const apiCall = async (
    endpoint: string,
    options: ApiCallOptions = {}
): Promise<any> => {
    const url = buildUrl(endpoint);
    let token = await getAuthToken();

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        };

        console.log(`[API] ${options.method || "GET"} ${endpoint}`, {
            hasToken: !!token,
            authHeader: headers.Authorization ? "set" : "missing",
        });

        let response = await fetch(url, {
            headers,
            ...options,
        });

        // Handle 401 - try to refresh token and retry
        if (response.status === 401) {
            console.warn(`[API] Got 401 on ${options.method || "GET"} ${endpoint}`);

            // If already refreshing, queue this request
            if (isRefreshing) {
                console.log("[API] Token refresh in progress, queuing request...");
                return new Promise((resolve, reject) => {
                    refreshQueue.push(async () => {
                        try {
                            const result = await apiCall(endpoint, options);
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            }

            // Start refresh process
            isRefreshing = true;
            console.log("[API] Starting token refresh...");

            const refreshed = await refreshAccessToken();

            // Process queued requests
            isRefreshing = false;
            const queue = refreshQueue;
            refreshQueue = [];
            console.log(`[API] Processing ${queue.length} queued requests`);
            queue.forEach((callback) => callback());

            if (refreshed) {
                // Retry with new token
                console.log("[API] Retrying request with new token...");
                token = await getAuthToken();
                const newHeaders: Record<string, string> = {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(options.headers || {}),
                };

                response = await fetch(url, {
                    headers: newHeaders,
                    ...options,
                });
            } else {
                console.error("[API] Token refresh failed, user needs to login again");
                throw new Error("Session expired. Please login again.");
            }
        }

        if (!response.ok) {
            const errorMsg = `API error: ${response.status} ${response.statusText}`;
            console.error(`[API] ${errorMsg} on ${options.method || "GET"} ${endpoint}`);
            throw new Error(errorMsg);
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    } catch (error: any) {
        console.error(`[API] Call failed for ${options.method || "GET"} ${endpoint}:`, error.message);
        throw error;
    }
};

export const api = {
    get: async (endpoint: string, config: any = {}) => {
        const { params, ...restConfig } = config;
        const queryString = params
            ? `?${new URLSearchParams(params).toString()}`
            : "";

        return apiCall(`${endpoint}${queryString}`, {
            method: "GET",
            ...restConfig,
        });
    },

    post: async (endpoint: string, data: any = null, config: any = {}) => {
        return apiCall(endpoint, {
            method: "POST",
            body: data ? JSON.stringify(data) : undefined,
            ...config,
        });
    },

    patch: async (endpoint: string, data: any = null, config: any = {}) => {
        return apiCall(endpoint, {
            method: "PATCH",
            body: data ? JSON.stringify(data) : undefined,
            ...config,
        });
    },

    delete: async (endpoint: string, config: any = {}) => {
        return apiCall(endpoint, {
            method: "DELETE",
            ...config,
        });
    },
};

// Export token management functions for use in auth flow
export const tokenManager = {
    setTokens,
    clearTokens,
    getAccessToken: getAuthToken,
    getRefreshToken,
};

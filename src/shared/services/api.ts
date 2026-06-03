import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";
import { DeviceEventEmitter } from "react-native";
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
    }};

const clearTokens = async (): Promise<void> => {
    await authStorage.removeItem("token");
    await authStorage.removeItem("refreshToken");
    await authStorage.removeItem("user");    DeviceEventEmitter.emit("forceLogout");
};

const refreshAccessToken = async (): Promise<boolean> => {
    try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
            console.error("[API] No refresh token available");
            await clearTokens();
            return false;
        }
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
                await setTokens(newAccessToken, newRefreshToken);                return true;
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
    const { suppressErrorLog, skipAuth, skipRefresh, headers: optionHeaders, ...fetchOptions } = options as ApiCallOptions & {
        suppressErrorLog?: boolean;
        skipAuth?: boolean;
        skipRefresh?: boolean;
        headers?: Record<string, string>;
    };
    let token = skipAuth ? null : await getAuthToken();

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(optionHeaders || {}),
        };

        let response = await fetch(url, {
            headers,
            ...fetchOptions,
        });

        // Handle 401 - try to refresh token and retry
        if (response.status === 401 && !skipRefresh) {
            console.warn(`[API] Got 401 on ${options.method || "GET"} ${endpoint}`);

            // If already refreshing, queue this request
            if (isRefreshing) {                return new Promise((resolve, reject) => {
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
            const refreshed = await refreshAccessToken();

            // Process queued requests
            isRefreshing = false;
            const queue = refreshQueue;
            refreshQueue = [];            queue.forEach((callback) => callback());

            if (refreshed) {                token = skipAuth ? null : await getAuthToken();
                const newHeaders: Record<string, string> = {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(optionHeaders || {}),
                };

                response = await fetch(url, {
                    headers: newHeaders,
                    ...fetchOptions,
                });
            } else {
                console.error("[API] Token refresh failed, user needs to login again");
                throw new Error("Session expired. Please login again.");
            }
        }

        if (!response.ok) {
            let errorDetails = "";
            let parsedError: any = null;
            try {
                const bodyText = await response.text();
                try {
                    parsedError = JSON.parse(bodyText);
                    errorDetails = JSON.stringify(parsedError, null, 2);
                } catch {
                    errorDetails = bodyText;
                }
            } catch {
                errorDetails = "Unable to read response body";
            }
            const errorMsg = `API error: ${response.status} ${response.statusText}`;
            if (!suppressErrorLog) {
                console.error(`[API] ${errorMsg} on ${options.method || "GET"} ${endpoint}`);
                console.error(`[API] Response body:`, errorDetails);
            }
            const apiError: any = new Error(parsedError?.msg || parsedError?.message || errorMsg);
            apiError.status = response.status;
            apiError.code = parsedError?.code;
            apiError.details = parsedError?.details;
            apiError.responseBody = parsedError;
            throw apiError;
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    } catch (error: any) {
        if (!suppressErrorLog) {
            console.error(`[API] Call failed for ${options.method || "GET"} ${endpoint}:`, error.message);
        }
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

    put: async (endpoint: string, data: any = null, config: any = {}) => {
        return apiCall(endpoint, {
            method: "PUT",
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
    refreshAccessToken,
};

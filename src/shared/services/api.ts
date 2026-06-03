import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";
import { DeviceEventEmitter } from "react-native";
import { getDeviceHeaders } from "./deviceInfo";
import type { ApiCallOptions } from "@/types";

const buildUrl = (endpoint: string): string => {
    const normalizedEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;
    return `${getApiBaseUrl()}${normalizedEndpoint}`;
};

const AUTH_DEBUG_PREFIX = "[AUTH_DEBUG]";

const maskToken = (token?: string | null): string => {
    if (!token) {
        return "missing";
    }

    return `${token.slice(0, 8)}...${token.slice(-6)}`;
};

const readAccessTokenFromPayload = (payload: any): string => {
    const data = payload?.data || payload;
    return data?.accessToken || data?.access_token || "";
};

const readRefreshTokenFromPayload = (payload: any): string | undefined => {
    const data = payload?.data || payload;
    return data?.refreshToken || data?.refresh_token;
};

const readResponseBody = async (response: Response): Promise<any> => {
    try {
        const bodyText = await response.text();
        if (!bodyText) {
            return null;
        }

        try {
            return JSON.parse(bodyText);
        } catch {
            return bodyText;
        }
    } catch {
        return null;
    }
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
let refreshQueue: Array<(refreshed: boolean) => void> = [];
let refreshPromise: Promise<boolean> | null = null;

const getRefreshToken = async (): Promise<string | null> => {
    return await authStorage.getItem("refreshToken");
};

const setTokens = async (accessToken: string, refreshToken?: string): Promise<void> => {
    await authStorage.setItem("token", accessToken);
    if (refreshToken) {
        await authStorage.setItem("refreshToken", refreshToken);
    }
    console.log(`${AUTH_DEBUG_PREFIX} Stored refreshed access token`, {
        accessToken: maskToken(accessToken),
        hasRefreshToken: !!refreshToken,
    });
};

/**
 * Soft clear: remove tokens from storage but do NOT force logout.
 * Used for transient / network errors where the session might still be recoverable.
 */
const softClearTokens = async (): Promise<void> => {
    console.log(`${AUTH_DEBUG_PREFIX} Soft-clearing auth tokens (no logout)`);
    await authStorage.removeItem("token");
    await authStorage.removeItem("refreshToken");
    await authStorage.removeItem("user");
};

const clearTokensAndNotifySessionExpired = async (): Promise<void> => {
    await softClearTokens();
    DeviceEventEmitter.emit("forceLogout", { reason: "session_expired" });
};

/**
 * Hard clear: remove tokens AND emit forceLogout.
 * Only used when the server explicitly confirms the refresh token is revoked (401/403).
 */
const hardClearTokensAndLogout = async (): Promise<void> => {
    console.log(`${AUTH_DEBUG_PREFIX} Hard-clearing auth tokens and forcing logout`);
    await authStorage.removeItem("token");
    await authStorage.removeItem("refreshToken");
    await authStorage.removeItem("user");
    DeviceEventEmitter.emit("forceLogout");
};

const executeRefreshAccessToken = async (): Promise<boolean> => {
    try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
            console.error(`${AUTH_DEBUG_PREFIX} Refresh failed: no refresh token available`);
            // No refresh token at all — likely already logged out or never stored.
            await clearTokensAndNotifySessionExpired();
            return false;
        }
        // Call refresh endpoint WITHOUT auth header to avoid infinite loop
        console.log(`${AUTH_DEBUG_PREFIX} Attempting token refresh`, {
            refreshToken: maskToken(refreshToken),
        });
        const response = await fetch(buildUrl("/auth/refresh"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
            const result = await readResponseBody(response);
            const newAccessToken = readAccessTokenFromPayload(result);
            const newRefreshToken = readRefreshTokenFromPayload(result);

            if (newAccessToken) {
                await setTokens(newAccessToken, newRefreshToken);
                console.log(`${AUTH_DEBUG_PREFIX} Token refresh succeeded`, {
                    accessToken: maskToken(newAccessToken),
                    rotatedRefreshToken: !!newRefreshToken,
                });
                return true;
            }

            console.error(`${AUTH_DEBUG_PREFIX} Refresh failed: no auth accessToken in response`);
            return false;
        }

        const errorBody = await readResponseBody(response);
        console.error(`${AUTH_DEBUG_PREFIX} Token refresh HTTP failure`, {
            status: response.status,
            code: errorBody?.code,
            message: errorBody?.message || errorBody?.msg || (typeof errorBody === "string" ? errorBody : undefined),
        });

        if (response.status === 401 || response.status === 403) {
            // Server explicitly rejected the refresh token → session is truly dead.
            await hardClearTokensAndLogout();
        }
        // For other HTTP errors (5xx, etc.), do NOT clear tokens — transient failure.
        return false;
    } catch (error: any) {
        // Network errors (no internet, timeout, DNS failure, etc.)
        // Do NOT clear tokens or forceLogout — the session may still be valid.
        console.error(`${AUTH_DEBUG_PREFIX} Token refresh network/error failure`, error?.message || error);
        return false;
    }
};

const refreshAccessToken = async (): Promise<boolean> => {
    if (refreshPromise) {
        console.log(`${AUTH_DEBUG_PREFIX} Waiting for in-flight token refresh`);
        return refreshPromise;
    }

    refreshPromise = executeRefreshAccessToken();
    try {
        return await refreshPromise;
    } finally {
        refreshPromise = null;
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
        if (!skipAuth) {
            console.log(`${AUTH_DEBUG_PREFIX} Protected request`, {
                method: options.method || "GET",
                endpoint,
                token: maskToken(token),
            });
        }

        const deviceHeaders = await getDeviceHeaders();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...deviceHeaders,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(optionHeaders || {}),
        };

        let response = await fetch(url, {
            headers,
            ...fetchOptions,
        });
        const responseDeviceId = response.headers.get("x-device-id");
        if (responseDeviceId) {
            await authStorage.setItem("deviceId", responseDeviceId);
        }

        // Handle 401 - try to refresh token and retry
        if (response.status === 401 && !skipRefresh) {
            console.warn(`${AUTH_DEBUG_PREFIX} Got 401`, {
                method: options.method || "GET",
                endpoint,
                token: maskToken(token),
            });

            // If already refreshing, queue this request
            if (isRefreshing) {
                console.log(`${AUTH_DEBUG_PREFIX} Queueing request during token refresh`, {
                    method: options.method || "GET",
                    endpoint,
                });
                return new Promise((resolve, reject) => {
                    refreshQueue.push(async (refreshed) => {
                        if (!refreshed) {
                            reject(new Error("Session expired. Please login again."));
                            return;
                        }

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
            refreshQueue = [];
            queue.forEach((callback) => callback(refreshed));

            if (refreshed) {
                token = skipAuth ? null : await getAuthToken();
                const newHeaders: Record<string, string> = {
                    "Content-Type": "application/json",
                    ...deviceHeaders,
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(optionHeaders || {}),
                };

                response = await fetch(url, {
                    headers: newHeaders,
                    ...fetchOptions,
                });
                const retryDeviceId = response.headers.get("x-device-id");
                if (retryDeviceId) {
                    await authStorage.setItem("deviceId", retryDeviceId);
                }
            } else {
                console.error(`${AUTH_DEBUG_PREFIX} Token refresh failed; protected request cannot be retried`, {
                    method: options.method || "GET",
                    endpoint,
                });
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
    clearTokens: softClearTokens,
    hardClearTokensAndLogout,
    getAccessToken: getAuthToken,
    getRefreshToken,
    refreshAccessToken,
};

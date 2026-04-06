import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";

const buildUrl = (endpoint) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${getApiBaseUrl()}${normalizedEndpoint}`;
};

const getAuthToken = async () => {
  let token = await authStorage.getItem("token");
  // Clean token: remove whitespace and ensure it's a string
  if (token) {
    token = String(token).trim();
  }
  console.log("[API] Token retrieved:", token ? "✅ exists (" + token.substring(0, 20) + "...)" : "❌ missing");
  return token;
};

export const apiCall = async (endpoint, options = {}) => {
  const url = buildUrl(endpoint);
  const token = await getAuthToken();

  try {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    console.log(`[API] ${options.method || "GET"} ${endpoint}`, {
      hasToken: !!token,
      authHeader: headers.Authorization ? "set" : "missing",
    });

    const response = await fetch(url, {
      headers,
      cache: "no-store",
      ...options,
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error(`[API] 401 Unauthorized on ${options.method || "GET"} ${endpoint}`, {
          hasAuthHeader: !!headers.Authorization,
          authHeaderValue: headers.Authorization ? "Bearer <token>" : "MISSING",
        });
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    // Only log non-401 errors to avoid spam on startup
    if (!error.message?.includes("401")) {
      console.error("API call failed:", error);
    }
    throw error;
  }
};

export const api = {
  get: async (endpoint, config = {}) => {
    const { params, ...restConfig } = config;
    const queryString = params ? `?${new URLSearchParams(params).toString()}` : "";

    return apiCall(`${endpoint}${queryString}`, {
      method: "GET",
      ...restConfig,
    });
  },

  post: async (endpoint, data = null, config = {}) => {
    return apiCall(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
      ...config,
    });
  },

  patch: async (endpoint, data = null, config = {}) => {
    return apiCall(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
      ...config,
    });
  },

  delete: async (endpoint, config = {}) => {
    return apiCall(endpoint, {
      method: "DELETE",
      ...config,
    });
  },
};

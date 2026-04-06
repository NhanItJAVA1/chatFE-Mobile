import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";

const buildUrl = (endpoint) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${getApiBaseUrl()}${normalizedEndpoint}`;
};

const getAuthToken = async () => {
  return await authStorage.getItem("token");
};

export const apiCall = async (endpoint, options = {}) => {
  const url = buildUrl(endpoint);
  const token = await getAuthToken();

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      cache: "no-store",
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("API call failed:", error);
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

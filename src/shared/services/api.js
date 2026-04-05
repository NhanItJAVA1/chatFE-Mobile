// API service
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/v1";

const getAuthToken = () => {
  return localStorage.getItem("token");
};

export const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      cache: "no-store",
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
};

// API client with get/post methods similar to axios
export const api = {
  get: async (endpoint, config = {}) => {
    const { params, ...restConfig } = config;
    const queryString = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiCall(endpoint + queryString, {
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

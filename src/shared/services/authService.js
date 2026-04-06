import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";

const buildUrl = (endpoint) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${getApiBaseUrl()}${normalizedEndpoint}`;
};

const readErrorMessage = async (response, fallbackMessage) => {
  try {
    const error = await response.json();
    return error?.message || error?.msg || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

export const authService = {
  register: async (userData) => {
    const response = await fetch(buildUrl("/auth/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Registration failed"));
    }

    return await response.json();
  },

  login: async (phone, password) => {
    const response = await fetch(buildUrl("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, password }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Login failed"));
    }

    return await response.json();
  },

  getProfile: async (token) => {
    const resolvedToken = token || (await authStorage.getItem("token"));

    const response = await fetch(buildUrl("/profile"), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to fetch profile"));
    }

    return await response.json();
  },

  saveToken: async (token) => {
    await authStorage.setItem("token", token);
  },

  getToken: async () => {
    return await authStorage.getItem("token");
  },

  saveUser: async (user) => {
    await authStorage.setItem("user", JSON.stringify(user));
  },

  getUser: async () => {
    const user = await authStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },

  logout: async () => {
    await authStorage.removeItem("token");
    await authStorage.removeItem("user");
  },
};

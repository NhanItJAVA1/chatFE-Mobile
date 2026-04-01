const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/v1";

export const authService = {
  // Register new user
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Registration failed");
    }

    return await response.json();
  },

  // Login user
  login: async (phone, password) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }

    const data = await response.json();
    return data; // { status, msg, data: { token, ... } }
  },

  // Get user profile
  getProfile: async (token) => {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch profile");
    }

    const data = await response.json();
    return data; // { status, msg, data: { user data } }
  },

  // Logout
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  // Save token
  saveToken: (token) => {
    localStorage.setItem("token", token);
  },

  // Get token
  getToken: () => {
    return localStorage.getItem("token");
  },

  // Save user
  saveUser: (user) => {
    localStorage.setItem("user", JSON.stringify(user));
  },

  // Get user
  getUser: () => {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem("token");
  },
};

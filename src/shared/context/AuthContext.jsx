import React, { createContext, useState, useEffect } from "react";
import { authService } from "../services/authService";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth from localStorage
  useEffect(() => {
    const savedToken = authService.getToken();
    const savedUser = authService.getUser();

    if (savedToken) {
      setToken(savedToken);

      // Fetch latest profile from server
      authService
        .getProfile(savedToken)
        .then((response) => {
          const profile = response; // axios interceptor already extracts data
          setUser(profile);
          authService.saveUser(profile);
        })
        .catch(() => {
          // If profile fetch fails, use saved user
          setUser(savedUser);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  // Register
  const register = async (userData) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authService.register(userData);
      return response;
    } catch (err) {
      const errorMessage = err.message || "Registration failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Login
  const login = async (phone, password) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authService.login({ phone, password });
      // axios interceptor already returns the data, not wrapped in .data
      const data = response || {};

      authService.saveToken(data.token || data.accessToken);
      setToken(data.token || data.accessToken);

      // Fetch full profile from /profile endpoint
      const profileResponse = await authService.getProfile(data.token || data.accessToken);
      const profile = profileResponse; // axios interceptor already extracts data

      authService.saveUser(profile);
      setUser(profile);

      return profile;
    } catch (err) {
      const errorMessage = err.message || "Login failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = () => {
    authService.logout();
    setUser(null);
    setToken(null);
    setError(null);
  };

  // Get profile
  const getProfile = async () => {
    try {
      if (!token) throw new Error("No token available");
      const response = await authService.getProfile(token);
      const profile = response; // axios interceptor already extracts data
      setUser(profile);
      authService.saveUser(profile);
      return profile;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    getProfile,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

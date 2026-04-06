import React, { createContext, useEffect, useState } from "react";
import { authService } from "../services/authService";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      const savedToken = authService.getToken();
      const savedUser = authService.getUser();

      if (!isActive) {
        return;
      }

      if (savedToken) {
        setToken(savedToken);

        try {
          const profileResponse = await authService.getProfile(savedToken);
          const profile = profileResponse;

          if (!isActive) {
            return;
          }

          setUser(profile);
          authService.saveUser(profile);
        } catch (err) {
          if (!isActive) {
            return;
          }

          // If profile fetch fails, use saved user
          if (savedUser) {
            setUser(savedUser);
          }
        }
      } else if (savedUser) {
        setUser(savedUser);
      }

      if (isActive) {
        setLoading(false);
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  const register = async (userData) => {
    try {
      setError(null);
      setLoading(true);
      return await authService.register(userData);
    } catch (err) {
      const errorMessage = err.message || "Registration failed";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

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

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setToken(null);
      setError(null);
    }
  };

  const getProfile = async () => {
    try {
      if (!token) {
        throw new Error("No token available");
      }

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

  // Update user profile locally (called after API update)
  const updateUserProfile = (updatedData) => {
    const newUser = { ...user, ...updatedData };
    setUser(newUser);
    authService.saveUser(newUser);
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
    updateUserProfile,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

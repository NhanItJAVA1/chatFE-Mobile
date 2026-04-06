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
      const savedToken = await authService.getToken();
      const savedUser = await authService.getUser();

      if (!isActive) {
        return;
      }

      if (savedToken) {
        setToken(savedToken);

        try {
          const profileResponse = await authService.getProfile(savedToken);
          const profile = profileResponse.data;

          if (!isActive) {
            return;
          }

          setUser(profile);
          await authService.saveUser(profile);
        } catch {
          if (!isActive) {
            return;
          }

          setUser(savedUser);
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
      const response = await authService.login(phone, password);
      const data = response.data;

      await authService.saveToken(data.token);
      setToken(data.token);

      const profileResponse = await authService.getProfile(data.token);
      const profile = profileResponse.data;

      await authService.saveUser(profile);
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
    await authService.logout();
    setUser(null);
    setToken(null);
    setError(null);
  };

  const getProfile = async () => {
    try {
      if (!token) {
        throw new Error("No token available");
      }

      const response = await authService.getProfile(token);
      const profile = response.data;
      setUser(profile);
      await authService.saveUser(profile);
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

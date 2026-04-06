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

      if (!isActive) return;

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
      const data = response || {};

      const accessToken = data.token || data.accessToken;

      // Save token
      if (accessToken) {
        // Ensure token is properly saved
        await authService.saveToken(accessToken);

      authService.saveUser(profile);
      setUser(profile);

      // Check if login response already contains user profile
      let userProfile = data.user || data.profile || null;

      // If profile not in login response, construct from available response data
      if (!userProfile) {
        // Use data from backend response, fallback to phone
        userProfile = {
          phone: data.phone || phone,
          displayName: data.displayName || "",
          email: data.email || "",
          bio: data.bio || "",
          id: data.id,
        };
      } else {
        // Ensure critical fields exist in backend response
        userProfile = {
          id: userProfile.id,
          phone: userProfile.phone || phone,
          displayName: userProfile.displayName || "",
          email: userProfile.email || "",
          bio: userProfile.bio || "",
        };
      }

      // Save user
      await authService.saveUser(userProfile);
      setUser(userProfile);

      return userProfile;
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

  const updateProfile = async (profileData) => {
    try {
      setLoading(true);

      // Verify token exists before API call
      const currentToken = await authService.getToken();
      if (!currentToken) {
        console.warn("[AuthContext] No token available, restoring session...");
        const savedToken = await authService.getToken();
        const savedUser = await authService.getUser();
        if (savedToken) {
          setToken(savedToken);
          setUser(savedUser || null);
        } else {
          throw new Error("Not authenticated - please login again");
        }
      }

      const response = await authService.getProfile(token);
      const profile = response; // axios interceptor already extracts data
      setUser(profile);
      authService.saveUser(profile);
      return profile;
    } catch (err) {
      const errorMessage = err.message || "Update failed";
      setError(errorMessage);
      console.error("[AuthContext] updateProfile error:", err);
      throw err;
    } finally {
      setLoading(false);
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
    updateProfile,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

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

      console.log("[AuthContext] RestoreSession - savedUser:", JSON.stringify(savedUser, null, 2));

      if (!isActive) return;

      if (savedToken) {
        setToken(savedToken);
        setUser(savedUser || null);
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
      console.log("[AuthContext] Login response:", JSON.stringify(response, null, 2));
      
      const data = response || {};

      const accessToken = data.token || data.accessToken;

      // Save token
      if (accessToken) {
        // Ensure token is properly saved
        await authService.saveToken(accessToken);

        // Verify it was saved
        const savedToken = await authService.getToken();
        if (!savedToken) {
          throw new Error("Failed to save authentication token");
        }
        console.log("[AuthContext] Login: token saved and verified ✅");
        setToken(accessToken);
      } else {
        console.warn("[AuthContext] Login: no token in response", data);
      }

      // Check if login response already contains user profile
      let userProfile = data.user || data.profile || null;
      console.log("[AuthContext] User profile from response:", JSON.stringify(userProfile, null, 2));

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
    await authService.logout();
    setUser(null);
    setToken(null);
    setError(null);
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

      // Call authService.updateProfile (handles offline-first + optional backend sync)
      const updatedUser = await authService.updateProfile(profileData);

      // Update state with the locally saved data
      setUser(updatedUser);
      console.log("[AuthContext] Profile updated successfully (may be syncing to backend)");
      return updatedUser;
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

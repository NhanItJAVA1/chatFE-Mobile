import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";

export const LoginPage = () => {
  const navigate = useNavigate();
  const [showLoginForm, setShowLoginForm] = useState(true);

  const handleLoginSuccess = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          Chat App
        </h1>
        <p className="text-gray-600 text-center mb-8">Login to your account</p>

        <LoginForm onSuccess={handleLoginSuccess} />

        <div className="text-right mt-3">
          <Link
            to="/forgot-password"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Forgot password?
          </Link>
        </div>

        <p className="text-center text-gray-600 mt-6">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 hover:underline font-medium"
          >
            Register now
          </Link>
        </p>
      </div>
    </div>
  );
};

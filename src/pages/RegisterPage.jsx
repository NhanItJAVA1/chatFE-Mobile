import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { RegisterForm } from "../components/auth/RegisterForm";

export const RegisterPage = () => {
  const navigate = useNavigate();

  const handleRegisterSuccess = () => {
    navigate("/login", {
      state: { message: "Registration successful! Please login." },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">Chat App</h1>
        <p className="text-gray-600 text-center mb-8">Create a new account</p>

        <RegisterForm onSuccess={handleRegisterSuccess} />

        <p className="text-center text-gray-600 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
};

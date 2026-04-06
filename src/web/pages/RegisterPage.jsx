import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { RegisterForm } from "../components/auth/RegisterForm";

export const RegisterPage = () => {
  const navigate = useNavigate();

  const handleRegisterSuccess = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center px-4 py-6 sm:py-8">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md sm:max-w-lg lg:max-w-xl p-5 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 text-center mb-2">
          Create your account
        </h1>
        <p className="text-sm sm:text-base text-gray-600 text-center mb-6 sm:mb-8">
          Join Chat App and start connecting with your friends.
        </p>

        <RegisterForm onSuccess={handleRegisterSuccess} />

        <p className="text-center text-sm sm:text-base text-gray-600 mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-blue-600 hover:underline font-medium"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
};

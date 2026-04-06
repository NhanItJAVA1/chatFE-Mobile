import React from "react";
import { Link } from "react-router-dom";
import { ForgotPasswordForm } from "../components/auth/ForgotPasswordForm";

export const ForgotPasswordPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center px-4 py-6 sm:py-8">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md sm:max-w-lg p-5 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 text-center mb-2">
          Forgot password?
        </h1>
        <p className="text-sm sm:text-base text-gray-600 text-center mb-6 sm:mb-8">
          Nhập số điện thoại hoặc email để nhận hướng dẫn đặt lại mật khẩu.
        </p>

        <ForgotPasswordForm />

        <p className="text-center text-sm sm:text-base text-gray-600 mt-6">
          Remember your password?{" "}
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

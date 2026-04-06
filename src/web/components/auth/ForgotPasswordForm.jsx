import React, { useState } from "react";
import { authService } from "../../../shared/services";

const getErrorMessage = (error) => {
  if (!error) return "Request failed";
  if (error.message) return error.message;
  if (error.msg) return error.msg;
  if (error.response?.data?.msg) return error.response.data.msg;
  return "Request failed";
};

export const ForgotPasswordForm = ({ onSuccess }) => {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const validate = () => {
    if (!identifier.trim()) {
      setError("Vui lòng nhập số điện thoại hoặc email.");
      return false;
    }

    return true;
  };

  const buildPayload = (value) => {
    const trimmed = value.trim();
    if (trimmed.includes("@")) {
      return { email: trimmed };
    }
    return { phone: trimmed };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!validate()) return;

    setLoading(true);
    try {
      const payload = buildPayload(identifier);
      await authService.forgotPassword(payload);

      const message = "Yêu cầu đã được gửi. Vui lòng kiểm tra email/SMS để tiếp tục đặt lại mật khẩu.";
      setSuccessMessage(message);
      onSuccess?.(message);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại hoặc Email</label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="VD: 0912345678 hoặc your@email.com"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {successMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition"
      >
        {loading ? "Đang gửi..." : "Gửi yêu cầu đặt lại mật khẩu"}
      </button>
    </form>
  );
};

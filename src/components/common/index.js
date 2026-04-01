// Common reusable components
// Examples and templates for button, modal, etc.

import React from "react";

export const Button = ({ children, variant = "primary", ...props }) => {
  const baseStyles = "px-4 py-2 rounded-lg font-semibold transition duration-200";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };

  return (
    <button className={`${baseStyles} ${variants[variant]}`} {...props}>
      {children}
    </button>
  );
};

export const Card = ({ children, className = "" }) => {
  return <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>{children}</div>;
};

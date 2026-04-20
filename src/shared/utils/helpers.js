// Utility functions
// Place your helper functions here

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const truncateText = (text, maxLength = 50) => {
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Generate default avatar URL from initials
 * Uses UI Avatars service: https://ui-avatars.com
 */
export const getDefaultAvatarUrl = (displayName = "User", userId = "") => {
  const name = displayName || "User";
  // Get first letter of each word, max 2 letters
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  // Generate consistent color from userId
  const colors = ["3B82F6", "8B5CF6", "EC4899", "F59E0B", "10B981", "06B6D4", "EF4444", "6366F1"];
  let hash = 0;
  for (let i = 0; i < (userId || "").length; i++) {
    hash = ((hash << 5) - hash) + (userId || "").charCodeAt(i);
  }
  const colorIndex = Math.abs(hash) % colors.length;
  const bgColor = colors[colorIndex];

  // Use UI Avatars service to generate avatar with initials
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    initials
  )}&background=${bgColor}&color=FFFFFF&bold=true&size=200&font-size=0.4`;
};

export const classNames = (...classes) => {
  return classes.filter(Boolean).join(" ");
};


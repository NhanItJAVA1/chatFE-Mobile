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

export const classNames = (...classes) => {
  return classes.filter(Boolean).join(" ");
};

const normalizeApiUrl = (url) => {
  if (!url || typeof url !== "string") {
    return url;
  }

  return url.trim().replace(/\/+$/, "");
};

const DEFAULT_API_BASE_URL =
  normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL) || "https://api.iamphuong.dev/v1";

let runtimeConfig = {
  apiUrl: DEFAULT_API_BASE_URL,
};

export const configureRuntime = (nextConfig = {}) => {
  runtimeConfig = {
    ...runtimeConfig,
    ...("apiUrl" in nextConfig
      ? { ...nextConfig, apiUrl: normalizeApiUrl(nextConfig.apiUrl) }
      : nextConfig),
  };
};

export const getApiBaseUrl = () => {
  return normalizeApiUrl(runtimeConfig.apiUrl) || DEFAULT_API_BASE_URL;
};

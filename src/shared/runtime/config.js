const DEFAULT_API_BASE_URL = "http://localhost:3000/v1";

let runtimeConfig = {
  apiUrl: DEFAULT_API_BASE_URL,
};

export const configureRuntime = (nextConfig = {}) => {
  runtimeConfig = {
    ...runtimeConfig,
    ...nextConfig,
  };
};

export const getApiBaseUrl = () => {
  return runtimeConfig.apiUrl || DEFAULT_API_BASE_URL;
};

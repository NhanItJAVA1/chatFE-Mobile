const DEFAULT_API_BASE_URL = "http://192.168.1.6:3000/v1";
//192.168.1.6

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

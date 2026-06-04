/**
 * Common type definitions
 * Shared utility types used across the application
 */

export type ApiCallOptions = {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    skipAuth?: boolean;
    skipRefresh?: boolean;
    [key: string]: any;
};

export type UseFetchResult<T> = {
    data: T | null;
    loading: boolean;
    error: string | null;
};

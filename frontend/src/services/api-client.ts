import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// API client - luôn dùng relative URL để tự động match protocol (HTTP/HTTPS)
// Build: 2026-01-29-v2
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh token queue to prevent concurrent refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: InternalAxiosRequestConfig) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve({ headers: { Authorization: `Bearer ${token}` } } as InternalAxiosRequestConfig);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Skip refresh for auth endpoints themselves
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/refresh') ||
                           originalRequest?.url?.includes('/auth/login') ||
                           originalRequest?.url?.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          const token = localStorage.getItem('token');
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        const { access_token, refresh_token: newRefreshToken } = response.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('refresh_token', newRefreshToken);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && isAuthEndpoint) {
      // Don't redirect for auth endpoints - let callers handle
    }

    return Promise.reject(error);
  }
);

export default apiClient;

/**
 * AURALIS API CLIENT — Silent Refresh Axios Instance
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const apiClient: AxiosInstance = axios.create({
  baseURL:         `${BASE_URL}/api/v1`,
  withCredentials: true,
  timeout:         15_000,
});

// Request interceptor — access token ekle
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('auralis_access_token')
        : null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
);

// Response interceptor — Silent Refresh
let isRefreshing = false;
let failedQueue:  Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: { config: InternalAxiosRequestConfig & { _retry?: boolean }; response?: { status: number } }) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      });
    }

    original._retry = true;
    isRefreshing    = true;

    try {
      const refreshToken = localStorage.getItem('auralis_refresh_token');
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post<{
        accessToken:  string;
        refreshToken: string;
      }>(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });

      localStorage.setItem('auralis_access_token',  data.accessToken);
      localStorage.setItem('auralis_refresh_token', data.refreshToken);

      failedQueue.forEach(({ resolve }) => resolve(data.accessToken));
      failedQueue = [];

      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);
    } catch (refreshError) {
      failedQueue.forEach(({ reject }) => reject(refreshError));
      failedQueue = [];

      localStorage.removeItem('auralis_access_token');
      localStorage.removeItem('auralis_refresh_token');

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;

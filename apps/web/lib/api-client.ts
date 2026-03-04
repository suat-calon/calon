/**
 * AURALIS API CLIENT — HttpOnly Cookie Tabanlı Axios Instance
 *
 * Güvenlik (v2):
 *   • localStorage TOKEN YOKTUR — XSS saldırısına karşı kapalı
 *   • withCredentials: true — tarayıcı HttpOnly cookie'leri otomatik gönderir
 *   • TenantGuard, access token'ı auralis_access cookie'den okur
 *   • Silent refresh: 401'de /auth/refresh çağrılır → yeni cookie set edilir
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const apiClient: AxiosInstance = axios.create({
  baseURL:         `${BASE_URL}/api/v1`,
  withCredentials: true,   // Cookie otomatik gönderilir (HttpOnly erişim gerekmez)
  timeout:         15_000,
});

// ── Silent Refresh ──────────────────────────────────────────────────────────

let isRefreshing = false;
let failedQueue:  Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: {
    config: InternalAxiosRequestConfig & { _retry?: boolean };
    response?: { status: number };
  }) => {
    const original = error.config;

    // 401 değilse veya zaten retry yapıldıysa ilet
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // /auth/ endpoint'lerindeki 401 → sonsuz döngü önleme
    if (original.url?.includes('/auth/')) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Paralel istekler yenileme bitene kadar bekler
      return new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        return apiClient(original);
      });
    }

    original._retry = true;
    isRefreshing    = true;

    try {
      // auralis_refresh cookie'si withCredentials ile otomatik gönderilir
      // Body gerekmez — server cookie'den okur ve yeni cookie set eder
      await axios.post(
        `${BASE_URL}/api/v1/auth/refresh`,
        {},
        { withCredentials: true },
      );

      // Yenileme başarılı — bekleyen istekleri serbest bırak
      failedQueue.forEach(({ resolve }) => resolve());
      failedQueue = [];

      return apiClient(original);
    } catch (refreshError) {
      failedQueue.forEach(({ reject }) => reject(refreshError));
      failedQueue = [];

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

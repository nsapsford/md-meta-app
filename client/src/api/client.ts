import axios from 'axios';
import { getAuthToken } from '../auth/token';

const baseURL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV
    ? '/api'
    : (() => {
        throw new Error('VITE_API_URL must be set for production builds');
      })());

const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export class ApiError extends Error {
  /** HTTP status code, or null for network/timeout errors. */
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Preserve cancellation identity so callers' axios.isCancel(err) checks keep working.
    if (axios.isCancel(err)) return Promise.reject(err);
    const body = err.response?.data;
    const message =
      (typeof body === 'object' && body?.error) ||
      (typeof body === 'string' && body.length < 200 && body) ||
      err.message ||
      'Network error';
    return Promise.reject(new ApiError(message, err.response?.status ?? null));
  }
);

export default api;

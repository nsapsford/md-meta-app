import axios from 'axios';

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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const body = err.response?.data;
    const message =
      (typeof body === 'object' && body?.error) ||
      (typeof body === 'string' && body.length < 200 && body) ||
      err.message ||
      'Network error';
    return Promise.reject(new Error(message));
  }
);

export default api;

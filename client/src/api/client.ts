import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * 서버가 내려준 이미지 경로를 실제 로드 가능한 URL로 변환.
 * - S3 presigned URL 등 절대 URL이면 그대로 사용
 * - 로컬 저장 모드의 상대 경로(/uploads/...)면 API BASE_URL을 앞에 붙임
 *   (에뮬레이터 10.0.2.2 / 실기기 LAN IP 어디서든 동작)
 */
export const resolveMediaUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('access_token');
    }
    return Promise.reject(err);
  },
);

// Auth
export const authAPI = {
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  updateDeviceToken: (device_token: string, platform: string) =>
    api.put('/auth/device-token', { device_token, platform }),
};

// Pets
export const petAPI = {
  list: () => api.get('/pets'),
  create: (data: object) => api.post('/pets', data),
  get: (id: string) => api.get(`/pets/${id}`),
  update: (id: string, data: object) => api.put(`/pets/${id}`, data),
  delete: (id: string) => api.delete(`/pets/${id}`),
  uploadPhoto: (id: string, formData: FormData) =>
    api.post(`/pets/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Scans
export const scanAPI = {
  upload: (formData: FormData) =>
    api.post('/scans/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  history: (petId: string, limit = 20, offset = 0) =>
    api.get(`/scans/history/${petId}`, { params: { limit, offset } }),
  get: (scanId: string) => api.get(`/scans/${scanId}`),
};

export default api;

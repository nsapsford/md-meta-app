import api from './client';
import type { AuthSession, AuthUser, LoginPayload, RegisterPayload } from '../types/auth';

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const res = await api.post('/auth/login', payload);
  return res.data;
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  const res = await api.post('/auth/register', payload);
  return res.data;
}

export async function getMe(): Promise<AuthUser> {
  const res = await api.get('/auth/me');
  return res.data.user;
}

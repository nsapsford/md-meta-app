export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  created_at: number; // unix seconds
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  display_name?: string;
}

export type AuthStatus =
  | 'restoring'      // reading persisted session from device storage
  | 'authenticated'
  | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

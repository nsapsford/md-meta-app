import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { setAuthToken } from './token';
import { kvGet, kvRemove, kvSet } from '../storage/kvStore';
import type { AuthState, AuthUser, LoginPayload, RegisterPayload } from '../types/auth';

export interface AuthContextValue extends AuthState {
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'restoring', user: null });

  const applySession = useCallback(async (token: string, user: AuthUser) => {
    setAuthToken(token);
    setState({ status: 'authenticated', user });
    await kvSet('auth.session', { token, user });
  }, []);

  // Restore the persisted session on boot. The stored user renders
  // immediately (offline-first); /me revalidates silently in the background
  // and only logs out on an explicit 401 — network failures keep the
  // offline session alive.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await kvGet('auth.session');
      if (cancelled) return;
      if (!session) {
        setState({ status: 'anonymous', user: null });
        return;
      }
      setAuthToken(session.token);
      setState({ status: 'authenticated', user: session.user });
      try {
        const user = await authApi.getMe();
        if (!cancelled) await applySession(session.token, user);
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 401) {
          setAuthToken(null);
          await kvRemove('auth.session');
          setState({ status: 'anonymous', user: null });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [applySession]);

  const login = useCallback(async (payload: LoginPayload) => {
    const session = await authApi.login(payload);
    await applySession(session.token, session.user);
  }, [applySession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const session = await authApi.register(payload);
    await applySession(session.token, session.user);
  }, [applySession]);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setState({ status: 'anonymous', user: null });
    await kvRemove('auth.session');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

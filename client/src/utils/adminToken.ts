export const ADMIN_TOKEN_KEY = 'admin_token';

export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

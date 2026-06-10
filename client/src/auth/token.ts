// Module-level token holder so the axios client can attach the Bearer token
// without importing React context (which would create a circular dependency:
// AuthContext -> api/auth -> api/client -> AuthContext).
let currentToken: string | null = null;

export function getAuthToken(): string | null {
  return currentToken;
}

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

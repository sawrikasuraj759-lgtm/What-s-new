export const SESSION_TOKEN_KEY = 'yashi_session_token';

export function getStoredSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      localStorage.setItem(SESSION_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function withAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getStoredSessionToken();
  if (!token) {
    return { ...extra };
  }
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

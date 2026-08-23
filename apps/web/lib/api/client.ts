const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const SESSION_KEY = 'cotizaciones.session';

function getSessionToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return '';
    }

    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken || '';
  } catch {
    return '';
  }
}

function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}

async function readErrorMessage(response: Response) {
  const raw = await response.text();

  if (!raw) {
    return `Request failed: ${response.status}`;
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join(', ');
    }

    return parsed.message || raw;
  } catch {
    return raw;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);

    if (response.status === 401 && token && path !== '/auth/login') {
      clearStoredSession();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      throw new Error('La sesión expiró. Inicia sesión de nuevo.');
    }

    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string) {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(path: string) {
  return apiFetch<T>(path, {
    method: 'DELETE',
  });
}

export function apiDeleteWithBody<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, {
    method: 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  });
}

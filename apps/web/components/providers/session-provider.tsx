'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useCurrentUser, useLogin } from '@/lib/api/hooks';
import type { AuthUser } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STORAGE_KEY = 'cotizaciones.session';

type SessionState = {
  accessToken: string;
  user: AuthUser | null;
};

type SessionContextValue = {
  accessToken: string;
  user: AuthUser;
  ready: boolean;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredSession(): SessionState {
  if (typeof window === 'undefined') {
    return { accessToken: '', user: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { accessToken: '', user: null };
    }

    const parsed = JSON.parse(raw) as SessionState;
    return {
      accessToken: parsed.accessToken || '',
      user: parsed.user || null,
    };
  } catch {
    return { accessToken: '', user: null };
  }
}

function persistSession(next: SessionState) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!next.accessToken) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function LoginScreen() {
  const loginMutation = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit() {
    const response = await loginMutation.mutateAsync({
      email,
      password,
    });

    persistSession({
      accessToken: response.accessToken,
      user: response.user,
    });

    window.location.reload();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] p-6">
      <Card className="w-full max-w-[460px]">
        <CardHeader
          title="Acceso al sistema"
          description="Ingresa con tu correo y contraseña para continuar."
        />
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="flex items-center gap-5 rounded-[28px] bg-white/80 px-3 py-2">
              <div className="flex h-[158px] w-[108px] items-center justify-center overflow-hidden">
                <Image
                  src="/brand/logo.png"
                  alt="SIEZA"
                  width={94}
                  height={128}
                  className="h-[128px] w-[94px] object-contain"
                  priority
                />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-secondary)]">
                  SIEZA
                </p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-primary)]">
                  energy solutions
                </p>
                <p className="mt-3 text-sm font-medium text-[var(--color-text-muted)]">
                  Sistema comercial de cotizaciones
                </p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Mail</p>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Password</p>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {loginMutation.isError ? (
            <p className="text-sm text-[var(--color-danger)]">
              No fue posible iniciar sesión. Verifica correo y contraseña.
            </p>
          ) : null}
          <Button
            className="w-full"
            onClick={submit}
            disabled={loginMutation.isPending || !email.trim() || password.length < 8}
          >
            {loginMutation.isPending ? 'Ingresando...' : 'Entrar al sistema'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ accessToken: '', user: null });
  const [booted, setBooted] = useState(false);
  const meQuery = useCurrentUser(booted && Boolean(session.accessToken));
  const hasStoredSession = Boolean(session.accessToken && session.user);

  useEffect(() => {
    const stored = readStoredSession();
    setSession(stored);
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!meQuery.data || !session.accessToken) {
      return;
    }

    const next = {
      accessToken: session.accessToken,
      user: meQuery.data,
    };

    setSession(next);
    persistSession(next);
  }, [meQuery.data, session.accessToken]);

  useEffect(() => {
    if (!meQuery.isError || !session.accessToken) {
      return;
    }

    persistSession({ accessToken: '', user: null });
    setSession({ accessToken: '', user: null });
  }, [meQuery.isError, session.accessToken]);

  const value = useMemo<SessionContextValue | null>(
    () => ({
      accessToken: session.accessToken,
      user: session.user as AuthUser,
      ready:
        booted &&
        (!session.accessToken || hasStoredSession || meQuery.isSuccess || meQuery.isError),
      signOut: () => {
        persistSession({ accessToken: '', user: null });
        setSession({ accessToken: '', user: null });
      },
    }),
    [booted, hasStoredSession, meQuery.isError, meQuery.isSuccess, session],
  );

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="rounded-3xl border border-[var(--color-border)] bg-white px-6 py-5 text-sm text-[var(--color-text-muted)] shadow-sm">
          Cargando sesión...
        </div>
      </div>
    );
  }

  if (!session.accessToken || !session.user || !value) {
    return <LoginScreen />;
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return context;
}

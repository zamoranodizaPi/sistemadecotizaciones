'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleUserRound, Mail, Plus, Search, Shield } from 'lucide-react';
import { useCreateUser, useUsers } from '@/lib/api/hooks';
import { useSession } from '@/components/providers/session-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell, DataRow, DataTable } from '@/components/ui/table';
import { Toast } from '@/components/ui/toast';

export function UsersOverview() {
  const { user } = useSession();
  const usersQuery = useUsers(user.displayRole === 'ADMIN');
  const createUserMutation = useCreateUser();

  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<null | { title: string; description: string }>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');

  const users = usersQuery.data || [];
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((systemUser) =>
      [systemUser.name, systemUser.email, systemUser.displayRole]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, users]);

  const selectedUser =
    filteredUsers.find((systemUser) => systemUser.id === selectedUserId) ||
    users.find((systemUser) => systemUser.id === selectedUserId) ||
    filteredUsers[0] ||
    null;

  useEffect(() => {
    if (!filteredUsers.length) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !filteredUsers.some((systemUser) => systemUser.id === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].id);
    }
  }, [filteredUsers, selectedUserId]);

  function notify(title: string, description: string) {
    setShowToast({ title, description });
    window.setTimeout(() => setShowToast(null), 2500);
  }

  async function createUser() {
    await createUserMutation.mutateAsync({
      name,
      email,
      password,
      role,
    });

    setName('');
    setEmail('');
    setPassword('');
    setRole('EDITOR');
    notify('Usuario creado', 'La nueva cuenta ya está disponible para el equipo.');
  }

  if (user.displayRole !== 'ADMIN') {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Solo los administradores pueden gestionar usuarios y roles.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (usersQuery.isLoading) {
    return (
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-4 py-6">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (usersQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar usuarios.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showToast ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={showToast.title} description={showToast.description} />
        </div>
      ) : null}

      <SectionHeading title="Usuarios" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="py-5">
                <p className="text-sm text-[var(--color-text-muted)]">Usuarios activos</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{users.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5">
                <p className="text-sm text-[var(--color-text-muted)]">Administradores</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {users.filter((systemUser) => systemUser.displayRole === 'ADMIN').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5">
                <p className="text-sm text-[var(--color-text-muted)]">Editores y visualizadores</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {users.filter((systemUser) => systemUser.displayRole !== 'ADMIN').length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Base de usuarios"
              description="Busca por nombre, correo o rol. La fila seleccionada actualiza el panel lateral."
            />
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-10"
                    placeholder="Buscar nombre, correo o rol"
                  />
                </div>
                <div className="flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 text-sm text-[var(--color-text-muted)]">
                  {filteredUsers.length} usuarios visibles
                </div>
              </div>

              <DataTable columns={['Usuario', 'Correo', 'Rol', 'Estado']}>
                {filteredUsers.map((systemUser) => {
                  const selected = systemUser.id === selectedUser?.id;

                  return (
                    <DataRow
                      key={systemUser.id}
                      interactive
                      onClick={() => setSelectedUserId(systemUser.id)}
                      className={selected ? 'bg-[var(--color-panel-subtle)]' : undefined}
                    >
                      <DataCell>
                        <div className="w-full text-left">
                          <p className="font-medium">{systemUser.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">Cuenta del sistema</p>
                        </div>
                      </DataCell>
                      <DataCell>{systemUser.email}</DataCell>
                      <DataCell>
                        <Badge variant="info">{systemUser.displayRole}</Badge>
                      </DataCell>
                      <DataCell>{systemUser.isActive ? 'Activo' : 'Inactivo'}</DataCell>
                    </DataRow>
                  );
                })}
              </DataTable>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit xl:sticky xl:top-24">
            {selectedUser ? (
              <>
                <CardHeader
                  title={selectedUser.name}
                  description={selectedUser.email}
                  action={<Badge variant="info">{selectedUser.displayRole}</Badge>}
                />
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                      <p className="text-sm text-[var(--color-text-muted)]">Rol operativo</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedUser.displayRole}</p>
                    </div>
                    <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                      <p className="text-sm text-[var(--color-text-muted)]">Estado</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                        {selectedUser.isActive ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--color-border)] p-4">
                    <p className="text-sm font-medium text-[var(--color-text)]">Acceso</p>
                    <div className="mt-3 space-y-3 text-sm text-[var(--color-text-muted)]">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-[var(--color-primary)]" />
                        <span>{selectedUser.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-[var(--color-primary)]" />
                        <span>Permisos según rol {selectedUser.displayRole.toLowerCase()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="py-16">
                <div className="text-center">
                  <CircleUserRound className="mx-auto h-8 w-8 text-[var(--color-primary)]" />
                  <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                    No hay un usuario seleccionado para mostrar en el panel.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Crear usuario"
              description="Solo administradores pueden crear nuevas cuentas del sistema."
            />
            <CardContent className="space-y-4">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" />
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo" />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Contraseña temporal"
              />
              <Select value={role} onChange={(event) => setRole(event.target.value as 'ADMIN' | 'EDITOR' | 'VIEWER')}>
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Visualizador</option>
                <option value="ADMIN">Administrador</option>
              </Select>
              <Button
                onClick={createUser}
                disabled={
                  createUserMutation.isPending ||
                  !name.trim() ||
                  !email.trim() ||
                  password.length < 8
                }
              >
                <Plus className="h-4 w-4" />
                {createUserMutation.isPending ? 'Creando...' : 'Crear usuario'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

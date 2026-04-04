'use client';

import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Save, Trash2, X } from 'lucide-react';
import {
  useCreateWorkItemCatalog,
  useDeleteWorkItemCatalog,
  useUpdateWorkItemCatalog,
  useWorkItemCatalog,
} from '@/lib/api/hooks';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

export function WorkItemCatalogManager() {
  const { user } = useSession();
  const canManageCatalog = user.displayRole !== 'VIEWER';
  const workItemsQuery = useWorkItemCatalog();
  const createWorkItemMutation = useCreateWorkItemCatalog();
  const updateWorkItemMutation = useUpdateWorkItemCatalog();
  const deleteWorkItemMutation = useDeleteWorkItemCatalog();

  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  const workItems = useMemo(() => workItemsQuery.data || [], [workItemsQuery.data]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  function notify(title: string, description: string) {
    setToastMessage({ title, description });
  }

  async function createWorkItem() {
    const names = newItemName
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!names.length) {
      return;
    }

    for (const name of names) {
      await createWorkItemMutation.mutateAsync({ name });
    }

    setNewItemName('');
    notify(
      names.length === 1 ? 'Trabajo creado' : 'Trabajos creados',
      names.length === 1
        ? 'El trabajo ya quedó disponible para asignarlo a conceptos.'
        : 'Los trabajos ya quedaron disponibles para asignarlos a conceptos.',
    );
  }

  async function saveWorkItem() {
    const name = editingName.trim();
    if (!editingId || !name) {
      return;
    }

    await updateWorkItemMutation.mutateAsync({ id: editingId, name });
    setEditingId('');
    setEditingName('');
    notify('Trabajo actualizado', 'El nombre del trabajo quedó guardado.');
  }

  async function removeWorkItem(id: string) {
    await deleteWorkItemMutation.mutateAsync(id);
    if (editingId === id) {
      setEditingId('');
      setEditingName('');
    }
    notify('Trabajo eliminado', 'El trabajo ya no aparece en el catálogo activo.');
  }

  if (workItemsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (workItemsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar el catálogo de trabajos.</p>
        </CardContent>
      </Card>
    );
  }

  if (!canManageCatalog) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Tu rol actual solo puede consultar tableros y reportes. La gestión de trabajos requiere un usuario editor o administrador.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastMessage.title} description={toastMessage.description} />
        </div>
      ) : null}

      <SectionHeading
        title="Trabajos a realizar"
      />

      <Card>
        <CardHeader
          title="Catálogo de trabajos"
          description="Administra el listado reutilizable que después podrás asociar a cada concepto."
        />
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <Textarea
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              placeholder="Escribe uno o varios trabajos, un renglón por cada trabajo"
              rows={10}
              className="w-full"
            />
            <div className="flex justify-end">
              <Button onClick={createWorkItem} disabled={createWorkItemMutation.isPending || !newItemName.trim()}>
                <Plus className="h-4 w-4" />
                Agregar trabajos
              </Button>
            </div>
          </div>

          {!workItems.length ? (
            <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-5 py-12 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Aún no hay trabajos guardados.</p>
            </div>
          ) : (
            workItems.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                    ) : (
                      <>
                        <p className="font-medium text-[var(--color-text)]">{item.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Actualizado {new Date(item.updatedAt).toLocaleString('es-MX')}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <Button onClick={saveWorkItem} disabled={updateWorkItemMutation.isPending || !editingName.trim()}>
                          <Save className="h-4 w-4" />
                          Guardar
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId('');
                            setEditingName('');
                          }}
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                      >
                        <PencilLine className="h-4 w-4" />
                        Editar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => removeWorkItem(item.id)}
                      disabled={deleteWorkItemMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

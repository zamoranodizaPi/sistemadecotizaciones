'use client';

import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Save, Trash2, X } from 'lucide-react';
import {
  useCreateReusableTextBlock,
  useDeleteReusableTextBlock,
  useReusableTextBlocks,
  useUpdateReusableTextBlock,
} from '@/lib/api/hooks';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

const blockTypes = ['ALCANCE', 'EXCLUSIONES', 'ENTREGABLES', 'SUPUESTOS', 'GARANTIAS'];

export function ReusableTextBlockManager() {
  const { user } = useSession();
  const canManageCatalog = user.displayRole !== 'VIEWER';
  const blocksQuery = useReusableTextBlocks();
  const createBlockMutation = useCreateReusableTextBlock();
  const updateBlockMutation = useUpdateReusableTextBlock();
  const deleteBlockMutation = useDeleteReusableTextBlock();

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState(blockTypes[0]);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState(blockTypes[0]);
  const [editingContent, setEditingContent] = useState('');
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  const blocks = useMemo(() => blocksQuery.data || [], [blocksQuery.data]);

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

  async function createBlock() {
    if (!newName.trim() || !newType.trim() || !newContent.trim()) {
      return;
    }

    await createBlockMutation.mutateAsync({
      name: newName.trim(),
      type: newType.trim(),
      content: newContent.trim(),
    });

    setNewName('');
    setNewType(blockTypes[0]);
    setNewContent('');
    notify('Bloque creado', 'El bloque reutilizable ya quedó disponible en cotizaciones.');
  }

  async function saveBlock() {
    if (!editingId || !editingName.trim() || !editingType.trim() || !editingContent.trim()) {
      return;
    }

    await updateBlockMutation.mutateAsync({
      id: editingId,
      name: editingName.trim(),
      type: editingType.trim(),
      content: editingContent.trim(),
    });

    setEditingId('');
    setEditingName('');
    setEditingType(blockTypes[0]);
    setEditingContent('');
    notify('Bloque actualizado', 'El bloque reutilizable quedó guardado.');
  }

  async function removeBlock(id: string) {
    await deleteBlockMutation.mutateAsync(id);
    if (editingId === id) {
      setEditingId('');
      setEditingName('');
      setEditingType(blockTypes[0]);
      setEditingContent('');
    }
    notify('Bloque eliminado', 'El bloque ya no aparece en el catálogo activo.');
  }

  if (blocksQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (blocksQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar los bloques reutilizables.</p>
        </CardContent>
      </Card>
    );
  }

  if (!canManageCatalog) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Tu rol actual solo puede consultar tableros y reportes. La gestión de bloques requiere un usuario editor o administrador.
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

      <SectionHeading title="Bloques reutilizables" />

      <Card>
        <CardHeader
          title="Biblioteca comercial"
          description="Administra textos reutilizables para alcance, exclusiones, entregables, supuestos y garantías."
        />
        <CardContent className="space-y-5">
          <div className="space-y-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre del bloque" />
              <Select value={newType} onChange={(event) => setNewType(event.target.value)}>
                {blockTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              rows={10}
              placeholder="Contenido del bloque reutilizable"
            />
            <div className="flex justify-end">
              <Button
                onClick={createBlock}
                disabled={createBlockMutation.isPending || !newName.trim() || !newType.trim() || !newContent.trim()}
              >
                <Plus className="h-4 w-4" />
                Agregar bloque
              </Button>
            </div>
          </div>

          {!blocks.length ? (
            <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-5 py-12 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Aún no hay bloques reutilizables guardados.</p>
            </div>
          ) : (
            blocks.map((block) => {
              const isEditing = editingId === block.id;
              return (
                <div key={block.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                        <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                        <Select value={editingType} onChange={(event) => setEditingType(event.target.value)}>
                          {blockTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows={8} />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--color-text)]">{block.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{block.type}</p>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Actualizado {new Date(block.updatedAt).toLocaleString('es-MX')}
                        </p>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{block.content}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          onClick={saveBlock}
                          disabled={updateBlockMutation.isPending || !editingName.trim() || !editingType.trim() || !editingContent.trim()}
                        >
                          <Save className="h-4 w-4" />
                          Guardar
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId('');
                            setEditingName('');
                            setEditingType(blockTypes[0]);
                            setEditingContent('');
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
                          setEditingId(block.id);
                          setEditingName(block.name);
                          setEditingType(block.type);
                          setEditingContent(block.content);
                        }}
                      >
                        <PencilLine className="h-4 w-4" />
                        Editar
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => removeBlock(block.id)} disabled={deleteBlockMutation.isPending}>
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

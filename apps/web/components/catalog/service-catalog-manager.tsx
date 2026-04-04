'use client';

import { useMemo, useState } from 'react';
import { PencilLine, Plus, Save, Trash2 } from 'lucide-react';
import {
  useCatalog,
  useCreateServiceTemplate,
  useDeleteServiceTemplate,
  useServiceTemplates,
  useUpdateServiceTemplate,
  useWorkItemCatalog,
} from '@/lib/api/hooks';
import { mapCatalogForUi } from '@/lib/catalog';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

type EditableSupply = {
  serviceId: string;
  pricingProfileId: string;
  quantity: string;
};

function extractActivities(
  sections?: Array<{ title: string; content: string }> | null,
) {
  const section = sections?.find((entry) =>
    ['trabajos a realizar:', 'actividades:'].includes(entry.title.trim().toLowerCase()),
  );

  return section?.content
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) || [];
}

export function ServiceCatalogManager() {
  const { user } = useSession();
  const canManage = user.displayRole !== 'VIEWER';
  const catalogQuery = useCatalog();
  const serviceTemplatesQuery = useServiceTemplates();
  const activityCatalogQuery = useWorkItemCatalog();
  const createMutation = useCreateServiceTemplate();
  const updateMutation = useUpdateServiceTemplate();
  const deleteMutation = useDeleteServiceTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState('Servicio');
  const [selectedSupplyId, setSelectedSupplyId] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedActivity, setSelectedActivity] = useState('');
  const [activitiesText, setActivitiesText] = useState('');
  const [supplies, setSupplies] = useState<EditableSupply[]>([]);
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  const supplyCatalog = useMemo(
    () => (catalogQuery.data ? mapCatalogForUi(catalogQuery.data) : []),
    [catalogQuery.data],
  );
  const allSupplies = useMemo(
    () =>
      supplyCatalog.flatMap((category) =>
        category.services.map((service) => ({
          ...service,
          categoryName: category.name,
          categoryCode: category.code,
        })),
      ),
    [supplyCatalog],
  );
  const serviceTemplates = serviceTemplatesQuery.data || [];
  const activityCatalog = activityCatalogQuery.data || [];
  const selectedSupply = allSupplies.find((item) => item.id === selectedSupplyId) || null;
  const availableProfiles = selectedSupply?.pricingProfiles || [];

  function notify(title: string, description: string) {
    setToastMessage({ title, description });
    window.setTimeout(() => setToastMessage(null), 2800);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setTemplateType('Servicio');
    setSelectedSupplyId('');
    setSelectedProfileId('');
    setQuantity('1');
    setSelectedActivity('');
    setActivitiesText('');
    setSupplies([]);
  }

  function addSupply() {
    if (!selectedSupplyId || !selectedProfileId) {
      return;
    }

    setSupplies((current) => [
      ...current,
      {
        serviceId: selectedSupplyId,
        pricingProfileId: selectedProfileId,
        quantity: quantity || '1',
      },
    ]);
    setSelectedSupplyId('');
    setSelectedProfileId('');
    setQuantity('1');
  }

  function addActivity() {
    if (!selectedActivity.trim()) {
      return;
    }

    const current = activitiesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!current.includes(selectedActivity.trim())) {
      setActivitiesText([...current, selectedActivity.trim()].join('\n'));
    }

    setSelectedActivity('');
  }

  async function saveServiceCatalog() {
    if (!name.trim() || !supplies.length) {
      return;
    }

    const payload = {
      name: name.trim(),
      templateType: templateType.trim() || 'Servicio',
      items: supplies.map((item) => ({
        serviceId: item.serviceId,
        pricingProfileId: item.pricingProfileId,
        quantity: Math.max(1, Number(item.quantity) || 1),
      })),
      activityNames: activitiesText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        notify('Servicio actualizado', 'La composición de suministros y actividades quedó guardada.');
      } else {
        await createMutation.mutateAsync(payload);
        notify('Servicio creado', 'Ya puedes usar este servicio para precargar suministros y actividades.');
      }

      resetForm();
    } catch (error) {
      notify('No fue posible guardar', error instanceof Error ? error.message : 'Error al guardar el servicio.');
    }
  }

  async function removeServiceCatalog(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      if (editingId === id) {
        resetForm();
      }
      notify('Servicio eliminado', 'El servicio ya no aparece en el catálogo activo.');
    } catch (error) {
      notify('No fue posible eliminar', error instanceof Error ? error.message : 'Error al eliminar.');
    }
  }

  function startEditing(template: (typeof serviceTemplates)[number]) {
    setEditingId(template.id);
    setName(template.name);
    setTemplateType(template.templateType || 'Servicio');
    setSupplies(
      template.items.map((item) => ({
        serviceId: item.serviceId,
        pricingProfileId: item.pricingProfileId,
        quantity: String(item.quantity),
      })),
    );
    setActivitiesText(extractActivities(template.commercialSections).join('\n'));
  }

  if (catalogQuery.isLoading || serviceTemplatesQuery.isLoading || activityCatalogQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-80 w-full" />
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
        title="Catálogo de servicios"
        description="Cada servicio se compone de suministros y actividades. Al usarlo en una cotización podrás precargar ambos."
        action={
          canManage ? (
            <Button variant="secondary" onClick={resetForm}>
              <Plus className="h-4 w-4" />
              Nuevo servicio
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title={editingId ? 'Editar servicio' : 'Nuevo servicio'}
          description="Define el servicio comercial seleccionando los suministros y actividades que lo componen."
        />
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del servicio" />
            <Select value={templateType} onChange={(event) => setTemplateType(event.target.value)}>
              <option value="Servicio">Servicio</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Diagnóstico">Diagnóstico</option>
              <option value="Puesta en marcha">Puesta en marcha</option>
              <option value="Proyecto">Proyecto</option>
            </Select>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_120px_auto]">
            <Select value={selectedSupplyId} onChange={(event) => setSelectedSupplyId(event.target.value)}>
              <option value="">Selecciona suministro</option>
              {allSupplies.map((supply) => (
                <option key={supply.id} value={supply.id}>
                  {supply.name} · {supply.code}
                </option>
              ))}
            </Select>
            <Select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} disabled={!selectedSupply}>
              <option value="">Precio / perfil</option>
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </Select>
            <Input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, '') || '1')} placeholder="Cant." />
            <Button onClick={addSupply} disabled={!selectedSupplyId || !selectedProfileId}>
              Agregar suministro
            </Button>
          </div>

          <div className="space-y-2">
            {supplies.length ? (
              supplies.map((item, index) => {
                const supply = allSupplies.find((entry) => entry.id === item.serviceId);
                const profile = supply?.pricingProfiles.find((entry) => entry.id === item.pricingProfileId);

                return (
                  <div key={`${item.serviceId}-${item.pricingProfileId}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-[var(--color-text)]">{supply?.name || 'Suministro'}</p>
                      <p className="text-[var(--color-text-muted)]">{profile?.name || 'Sin perfil'} · Cantidad {item.quantity}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setSupplies((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Todavía no agregas suministros a este servicio.</p>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Select value={selectedActivity} onChange={(event) => setSelectedActivity(event.target.value)}>
              <option value="">Selecciona actividad del catálogo</option>
              {activityCatalog.map((activity) => (
                <option key={activity.id} value={activity.name}>
                  {activity.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={addActivity} disabled={!selectedActivity.trim()}>
              Agregar actividad
            </Button>
          </div>

          <Textarea
            rows={8}
            value={activitiesText}
            onChange={(event) => setActivitiesText(event.target.value)}
            placeholder="Una actividad por renglón"
          />

          <div className="flex flex-wrap justify-end gap-2">
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar edición
              </Button>
            ) : null}
            <Button onClick={saveServiceCatalog} disabled={!canManage || !name.trim() || !supplies.length}>
              <Save className="h-4 w-4" />
              Guardar servicio
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Servicios registrados"
          description="Estos servicios sirven para precargar suministros y actividades en una cotización."
        />
        <CardContent className="space-y-3">
          {serviceTemplates.length ? (
            serviceTemplates.map((template) => (
              <div key={template.id} className="flex flex-col gap-3 rounded-[24px] border border-[var(--color-border)] bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="font-medium text-[var(--color-text)]">{template.name}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {template.templateType || 'Servicio'} · {template.items.length} suministros · {extractActivities(template.commercialSections).length} actividades
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => startEditing(template)}>
                    <PencilLine className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeServiceCatalog(template.id)}>
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Todavía no tienes servicios catalogados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

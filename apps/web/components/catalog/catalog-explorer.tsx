'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  FolderPlus,
  Copy,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  useCatalog,
  useClearCatalog,
  useCreateCategory,
  useCreateService,
  useDetectedCatalogServices,
  useCloneService,
  useDeleteCategory,
  useDeleteService,
  useExchangeRate,
  useExportCatalogExcel,
  useRefreshExchangeRate,
  useUpdateExchangeRate,
  useUpdateDetectedCatalogServiceStatus,
  useUpdatePricingProfiles,
  useUpdateService,
  useWorkItemCatalog,
} from '@/lib/api/hooks';
import { mapCatalogForUi } from '@/lib/catalog';
import { formatCurrency } from '@/lib/utils';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell, DataRow, DataTable } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

type EditablePriceOption = {
  localId: string;
  id?: string;
  code: string;
  name: string;
  sortOrder: number;
  mxnPrice: string;
  usdPrice: string;
};

function normalizeDecimalInput(raw: string) {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/-/g, '');
  if (!cleaned) {
    return '';
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  let integerPart = cleaned;
  let decimalPart = '';

  if (separatorIndex >= 0) {
    integerPart = cleaned.slice(0, separatorIndex);
    decimalPart = cleaned.slice(separatorIndex + 1);
  }

  const normalizedInteger = integerPart.replace(/[^\d]/g, '') || '0';
  const normalizedDecimal = decimalPart.replace(/[^\d]/g, '').slice(0, 2);

  return `${normalizedInteger}.${normalizedDecimal}`;
}

function truncateToTwoDecimals(value: number) {
  return Math.trunc(value * 100) / 100;
}

function parseFormattedDecimal(value: string) {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return truncateToTwoDecimals(parsed);
}

function formatDecimalDisplay(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '';
  }

  const safe = truncateToTwoDecimals(value);
  const [integerPart, decimalPart = '00'] = safe.toFixed(2).split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${groupedInteger}.${decimalPart}`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCompactValue(value: string) {
  return normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
}

export function CatalogExplorer() {
  const { user } = useSession();
  const canManageCatalog = user.displayRole !== 'VIEWER';
  const canDelete = user.displayRole === 'ADMIN';
  const catalogQuery = useCatalog();
  const createCategoryMutation = useCreateCategory();
  const createServiceMutation = useCreateService();
  const detectedCatalogServicesQuery = useDetectedCatalogServices();
  const cloneServiceMutation = useCloneService();
  const updateServiceMutation = useUpdateService();
  const updatePricingProfilesMutation = useUpdatePricingProfiles();
  const deleteCategoryMutation = useDeleteCategory();
  const deleteServiceMutation = useDeleteService();
  const clearCatalogMutation = useClearCatalog();
  const exchangeRateQuery = useExchangeRate();
  const exportCatalogMutation = useExportCatalogExcel();
  const refreshExchangeRateMutation = useRefreshExchangeRate();
  const updateExchangeRateMutation = useUpdateExchangeRate();
  const updateDetectedCatalogServiceStatusMutation = useUpdateDetectedCatalogServiceStatus();
  const workItemCatalogQuery = useWorkItemCatalog();

  const catalog = useMemo(
    () => (catalogQuery.data ? mapCatalogForUi(catalogQuery.data) : []),
    [catalogQuery.data],
  );

  const [activeCategory, setActiveCategory] = useState('');
  const [activeService, setActiveService] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceSort, setServiceSort] = useState<'name' | 'code'>('name');
  const [priceOptions, setPriceOptions] = useState<EditablePriceOption[]>([]);
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceEditModalOpen, setServiceEditModalOpen] = useState(false);
  const [serviceCloneModalOpen, setServiceCloneModalOpen] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');

  const [serviceCode, setServiceCode] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceUnit, setServiceUnit] = useState('');
  const [serviceRelatedWork, setServiceRelatedWork] = useState('');
  const [selectedWorkItems, setSelectedWorkItems] = useState<string[]>([]);
  const [cloneServiceCode, setCloneServiceCode] = useState('');
  const [cloneServiceName, setCloneServiceName] = useState('');
  const [cloneServiceDescription, setCloneServiceDescription] = useState('');
  const [cloneServiceUnit, setCloneServiceUnit] = useState('');
  const [cloneServiceRelatedWork, setCloneServiceRelatedWork] = useState('');
  const [cloneSelectedWorkItems, setCloneSelectedWorkItems] = useState<string[]>([]);

  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const workItemCatalog = workItemCatalogQuery.data || [];
  const detectedCatalogServices = detectedCatalogServicesQuery.data || [];
  const deferredActiveService = useDeferredValue(activeService);

  const resolvedCategory = activeCategory || catalog[0]?.code || '';
  const currentCategory = catalog.find((category) => category.code === resolvedCategory) ?? catalog[0];
  const filteredServices = useMemo(() => {
    const services = currentCategory?.services ?? [];
    const normalizedQuery = normalizeSearchValue(serviceQuery);
    const compactQuery = normalizeCompactValue(serviceQuery);
    const baseServices = !normalizedQuery
      ? services
      : services.filter((service) => {
          return [service.name, service.code, service.description, service.relatedWork]
            .filter(Boolean)
            .some((value) => {
              const normalizedValue = normalizeSearchValue(value);
              const compactValue = normalizeCompactValue(value);

              return (
                normalizedValue.includes(normalizedQuery) ||
                (compactQuery ? compactValue.includes(compactQuery) : false)
              );
            });
        });

    return [...baseServices].sort((left, right) => {
      if (serviceSort === 'code') {
        return left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' });
      }

      return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
    });
  }, [currentCategory, serviceQuery, serviceSort]);
  const resolvedService = deferredActiveService || currentCategory?.services[0]?.id || '';
  const currentService =
    currentCategory?.services.find((service) => service.id === resolvedService) ??
    filteredServices[0] ??
    currentCategory?.services[0];

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!catalog.length) {
      setActiveCategory('');
      setActiveService('');
      return;
    }

    if (!currentCategory) {
      setActiveCategory(catalog[0].code);
      setActiveService(catalog[0].services[0]?.id || '');
      return;
    }

    if (!currentService && currentCategory.services[0]) {
      setActiveService((filteredServices[0] || currentCategory.services[0]).id);
    }
  }, [catalog, currentCategory, currentService, filteredServices]);

  useEffect(() => {
    if (!currentService) {
      setPriceOptions([]);
      return;
    }

    setPriceOptions(
      currentService.pricingProfiles.map((profile, index) => ({
        localId: `${profile.id}-${profile.code}-${index}`,
        id: profile.id,
        code: profile.code,
        name: profile.name,
        sortOrder: profile.sortOrder,
        mxnPrice:
          profile.mxnPrice === '' ? '' : formatDecimalDisplay(Number(profile.mxnPrice)),
        usdPrice:
          profile.usdPrice === '' ? '' : formatDecimalDisplay(Number(profile.usdPrice)),
      })),
    );

    setServiceCode(currentService.code);
    setServiceName(currentService.name);
    setServiceDescription(currentService.description);
    setServiceUnit(currentService.unit || '');
    setServiceRelatedWork(currentService.relatedWork || '');
    setSelectedWorkItems(
      currentService.relatedWork
        ? currentService.relatedWork.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : [],
    );
    setCloneServiceCode(`${currentService.code}_COPY`);
    setCloneServiceName(`${currentService.name} copia`);
    setCloneServiceDescription(currentService.description);
    setCloneServiceUnit(currentService.unit || '');
    setCloneServiceRelatedWork(currentService.relatedWork || '');
    setCloneSelectedWorkItems(
      currentService.relatedWork
        ? currentService.relatedWork.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : [],
    );
  }, [currentService]);

  useEffect(() => {
    if (exchangeRateQuery.data) {
      setExchangeRateInput(formatDecimalDisplay(Number(exchangeRateQuery.data.rate)));
    }
  }, [exchangeRateQuery.data]);

  if (catalogQuery.isLoading || exchangeRateQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (catalogQuery.isError || exchangeRateQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar la configuracion.</p>
        </CardContent>
      </Card>
    );
  }

  if (user.displayRole === 'VIEWER') {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Tu rol actual solo puede consultar tableros y reportes. La gestión de catálogo requiere un usuario editor o administrador.
          </p>
        </CardContent>
      </Card>
    );
  }

  function notify(title: string, description: string) {
    setToastMessage({ title, description });
  }

  function buildRelatedWorkValue(items: string[]) {
    return items.map((item) => item.trim()).filter(Boolean).join('\n');
  }

  function buildRelatedWorkValueFromText(value: string) {
    return parseRelatedWorkLines(value).join('\n');
  }

  function parseRelatedWorkLines(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function syncSelectedWorkItemsFromText(value: string) {
    const lines = parseRelatedWorkLines(value);
    setSelectedWorkItems(workItemCatalog.map((item) => item.name).filter((item) => lines.includes(item)));
  }

  function syncCloneSelectedWorkItemsFromText(value: string) {
    const lines = parseRelatedWorkLines(value);
    setCloneSelectedWorkItems(workItemCatalog.map((item) => item.name).filter((item) => lines.includes(item)));
  }

  function toggleServiceWorkItem(itemName: string) {
    setSelectedWorkItems((current) => {
      const next = current.includes(itemName)
        ? current.filter((item) => item !== itemName)
        : [...current, itemName];
      setServiceRelatedWork(buildRelatedWorkValue(next));
      return next;
    });
  }

  function toggleCloneWorkItem(itemName: string) {
    setCloneSelectedWorkItems((current) => {
      const next = current.includes(itemName)
        ? current.filter((item) => item !== itemName)
        : [...current, itemName];
      setCloneServiceRelatedWork(buildRelatedWorkValue(next));
      return next;
    });
  }

  async function exportCatalog() {
    try {
      const response = await exportCatalogMutation.mutateAsync();
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${response.file}`;
      link.download = response.fileName;
      link.click();
      notify('Catálogo exportado', 'Descargamos una plantilla Excel lista para actualización masiva.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible exportar el catálogo.';
      notify('Exportación fallida', message);
    }
  }

  function addPriceOption() {
    const nextIndex = priceOptions.length + 1;

    setPriceOptions((current) => [
      ...current,
      {
        localId: `local-${crypto.randomUUID()}`,
        code: `OPCION_${nextIndex}`,
        name: `Opcion ${nextIndex}`,
        sortOrder: nextIndex,
        mxnPrice: '',
        usdPrice: '',
      },
    ]);
  }

  async function savePriceOptions() {
    if (!currentService) {
      return;
    }

    await updatePricingProfilesMutation.mutateAsync({
      serviceId: currentService.id,
      profiles: priceOptions.map((option, index) => ({
        id: option.id,
        code: option.code,
        name: option.name,
        sortOrder: index + 1,
        ...(parseFormattedDecimal(option.mxnPrice) !== null
          ? { mxnPrice: parseFormattedDecimal(option.mxnPrice) as number }
          : {}),
        ...(parseFormattedDecimal(option.usdPrice) !== null
          ? { usdPrice: parseFormattedDecimal(option.usdPrice) as number }
          : {}),
      })),
    });

    notify('Opciones actualizadas', 'Las opciones de precio del servicio quedaron guardadas.');
  }

  async function saveService() {
    if (!currentService) {
      return;
    }

    await updateServiceMutation.mutateAsync({
      serviceId: currentService.id,
      code: serviceCode,
      name: serviceName,
      description: serviceDescription || undefined,
      unit: serviceUnit || undefined,
      relatedWork: buildRelatedWorkValueFromText(serviceRelatedWork) || undefined,
    });

    setServiceEditModalOpen(false);
    notify('Suministro actualizado', 'Los datos del suministro ya fueron editados.');
  }

  async function createCategory() {
    await createCategoryMutation.mutateAsync({
      code: categoryCode,
      name: categoryName,
      description: categoryDescription || undefined,
    });

    setCategoryModalOpen(false);
    setCategoryCode('');
    setCategoryName('');
    setCategoryDescription('');
    notify('Categoria creada', 'La nueva categoria ya esta disponible.');
  }

  async function createService() {
    if (!currentCategory) {
      return;
    }

    await createServiceMutation.mutateAsync({
      categoryCode: currentCategory.code,
      serviceCode,
      name: serviceName,
      description: serviceDescription || undefined,
      unit: serviceUnit || undefined,
      relatedWork: buildRelatedWorkValueFromText(serviceRelatedWork) || undefined,
    });

    setServiceModalOpen(false);
    setServiceCode('');
    setServiceName('');
    setServiceDescription('');
    setServiceUnit('');
    setServiceRelatedWork('');
    setSelectedWorkItems([]);
    notify('Suministro creado', 'Ahora puedes editarlo y capturar sus opciones de precio.');
  }

  async function cloneService() {
    if (!currentService || !currentCategory) {
      return;
    }

    await cloneServiceMutation.mutateAsync({
      serviceId: currentService.id,
      code: cloneServiceCode,
      name: cloneServiceName,
      categoryCode: currentCategory.code,
      description: cloneServiceDescription || undefined,
      unit: cloneServiceUnit || undefined,
      relatedWork: buildRelatedWorkValueFromText(cloneServiceRelatedWork) || undefined,
    });

    setServiceCloneModalOpen(false);
    notify('Suministro duplicado', 'Se creó una copia con todas sus opciones de precio.');
  }

  async function saveExchangeRate() {
    const nextRate = parseFormattedDecimal(exchangeRateInput);
    if (!nextRate) {
      return;
    }

    await updateExchangeRateMutation.mutateAsync(nextRate);
    notify('Tipo de cambio ajustado', 'El valor manual ya quedo guardado.');
  }

  async function refreshExchangeRate() {
    await refreshExchangeRateMutation.mutateAsync();
    notify('Tipo de cambio actualizado', 'Se consulto la fuente automatica.');
  }

  async function removeService() {
    if (!currentService || !canDelete) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para borrar este servicio');
    if (!password) {
      return;
    }

    await deleteServiceMutation.mutateAsync({ serviceId: currentService.id, password });
    setActiveService('');
    notify('Suministro eliminado', 'El suministro ya no aparece en el catálogo activo.');
  }

  async function removeCategory() {
    if (!currentCategory || !canDelete) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para borrar esta categoría');
    if (!password) {
      return;
    }

    await deleteCategoryMutation.mutateAsync({ categoryId: currentCategory.id, password });
    setActiveCategory('');
    setActiveService('');
    notify('Categoria eliminada', 'La categoria y sus servicios fueron ocultados.');
  }

  async function clearCatalog() {
    if (!canDelete) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para vaciar el catálogo');
    if (!password) {
      return;
    }

    await clearCatalogMutation.mutateAsync(password);
    setClearModalOpen(false);
    setActiveCategory('');
    setActiveService('');
    notify('Catalogo vaciado', 'Ahora puedes recrear categorias y servicios manualmente.');
  }

  function updatePriceOptionValue(
    index: number,
    field: 'mxnPrice' | 'usdPrice',
    rawValue: string,
  ) {
    const nextValue = parseFormattedDecimal(rawValue);
    const nextRate = parseFormattedDecimal(exchangeRateInput);

    setPriceOptions((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        const sanitizedRaw = rawValue.replace(/[^\d,.\s]/g, '').trim();

        if (nextValue === null) {
          return {
            ...item,
            [field]: sanitizedRaw,
          };
        }

        if (!nextRate) {
          return {
            ...item,
            [field]: sanitizedRaw,
          };
        }

        if (field === 'mxnPrice') {
          return {
            ...item,
            mxnPrice: sanitizedRaw,
            usdPrice: formatDecimalDisplay(truncateToTwoDecimals(nextValue / nextRate)),
          };
        }

        return {
          ...item,
          usdPrice: sanitizedRaw,
          mxnPrice: formatDecimalDisplay(truncateToTwoDecimals(nextValue * nextRate)),
        };
      }),
    );
  }

  function finalizePriceOptionValue(index: number, field: 'mxnPrice' | 'usdPrice') {
    setPriceOptions((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        const parsed = parseFormattedDecimal(item[field]);
        return {
          ...item,
          [field]: parsed === null ? '' : formatDecimalDisplay(parsed),
        };
      }),
    );
  }

  return (
    <div className="space-y-6">
      {detectedCatalogServices.length ? (
        <Card>
          <CardHeader
            title="Servicios detectados por IA"
            description="Estos servicios fueron encontrados en consultas reales y todavía no existen en catálogo con precio validado."
          />
          <CardContent className="space-y-3">
            {detectedCatalogServices.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">{entry.name}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Categoría sugerida: {entry.suggestedCategory || 'Sin categoría'} · Uso detectado {entry.usageCount} veces · Confianza {Math.round(entry.confidence * 100)}%
                  </p>
                  {entry.sourceInput ? (
                    <p className="mt-1 text-xs text-[var(--color-text-faint)]">{entry.sourceInput}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCategoryCode(entry.suggestedCategory || '');
                      setServiceCode('');
                      setServiceName(entry.name);
                      setServiceDescription('');
                      setServiceUnit('');
                      setServiceRelatedWork('');
                      setSelectedWorkItems([]);
                      setServiceModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Crear en catálogo
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateDetectedCatalogServiceStatusMutation.mutate({
                        id: entry.id,
                        status: 'APPROVED',
                      })
                    }
                  >
                    Validado
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateDetectedCatalogServiceStatusMutation.mutate({
                        id: entry.id,
                        status: 'DISMISSED',
                      })
                    }
                  >
                    Descartar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastMessage.title} description={toastMessage.description} />
        </div>
      ) : null}

      <SectionHeading
        title="Catálogo de suministros"
        action={
          <div className="flex flex-wrap gap-2">
            {canManageCatalog ? (
              <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Nueva categoria
              </Button>
            ) : null}
            {canManageCatalog ? (
              <Button variant="secondary" onClick={() => setServiceModalOpen(true)} disabled={!currentCategory}>
                <Plus className="h-4 w-4" />
                Nuevo suministro
              </Button>
            ) : null}
            {canManageCatalog ? (
              <Button
                variant="secondary"
                onClick={exportCatalog}
                disabled={exportCatalogMutation.isPending || !catalog.length}
              >
                Exportar catálogo
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="danger" onClick={() => setClearModalOpen(true)} disabled={!catalog.length}>
                <Trash2 className="h-4 w-4" />
                Vaciar catalogo
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Tipo de cambio"
          description="Valor global USD/MXN usado para conversiones cuando una opcion solo tiene precio en una moneda."
          action={
            <Button variant="secondary" size="sm" onClick={refreshExchangeRate} disabled={refreshExchangeRateMutation.isPending}>
              <RefreshCcw className="h-4 w-4" />
              Actualizar
            </Button>
          }
        />
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <Input
            inputMode="decimal"
            value={exchangeRateInput}
            onChange={(event) => setExchangeRateInput(event.target.value.replace(/[^\d,.\s]/g, '').trim())}
            onBlur={() =>
              setExchangeRateInput((current) => {
                const parsed = parseFormattedDecimal(current);
                return parsed === null ? '' : formatDecimalDisplay(parsed);
              })
            }
          />
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
            Fuente: {exchangeRateQuery.data?.source}
          </div>
          <Button onClick={saveExchangeRate} disabled={updateExchangeRateMutation.isPending}>
            Guardar ajuste
          </Button>
        </CardContent>
      </Card>

      {!catalog.length ? (
        <Card>
          <CardContent className="py-16">
            <div className="mx-auto max-w-xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Catalogo vacio</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">
                Crea la estructura manualmente
              </h3>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Empieza creando categorías y luego suministros. Cada suministro puede tener las opciones de precio que tú definas.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs
            items={catalog.map((category) => ({ value: category.code, label: category.name }))}
            active={resolvedCategory}
            onChange={(value) => {
              setActiveCategory(value);
              setServiceQuery('');
              const nextCategory = catalog.find((category) => category.code === value);
              setActiveService(nextCategory?.services[0]?.id || '');
            }}
          />

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card>
              <CardHeader
                title={currentCategory?.name || 'Categoria'}
                description={currentCategory?.description || 'Sin descripcion'}
                action={
                  currentCategory && canDelete ? (
                    <Button variant="ghost" size="sm" onClick={removeCategory}>
                      <Trash2 className="h-4 w-4" />
                      Borrar categoria
                    </Button>
                  ) : null
                }
              />
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                    <Input
                      value={serviceQuery}
                      onChange={(event) => setServiceQuery(event.target.value)}
                      className="pl-10"
                      placeholder="Buscar suministro por nombre o codigo"
                    />
                  </div>
                  <Select value={serviceSort} onChange={(event) => setServiceSort(event.target.value as 'name' | 'code')}>
                    <option value="name">Ordenar por nombre</option>
                    <option value="code">Ordenar por código</option>
                  </Select>
                </div>
                {currentCategory?.services.length ? (
                  <DataTable columns={['Suministro', 'Codigo', 'Opciones', 'Estado']}>
                    {filteredServices.map((service) => (
                      <DataRow
                        key={service.id}
                        interactive
                        onClick={() =>
                          startTransition(() => {
                            setActiveService(service.id);
                          })
                        }
                        className={currentService?.id === service.id ? 'bg-[var(--color-panel-subtle)]' : undefined}
                      >
                        <DataCell>
                          <div className="w-full text-left">
                            <p className="font-medium">{service.name}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{service.description || 'Sin descripcion'}</p>
                          </div>
                        </DataCell>
                        <DataCell>{service.code}</DataCell>
                        <DataCell>{service.pricingProfiles.length}</DataCell>
                        <DataCell>
                          {service.pricingProfiles.length ? 'Configurable' : 'Sin opciones'}
                        </DataCell>
                      </DataRow>
                    ))}
                  </DataTable>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-5 py-10 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">Esta categoría aún no tiene suministros.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title={currentService ? 'Configuración del servicio' : 'Selecciona un servicio'}
              />
              <CardContent className="space-y-5">
                {currentService ? (
                  <>
                    <div className="rounded-[28px] bg-[var(--color-secondary)] p-5 text-white">
                      <p className="text-sm text-white/60">Servicio seleccionado</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{currentService.name}</p>
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
                        <Settings2 className="h-3.5 w-3.5" />
                        Opciones de precio libres
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canManageCatalog ? (
                          <Button variant="secondary" size="sm" onClick={() => setServiceEditModalOpen(true)}>
                            <PencilLine className="h-4 w-4" />
                            Editar servicio
                          </Button>
                        ) : null}
                        {canManageCatalog ? (
                          <Button variant="secondary" size="sm" onClick={() => setServiceCloneModalOpen(true)}>
                            <Copy className="h-4 w-4" />
                            Duplicar
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button variant="ghost" size="sm" onClick={removeService}>
                            <Trash2 className="h-4 w-4" />
                            Borrar
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--color-text)]">Opciones de precio</p>
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={addPriceOption}>
                            <Plus className="h-4 w-4" />
                            Nueva opcion
                          </Button>
                          <Button onClick={savePriceOptions} disabled={updatePricingProfilesMutation.isPending}>
                            <Save className="h-4 w-4" />
                            Guardar
                          </Button>
                        </div>
                      </div>

                      {priceOptions.map((option, index) => (
                        <div key={`${option.localId}-${index}`} className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              value={option.code}
                              onChange={(event) =>
                                setPriceOptions((current) =>
                                  current.map((item, currentIndex) =>
                                    currentIndex === index ? { ...item, code: event.target.value } : item,
                                  ),
                                )
                              }
                              placeholder="Codigo"
                            />
                            <Input
                              value={option.name}
                              onChange={(event) =>
                                setPriceOptions((current) =>
                                  current.map((item, currentIndex) =>
                                    currentIndex === index ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                              placeholder="Nombre de la opcion"
                            />
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="Precio MXN"
                              value={option.mxnPrice}
                              onChange={(event) => updatePriceOptionValue(index, 'mxnPrice', event.target.value)}
                              onBlur={() => finalizePriceOptionValue(index, 'mxnPrice')}
                            />
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="Precio USD"
                              value={option.usdPrice}
                              onChange={(event) => updatePriceOptionValue(index, 'usdPrice', event.target.value)}
                              onBlur={() => finalizePriceOptionValue(index, 'usdPrice')}
                            />
                          </div>
                          <div className="mt-3 flex justify-between text-sm text-[var(--color-text-muted)]">
                            <span>
                              {option.mxnPrice !== ''
                                ? formatCurrency(parseFormattedDecimal(option.mxnPrice) || 0, 'MXN')
                                : 'Sin MXN'}{' '}
                              ·{' '}
                              {option.usdPrice !== ''
                                ? formatCurrency(parseFormattedDecimal(option.usdPrice) || 0, 'USD')
                                : 'Sin USD'}
                            </span>
                            <button
                              onClick={() =>
                                setPriceOptions((current) => current.filter((_, currentIndex) => currentIndex !== index))
                              }
                              className="text-[var(--color-danger)]"
                            >
                              Eliminar opcion
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-[var(--color-text)]">Historial legacy</p>
                      {currentService.history.length ? (
                        currentService.history.map((entry) => (
                          <div key={`${entry.date}-${entry.price}`} className="flex items-center justify-between rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3">
                            <div>
                              <p className="text-sm font-medium">{entry.date}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{entry.source}</p>
                            </div>
                            <p className="font-semibold">{formatCurrency(entry.price)}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                          Sin historial legacy.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--color-text)]">Trabajo relacionado</p>
                        <Button variant="secondary" size="sm" onClick={saveService} disabled={updateServiceMutation.isPending}>
                          <Save className="h-4 w-4" />
                          Guardar servicio
                        </Button>
                      </div>
                      <Textarea
                        value={serviceRelatedWork}
                        onChange={(event) => setServiceRelatedWork(event.target.value)}
                        onBlur={(event) => syncSelectedWorkItemsFromText(event.target.value)}
                        placeholder="Trabajos relacionados seleccionados"
                      />
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Si este servicio requiere un trabajo asociado, escríbelo aquí. Solo se usará uno por concepto y se imprimirá automáticamente en la cotización.
                      </p>
                      {workItemCatalog.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {workItemCatalog.map((item) => {
                            const checked = selectedWorkItems.includes(item.name);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleServiceWorkItem(item.name)}
                                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                  checked
                                    ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                                    : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                                }`}
                              >
                                <span>{item.name}</span>
                                <span>{checked ? '✓' : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                          Aún no hay trabajos guardados en el catálogo.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-5 py-14 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">Selecciona un servicio para editarlo.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="Nueva categoria">
        <div className="space-y-4">
          <Input value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} placeholder="Codigo" />
          <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Nombre visible" />
          <Textarea value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="Descripcion opcional" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCategoryModalOpen(false)}>Cancelar</Button>
            <Button onClick={createCategory} disabled={!categoryCode.trim() || !categoryName.trim()}>Crear categoria</Button>
          </div>
        </div>
      </Modal>

      <Modal open={serviceModalOpen} onClose={() => setServiceModalOpen(false)} title="Nuevo servicio">
        <div className="space-y-4">
          <Input value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} placeholder="Codigo del servicio" />
          <Input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Nombre del servicio" />
          <Input value={serviceUnit} onChange={(event) => setServiceUnit(event.target.value)} placeholder="Unidad opcional" />
          <Textarea value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Descripcion opcional" />
          <Textarea
            value={serviceRelatedWork}
            onChange={(event) => setServiceRelatedWork(event.target.value)}
            onBlur={(event) => syncSelectedWorkItemsFromText(event.target.value)}
            placeholder="Trabajos relacionados seleccionados"
          />
          {workItemCatalog.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {workItemCatalog.map((item) => {
                const checked = selectedWorkItems.includes(item.name);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleServiceWorkItem(item.name)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      checked
                        ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                        : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span>{checked ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setServiceModalOpen(false)}>Cancelar</Button>
            <Button onClick={createService} disabled={!currentCategory || !serviceCode.trim() || !serviceName.trim()}>Crear servicio</Button>
          </div>
        </div>
      </Modal>

      <Modal open={serviceEditModalOpen} onClose={() => setServiceEditModalOpen(false)} title="Editar servicio">
        <div className="space-y-4">
          <Input value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} placeholder="Codigo del servicio" />
          <Input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Nombre del servicio" />
          <Input value={serviceUnit} onChange={(event) => setServiceUnit(event.target.value)} placeholder="Unidad opcional" />
          <Textarea value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Descripcion opcional" />
          <Textarea
            value={serviceRelatedWork}
            onChange={(event) => setServiceRelatedWork(event.target.value)}
            onBlur={(event) => syncSelectedWorkItemsFromText(event.target.value)}
            placeholder="Trabajos relacionados seleccionados"
          />
          {workItemCatalog.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {workItemCatalog.map((item) => {
                const checked = selectedWorkItems.includes(item.name);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleServiceWorkItem(item.name)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      checked
                        ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                        : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span>{checked ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setServiceEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveService} disabled={!serviceCode.trim() || !serviceName.trim()}>Guardar cambios</Button>
          </div>
        </div>
      </Modal>

      <Modal open={serviceCloneModalOpen} onClose={() => setServiceCloneModalOpen(false)} title="Duplicar servicio">
        <div className="space-y-4">
          <Input value={cloneServiceCode} onChange={(event) => setCloneServiceCode(event.target.value)} placeholder="Codigo del nuevo servicio" />
          <Input value={cloneServiceName} onChange={(event) => setCloneServiceName(event.target.value)} placeholder="Nombre del nuevo servicio" />
          <Input value={cloneServiceUnit} onChange={(event) => setCloneServiceUnit(event.target.value)} placeholder="Unidad opcional" />
          <Textarea value={cloneServiceDescription} onChange={(event) => setCloneServiceDescription(event.target.value)} placeholder="Descripcion opcional" />
          <Textarea
            value={cloneServiceRelatedWork}
            onChange={(event) => setCloneServiceRelatedWork(event.target.value)}
            onBlur={(event) => syncCloneSelectedWorkItemsFromText(event.target.value)}
            placeholder="Trabajos relacionados seleccionados"
          />
          {workItemCatalog.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {workItemCatalog.map((item) => {
                const checked = cloneSelectedWorkItems.includes(item.name);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleCloneWorkItem(item.name)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      checked
                        ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                        : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span>{checked ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4 text-sm text-[var(--color-text-muted)]">
            Se copiara el servicio con todas sus opciones de precio. Luego podras ajustar nombres y precios en la copia.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setServiceCloneModalOpen(false)}>Cancelar</Button>
            <Button onClick={cloneService} disabled={!cloneServiceCode.trim() || !cloneServiceName.trim() || cloneServiceMutation.isPending}>
              Duplicar servicio
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={clearModalOpen} onClose={() => setClearModalOpen(false)} title="Vaciar catalogo">
        <div className="space-y-4">
          <div className="rounded-2xl bg-[rgba(239,68,68,0.06)] p-4 text-sm text-[var(--color-text-muted)]">
            Se aplicará borrado lógico. Las cotizaciones existentes no cambian, pero el catálogo activo quedará limpio.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={clearCatalog}>Vaciar ahora</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

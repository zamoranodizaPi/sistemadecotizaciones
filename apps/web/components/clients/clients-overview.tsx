'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Copy, Mail, MapPin, PencilLine, Phone, Plus, Search, Trash2 } from 'lucide-react';
import {
  useClients,
  useCreateClient,
  useUpdateClient,
  useCloneClient,
  useDeleteClient,
} from '@/lib/api/hooks';
import { CLIENT_INDUSTRIES, mapClientsForUi } from '@/lib/clients';
import { convertCurrencyAmount, formatCurrency } from '@/lib/utils';
import { useDisplaySettings } from '@/components/providers/display-settings-provider';
import { useSession } from '@/components/providers/session-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell, DataRow, DataTable } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

type ClientFormState = {
  legalName: string;
  commercialName: string;
  rfc: string;
  address: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
};

const emptyForm: ClientFormState = {
  legalName: '',
  commercialName: '',
  rfc: '',
  address: '',
  industry: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  contactRole: '',
};

export function ClientsOverview() {
  const { user } = useSession();
  const { displayCurrency, exchangeRate } = useDisplaySettings();
  const canManageClients = user.displayRole !== 'VIEWER';
  const canDelete = user.displayRole === 'ADMIN';
  const clientsQuery = useClients();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const cloneClientMutation = useCloneClient();
  const deleteClientMutation = useDeleteClient();

  const clients = useMemo(
    () => (clientsQuery.data ? mapClientsForUi(clientsQuery.data) : []),
    [clientsQuery.data],
  );

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | 'clone' | 'delete' | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [showToast, setShowToast] = useState<null | { title: string; description: string }>(null);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return clients;
    }

    return clients.filter((client) => {
      const haystacks = [
        client.legalName,
        client.commercialName,
        client.rfc,
        client.address,
        ...client.contacts.flatMap((contact) => [contact.name, contact.email, contact.phone, contact.role]),
      ];

      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [clients, query]);

  function clientRevenue(client: (typeof clients)[number]) {
    return client.quotations.reduce(
      (sum, quotation) =>
        sum + convertCurrencyAmount(quotation.total, quotation.currency, displayCurrency, exchangeRate),
      0,
    );
  }

  const selectedClient =
    filteredClients.find((client) => client.id === selectedClientId) ||
    clients.find((client) => client.id === selectedClientId) ||
    filteredClients[0] ||
    null;

  useEffect(() => {
    if (!filteredClients.length) {
      setSelectedClientId(null);
      return;
    }

    if (!selectedClientId || !filteredClients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [filteredClients, selectedClientId]);

  function openCreate() {
    setMode('create');
    setSelectedClientId(null);
    setForm(emptyForm);
  }

  function openEdit(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const mainContact = client.contacts[0];

    setMode('edit');
    setSelectedClientId(clientId);
    setForm({
      legalName: client.legalName,
      commercialName: client.commercialName,
      rfc: client.rfc,
      address: client.address,
      industry: client.industry,
      contactName: mainContact?.name || '',
      contactEmail: mainContact?.email === 'Sin correo' ? '' : mainContact?.email || '',
      contactPhone: mainContact?.phone || '',
      contactRole: mainContact?.role === 'Sin cargo' ? '' : mainContact?.role || '',
    });
  }

  function openClone(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    setMode('clone');
    setSelectedClientId(clientId);
    setForm({
      legalName: `${client.legalName} copia`,
      commercialName: client.commercialName,
      rfc: '',
      address: client.address,
      industry: client.industry,
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      contactRole: '',
    });
  }

  function openDelete(clientId: string) {
    setMode('delete');
    setSelectedClientId(clientId);
  }

  function closeModal() {
    setMode(null);
  }

  function notify(title: string, description: string) {
    setShowToast({ title, description });
    window.setTimeout(() => setShowToast(null), 2500);
  }

  async function submitForm() {
    if (mode === 'create') {
      await createClientMutation.mutateAsync({
        legalName: form.legalName,
        commercialName: form.commercialName || undefined,
        rfc: form.rfc,
        address: form.address || undefined,
        industry: form.industry || undefined,
        contacts: [
          {
            fullName: form.contactName,
            email: form.contactEmail || undefined,
            phone: form.contactPhone || undefined,
            position: form.contactRole || undefined,
          },
        ],
      });

      closeModal();
      setForm(emptyForm);
      notify('Cliente creado', 'La cuenta ya está disponible para generar cotizaciones.');
      return;
    }

    if (mode === 'edit' && selectedClientId) {
      await updateClientMutation.mutateAsync({
        id: selectedClientId,
        legalName: form.legalName,
        commercialName: form.commercialName || undefined,
        rfc: form.rfc,
        address: form.address || undefined,
        industry: form.industry || undefined,
        contacts: [
          {
            fullName: form.contactName,
            email: form.contactEmail || undefined,
            phone: form.contactPhone || undefined,
            position: form.contactRole || undefined,
          },
        ],
      });

      closeModal();
      notify('Cliente actualizado', 'Si cambiaste el nombre del contacto principal, el anterior se conservó como historial de la empresa.');
      return;
    }

    if (mode === 'clone' && selectedClientId) {
      await cloneClientMutation.mutateAsync({
        id: selectedClientId,
        legalName: form.legalName,
        commercialName: form.commercialName || undefined,
        rfc: form.rfc,
        address: form.address || undefined,
      });

      closeModal();
      notify('Cliente duplicado', 'Se creo una copia del cliente.');
    }
  }

  async function confirmDelete() {
    if (!selectedClientId) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para borrar este cliente');
    if (!password) {
      return;
    }

    await deleteClientMutation.mutateAsync({ id: selectedClientId, password });
    closeModal();
    notify('Cliente eliminado', 'El cliente ya no aparece en el catalogo activo.');
  }

  if (user.displayRole === 'VIEWER') {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Tu rol actual solo puede consultar tableros y reportes. La gestión de clientes requiere un usuario editor o administrador.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (clientsQuery.isLoading) {
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

  if (clientsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar clientes.</p>
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

      <SectionHeading
        eyebrow="Clientes"
        title="Vista CRM de cuentas"
        description="Lista operativa a la izquierda y contexto comercial a la derecha para editar cuentas sin perder foco."
        action={canManageClients ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        ) : undefined}
      />

      {!clients.length ? (
        <Card>
          <CardContent className="py-16">
            <div className="mx-auto max-w-xl text-center">
              <Building2 className="mx-auto h-8 w-8 text-[var(--color-primary)]" />
              <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">
                Aun no tienes clientes
              </h3>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Crea tu primer cliente para usarlo al generar cotizaciones.
              </p>
              {canManageClients ? (
                <div className="mt-6">
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Crear primer cliente
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardContent className="py-5">
                  <p className="text-sm text-[var(--color-text-muted)]">Cuentas activas</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{clients.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5">
                  <p className="text-sm text-[var(--color-text-muted)]">Revenue acumulado</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                    {formatCurrency(clients.reduce((sum, client) => sum + clientRevenue(client), 0), displayCurrency)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5">
                  <p className="text-sm text-[var(--color-text-muted)]">Cotizaciones activas</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                    {clients.reduce((sum, client) => sum + client.activeQuotations, 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Base de clientes"
                description="Busca por empresa, RFC, contacto o correo. La fila seleccionada actualiza el panel lateral."
              />
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-10"
                      placeholder="Buscar cuenta, RFC o contacto"
                    />
                  </div>
                  <div className="flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 text-sm text-[var(--color-text-muted)]">
                    {filteredClients.length} cuentas visibles
                  </div>
                </div>

                <DataTable columns={['Cuenta', 'RFC', 'Industria', 'Contacto principal', 'Cotizaciones', 'Revenue']}>
                  {filteredClients.map((client) => {
                    const mainContact = client.contacts[0];
                    const selected = client.id === selectedClient?.id;

                    return (
                      <DataRow
                        key={client.id}
                        interactive
                        onClick={() => setSelectedClientId(client.id)}
                        className={selected ? 'bg-[var(--color-panel-subtle)]' : undefined}
                      >
                        <DataCell>
                          <div className="w-full text-left">
                            <p className="font-medium">{client.legalName}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{client.segment}</p>
                          </div>
                        </DataCell>
                        <DataCell>{client.rfc || 'Sin RFC'}</DataCell>
                        <DataCell>{client.industry || 'Sin definir'}</DataCell>
                        <DataCell>
                          <div>
                            <p className="font-medium">{mainContact?.name || 'Sin contacto'}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{mainContact?.email || 'Sin correo'}</p>
                          </div>
                        </DataCell>
                        <DataCell>
                          <Badge variant="info">{client.activeQuotations} activos</Badge>
                        </DataCell>
                        <DataCell className="font-medium">{formatCurrency(clientRevenue(client), displayCurrency)}</DataCell>
                      </DataRow>
                    );
                  })}
                </DataTable>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit xl:sticky xl:top-24">
            {selectedClient ? (
              <>
                <CardHeader
                  title={selectedClient.legalName}
                  description={`${selectedClient.industry || 'Industria sin definir'} · ${selectedClient.rfc || 'Sin RFC'}`}
                  action={<Badge variant="info">{selectedClient.activeQuotations} cotizaciones</Badge>}
                />
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                      <p className="text-sm text-[var(--color-text-muted)]">Revenue acumulado</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{formatCurrency(clientRevenue(selectedClient), displayCurrency)}</p>
                    </div>
                    <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                      <p className="text-sm text-[var(--color-text-muted)]">Contactos registrados</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedClient.contacts.length}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--color-border)] p-4">
                    <p className="text-sm font-medium text-[var(--color-text)]">Dirección fiscal</p>
                    <div className="mt-3 flex items-start gap-3 text-sm text-[var(--color-text-muted)]">
                      <MapPin className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" />
                      <p>{selectedClient.address || 'Sin dirección registrada'}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[var(--color-text)]">Contactos</p>
                    {selectedClient.contacts.map((contact) => (
                      <div
                        key={`${contact.id}-${contact.email}-${contact.name}`}
                        className="rounded-2xl border border-[var(--color-border)] px-4 py-3"
                      >
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-[var(--color-text-muted)]">{contact.role}</p>
                        <div className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-[var(--color-primary)]" />
                            <span>{contact.email || 'Sin correo'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-[var(--color-primary)]" />
                            <span>{contact.phone || 'Sin teléfono'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canManageClients ? (
                      <Button variant="secondary" size="sm" onClick={() => openEdit(selectedClient.id)}>
                        <PencilLine className="h-4 w-4" />
                        Editar
                      </Button>
                    ) : null}
                    {canManageClients ? (
                      <Button variant="secondary" size="sm" onClick={() => openClone(selectedClient.id)}>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button variant="ghost" size="sm" onClick={() => openDelete(selectedClient.id)}>
                        <Trash2 className="h-4 w-4" />
                        Borrar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="py-16">
                <div className="text-center">
                  <Building2 className="mx-auto h-8 w-8 text-[var(--color-primary)]" />
                  <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                    No hay una cuenta seleccionada para mostrar en el panel.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={mode === 'create' || mode === 'edit' || mode === 'clone'}
        onClose={closeModal}
        title={
          mode === 'create'
            ? 'Nuevo cliente'
            : mode === 'edit'
              ? 'Editar cliente'
              : 'Copiar cliente'
        }
        description="La empresa y su contacto principal quedaran disponibles para el equipo comercial."
        className="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-[28px] border border-[var(--color-border)] bg-white p-5">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Datos de la empresa</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Captura la razón social, RFC y dirección de la cuenta.
                </p>
              </div>
              <Input value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} placeholder="Razón social" />
              <Input value={form.commercialName} onChange={(event) => setForm((current) => ({ ...current, commercialName: event.target.value }))} placeholder="Nombre comercial opcional" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={form.rfc} onChange={(event) => setForm((current) => ({ ...current, rfc: event.target.value }))} placeholder="RFC" />
                <Input value={form.contactRole} onChange={(event) => setForm((current) => ({ ...current, contactRole: event.target.value }))} placeholder="Puesto del contacto" disabled={mode === 'clone'} />
              </div>
              <Select value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))}>
                <option value="">Industria (sin definir)</option>
                {CLIENT_INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </Select>
              <Textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Dirección opcional" className="min-h-[160px]" />
            </div>
            <div className="space-y-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-5">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text)]">Contacto principal</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Este contacto quedará listo para usarse en cotizaciones y seguimiento comercial. Si cambias el nombre al editar, el contacto anterior se conservará.
                </p>
              </div>
              {mode === 'clone' ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-[var(--color-text-muted)]">
                  Se copiará el cliente con sus contactos. Solo necesitas un nuevo nombre y RFC.
                </div>
              ) : (
                <>
                  <Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Nombre completo" />
                  <div className="grid gap-3">
                    <Input value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="Email opcional" />
                    <Input value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="Teléfono opcional" />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              onClick={submitForm}
              disabled={
                createClientMutation.isPending ||
                updateClientMutation.isPending ||
                cloneClientMutation.isPending ||
                !form.legalName.trim() ||
                !form.rfc.trim() ||
                (mode !== 'clone' && !form.contactName.trim())
              }
            >
              {mode === 'create' ? 'Crear cliente' : mode === 'edit' ? 'Guardar cambios' : 'Copiar cliente'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={mode === 'delete'}
        onClose={closeModal}
        title="Borrar cliente"
        description="El borrado es lógico. Las cotizaciones históricas no se alteran."
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-[rgba(239,68,68,0.06)] p-4 text-sm text-[var(--color-text-muted)]">
            Se ocultara del catalogo activo el cliente {selectedClient?.legalName || ''}.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteClientMutation.isPending}>
              Borrar cliente
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

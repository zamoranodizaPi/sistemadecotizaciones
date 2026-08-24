'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useCompanyProfile, useUpdateCompanyProfile } from '@/lib/api/hooks';
import { resolveCompanyBrandName, resolveCompanyLogo, resolveCompanyTagline } from '@/lib/company-brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

export function CompanySettingsWorkspace() {
  const profileQuery = useCompanyProfile();
  const updateMutation = useUpdateCompanyProfile();
  const [toast, setToast] = useState<null | { title: string; description: string }>(null);
  const [form, setForm] = useState({
    legalName: '',
    commercialName: '',
    brandShortName: '',
    tagline: '',
    logoUrl: '',
    rfc: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: 'MX',
    defaultDurationOfWork: '',
    defaultTerms: '',
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setForm({
      legalName: profileQuery.data.legalName || '',
      commercialName: profileQuery.data.commercialName || '',
      brandShortName: profileQuery.data.brandShortName || '',
      tagline: profileQuery.data.tagline || '',
      logoUrl: profileQuery.data.logoUrl || '',
      rfc: profileQuery.data.rfc || '',
      email: profileQuery.data.email || '',
      phone: profileQuery.data.phone || '',
      website: profileQuery.data.website || '',
      address: profileQuery.data.address || '',
      city: profileQuery.data.city || '',
      state: profileQuery.data.state || '',
      country: profileQuery.data.country || 'MX',
      defaultDurationOfWork: profileQuery.data.defaultDurationOfWork || '',
      defaultTerms: profileQuery.data.defaultTerms || '',
    });
  }, [profileQuery.data]);

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveProfile() {
    await updateMutation.mutateAsync(form);
    setToast({
      title: 'Empresa actualizada',
      description: 'Los datos comerciales y operativos quedaron guardados.',
    });
    window.setTimeout(() => setToast(null), 2500);
  }

  if (profileQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toast.title} description={toast.description} />
        </div>
      ) : null}

      <SectionHeading
        eyebrow="Configuración"
        title="Mi empresa"
        description="Administra datos fiscales, comerciales y textos base de tu empresa desde una sola sección."
        action={
          <Button onClick={saveProfile} disabled={updateMutation.isPending || !form.legalName.trim()}>
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Identidad comercial"
            description="Estos datos te ayudan a mantener alineado el perfil corporativo en el sistema."
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input value={form.legalName} onChange={(event) => setField('legalName', event.target.value)} placeholder="Razón social" />
              <Input value={form.commercialName} onChange={(event) => setField('commercialName', event.target.value)} placeholder="Nombre comercial" />
              <Input value={form.brandShortName} onChange={(event) => setField('brandShortName', event.target.value)} placeholder="Marca corta" />
              <Input value={form.tagline} onChange={(event) => setField('tagline', event.target.value)} placeholder="Tagline" />
              <Input value={form.logoUrl} onChange={(event) => setField('logoUrl', event.target.value)} placeholder="Ruta del logo, por ejemplo /brand/logo.png" />
              <Input value={form.rfc} onChange={(event) => setField('rfc', event.target.value)} placeholder="RFC" />
              <Input value={form.website} onChange={(event) => setField('website', event.target.value)} placeholder="Sitio web" />
              <Input value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="Correo" />
              <Input value={form.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="Teléfono" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Vista rápida"
            description="Resumen actual de cómo queda presentada tu empresa dentro del sistema."
          />
          <CardContent className="space-y-4">
            <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  <img
                    src={resolveCompanyLogo(form)}
                    alt={resolveCompanyBrandName(form)}
                    className="h-9 w-9 object-contain"
                  />
                </div>
                <div>
                  <p className="text-base font-semibold text-[var(--color-text)]">{resolveCompanyBrandName(form)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">{resolveCompanyTagline(form)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-[var(--color-text-muted)]">
                <p>{form.legalName || 'Sin razón social'}</p>
                <p>{form.rfc || 'Sin RFC'}</p>
                <p>{form.email || 'Sin correo'} {form.phone ? `· ${form.phone}` : ''}</p>
                <p>{form.logoUrl || 'Sin ruta de logo capturada'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Ubicación y textos operativos"
          description="Úsalo para mantener dirección y textos base que luego pueden alimentar procesos comerciales."
        />
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Input value={form.address} onChange={(event) => setField('address', event.target.value)} placeholder="Dirección" />
            <Input value={form.city} onChange={(event) => setField('city', event.target.value)} placeholder="Ciudad" />
            <Input value={form.state} onChange={(event) => setField('state', event.target.value)} placeholder="Estado" />
            <Input value={form.country} onChange={(event) => setField('country', event.target.value)} placeholder="País" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Duración de trabajo por defecto</p>
            <Textarea
              value={form.defaultDurationOfWork}
              onChange={(event) => setField('defaultDurationOfWork', event.target.value)}
              className="min-h-[120px]"
              placeholder="Texto base para duración de trabajos"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Términos por defecto</p>
            <Textarea
              value={form.defaultTerms}
              onChange={(event) => setField('defaultTerms', event.target.value)}
              className="min-h-[180px]"
              placeholder="Texto base de términos y condiciones"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

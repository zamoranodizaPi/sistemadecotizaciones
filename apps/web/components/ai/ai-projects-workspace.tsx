'use client';

import { Bot, CheckCircle2, Cpu, Download, FilePlus2, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  useAiProyecto,
  useClients,
  useConvertAiProyectoToQuotation,
  useGenerateAiProyectoPdf,
  useSaveAiProyectoTraining,
} from '@/lib/api/hooks';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

export function AiProjectsWorkspace() {
  const router = useRouter();
  const aiProyectoMutation = useAiProyecto();
  const clientsQuery = useClients();
  const convertMutation = useConvertAiProyectoToQuotation();
  const pdfMutation = useGenerateAiProyectoPdf();
  const saveTrainingMutation = useSaveAiProyectoTraining();

  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [sector, setSector] = useState('Industrial');
  const [nivelComplejidad, setNivelComplejidad] = useState('');
  const [complejidad, setComplejidad] = useState<'bajo' | 'medio' | 'alto'>('medio');
  const [zona, setZona] = useState<'urbano' | 'industrial' | 'remoto'>('industrial');
  const [urgencia, setUrgencia] = useState<'normal' | 'urgente'>('normal');
  const [margen, setMargen] = useState('1.3');
  const [quotationClientId, setQuotationClientId] = useState('');
  const [quotationCurrency, setQuotationCurrency] = useState<'USD' | 'MXN'>('USD');
  const [descripcion, setDescripcion] = useState('');
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  const proyecto = aiProyectoMutation.data?.proyecto;
  const totalProyecto = useMemo(() => {
    if (!proyecto) {
      return 0;
    }

    return proyecto.soluciones.reduce(
      (solutionSum, solution) =>
        solutionSum +
        solution.componentes.reduce(
          (componentSum, component) =>
            componentSum + Number(component.costoBase || 0) * Number(component.cantidad || 1),
          0,
        ),
      0,
    );
  }, [proyecto]);

  async function generarProyecto() {
    if (!descripcion.trim() || !sector.trim()) {
      return;
    }

    try {
      await aiProyectoMutation.mutateAsync({
        nombre: nombre.trim() || undefined,
        cliente: cliente.trim() || undefined,
        sector: sector.trim(),
        descripcion: descripcion.trim(),
        nivelComplejidad: nivelComplejidad.trim() || undefined,
        condiciones: {
          complejidad,
          zona,
          urgencia,
          margen: margen.trim() ? Number(margen) : undefined,
        },
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible generar el proyecto',
        description: error instanceof Error ? error.message : 'La generación del proyecto falló.',
      });
    }
  }

  async function guardarComoTraining() {
    if (!aiProyectoMutation.data) {
      return;
    }

    try {
      await saveTrainingMutation.mutateAsync({
        input: aiProyectoMutation.data.input,
        output: {
          proyecto: aiProyectoMutation.data.proyecto.nombre,
          soluciones: aiProyectoMutation.data.proyecto.soluciones.map((solution) => ({
              tipo: solution.tipo,
              incluyeIngenieria: solution.incluyeIngenieria,
              incluyeInstalacion: solution.incluyeInstalacion,
              incluyePuestaMarcha: solution.incluyePuestaMarcha,
              incluyeMantenimiento: solution.incluyeMantenimiento,
              componentes: solution.componentes.map((component) => ({
                tipo: component.tipo,
                nombre: component.nombre,
                marca: component.marca,
                categoria: component.categoria,
                costoBase: Number(component.costoBase),
                cantidad: Number(component.cantidad),
              })),
            })),
            costos: aiProyectoMutation.data.costos,
        },
        aceptado: true,
      });

      setToastMessage({
        title: 'Ejemplo guardado',
        description: 'El proyecto quedó registrado como training aceptado.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible guardar el training',
        description: error instanceof Error ? error.message : 'El guardado del ejemplo falló.',
      });
    }
  }

  async function convertirACotizacion() {
    if (!proyecto || !quotationClientId) {
      return;
    }

    try {
      const response = await convertMutation.mutateAsync({
        proyectoId: proyecto.id,
        clientId: quotationClientId,
        title: proyecto.nombre,
        currency: quotationCurrency,
      });

      setToastMessage({
        title: 'Cotización creada',
        description: `Se generó la cotización ${response.folio} con ${response.matchedItems} concepto(s) del catálogo.`,
      });
      router.push(`/quotations?selected=${response.quotationId}`);
    } catch (error) {
      setToastMessage({
        title: 'No fue posible convertir el proyecto',
        description: error instanceof Error ? error.message : 'La conversión a cotización falló.',
      });
    }
  }

  async function descargarPdfTecnico() {
    if (!proyecto) {
      return;
    }

    try {
      const response = await pdfMutation.mutateAsync(proyecto.id);
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${response.file}`;
      link.download = response.fileName;
      link.click();
    } catch (error) {
      setToastMessage({
        title: 'No fue posible generar el PDF',
        description: error instanceof Error ? error.message : 'La exportación del PDF técnico falló.',
      });
    }
  }

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastMessage.title} description={toastMessage.description} />
        </div>
      ) : null}

      <SectionHeading
        eyebrow="Asistente Inteligente"
        title="Proyectos IA"
        description="Genera soluciones completas de ingeniería eléctrica industrial con materiales, marcas, instalación, puesta en marcha y mantenimiento."
        action={
          <Button onClick={generarProyecto} disabled={aiProyectoMutation.isPending || !descripcion.trim() || !sector.trim()}>
            <Sparkles className="h-4 w-4" />
            Generar proyecto
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Solicitud del proyecto"
          description="Describe el alcance del proyecto. El motor buscará ejemplos similares y generará una solución de ingeniería estructurada."
        />
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre del proyecto" />
            <Input value={cliente} onChange={(event) => setCliente(event.target.value)} placeholder="Cliente" />
            <Input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Sector" />
            <Input value={nivelComplejidad} onChange={(event) => setNivelComplejidad(event.target.value)} placeholder="Complejidad sugerida (opcional)" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Select value={complejidad} onChange={(event) => setComplejidad(event.target.value as 'bajo' | 'medio' | 'alto')}>
              <option value="bajo">Complejidad baja</option>
              <option value="medio">Complejidad media</option>
              <option value="alto">Complejidad alta</option>
            </Select>
            <Select value={zona} onChange={(event) => setZona(event.target.value as 'urbano' | 'industrial' | 'remoto')}>
              <option value="urbano">Zona urbana</option>
              <option value="industrial">Zona industrial</option>
              <option value="remoto">Zona remota</option>
            </Select>
            <Select value={urgencia} onChange={(event) => setUrgencia(event.target.value as 'normal' | 'urgente')}>
              <option value="normal">Urgencia normal</option>
              <option value="urgente">Urgente</option>
            </Select>
            <Input value={margen} onChange={(event) => setMargen(event.target.value)} placeholder="Margen 1.2 - 1.4" />
          </div>
          <Textarea
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
            rows={6}
            placeholder="Ejemplo: Diseño e instalación de sistema de distribución eléctrica en nave industrial con múltiples líneas de producción"
          />
        </CardContent>
      </Card>

      {aiProyectoMutation.isPending ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {proyecto ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={proyecto.nombre}
              description={`${proyecto.cliente} · ${proyecto.sector} · Complejidad ${proyecto.complejidad}`}
            />
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                    <Bot className="h-4 w-4" />
                    Motor {aiProyectoMutation.data?.engine === 'openai' ? 'OpenAI' : 'Reglas locales'}
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">{proyecto.descripcion}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--color-text-muted)]">Costo estimado del proyecto</p>
                  <p className="text-2xl font-semibold text-[var(--color-text)]">{formatCurrency(aiProyectoMutation.data?.costos.total_final || totalProyecto, 'USD')}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Materiales</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{formatCurrency(aiProyectoMutation.data?.costos.materiales || 0, 'USD')}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Mano de obra</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{formatCurrency(aiProyectoMutation.data?.costos.mano_obra || 0, 'USD')}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Costo base</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{formatCurrency(aiProyectoMutation.data?.costos.costo_base || 0, 'USD')}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Margen aplicado</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{aiProyectoMutation.data?.costos.margen?.toFixed(2) || '1.30'}x</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <p className="text-sm font-semibold text-[var(--color-text)]">Factores dinámicos</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-[var(--color-text-muted)]">
                  <p>Complejidad: <span className="font-medium text-[var(--color-text)]">{aiProyectoMutation.data?.costos.factores.complejidad?.toFixed(2) || '1.20'}x</span></p>
                  <p>Zona: <span className="font-medium text-[var(--color-text)]">{aiProyectoMutation.data?.costos.factores.zona?.toFixed(2) || '1.00'}x</span></p>
                  <p>Urgencia: <span className="font-medium text-[var(--color-text)]">{aiProyectoMutation.data?.costos.factores.urgencia?.toFixed(2) || '1.00'}x</span></p>
                </div>
                {aiProyectoMutation.data?.similares?.length ? (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">Ejemplos que influyeron en costo</p>
                    <div className="mt-3 space-y-2">
                      {aiProyectoMutation.data.similares.slice(0, 3).map((item) => (
                        <div key={item.id} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--color-text)]">{item.id}</span>
                            <div className="text-right text-[var(--color-text-muted)]">
                              <div>similitud {Math.round(item.score * 100)}%</div>
                              <div>influencia costo {item.costInfluence?.toFixed(1) || '0.0'}%</div>
                            </div>
                          </div>
                          {item.costSignals?.length ? (
                            <p className="mt-2 text-[var(--color-text-muted)]">{item.costSignals.join(' · ')}</p>
                          ) : (
                            <p className="mt-2 text-[var(--color-text-muted)]">Influencia semántica general.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={guardarComoTraining} disabled={saveTrainingMutation.isPending}>
                  <Save className="h-4 w-4" />
                  Guardar como training aceptado
                </Button>
                <Button type="button" variant="secondary" onClick={descargarPdfTecnico} disabled={pdfMutation.isPending}>
                  <Download className="h-4 w-4" />
                  Exportar PDF técnico
                </Button>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <p className="text-sm font-semibold text-[var(--color-text)]">Convertir a cotización comercial</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Selecciona el cliente de la cuenta comercial. El sistema intentará mapear componentes al catálogo y dejará el resto en secciones por validar.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_140px_auto]">
                  <Select value={quotationClientId} onChange={(event) => setQuotationClientId(event.target.value)}>
                    <option value="">Selecciona un cliente</option>
                    {(clientsQuery.data || []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.legalName}
                      </option>
                    ))}
                  </Select>
                  <Select value={quotationCurrency} onChange={(event) => setQuotationCurrency(event.target.value as 'USD' | 'MXN')}>
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                  </Select>
                  <Button type="button" onClick={convertirACotizacion} disabled={convertMutation.isPending || !quotationClientId}>
                    <FilePlus2 className="h-4 w-4" />
                    Crear cotización
                  </Button>
                </div>
                {convertMutation.data ? (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                    Cotización creada: <span className="font-medium text-[var(--color-text)]">{convertMutation.data.folio}</span>. Conceptos mapeados: {convertMutation.data.matchedItems}. Componentes pendientes: {convertMutation.data.unmatchedComponents.length}.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {proyecto.soluciones.map((solution) => (
                  <div key={solution.id} className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-[var(--color-text)]">{solution.tipo}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {solution.incluyeIngenieria ? <span className="rounded-full bg-[var(--color-panel-subtle)] px-3 py-1">Ingeniería</span> : null}
                          {solution.incluyeInstalacion ? <span className="rounded-full bg-[var(--color-panel-subtle)] px-3 py-1">Instalación</span> : null}
                          {solution.incluyePuestaMarcha ? <span className="rounded-full bg-[var(--color-panel-subtle)] px-3 py-1">Puesta en marcha</span> : null}
                          {solution.incluyeMantenimiento ? <span className="rounded-full bg-[var(--color-panel-subtle)] px-3 py-1">Mantenimiento</span> : null}
                        </div>
                      </div>
                      <Cpu className="h-5 w-5 text-[var(--color-text-faint)]" />
                    </div>

                    <div className="mt-4 space-y-3">
                      {solution.componentes.map((component) => (
                        <div key={component.id} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-[var(--color-text)]">{component.nombre}</p>
                              <p className="text-sm text-[var(--color-text-muted)]">
                                {component.tipo} · {component.categoria}
                                {component.marca ? ` · ${component.marca}` : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-[var(--color-text)]">{formatCurrency(Number(component.costoBase) * Number(component.cantidad), 'USD')}</p>
                              <p className="text-xs text-[var(--color-text-faint)]">
                                base {Number(component.costoBase)} · cant. {Number(component.cantidad)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <p className="text-sm font-semibold text-[var(--color-text)]">Ejemplos similares usados por el motor</p>
                <div className="mt-3 space-y-2">
                  {aiProyectoMutation.data?.similares.length ? (
                    aiProyectoMutation.data.similares.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm">
                        <div className="flex items-center gap-2 text-[var(--color-text)]">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>{item.id}</span>
                        </div>
                        <span className="text-[var(--color-text-muted)]">
                          similitud {Math.round(item.score * 100)}% {item.aceptado === true ? '· aceptado' : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">No se encontraron ejemplos similares previos.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

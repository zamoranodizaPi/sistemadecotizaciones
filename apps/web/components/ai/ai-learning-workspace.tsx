'use client';

import { Save, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  useAiLearningPrompts,
  useAiLearningTraining,
  useCreateAiLearningPrompt,
  useDeleteAiLearningPrompt,
  useSubmitAiLearningDataset,
  useSubmitAiLearningTraining,
  useUpdateAiLearningPrompt,
  useDeleteAiLearningTraining,
  usePromoteAiLearningTraining,
  useRebuildLearning,
} from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

const defaultPrompt = `Eres un asistente inteligente especializado en servicios eléctricos.

La entrada del entrenamiento debe venir con:
- título del caso
- datos del cliente en JSON

La salida debe ser JSON estructurado con:
- servicios_recomendados
- tareas por servicio
- duracion_horas
- costo_estimado
- notas

No generes texto libre fuera del JSON.`;

const catalogPrompt = `Eres un asistente comercial de cotizaciones tecnicas.

Tu trabajo es mapear la solicitud del cliente contra suministros, servicios y actividades existentes.
Prioriza coincidencia con catalogo, historial y reglas aprendidas.
No inventes conceptos si no existen en catalogo.`;

function presetForMode(mode: 'CATALOG_MATCH' | 'STRUCTURED_JSON') {
  if (mode === 'CATALOG_MATCH') {
    return {
      name: 'Matching operacional con catalogo',
      systemPrompt: catalogPrompt,
      inputExample: 'Servicio a tablero CCM 8 secciones con pruebas completas',
      outputExample: '{\n  "category": "CCM",\n  "service": "pruebas completas",\n  "variables": {"secciones": 8},\n  "suggested_services": ["Pruebas a tablero CCM", "Configuracion de relevador"]\n}',
    };
  }

  return {
    name: 'Mantenimiento preventivo de tableros eléctricos',
    systemPrompt: defaultPrompt,
    inputExample: `titulo: Mantenimiento preventivo de tableros eléctricos

{
  "cliente": "Planta Industrial Acme",
  "sector": "Industrial",
  "descripcion_trabajo": "Se requiere mantenimiento preventivo de todos los tableros eléctricos, revisión de protecciones, limpieza de contactos y pruebas de continuidad.",
  "restricciones": "Trabajo debe realizarse en horario no operativo, dentro de 8 horas."
}`,
    outputExample: `{
  "servicios_recomendados": [
    {
      "servicio": "Inspección y limpieza de tableros",
      "tareas": ["Desmontaje de tapas", "Limpieza de contactos", "Verificación de conexiones"],
      "duracion_horas": 3
    },
    {
      "servicio": "Pruebas de continuidad y medición de aislamiento",
      "tareas": ["Medición con megóhmetro", "Registro de valores", "Revisión de protecciones térmicas"],
      "duracion_horas": 3
    },
    {
      "servicio": "Ajustes y recomendaciones",
      "tareas": ["Ajuste de conexiones flojas", "Reporte de observaciones", "Sugerencias de mantenimiento futuro"],
      "duracion_horas": 2
    }
  ],
  "costo_estimado": {
    "materiales": 200,
    "mano_obra": 800,
    "total": 1000,
    "moneda": "USD"
  },
  "notas": "Se recomienda repetir mantenimiento cada 6 meses para garantizar la seguridad y eficiencia."
}`,
  };
}

type TrainingEntry = {
  id: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  aceptado?: boolean | null;
  createdAt: string;
};

export function AiLearningWorkspace() {
  const promptsQuery = useAiLearningPrompts();
  const createPromptMutation = useCreateAiLearningPrompt();
  const updatePromptMutation = useUpdateAiLearningPrompt();
  const deletePromptMutation = useDeleteAiLearningPrompt();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'CATALOG_MATCH' | 'STRUCTURED_JSON'>('STRUCTURED_JSON');
  const initialPreset = presetForMode('STRUCTURED_JSON');
  const [name, setName] = useState(initialPreset.name);
  const [systemPrompt, setSystemPrompt] = useState(initialPreset.systemPrompt);
  const [inputExample, setInputExample] = useState(initialPreset.inputExample);
  const [outputExample, setOutputExample] = useState(initialPreset.outputExample);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);
  const [freeTrainingJson, setFreeTrainingJson] = useState('');
  const [datasetJson, setDatasetJson] = useState('');
  const deleteTrainingMutation = useDeleteAiLearningTraining();
  const promoteTrainingMutation = usePromoteAiLearningTraining();
  const [deletingTrainingId, setDeletingTrainingId] = useState<string | null>(null);
  const [promotingTrainingId, setPromotingTrainingId] = useState<string | null>(null);
  const [promotedTrainingIds, setPromotedTrainingIds] = useState<string[]>([]);
  const [promotingAll, setPromotingAll] = useState(false);
  const [lastAppliedRuleId, setLastAppliedRuleId] = useState<string | null>(null);

  const prompts = (promptsQuery.data || []).filter((prompt) => prompt.mode === mode);
  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedId) || null,
    [prompts, selectedId],
  );
  const trainingQuery = useAiLearningTraining();
  const rebuildMutation = useRebuildLearning();

  function handleDeleteTraining(id: string) {
    setDeletingTrainingId(id);

    deleteTrainingMutation.mutate(id, {
      onSuccess: () => {
        setToastMessage({
          title: 'Entrenamiento eliminado',
          description: 'El ejemplo ya no aparecerá en la lista.',
        });
      },
      onError: (error) => {
        setToastMessage({
          title: 'Error al eliminar',
          description: error instanceof Error ? error.message : 'No se pudo eliminar el entrenamiento.',
        });
      },
      onSettled: () => setDeletingTrainingId(null),
    });
  }

  function handlePromoteTraining(entry: { input: Record<string, unknown>; output: Record<string, unknown>; id: string }) {
    setPromotingTrainingId(entry.id);
    promoteTrainingMutation.mutate(
      {
        input: entry.input,
        output: entry.output,
        mode: mode,
      },
      {
        onSuccess: () => {
          setToastMessage({
            title: 'Entrenamiento promovido',
            description: 'El asistente lo usará como regla local.',
          });
        },
        onSettled: () => setPromotingTrainingId(null),
      },
    );
    setPromotedTrainingIds((current) => Array.from(new Set([...current, entry.id])));
  }

  useEffect(() => {
    if (!trainingQuery.data?.length) {
      setPromotedTrainingIds([]);
      return;
    }

    setPromotedTrainingIds((prev) =>
      prev.filter((id) => trainingQuery.data?.some((entry) => entry.id === id)),
    );
  }, [trainingQuery.data]);

  function loadPrompt(id: string | null) {
    if (!id) {
      setSelectedId(null);
      const preset = presetForMode(mode);
      setName(preset.name);
      setSystemPrompt(preset.systemPrompt);
      setInputExample(preset.inputExample);
      setOutputExample(preset.outputExample);
      setIsActive(true);
      setSortOrder('0');
      return;
    }

    const prompt = prompts.find((entry) => entry.id === id);
    if (!prompt) {
      return;
    }

    setSelectedId(prompt.id);
    setMode(prompt.mode);
    setName(prompt.name);
    setSystemPrompt(prompt.systemPrompt);
    setInputExample(prompt.inputExample || '');
    setOutputExample(prompt.outputExample || '');
    setIsActive(prompt.isActive);
    setSortOrder(String(prompt.sortOrder));
  }

  async function savePrompt() {
    if (!name.trim() || !systemPrompt.trim()) {
      setToastMessage({
        title: 'Faltan datos',
        description: 'Nombre y prompt base son obligatorios.',
      });
      return;
    }

    try {
      if (selectedId) {
        await updatePromptMutation.mutateAsync({
          id: selectedId,
          name: name.trim(),
          mode,
          systemPrompt: systemPrompt.trim(),
          inputExample: inputExample.trim() || undefined,
          outputExample: outputExample.trim() || undefined,
          isActive,
          sortOrder: Number(sortOrder) || 0,
        });
      } else {
        const created = await createPromptMutation.mutateAsync({
          name: name.trim(),
          mode,
          systemPrompt: systemPrompt.trim(),
          inputExample: inputExample.trim() || undefined,
          outputExample: outputExample.trim() || undefined,
          isActive,
          sortOrder: Number(sortOrder) || 0,
        });

        if (created && typeof created === 'object' && 'id' in created) {
          loadPrompt(String(created.id));
        }
      }

      setToastMessage({
        title: 'Aprendizaje guardado',
        description: 'El prompt quedó disponible para el asistente inteligente.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible guardar',
        description: error instanceof Error ? error.message : 'El guardado del prompt falló.',
      });
    }
  }

  async function removePrompt(id: string) {
    try {
      await deletePromptMutation.mutateAsync(id);
      if (selectedId === id) {
        loadPrompt(null);
      }
      setToastMessage({
        title: 'Prompt eliminado',
        description: 'El entrenamiento fue retirado del asistente.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible eliminar',
        description: error instanceof Error ? error.message : 'La eliminación falló.',
      });
    }
  }

  const freeTrainingMutation = useSubmitAiLearningTraining();
  const datasetMutation = useSubmitAiLearningDataset();

  async function handleFreeTraining() {
    try {
      const parsed = JSON.parse(freeTrainingJson);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Ingresa un JSON válido con campos "input" y "output".');
      }
      if (!parsed.input || !parsed.output) {
        throw new Error('El JSON debe incluir "input" y "output".');
      }

      await freeTrainingMutation.mutateAsync({
        input: parsed.input,
        output: parsed.output,
        aceptado: true,
      });

      promoteTrainingMutation.mutate({
        input: parsed.input,
        output: parsed.output,
        mode: mode,
      });
      setFreeTrainingJson('');
      setToastMessage({
        title: 'Entrenamiento libre registrado',
        description: 'El ejemplo JSON queda guardado para el asistente.',
      });
    } catch (error) {
      setToastMessage({
        title: 'JSON inválido',
        description: error instanceof Error ? error.message : 'Proporciona un JSON válido.',
      });
    }
  }

  async function handleDatasetTraining() {
    try {
      const parsed = JSON.parse(datasetJson);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.trainingDataset)) {
        throw new Error('Ingresa un JSON válido con el array "trainingDataset".');
      }

      await datasetMutation.mutateAsync({
        trainingDataset: parsed.trainingDataset,
      });
      parsed.trainingDataset.forEach((entry: any) => {
        promoteTrainingMutation.mutate({
          input: entry.input,
          output: entry.output,
          mode: mode,
        });
      });
      setDatasetJson('');
      setToastMessage({
        title: 'Dataset guardado',
        description: 'Se registró el conjunto de entrenamiento completo.',
      });
    } catch (error) {
      setToastMessage({
        title: 'JSON inválido',
        description: error instanceof Error ? error.message : 'El JSON debe contener trainingDataset.',
      });
    }
  }

  async function handlePromoteAll() {
    if (!trainingQuery.data?.length) {
      setToastMessage({ title: 'Nada por promover', description: 'No hay ejemplos cargados.' });
      return;
    }

    setPromotingAll(true);
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(
      trainingQuery.data.map((entry: { input: Record<string, unknown>; output: Record<string, unknown> }) =>
        promoteTrainingMutation.mutateAsync({
          input: entry.input,
          output: entry.output,
          mode: mode,
        }),
      ),
    );
    setPromotingAll(false);

    const successCount = results.filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled').length;
    const failureCount = results.length - successCount;
    if (trainingQuery.data?.length) {
      setPromotedTrainingIds(trainingQuery.data.map((entry) => entry.id));
    }
    setToastMessage({
      title: 'Promoción masiva',
      description: `${successCount} ejemplos promovidos${failureCount ? `, ${failureCount} fallaron` : ''}.`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionHeading
          eyebrow="Asistente Inteligente"
          title="Aprendizaje"
          description="Guarda prompts, ejemplos y reglas de instrucción para entrenar al asistente con el lenguaje comercial y técnico de tu operación."
        />
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              rebuildMutation.mutate(undefined, {
                onSuccess: (data) => {
                  setToastMessage({
                    title: 'Aprendizaje reiniciado',
                    description: `Se reconstruyeron ${data.learned} cotizaciones.`,
                  });
                },
                onError: (error) => {
                  setToastMessage({
                    title: 'Error al reiniciar',
                    description:
                      error instanceof Error ? error.message : 'No se pudo borrar el aprendizaje.',
                  });
                },
              })
            }
            disabled={rebuildMutation.isPending}
          >
            {rebuildMutation.isPending ? 'Reiniciando...' : 'Borrar aprendizaje'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader
            title="Prompts activos"
            description="El asistente usa estos bloques como contexto adicional cuando genera sugerencias."
          />
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Button type="button" variant={mode === 'CATALOG_MATCH' ? 'primary' : 'secondary'} onClick={() => { setMode('CATALOG_MATCH'); const preset = presetForMode('CATALOG_MATCH'); setSelectedId(null); setName(preset.name); setSystemPrompt(preset.systemPrompt); setInputExample(preset.inputExample); setOutputExample(preset.outputExample); setIsActive(true); setSortOrder('0'); }}>
                Matching con catálogo
              </Button>
              <Button type="button" variant={mode === 'STRUCTURED_JSON' ? 'primary' : 'secondary'} onClick={() => { setMode('STRUCTURED_JSON'); const preset = presetForMode('STRUCTURED_JSON'); setSelectedId(null); setName(preset.name); setSystemPrompt(preset.systemPrompt); setInputExample(preset.inputExample); setOutputExample(preset.outputExample); setIsActive(true); setSortOrder('0'); }}>
                JSON estructurado
              </Button>
            </div>
            <Button type="button" variant="secondary" className="w-full" onClick={() => loadPrompt(null)}>
              <Sparkles className="h-4 w-4" />
              Nuevo prompt de aprendizaje
            </Button>

            {prompts.length ? (
              prompts.map((prompt) => {
                const active = selectedId === prompt.id;
                return (
                  <div
                    key={prompt.id}
                    className={`rounded-[24px] border p-4 ${active ? 'border-[var(--color-primary)] bg-[var(--color-panel-subtle)]' : 'border-[var(--color-border)] bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadPrompt(prompt.id)}>
                        <div>
                          <p className="font-medium text-[var(--color-text)]">{prompt.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {prompt.isActive ? 'Activo' : 'Inactivo'} · Orden {prompt.sortOrder}
                          </p>
                        </div>
                      </button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removePrompt(prompt.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Aún no hay prompts de aprendizaje guardados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={selectedPrompt ? 'Editar prompt' : 'Nuevo prompt'}
            description="Puedes pegar instrucciones completas, ejemplos de entrada/salida y activar o desactivar cada bloque."
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_140px_140px]">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del prompt" />
              <Input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} placeholder="Orden" />
              <Button type="button" variant={isActive ? 'primary' : 'secondary'} onClick={() => setIsActive((current) => !current)}>
                {isActive ? 'Activo' : 'Inactivo'}
              </Button>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Prompt base</p>
              <Textarea
                className="mt-3"
                rows={12}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="Instrucción principal que guiará al asistente."
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Ejemplo de entrada</p>
              <Textarea
                className="mt-3"
                rows={9}
                value={inputExample}
                onChange={(event) => setInputExample(event.target.value)}
                placeholder='titulo: Mantenimiento preventivo de tableros eléctricos\n\n{ "cliente": "...", "sector": "...", "descripcion_trabajo": "...", "restricciones": "..." }'
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Ejemplo de salida JSON</p>
              <Textarea
                className="mt-3"
                rows={16}
                value={outputExample}
                onChange={(event) => setOutputExample(event.target.value)}
                placeholder='{"servicios_recomendados":[],"costo_estimado":{"materiales":0,"mano_obra":0,"total":0,"moneda":"USD"},"notas":""}'
              />
            </div>

            <Button
              type="button"
              onClick={savePrompt}
              disabled={createPromptMutation.isPending || updatePromptMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Guardar aprendizaje
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Entrenamiento libre"
          description="Pega un JSON con input/output y crea un ejemplo directo para el asistente."
        />
        <CardContent className="space-y-3">
          <Textarea
            value={freeTrainingJson}
            onChange={(event) => setFreeTrainingJson(event.target.value)}
            rows={14}
            placeholder='{"input": {"cliente":"X","descripcion":"..."}, "output": {"servicios_recomendados":[]}}'
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Se espera un objeto con `input` y `output`. Puede incluir cualquier estructura adicional; el sistema lo almacenará como un entrenamiento aceptado.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={handleFreeTraining}
            disabled={freeTrainingMutation.isPending}
          >
            Guardar JSON como entrenamiento
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Entrenamiento por dataset"
          description="Pega un JSON con el array `trainingDataset` y guardalo completo."
        />
        <CardContent className="space-y-3">
          <Textarea
            value={datasetJson}
            onChange={(event) => setDatasetJson(event.target.value)}
            rows={16}
            placeholder='{"trainingDataset":[{"input":{...},"output":{...}}]}'
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Cada entrada del array se almacenará como ejemplo aceptado.
          </p>
          <Button type="button" variant="secondary" onClick={handleDatasetTraining} disabled={datasetMutation.isPending}>
            Guardar dataset completo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Entrenamientos guardados"
          description="Los últimos 20 JSON libres se muestran aquí para revisión."
        />
        <div className="flex justify-end px-6 -mt-6">
          <Button type="button" variant="ghost" size="sm" onClick={handlePromoteAll} disabled={promotingAll || promoteTrainingMutation.isPending}>
            Promocionar todo
          </Button>
        </div>
        <CardContent className="space-y-3">
          {trainingQuery.isLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Cargando ejemplos...</p>
          ) : trainingQuery.data?.length ? (
            <div className="space-y-2">
              {trainingQuery.data.map((entry: TrainingEntry) => {
                const isPromoted = promotedTrainingIds.includes(entry.id);
                return (
                  <div key={entry.id} className="rounded-[20px] border border-[var(--color-border)] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                        {isPromoted && (
                          <span className="text-xs text-emerald-600 font-semibold">Promocionado</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePromoteTraining(entry)}
                          disabled={promoteTrainingMutation.isPending || promotingTrainingId === entry.id || isPromoted}
                        >
                          Promocionar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTraining(entry.id)}
                          disabled={deleteTrainingMutation.isPending || deletingTrainingId === entry.id}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    <details>
                      <summary className="text-sm font-semibold text-[var(--color-text)] cursor-pointer">Ver JSON</summary>
                      <pre className="mt-2 max-h-48 overflow-auto text-[0.72rem] leading-snug text-[var(--color-text-muted)]">
  input: {JSON.stringify(entry.input, null, 2)}
  output: {JSON.stringify(entry.output, null, 2)}
                      </pre>
                      <span className={`text-xs ${entry.aceptado ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {entry.aceptado ? 'Aceptado' : 'Pendiente'}
                      </span>
                    </details>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">No hay ejemplos guardados aún.</p>
          )}
        </CardContent>
      </Card>

      {toastMessage ? (
        <Toast
          title={toastMessage.title}
          description={toastMessage.description}
        />
      ) : null}
    </div>
  );
}

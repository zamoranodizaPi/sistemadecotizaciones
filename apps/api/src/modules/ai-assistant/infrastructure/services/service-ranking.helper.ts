import { stripAccents } from '../../../../shared/domain/text-similarity';
import type { ParsedIntent } from './intent-parsing.service';

/**
 * Funciones puras para rankear/filtrar servicios del catalogo contra una
 * intencion ya parseada. Extraidas de ai-assistant.service.ts (que las tenia
 * como metodos privados) para que ese archivo se enfoque en la orquestacion.
 */

export type RankableService = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  relatedWork: string | null;
  category: { id: string; name: string; code: string };
  pricingProfiles: Array<{
    id: string;
    name: string;
    mxnPrice: unknown;
    usdPrice: unknown;
    versions?: Array<{ mxnPrice?: unknown; usdPrice?: unknown }>;
  }>;
};

export function extractKeywords(value: string): string[] {
  return Array.from(new Set(stripAccents(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2)));
}

export function expandSearchTerms(
  parsed: ParsedIntent,
  input: string,
  suggestedServiceHints: string[],
): string[] {
  const normalizedInput = stripAccents(input);
  const terms = new Set<string>([
    ...extractKeywords(input),
    ...parsed.keywords.map((keyword) => stripAccents(keyword)),
    ...suggestedServiceHints.flatMap((hint) => extractKeywords(hint)),
  ]);

  if (parsed.category) {
    terms.add(stripAccents(parsed.category));
  }

  if (parsed.service) {
    extractKeywords(parsed.service).forEach((term) => terms.add(term));
  }

  if (normalizedInput.includes('pruebas completas')) {
    ['prueba', 'pruebas', 'configuracion', 'reporte', 'reportes'].forEach((term) => terms.add(term));
  }

  if (normalizedInput.includes('tablero')) {
    ['tablero', 'tableros', 'seccion', 'secciones'].forEach((term) => terms.add(term));
  }

  if (normalizedInput.includes('ccm')) {
    ['ccm', 'motor', 'motores'].forEach((term) => terms.add(term));
  }

  if (normalizedInput.includes('minigear') || normalizedInput.includes('34.5')) {
    [
      'minigear',
      'swbg',
      'switchgear',
      'media',
      'tension',
      'relevador',
      'proteccion',
      'aislamiento',
      'contacto',
      'medidor',
      'arco',
      'inyeccion',
      'energizado',
      'vacio',
      'carga',
    ].forEach((term) => terms.add(term));
  }

  if (normalizedInput.includes('puesta en marcha')) {
    ['puesta', 'marcha', 'operacion', 'disparo', 'prueba', 'pruebas'].forEach((term) => terms.add(term));
  }

  return [...terms].filter((term) => term.length > 2);
}

export function isSimpleScopeRequest(normalizedInput: string): boolean {
  return (
    /\b(cambiar|cambio|reemplazo|reemplazar|sustitucion|sustituir|instalar|instalacion|poner)\b/.test(normalizedInput) &&
    /\b(foco|focos|lampara|lamparas|luminaria|luminarias|contacto|contactos|apagador|apagadores|breaker|breakers|interruptor|interruptores)\b/.test(normalizedInput)
  );
}

export function isAdvancedHighComplexityService(haystack: string): boolean {
  return /\b(arco|sel751a|relevador|proteccion|tp|transformacion|inyeccion|subestacion|switchgear|swbg|minigear|media tension|disparo)\b/.test(
    haystack,
  );
}

export function serviceSeemsCompatibleWithIntent(
  parsedService: string,
  haystack: string,
  normalizedInput: string,
): boolean {
  const normalizedService = stripAccents(parsedService);

  if (/\b(mantenimiento|revision|limpieza)\b/.test(normalizedService)) {
    return /\b(mantenimiento|revision|limpieza|inspeccion|apriete)\b/.test(haystack);
  }

  if (/\b(cambio|reemplazo|sustitucion)\b/.test(normalizedInput)) {
    return /\b(cambio|reemplazo|sustitucion|instalacion)\b/.test(haystack);
  }

  if (normalizedService.includes('puesta en marcha')) {
    return /\b(puesta|energizado|operacion|prueba|disparo|carga|vacio)\b/.test(haystack);
  }

  if (normalizedService.includes('pruebas')) {
    return /\b(prueba|pruebas|aislamiento|continuidad|operacion|contacto)\b/.test(haystack);
  }

  return true;
}

export function containsMismatchedDomainTerms(normalizedInput: string, haystack: string): boolean {
  if (/\b(foco|focos|lampara|lamparas|luminaria|luminarias)\b/.test(normalizedInput)) {
    return /\b(arco|relevador|tp|sel751a|subestacion|switchgear|swbg|minigear)\b/.test(haystack);
  }

  if (/\b(contacto|contactos|apagador|apagadores)\b/.test(normalizedInput)) {
    return /\b(arco|tp|sel751a|switchgear|subestacion|minigear)\b/.test(haystack);
  }

  return false;
}

export function rankServices(
  services: RankableService[],
  parsed: ParsedIntent,
  input: string,
  suggestedServiceHints: string[],
): Array<{ service: RankableService; score: number }> {
  const normalizedInput = stripAccents(input);
  const searchTerms = expandSearchTerms(parsed, input, suggestedServiceHints);
  const isSimpleScope = isSimpleScopeRequest(normalizedInput);

  return services
    .map((service) => {
      const haystack = stripAccents(
        [service.code, service.name, service.description || '', service.relatedWork || '', service.category.name, service.category.code].join(' '),
      );

      let score = 0;

      if (parsed.category && haystack.includes(stripAccents(parsed.category))) {
        score += 4;
      }

      if (parsed.service && haystack.includes(stripAccents(parsed.service))) {
        score += 5;
      }

      if (suggestedServiceHints.some((hint) => haystack.includes(stripAccents(hint)))) {
        score += 4.5;
      }

      const tokenMatches = searchTerms.filter((term) => haystack.includes(term)).length;
      score += tokenMatches * 0.9;

      for (const keyword of parsed.keywords) {
        if (haystack.includes(stripAccents(keyword))) {
          score += 1.2;
        }
      }

      if (normalizedInput.includes('pruebas completas') && /prueba|config|reporte/.test(haystack)) {
        score += 2;
      }

      if (
        (normalizedInput.includes('minigear') || normalizedInput.includes('34.5')) &&
        /minigear|switchgear|swbg|relevador|proteccion|tp|medidor|aislamiento|contacto|arco/.test(haystack)
      ) {
        score += 3;
      }

      if (
        normalizedInput.includes('puesta en marcha') &&
        /puesta|energizado|carga|vacio|operacion|inyeccion|disparo/.test(haystack)
      ) {
        score += 2.6;
      }

      if (isSimpleScope && isAdvancedHighComplexityService(haystack)) {
        score -= 6;
      }

      if (parsed.service && !serviceSeemsCompatibleWithIntent(parsed.service, haystack, normalizedInput)) {
        score -= 3.5;
      }

      if (containsMismatchedDomainTerms(normalizedInput, haystack)) {
        score -= 2.8;
      }

      return { service, score };
    })
    .filter((entry) => entry.score > 1.8)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

export function buildServiceFamilyKey(value: string): string {
  const normalized = stripAccents(value)
    .replace(/\b(servicio|suministro|pruebas?|prueba|de|del|para|con|y|tablero|electrico|electrica|electricos|electrica|sistema)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || stripAccents(value);
}

export function dedupeSuggestedItems<
  T extends {
    service: string;
    serviceId: string | null;
    pricingProfileId: string | null;
  },
>(items: T[]): T[] {
  const selected: T[] = [];
  const seenIds = new Set<string>();
  const seenFamilies = new Set<string>();

  for (const item of items) {
    const idKey = item.serviceId || item.pricingProfileId || stripAccents(item.service);
    const familyKey = buildServiceFamilyKey(item.service);

    if (seenIds.has(idKey) || seenFamilies.has(familyKey)) {
      continue;
    }

    seenIds.add(idKey);
    seenFamilies.add(familyKey);
    selected.push(item);
  }

  return selected;
}

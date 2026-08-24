/**
 * Utilidades de normalizacion/similitud de texto compartidas por los modulos
 * de IA (ai-assistant, ai-learning, ai-proyectos), que antes reimplementaban
 * variantes casi identicas de lo mismo por separado.
 */

// Marcas de combinacion (acentos) que quedan sueltas tras normalize('NFD').
const COMBINING_MARKS = /\p{Mark}/gu;

/** Quita acentos y pasa a minusculas. No toca puntuacion ni espacios. */
export function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();
}

/**
 * Normalizacion mas agresiva para comparar/indexar texto libre: acentos
 * fuera, puntuacion reemplazada por espacio, espacios colapsados.
 */
export function normalizeForMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud Jaccard sobre tokens alfanumericos (separa por cualquier caracter no alfanumerico). */
export function jaccardSimilarity(left: string, right: string): number {
  const leftSet = new Set(left.split(/[^a-z0-9]+/).filter(Boolean));
  const rightSet = new Set(right.split(/[^a-z0-9]+/).filter(Boolean));
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size || 1;
  return intersection / union;
}

/**
 * Score de overlap de tokens (largo > 2, separados por espacio simple; se
 * espera texto ya normalizado con `normalizeForMatching`) con boost si
 * ambos textos contienen `brand`. Usado para matching componente/candidato.
 */
export function tokenOverlapScore(component: string, candidate: string, brand: string): number {
  if (!component || !candidate) {
    return 0;
  }

  if (candidate.includes(component) || component.includes(candidate)) {
    return brand && candidate.includes(brand) ? 0.98 : 0.9;
  }

  const componentTokens = new Set(component.split(' ').filter((token) => token.length > 2));
  const candidateTokens = new Set(candidate.split(' ').filter((token) => token.length > 2));
  const overlap = [...componentTokens].filter((token) => candidateTokens.has(token)).length;
  const baseScore = overlap / Math.max(componentTokens.size, 1);

  if (brand && candidate.includes(brand)) {
    return Math.min(1, baseScore + 0.2);
  }

  return baseScore;
}

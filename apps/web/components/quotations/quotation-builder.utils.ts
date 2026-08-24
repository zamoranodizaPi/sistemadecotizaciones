import { formatCurrency } from '@/lib/utils';

// Marcas de combinacion (acentos) que quedan sueltas tras normalize('NFD').
const COMBINING_MARKS = /\p{Mark}/gu;

/**
 * Tipos y funciones puras usados por el wizard de creacion/edicion de
 * cotizaciones. Extraidos de quotation-builder.tsx (que los tenia inline)
 * para separar la logica de datos de la orquestacion de UI/estado.
 */

export type SummaryItem = {
  localId: string;
  serviceId?: string;
  pricingProfileId?: string;
  sourceType: 'SERVICE' | 'ACTIVITY';
  partNumber: number;
  partQuantity: number;
  code: string;
  name: string;
  relatedWork?: string;
  quantity: number;
  days: number;
  price: number;
  category: string;
  currency: 'MXN' | 'USD';
  pricingProfileName: string;
  priceOriginCurrency: 'MXN' | 'USD';
  priceInput: string;
  basePrice: number;
  priceOverridden: boolean;
  isOptional?: boolean;
  optionGroup?: string;
  optionLabel?: string;
};

export type CommercialSection = {
  title: string;
  content: string;
};

export type PartDefinition = {
  partNumber: number;
  title: string;
  quantity: number;
};

export type PercentageConsideration = {
  localId: string;
  type: 'PERCENTAGE';
  concept: string;
  mode: 'PERCENTAGE' | 'FIXED';
  quantity: string;
  percentage: string;
  mxnAmount: string;
  usdAmount: string;
};

export type TravelConsideration = {
  localId: string;
  type: 'TRAVEL';
  location: string;
  mxnAmount: string;
  usdAmount: string;
};

export type SpecialConsideration = PercentageConsideration | TravelConsideration;

export function createLocalId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSummaryItemKey(item: Pick<SummaryItem, 'sourceType' | 'partNumber' | 'code' | 'pricingProfileId' | 'currency'>) {
  return `${item.sourceType}-P${item.partNumber}-${item.code}-${item.pricingProfileId || 'manual'}-${item.currency}`;
}

export function getItemLineTotal(item: Pick<SummaryItem, 'price' | 'quantity' | 'days' | 'sourceType' | 'partQuantity'>) {
  return item.price * item.quantity * (item.sourceType === 'ACTIVITY' ? item.days : 1) * item.partQuantity;
}

export function isActivityConcept(input: {
  code?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
}) {
  return (
    input.categoryCode === 'ACT' ||
    String(input.code || '').toUpperCase().startsWith('ACT-') ||
    String(input.categoryName || '').trim().toLowerCase() === 'actividades'
  );
}

export function normalizeConceptName(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export function getNextActivityCode(catalogServices: Array<{ code?: string | null }>) {
  const maxSequence = catalogServices
    .map((service) => service.code)
    .map((code) => Number(String(code || '').toUpperCase().replace(/^ACT-/, '')))
    .filter((value) => Number.isFinite(value))
    .reduce((max, current) => Math.max(max, current), 0);

  return `ACT-${String(maxSequence + 1).padStart(2, '0')}`;
}

export function isDerivedSpecialConsiderationItem(input: {
  code?: string | null;
  categoryName?: string | null;
}) {
  const normalizedCode = String(input.code || '').trim().toUpperCase();
  return ['ADICIONAL', 'VIATICOS'].includes(normalizedCode);
}

export function formatPercentageLabel(value: number) {
  return `${Number(value.toFixed(2)).toString().replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}%`;
}

export function normalizeDecimalInput(raw: string) {
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

export function truncateToTwoDecimals(value: number) {
  return Math.trunc(value * 100) / 100;
}

export function parseFormattedDecimal(value: string) {
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

export function formatMoneyInputDisplay(value: string, currency: 'MXN' | 'USD') {
  const parsed = parseFormattedDecimal(value);
  if (parsed === null) {
    return '';
  }

  return formatCurrency(parsed, currency);
}

export function formatEditableMoney(value: number, currency: 'MXN' | 'USD') {
  return formatCurrency(truncateToTwoDecimals(value), currency);
}

export const DEFAULT_COMMERCIAL_SECTIONS: CommercialSection[] = [
  {
    title: 'Trabajos a realizar:',
    content: '',
  },
  {
    title: 'Duracion de los trabajos:',
    content:
      'Una vez autorizado este presupuesto y colocada la orden por escrito a SISTEMAS ELECTRICOS ZARAGOZA S. A DE C. V. (SIEZA), el tiempo de realización es de:\nEl tiempo estimado es de 6 días en sitio, dependiendo de las facilidades de las instalaciones',
  },
  {
    title: 'Notas importantes:',
    content:
      '-La presente representa nuestra interpretación a sus requerimientos sobre la base de la información que nos proporcionaron y el alcance de suministro se limita a lo descrito en la\npresente oferta, cualquier desviación o equipo adicional, requerirá de una negociación del precio y tiempo de entrega cotizados.\n-No se contempla la reparación ni el refaccionamiento de ningún tipo, de ser necesario será cotizado por separado.\n-Se requiere de una orden de compra y el anticipo correspondiente previo al inicio de los trabajos.\n-Se consideran los viáticos del personal para este servicio, incluyendo la entrega de reportes de campo.\n-Nuestros equipos de pruebas cuentan con Protocolo de pruebas de laboratorio certificado, se entrega copia conjuntamente con los reportes.\n-Confirmar con al menos 5 días de anticipación\n-Todo atraso no imputable a SIEZA se cobrará a razón de $15,000.00 pesos por día. Por el grupo de personal considerado (1 Ingeniero y 1 Técnico)\n-Se entregará copia de los reportes de campo al concluir el servicio, y una semana después, se enviará la carpeta con todos los reportes, incluyendo el fotográfico.',
  },
  {
    title: 'Precios y validez:',
    content: 'Los precios tienen una validez de 30 días.',
  },
  {
    title: 'CONDICIONES DE PAGO:',
    content: '100 % a 90 días después de concluir el servicio.',
  },
];

export const PARTS_METADATA_SECTION_TITLE = '__PARTS_METADATA__';
export const WORK_ITEMS_METADATA_SECTION_TITLE = '__WORK_ITEMS_METADATA__';

export function buildDefaultCommercialSections(company?: {
  legalName?: string | null;
  commercialName?: string | null;
  brandShortName?: string | null;
  defaultDurationOfWork?: string | null;
  defaultTerms?: string | null;
}) {
  const issuerName = company?.legalName || 'SISTEMAS ELECTRICOS ZARAGOZA S. A DE C. V. (SIEZA)';
  const shortName = company?.brandShortName || company?.commercialName || 'SIEZA';

  return DEFAULT_COMMERCIAL_SECTIONS.map((section) => {
    if (section.title === 'Duracion de los trabajos:') {
      return {
        ...section,
        content:
          company?.defaultDurationOfWork?.trim() ||
          `Una vez autorizado este presupuesto y colocada la orden por escrito a ${issuerName}, el tiempo de realización es de:\nEl tiempo estimado es de 6 días en sitio, dependiendo de las facilidades de las instalaciones`,
      };
    }

    if (section.title === 'Notas importantes:') {
      return {
        ...section,
        content: company?.defaultTerms?.trim() || section.content.replaceAll('SIEZA', shortName),
      };
    }

    return section;
  });
}

export function normalizeSectionTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();
}

export function normalizeCommercialSections(sections: CommercialSection[]) {
  const byTitle = new Map(
    sections.map((section) => [normalizeSectionTitle(section.title), section] as const),
  );

  const orderedBase = DEFAULT_COMMERCIAL_SECTIONS.map((defaultSection) => {
    const current = byTitle.get(normalizeSectionTitle(defaultSection.title));
    return {
      title: current?.title || defaultSection.title,
      content: current?.content || defaultSection.content,
    };
  });

  const extras = sections.filter((section) => {
    const normalized = normalizeSectionTitle(section.title);
    return !DEFAULT_COMMERCIAL_SECTIONS.some(
      (defaultSection) => normalizeSectionTitle(defaultSection.title) === normalized,
    );
  });

  return [...orderedBase, ...extras];
}

export function isPartsMetadataSection(section: CommercialSection) {
  return section.title === PARTS_METADATA_SECTION_TITLE;
}

export function isWorkItemsMetadataSection(section: CommercialSection) {
  return section.title === WORK_ITEMS_METADATA_SECTION_TITLE;
}

export function isInternalMetadataSection(section: CommercialSection) {
  return isPartsMetadataSection(section) || isWorkItemsMetadataSection(section);
}

export function stripInternalMetadata(sections: CommercialSection[]) {
  return sections.filter((section) => !isInternalMetadataSection(section));
}

export function buildPartDefinitions(
  count: number,
  quantities: Record<number, number>,
  titles: Record<number, string>,
) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const partNumber = index + 1;
    return {
      partNumber,
      title: titles[partNumber] || '',
      quantity: Math.max(1, quantities[partNumber] || 1),
    };
  });
}

export function serializePartDefinitionsSection(partDefinitions: PartDefinition[]): CommercialSection {
  return {
    title: PARTS_METADATA_SECTION_TITLE,
    content: JSON.stringify(
      partDefinitions.map((part) => ({
        partNumber: part.partNumber,
        title: part.title,
        quantity: part.quantity,
      })),
    ),
  };
}

export function parsePartDefinitionsSection(
  sections: CommercialSection[],
  fallbackCount: number,
  fallbackQuantities: Record<number, number>,
) {
  const metadataSection = sections.find(isPartsMetadataSection);
  const normalizedFallbackCount = Math.max(0, fallbackCount);
  const fallbackDefinitions = buildPartDefinitions(normalizedFallbackCount, fallbackQuantities, {});

  if (!metadataSection?.content?.trim()) {
    return fallbackDefinitions;
  }

  try {
    const parsed = JSON.parse(metadataSection.content);
    if (!Array.isArray(parsed)) {
      return fallbackDefinitions;
    }

    const normalized = parsed
      .map((entry) => ({
        partNumber: Math.max(1, Number(entry?.partNumber || 1)),
        title: String(entry?.title || ''),
        quantity: Math.max(1, Number(entry?.quantity || 1)),
      }))
      .filter((entry) => entry.partNumber <= normalizedFallbackCount)
      .filter((entry, index, current) => current.findIndex((item) => item.partNumber === entry.partNumber) === index)
      .sort((left, right) => left.partNumber - right.partNumber);

    return normalized.length ? normalized : fallbackDefinitions;
  } catch {
    return fallbackDefinitions;
  }
}

export function mergeCommercialSectionsWithPartDefinitions(
  sections: CommercialSection[],
  partDefinitions: PartDefinition[],
) {
  return [
    ...stripInternalMetadata(sections),
    serializePartDefinitionsSection(partDefinitions),
  ];
}

export function serializeWorkItemsMetadataSection(hiddenAutoWorkItems: string[]): CommercialSection {
  return {
    title: WORK_ITEMS_METADATA_SECTION_TITLE,
    content: JSON.stringify({
      hiddenAutoWorkItems,
    }),
  };
}

export function parseWorkItemsMetadataSection(sections: CommercialSection[]) {
  const metadataSection = sections.find(isWorkItemsMetadataSection);
  if (!metadataSection?.content?.trim()) {
    return { hiddenAutoWorkItems: [] as string[] };
  }

  try {
    const parsed = JSON.parse(metadataSection.content) as {
      hiddenAutoWorkItems?: unknown;
    };

    return {
      hiddenAutoWorkItems: Array.isArray(parsed.hiddenAutoWorkItems)
        ? parsed.hiddenAutoWorkItems
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        : [],
    };
  } catch {
    return { hiddenAutoWorkItems: [] as string[] };
  }
}

export function mergeCommercialSectionsWithMetadata(
  sections: CommercialSection[],
  partDefinitions: PartDefinition[],
  hiddenAutoWorkItems: string[],
) {
  return [
    ...stripInternalMetadata(sections),
    serializePartDefinitionsSection(partDefinitions),
    serializeWorkItemsMetadataSection(hiddenAutoWorkItems),
  ];
}

export function getPartDisplayTitle(partNumber: number, title?: string) {
  const normalizedTitle = String(title || '').trim();
  return normalizedTitle || `Partida ${partNumber}`;
}

export function getPartSelectorLabel(partNumber: number, title?: string) {
  const normalizedTitle = String(title || '').trim();
  return normalizedTitle ? `#${partNumber} · ${normalizedTitle}` : `#${partNumber}`;
}

export function splitWorkItems(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function mergeUniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function mergeWorkItemsPreservingOrder(
  existingContent: string,
  autoItems: string[],
  manualItems: string[],
) {
  const existingItems = splitWorkItems(existingContent);
  const nextManualItems = manualItems.filter((item) => !autoItems.includes(item.trim()));
  const merged: string[] = [];
  const seen = new Set<string>();

  const pushIfNeeded = (value: string) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    merged.push(normalized);
  };

  existingItems.forEach((item) => {
    if (autoItems.includes(item) || nextManualItems.includes(item)) {
      pushIfNeeded(item);
    }
  });

  autoItems.forEach(pushIfNeeded);
  nextManualItems.forEach(pushIfNeeded);

  return merged;
}

export function normalizeWorkLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();
}

export function isReportDeliveryWorkItem(value: string) {
  return normalizeWorkLabel(value).includes('entrega de reporte');
}

export function orderWorkItemsWithReportLast(values: string[]) {
  const regularItems: string[] = [];
  const reportItems: string[] = [];

  values.forEach((value) => {
    if (isReportDeliveryWorkItem(value)) {
      reportItems.push(value);
      return;
    }

    regularItems.push(value);
  });

  return [...regularItems, ...reportItems];
}

export function compareWorkItemCodes(left: SummaryItem, right: SummaryItem) {
  return left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' });
}

export function deriveAutoWorkItemsFromSeed(items: Array<Pick<SummaryItem, 'code' | 'relatedWork'>>) {
  const orderedConcepts = [...items].sort((left, right) =>
    left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' }),
  );
  const orderedLines = orderedConcepts.flatMap((item) => splitWorkItems(item.relatedWork || ''));
  return orderWorkItemsWithReportLast(mergeUniqueStrings(orderedLines));
}

export function extractManualWorkItems(sectionContent: string, automaticItems: string[]) {
  return splitWorkItems(sectionContent).filter((item) => !automaticItems.includes(item));
}

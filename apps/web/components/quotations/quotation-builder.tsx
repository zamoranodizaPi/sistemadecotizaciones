'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Minus, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  useCatalog,
  useClients,
  useCreateQuotation,
  useExchangeRate,
  useQuotations,
  useServiceTemplates,
  useQuotationTemplate,
  useReusableTextBlocks,
  useSpecialConsiderationCatalog,
  useUpdatePricingProfiles,
  useUpdateQuotationFromBuilder,
  useUpdateQuotationTemplate,
  useWorkItemCatalog,
} from '@/lib/api/hooks';
import { mapCatalogForUi } from '@/lib/catalog';
import { formatCurrency } from '@/lib/utils';
import { useSession } from '@/components/providers/session-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

type SummaryItem = {
  serviceId: string;
  pricingProfileId: string;
  code: string;
  name: string;
  relatedWork?: string;
  quantity: number;
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

type CommercialSection = {
  title: string;
  content: string;
};

type PercentageConsideration = {
  localId: string;
  type: 'PERCENTAGE';
  concept: string;
  mode: 'PERCENTAGE' | 'FIXED';
  quantity: string;
  percentage: string;
  mxnAmount: string;
  usdAmount: string;
};

type TravelConsideration = {
  localId: string;
  type: 'TRAVEL';
  location: string;
  mxnAmount: string;
  usdAmount: string;
};

type SpecialConsideration = PercentageConsideration | TravelConsideration;

function createLocalId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function formatMoneyInputDisplay(value: string, currency: 'MXN' | 'USD') {
  const parsed = parseFormattedDecimal(value);
  if (parsed === null) {
    return '';
  }

  return formatCurrency(parsed, currency);
}

function formatEditableMoney(value: number, currency: 'MXN' | 'USD') {
  return formatCurrency(truncateToTwoDecimals(value), currency);
}

const DEFAULT_COMMERCIAL_SECTIONS: CommercialSection[] = [
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

function normalizeSectionTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCommercialSections(sections: CommercialSection[]) {
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

function splitWorkItems(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeUniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function mergeWorkItemsPreservingOrder(
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

function normalizeWorkLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isReportDeliveryWorkItem(value: string) {
  return normalizeWorkLabel(value).includes('entrega de reporte');
}

function orderWorkItemsWithReportLast(values: string[]) {
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

function compareWorkItemCodes(left: SummaryItem, right: SummaryItem) {
  return left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' });
}

function deriveAutoWorkItemsFromSeed(items: Array<Pick<SummaryItem, 'code' | 'relatedWork'>>) {
  const orderedConcepts = [...items].sort((left, right) =>
    left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' }),
  );
  const orderedLines = orderedConcepts.flatMap((item) => splitWorkItems(item.relatedWork || ''));
  return orderWorkItemsWithReportLast(mergeUniqueStrings(orderedLines));
}

function extractManualWorkItems(sectionContent: string, automaticItems: string[]) {
  return splitWorkItems(sectionContent).filter((item) => !automaticItems.includes(item));
}

export function QuotationBuilder() {
  const { user } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get('edit');
  const catalogQuery = useCatalog();
  const clientsQuery = useClients();
  const quotationsQuery = useQuotations();
  const serviceTemplatesQuery = useServiceTemplates();
  const exchangeRateQuery = useExchangeRate();
  const quotationTemplateQuery = useQuotationTemplate();
  const specialConsiderationCatalogQuery = useSpecialConsiderationCatalog();
  const workItemCatalogQuery = useWorkItemCatalog();
  const reusableTextBlocksQuery = useReusableTextBlocks();
  const updatePricingProfilesMutation = useUpdatePricingProfiles();
  const updateQuotationTemplateMutation = useUpdateQuotationTemplate();
  const createMutation = useCreateQuotation();
  const updateBuilderMutation = useUpdateQuotationFromBuilder();

  const uiCatalog = useMemo(
    () => (catalogQuery.data ? mapCatalogForUi(catalogQuery.data) : []),
    [catalogQuery.data],
  );

  const [activeCategory, setActiveCategory] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clientPaletteOpen, setClientPaletteOpen] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);
  const [step, setStep] = useState<'client' | 'services' | 'considerations' | 'work' | 'conditions' | 'preview'>('client');
  const [title, setTitle] = useState('');
  const [coverTitle, setCoverTitle] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [serviceType, setServiceType] = useState('General');
  const [templateType, setTemplateType] = useState('General');
  const [pricingRule, setPricingRule] = useState('STANDARD');
  const [validityDays, setValidityDays] = useState('30');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPricingProfileId, setSelectedPricingProfileId] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedUnitPriceInput, setSelectedUnitPriceInput] = useState('');
  const [commercialSections, setCommercialSections] = useState<CommercialSection[]>([]);
  const [manualWorkItems, setManualWorkItems] = useState<string[]>([]);
  const [specialConsiderations, setSpecialConsiderations] = useState<SpecialConsideration[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastTitle, setToastTitle] = useState('Servicio agregado');
  const [toastDescription, setToastDescription] = useState('El resumen se recalculo en tiempo real.');
  const [didHydrateEdit, setDidHydrateEdit] = useState(false);
  const [catalogUpdateModalOpen, setCatalogUpdateModalOpen] = useState(false);
  const [selectedWorkItem, setSelectedWorkItem] = useState('');
  const [selectedReusableBlockIds, setSelectedReusableBlockIds] = useState<string[]>([]);

  const allServices = useMemo(
    () =>
      uiCatalog.flatMap((category) =>
        category.services.map((service) => ({
          ...service,
          categoryCode: category.code,
          categoryName: category.name,
        })),
      ),
    [uiCatalog],
  );
  const resolvedActiveCategory = activeCategory || uiCatalog[0]?.code || '';
  const currentCategory = uiCatalog.find((category) => category.code === resolvedActiveCategory) || uiCatalog[0];
  const services = currentCategory?.services ?? [];
  const filteredServices = useMemo(() => {
    const normalizedQuery = serviceQuery.trim().toLowerCase();
    const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, '');
    const scopedServices = normalizedQuery
      ? allServices
      : activeCategory
        ? allServices.filter((service) => service.categoryCode === resolvedActiveCategory)
        : allServices;

    const matchingServices = !normalizedQuery
      ? scopedServices
      : scopedServices.filter((service) => {
          const code = service.code.toLowerCase();
          const compactCode = code.replace(/[^a-z0-9]/g, '');

          return code.includes(normalizedQuery) || compactCode.includes(compactQuery);
        });

    return [...matchingServices].sort((left, right) =>
      left.code.localeCompare(right.code, 'es', { numeric: true, sensitivity: 'base' }),
    );
  }, [activeCategory, allServices, resolvedActiveCategory, serviceQuery]);
  const selectedService =
    allServices.find((service) => service.id === selectedServiceId) ||
    filteredServices[0] ||
    services[0];
  const availableProfiles = selectedService?.pricingProfiles || [];
  const selectedProfile =
    availableProfiles.find((profile) => profile.id === selectedPricingProfileId) || availableProfiles[0];
  const filteredClients = useMemo(() => {
    const clients = clientsQuery.data || [];
    const normalizedQuery = clientQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return clients;
    }

    return clients.filter((client) =>
      [
        client.legalName,
        client.commercialName || '',
        client.rfc,
        ...client.contacts.flatMap((contact) => [
          contact.fullName,
          contact.email || '',
          contact.phone || '',
          contact.position || '',
        ]),
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [clientQuery, clientsQuery.data]);
  const selectedClient =
    (clientsQuery.data || []).find((client) => client.id === clientId) || filteredClients[0] || null;
  const selectedSeller = user;
  const percentageCatalog = useMemo(
    () =>
      (specialConsiderationCatalogQuery.data || [])
        .filter((item) => item.type === 'PERCENTAGE' && item.concept)
        .map((item) => ({
          concept: item.concept as string,
          percentage: Number(item.percentage || 0),
          mxnAmount: Number(item.mxnAmount || 0),
          usdAmount: Number(item.usdAmount || 0),
        })),
    [specialConsiderationCatalogQuery.data],
  );
  const travelCatalog = useMemo(
    () =>
      (specialConsiderationCatalogQuery.data || [])
        .filter((item) => item.type === 'TRAVEL' && item.location)
        .map((item) => ({
          location: item.location as string,
          mxnAmount: Number(item.mxnAmount || 0),
          usdAmount: Number(item.usdAmount || 0),
        })),
    [specialConsiderationCatalogQuery.data],
  );
  const editingQuotation = useMemo(
    () => (editingId ? quotationsQuery.data?.find((quotation) => quotation.id === editingId) || null : null),
    [editingId, quotationsQuery.data],
  );
  const savedServiceTemplates = serviceTemplatesQuery.data || [];
  const filteredServiceTemplates = useMemo(
    () =>
      savedServiceTemplates.filter((template) =>
        !templateType || templateType === 'General'
          ? true
          : (template.templateType || 'General') === templateType,
      ),
    [savedServiceTemplates, templateType],
  );
  const workItemCatalog = workItemCatalogQuery.data || [];
  const reusableTextBlocks = reusableTextBlocksQuery.data || [];

  const exchangeRate = Number(exchangeRateQuery.data?.rate || 0);
  const serviceSubtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const percentageSubtotal = useMemo(
    () =>
      specialConsiderations
        .filter((item): item is PercentageConsideration => item.type === 'PERCENTAGE')
        .reduce((sum, item) => {
          if (item.mode !== 'PERCENTAGE') {
            return sum;
          }
          const percentage = Number(item.percentage || 0);
          return sum + serviceSubtotal * (percentage / 100);
        }, 0),
    [serviceSubtotal, specialConsiderations],
  );
  const fixedConsiderationsSubtotal = useMemo(
    () =>
      specialConsiderations
        .filter((item): item is PercentageConsideration => item.type === 'PERCENTAGE')
        .reduce((sum, item) => {
          if (item.mode !== 'FIXED') {
            return sum;
          }

          const quantity = Number(item.quantity || 1) || 1;
          const mxnAmount = Number(parseFormattedDecimal(item.mxnAmount) || 0);
          const usdAmount = Number(parseFormattedDecimal(item.usdAmount) || 0);

          if (currency === 'USD') {
            return sum + (usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0)) * quantity;
          }

          return sum + (mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0)) * quantity;
        }, 0),
    [currency, exchangeRate, specialConsiderations],
  );
  const travelSubtotal = useMemo(
    () =>
      specialConsiderations
        .filter((item): item is TravelConsideration => item.type === 'TRAVEL')
        .reduce((sum, item) => {
          const mxnAmount = Number(parseFormattedDecimal(item.mxnAmount) || 0);
          const usdAmount = Number(parseFormattedDecimal(item.usdAmount) || 0);

          if (currency === 'USD') {
            return sum + (usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0));
          }

          return sum + (mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0));
        }, 0),
    [currency, exchangeRate, specialConsiderations],
  );
  const subtotal = serviceSubtotal + percentageSubtotal + fixedConsiderationsSubtotal + travelSubtotal;
  const tax = subtotal * 0.16;
  const total = subtotal + tax;
  const modifiedPriceItems = useMemo(
    () => items.filter((item) => item.priceOverridden && Math.abs(item.price - item.basePrice) > 0.009),
    [items],
  );
  const previewConceptRows = useMemo(() => {
    const conceptRows = items.map((item) => ({
      key: `${item.code}-${item.pricingProfileId}-${item.currency}`,
      name: item.name,
      code: item.code,
      detail: `${item.pricingProfileName} · P.U. ${formatCurrency(item.price, item.currency)} · Cantidad ${item.quantity}`,
      total: item.price * item.quantity,
    }));

    const specialRows = specialConsiderations.flatMap((item) => {
      if (item.type === 'PERCENTAGE') {
        if (item.mode === 'PERCENTAGE') {
          const percentage = Number(item.percentage || 0);
          if (!percentage) {
            return [];
          }

          return [{
            key: item.localId,
            name: item.concept || `Adicional ${percentage}%`,
            code: 'ADICIONAL',
            detail: `${percentage}% sobre subtotal`,
            total: serviceSubtotal * (percentage / 100),
          }];
        }

        const mxnAmount = Number(parseFormattedDecimal(item.mxnAmount) || 0);
        const usdAmount = Number(parseFormattedDecimal(item.usdAmount) || 0);
        const quantity = Number(item.quantity || 1) || 1;
        const totalAmount =
          currency === 'USD'
            ? (usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0)) * quantity
            : (mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0)) * quantity;

        if (!totalAmount) {
          return [];
        }

        return [{
          key: item.localId,
          name: item.concept || 'Consideración especial',
          code: 'ADICIONAL',
          detail: `Monto fijo · P.U. ${formatCurrency(totalAmount / quantity, currency)} · Cantidad ${quantity}`,
          total: totalAmount,
        }];
      }

      const mxnAmount = Number(parseFormattedDecimal(item.mxnAmount) || 0);
      const usdAmount = Number(parseFormattedDecimal(item.usdAmount) || 0);
      const totalAmount =
        currency === 'USD'
          ? usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0)
          : mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0);

      if (!totalAmount) {
        return [];
      }

      return [{
        key: item.localId,
        name: item.location || 'Sin descripción',
        code: 'VIATICOS',
        detail: `Monto fijo · P.U. ${formatCurrency(totalAmount, currency)} · Cantidad 1`,
        total: totalAmount,
      }];
    });

    return [...conceptRows, ...specialRows];
  }, [currency, exchangeRate, items, serviceSubtotal, specialConsiderations]);
  const autoWorkItems = useMemo(
    () => deriveAutoWorkItemsFromSeed(items),
    [items],
  );
  const workSection = useMemo(
    () =>
      commercialSections.find(
        (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
      ) || null,
    [commercialSections],
  );
  const combinedWorkItems = useMemo(
    () =>
      orderWorkItemsWithReportLast(
        mergeWorkItemsPreservingOrder(workSection?.content || '', autoWorkItems, manualWorkItems),
      ),
    [autoWorkItems, manualWorkItems, workSection?.content],
  );
  const generalSections = useMemo(
    () =>
      commercialSections.filter(
        (section) => normalizeSectionTitle(section.title) !== 'trabajos a realizar:',
      ),
    [commercialSections],
  );
  useEffect(() => {
    if (!currentCategory) {
      return;
    }

    if (!activeCategory) {
      setActiveCategory(currentCategory.code);
    }
  }, [activeCategory, currentCategory]);

  useEffect(() => {
    if (!clientId && clientsQuery.data?.[0]?.id) {
      setClientId(clientsQuery.data[0].id);
      setClientQuery('');
    }
  }, [clientId, clientsQuery.data]);

  useEffect(() => {
    if (!filteredClients.length) {
      setHighlightedClientIndex(0);
      return;
    }

    setHighlightedClientIndex((current) => Math.min(current, filteredClients.length - 1));
  }, [filteredClients]);

  useEffect(() => {
    if (!selectedService && filteredServices[0]) {
      setSelectedServiceId(filteredServices[0].id);
      return;
    }

    if (selectedService && !selectedPricingProfileId && selectedService.pricingProfiles[0]) {
      setSelectedPricingProfileId(selectedService.pricingProfiles[0].id);
    }
  }, [filteredServices, selectedPricingProfileId, selectedService]);

  useEffect(() => {
    if (!filteredServices.length) {
      return;
    }

    if (!selectedServiceId || !filteredServices.some((service) => service.id === selectedServiceId)) {
      setSelectedServiceId(filteredServices[0].id);
      setSelectedPricingProfileId(filteredServices[0].pricingProfiles[0]?.id || '');
    }
  }, [filteredServices, selectedServiceId]);

  useEffect(() => {
    if (selectedService?.categoryCode && selectedService.categoryCode !== resolvedActiveCategory) {
      setActiveCategory(selectedService.categoryCode);
    }
  }, [resolvedActiveCategory, selectedService]);

  useEffect(() => {
    const nextResolvedPrice = resolveProfilePrice();
    if (!nextResolvedPrice) {
      setSelectedUnitPriceInput('');
      return;
    }

    setSelectedUnitPriceInput(formatEditableMoney(nextResolvedPrice.price, currency));
  }, [selectedServiceId, selectedPricingProfileId, currency, exchangeRate]);

  useEffect(() => {
    if (quotationTemplateQuery.data?.sections?.length) {
      const normalizedSections = normalizeCommercialSections(quotationTemplateQuery.data.sections);
      setCommercialSections(normalizedSections);
      const initialWorkSection = normalizedSections.find(
        (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
      );
      setManualWorkItems([]);
      return;
    }

    setCommercialSections(DEFAULT_COMMERCIAL_SECTIONS);
    setManualWorkItems([]);
  }, [quotationTemplateQuery.data]);

  useEffect(() => {
    if (!editingQuotation || didHydrateEdit || !allServices.length) {
      return;
    }

    setClientId(editingQuotation.client.id);
    setClientQuery('');
    setTitle(editingQuotation.title);
    setCoverTitle(editingQuotation.coverTitle || editingQuotation.title);
    setExecutiveSummary(editingQuotation.executiveSummary || '');
    setServiceType(editingQuotation.serviceType || 'General');
    setTemplateType(editingQuotation.templateType || 'General');
    setPricingRule(editingQuotation.pricingRule || 'STANDARD');
    setValidityDays('30');
    setCurrency((editingQuotation.currency || 'MXN') as 'MXN' | 'USD');
    const hydratedItems = editingQuotation.items
      .filter((item) => item.supplyId && item.pricingProfileId)
      .map((item) => ({
        serviceId: item.supplyId as string,
        pricingProfileId: item.pricingProfileId as string,
        code: item.supplyCode,
        name: item.supplyName,
        relatedWork:
          allServices.find((service) => service.id === item.supplyId)?.relatedWork || '',
        quantity: Number(item.quantity),
        price: Number(item.unitPrice),
        category: item.categoryName,
        currency: (editingQuotation.currency || 'MXN') as 'MXN' | 'USD',
        pricingProfileName: item.pricingProfileName || 'Precio general',
        isOptional: Boolean(item.isOptional),
        optionGroup: item.optionGroup || '',
        optionLabel: item.optionLabel || '',
        priceOriginCurrency: (item.priceOriginCurrency as 'MXN' | 'USD') || ((editingQuotation.currency || 'MXN') as 'MXN' | 'USD'),
        priceInput: formatEditableMoney(Number(item.unitPrice), (editingQuotation.currency || 'MXN') as 'MXN' | 'USD'),
        basePrice: Number(item.unitPrice),
        priceOverridden: false,
      }));
    setCommercialSections(
      (() => {
        const normalizedSections = normalizeCommercialSections(
          Array.isArray((editingQuotation as { commercialSections?: CommercialSection[] }).commercialSections)
            ? ((editingQuotation as { commercialSections?: CommercialSection[] }).commercialSections as CommercialSection[])
            : DEFAULT_COMMERCIAL_SECTIONS,
        );
        const initialWorkSection = normalizedSections.find(
          (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
        );
        setManualWorkItems(
          extractManualWorkItems(
            initialWorkSection?.content || '',
            deriveAutoWorkItemsFromSeed(hydratedItems),
          ),
        );
        return normalizedSections;
      })(),
    );
    setSpecialConsiderations(
      ((editingQuotation.specialConsiderations || []).map((item) =>
        item.type === 'PERCENTAGE'
          ? {
              localId: createLocalId('percentage'),
              type: 'PERCENTAGE' as const,
              concept: item.concept || '',
              mode: Number(item.percentage || 0) ? 'PERCENTAGE' as const : 'FIXED' as const,
              quantity: String(Number(item.quantity || 1)),
              percentage: String(Number(item.percentage || 0)),
              mxnAmount: item.mxnAmount ? formatCurrency(Number(item.mxnAmount), 'MXN') : '',
              usdAmount: item.usdAmount ? formatCurrency(Number(item.usdAmount), 'USD') : '',
            }
          : {
              localId: createLocalId('travel'),
              type: 'TRAVEL' as const,
              location: item.location || '',
              mxnAmount: item.mxnAmount ? formatCurrency(Number(item.mxnAmount), 'MXN') : '',
              usdAmount: item.usdAmount ? formatCurrency(Number(item.usdAmount), 'USD') : '',
            })) || [],
    );
    setItems(hydratedItems);
    setStep('client');
    setDidHydrateEdit(true);
  }, [allServices.length, didHydrateEdit, editingQuotation]);

  function showTimedToast(title: string, description: string) {
    setToastTitle(title);
    setToastDescription(description);
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 2200);
  }

  function chooseService(serviceId: string) {
    const nextService = allServices.find((service) => service.id === serviceId);
    if (!nextService) {
      return;
    }

    setSelectedServiceId(nextService.id);
    setSelectedPricingProfileId(nextService.pricingProfiles[0]?.id || '');
    setActiveCategory(nextService.categoryCode);
  }

  function chooseClient(nextClientId: string) {
    const nextClient = (clientsQuery.data || []).find((client) => client.id === nextClientId);
    if (!nextClient) {
      return;
    }

    setClientId(nextClient.id);
    setClientQuery('');
    setClientPaletteOpen(false);
  }

  function preloadFromQuotationTemplate(templateId: string) {
    const template = savedServiceTemplates.find((quotation) => quotation.id === templateId);
    if (!template) {
      return;
    }

    setTitle(template.name || '');
    setCoverTitle(template.name || '');
    setTemplateType(template.templateType || 'General');
    const hydratedItems = template.items
      .filter((item) => item.serviceId && item.pricingProfileId)
      .map((item) => ({
        serviceId: item.serviceId,
        pricingProfileId: item.pricingProfileId,
        code:
          allServices.find((service) => service.id === item.serviceId)?.code || 'SIN CLAVE',
        name:
          allServices.find((service) => service.id === item.serviceId)?.name || 'Concepto precargado',
        relatedWork:
          allServices.find((service) => service.id === item.serviceId)?.relatedWork || '',
        quantity: Number(item.quantity),
        price:
          typeof item.unitPriceOverride === 'number'
            ? item.unitPriceOverride
            : resolveProfilePrice(
                allServices
                  .find((service) => service.id === item.serviceId)
                  ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
                currency,
              )?.price || 0,
        category:
          allServices.find((service) => service.id === item.serviceId)?.categoryName || '',
        currency,
        pricingProfileName:
          allServices
            .find((service) => service.id === item.serviceId)
            ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId)?.name || 'Precio general',
        isOptional: Boolean(item.isOptional),
        optionGroup: item.optionGroup || '',
        optionLabel: item.optionLabel || '',
        priceOriginCurrency:
          resolveProfilePrice(
            allServices
              .find((service) => service.id === item.serviceId)
              ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
            currency,
          )?.priceOriginCurrency || currency,
        priceInput:
          (
            typeof item.unitPriceOverride === 'number'
              ? item.unitPriceOverride
              : resolveProfilePrice(
                  allServices
                    .find((service) => service.id === item.serviceId)
                    ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
                  currency,
                )?.price || 0
          ).toFixed(2),
        basePrice:
          resolveProfilePrice(
            allServices
              .find((service) => service.id === item.serviceId)
              ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
            currency,
          )?.price || 0,
        priceOverridden: typeof item.unitPriceOverride === 'number',
      }));
    setCommercialSections(
      (() => {
        const normalizedSections = normalizeCommercialSections(
          Array.isArray(template.commercialSections)
            ? (template.commercialSections as CommercialSection[])
            : DEFAULT_COMMERCIAL_SECTIONS,
        );
        const initialWorkSection = normalizedSections.find(
          (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
        );
        setManualWorkItems(
          extractManualWorkItems(
            initialWorkSection?.content || '',
            deriveAutoWorkItemsFromSeed(hydratedItems),
          ),
        );
        return normalizedSections;
      })(),
    );
    setSpecialConsiderations(
      ((template.specialConsiderations || []).map((item) =>
        item.type === 'PERCENTAGE'
          ? {
              localId: createLocalId('percentage'),
              type: 'PERCENTAGE' as const,
              concept: item.concept || '',
              mode: Number(item.percentage || 0) ? 'PERCENTAGE' as const : 'FIXED' as const,
              quantity: String(Number(item.quantity || 1)),
              percentage: String(Number(item.percentage || 0)),
              mxnAmount: item.mxnAmount ? formatCurrency(Number(item.mxnAmount), 'MXN') : '',
              usdAmount: item.usdAmount ? formatCurrency(Number(item.usdAmount), 'USD') : '',
            }
          : {
              localId: createLocalId('travel'),
              type: 'TRAVEL' as const,
              location: item.location || '',
              mxnAmount: item.mxnAmount ? formatCurrency(Number(item.mxnAmount), 'MXN') : '',
              usdAmount: item.usdAmount ? formatCurrency(Number(item.usdAmount), 'USD') : '',
            })) || [],
    );
    setItems(hydratedItems);
    setSelectedTemplateId(template.id);
    showTimedToast('Conceptos precargados', 'Se reutilizó la configuración de una cotización previa para este servicio.');
  }

  function updateCommercialSection(index: number, field: keyof CommercialSection, value: string) {
    setCommercialSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, [field]: value } : section,
      ),
    );
  }

  function addCommercialSection() {
    setCommercialSections((current) => [
      ...current,
      { title: 'Nueva sección:', content: '' },
    ]);
  }

  function updateWorkItemsContent(nextItems: string[]) {
    setManualWorkItems(nextItems.filter((item) => !autoWorkItems.includes(item.trim())));
  }

  function addWorkItemFromCatalog() {
    const nextValue = selectedWorkItem.trim();
    if (!nextValue) {
      return;
    }

    const currentSection = commercialSections.find(
      (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
    );
    const currentItems = mergeUniqueStrings([
      ...autoWorkItems,
      ...manualWorkItems,
      ...splitWorkItems(currentSection?.content || ''),
    ]);
    if (currentItems.includes(nextValue)) {
      setSelectedWorkItem('');
      return;
    }

    updateWorkItemsContent([...currentItems, nextValue]);
    setSelectedWorkItem('');
  }

  function addPercentageConsideration() {
    setSpecialConsiderations((current) => [
      ...current,
      {
        localId: createLocalId('percentage'),
        type: 'PERCENTAGE',
        concept: '',
        mode: 'PERCENTAGE',
        quantity: '1',
        percentage: '',
        mxnAmount: '',
        usdAmount: '',
      },
    ]);
  }

  function addTravelConsideration() {
    setSpecialConsiderations((current) => [
      ...current,
      {
        localId: createLocalId('travel'),
        type: 'TRAVEL',
        location: '',
        mxnAmount: '',
        usdAmount: '',
      },
    ]);
  }

  function removeSpecialConsideration(localId: string) {
    setSpecialConsiderations((current) => current.filter((item) => item.localId !== localId));
  }

  function updatePercentageConsideration(
    localId: string,
    field: 'concept' | 'quantity' | 'percentage' | 'mxnAmount' | 'usdAmount',
    value: string,
  ) {
    setSpecialConsiderations((current) =>
      current.map((item) =>
        item.localId === localId && item.type === 'PERCENTAGE'
          ? {
              ...item,
              [field]:
                field === 'percentage' || field === 'quantity'
                  ? value.replace(/[^0-9.]/g, '')
                  : value,
            }
          : item,
      ),
    );
  }

  function updatePercentageMode(localId: string, mode: PercentageConsideration['mode']) {
    setSpecialConsiderations((current) =>
      current.map((item) =>
        item.localId === localId && item.type === 'PERCENTAGE'
          ? {
              ...item,
              mode,
              percentage: mode === 'PERCENTAGE' ? item.percentage : '',
            }
          : item,
      ),
    );
  }

  function updateTravelConsideration(
    localId: string,
    field: 'location' | 'mxnAmount' | 'usdAmount',
    value: string,
  ) {
    setSpecialConsiderations((current) =>
      current.map((item) =>
        item.localId === localId && item.type === 'TRAVEL'
          ? {
              ...item,
              [field]:
                field === 'location' ? value : value.replace(/[^0-9.]/g, ''),
            }
          : item,
      ),
    );
  }

  function applyPercentageSuggestion(localId: string, concept: string) {
    const matched = percentageCatalog.find((item) => item.concept === concept);
    setSpecialConsiderations((current) =>
      current.map((item) =>
        item.localId === localId && item.type === 'PERCENTAGE'
          ? {
              ...item,
              concept,
              mode:
                matched && matched.percentage
                  ? 'PERCENTAGE'
                  : matched && (matched.mxnAmount || matched.usdAmount)
                    ? 'FIXED'
                    : item.mode,
              percentage: matched && matched.percentage ? String(matched.percentage) : item.percentage,
              mxnAmount:
                matched && matched.mxnAmount
                  ? formatCurrency(matched.mxnAmount, 'MXN')
                  : item.mxnAmount,
              usdAmount:
                matched && matched.usdAmount
                  ? formatCurrency(matched.usdAmount, 'USD')
                  : item.usdAmount,
            }
          : item,
      ),
    );
  }

  function applyTravelSuggestion(localId: string, location: string) {
    const matched = travelCatalog.find((item) => item.location === location);
    setSpecialConsiderations((current) =>
      current.map((item) =>
        item.localId === localId && item.type === 'TRAVEL'
          ? {
              ...item,
              location,
              mxnAmount:
                matched && matched.mxnAmount ? formatCurrency(matched.mxnAmount, 'MXN') : item.mxnAmount,
              usdAmount:
                matched && matched.usdAmount ? formatCurrency(matched.usdAmount, 'USD') : item.usdAmount,
            }
          : item,
      ),
    );
  }

  function focusMoneyField(
    localId: string,
    kind: 'PERCENTAGE' | 'TRAVEL',
    field: 'mxnAmount' | 'usdAmount',
  ) {
    const setter = kind === 'PERCENTAGE' ? updatePercentageConsideration : updateTravelConsideration;
    const target = specialConsiderations.find((item) => item.localId === localId && item.type === kind);
    if (!target) {
      return;
    }

    const currentValue = target[field];
    const parsed = parseFormattedDecimal(currentValue);
    setter(localId as string, field as never, parsed === null ? '' : parsed.toFixed(2));
  }

  function blurMoneyField(
    localId: string,
    kind: 'PERCENTAGE' | 'TRAVEL',
    field: 'mxnAmount' | 'usdAmount',
  ) {
    const setter = kind === 'PERCENTAGE' ? updatePercentageConsideration : updateTravelConsideration;
    const target = specialConsiderations.find((item) => item.localId === localId && item.type === kind);
    if (!target) {
      return;
    }

    const currentValue = target[field];
    const oppositeField = field === 'mxnAmount' ? 'usdAmount' : 'mxnAmount';
    const oppositeValue = target[oppositeField];
    setter(localId as string, field as never, formatMoneyInputDisplay(currentValue, field === 'mxnAmount' ? 'MXN' : 'USD'));
    setter(
      localId as string,
      oppositeField as never,
      formatMoneyInputDisplay(oppositeValue, oppositeField === 'mxnAmount' ? 'MXN' : 'USD'),
    );
  }

  function syncConvertedAmount(
    localId: string,
    kind: 'PERCENTAGE' | 'TRAVEL',
    field: 'mxnAmount' | 'usdAmount',
    value: string,
  ) {
    const setter = kind === 'PERCENTAGE' ? updatePercentageConsideration : updateTravelConsideration;
    setter(localId as string, field as never, value);

    const parsed = parseFormattedDecimal(value);
    if (parsed === null || !exchangeRate) {
      return;
    }

    const convertedValue =
      field === 'mxnAmount'
        ? truncateToTwoDecimals(parsed / exchangeRate)
        : truncateToTwoDecimals(parsed * exchangeRate);
    setter(
      localId as string,
      (field === 'mxnAmount' ? 'usdAmount' : 'mxnAmount') as never,
      convertedValue.toFixed(2),
    );
  }

  function resolveProfilePrice(
    profile = selectedProfile,
    targetCurrency: 'MXN' | 'USD' = currency,
  ) {
    if (!profile || !exchangeRate) {
      return null;
    }

    const mxnPrice = profile.mxnPrice === '' ? 0 : Number(profile.mxnPrice || 0);
    const usdPrice = profile.usdPrice === '' ? 0 : Number(profile.usdPrice || 0);

    if (targetCurrency === 'MXN') {
      if (mxnPrice) {
        return { price: mxnPrice, priceOriginCurrency: 'MXN' as const };
      }
      if (usdPrice) {
        return {
          price: Number((usdPrice * exchangeRate).toFixed(2)),
          priceOriginCurrency: 'USD' as const,
        };
      }
    }

    if (usdPrice) {
      return { price: usdPrice, priceOriginCurrency: 'USD' as const };
    }

    if (mxnPrice) {
      return {
        price: Number((mxnPrice / exchangeRate).toFixed(2)),
        priceOriginCurrency: 'MXN' as const,
      };
    }

    return null;
  }

  useEffect(() => {
    if (!items.length) {
      return;
    }

    setItems((current) =>
      current.map((item) => {
        const service = allServices.find((serviceEntry) => serviceEntry.id === item.serviceId);
        const profile = service?.pricingProfiles.find(
          (profileEntry) => profileEntry.id === item.pricingProfileId,
        );
        const resolved = resolveProfilePrice(profile, currency);

        if (!service || !profile || !resolved) {
          return {
            ...item,
            currency,
          };
        }

        return {
          ...item,
          code: service.code,
          name: service.name,
          relatedWork: service.relatedWork || '',
          category: service.categoryName,
          pricingProfileName: profile.name,
          price: item.priceOverridden
            ? truncateToTwoDecimals(
                item.currency === currency
                  ? item.price
                  : item.currency === 'MXN'
                    ? item.price / exchangeRate
                    : item.price * exchangeRate,
              )
            : resolved.price,
          currency,
          priceOriginCurrency: resolved.priceOriginCurrency,
          basePrice: resolved.price,
          priceInput: item.priceOverridden
            ? formatEditableMoney(
                truncateToTwoDecimals(
                item.currency === currency
                  ? item.price
                  : item.currency === 'MXN'
                    ? item.price / exchangeRate
                    : item.price * exchangeRate),
                currency,
              )
            : formatEditableMoney(resolved.price, currency),
        };
      }),
    );
  }, [allServices, currency, exchangeRate]);

  useEffect(() => {
    setCommercialSections((current) =>
      current.map((section) =>
        normalizeSectionTitle(section.title) === 'trabajos a realizar:'
          ? { ...section, content: combinedWorkItems.join('\n') }
          : section,
      ),
    );
  }, [combinedWorkItems]);

  function addConfiguredService() {
    if (!selectedService || !selectedProfile) {
      return;
    }

    const resolvedPrice = resolveProfilePrice();
    if (!resolvedPrice) {
      return;
    }

    const parsedSelectedUnitPrice = parseFormattedDecimal(selectedUnitPriceInput);
    const effectiveUnitPrice = parsedSelectedUnitPrice ?? resolvedPrice.price;
    const priceWasOverridden = Math.abs(effectiveUnitPrice - resolvedPrice.price) > 0.009;

    setItems((current) => {
      const compositeKey = `${selectedService.code}-${selectedProfile.id}-${currency}`;
      const existing = current.find(
        (item) => `${item.code}-${item.pricingProfileId}-${item.currency}` === compositeKey,
      );

      if (existing) {
        const updated = {
          ...existing,
          quantity: existing.quantity + Math.max(1, selectedQuantity),
        };

        return [
          updated,
          ...current.filter(
            (item) => `${item.code}-${item.pricingProfileId}-${item.currency}` !== compositeKey,
          ),
        ];
      }

      return [
        {
          serviceId: selectedService.id,
          pricingProfileId: selectedProfile.id,
          code: selectedService.code,
          name: selectedService.name,
          relatedWork: selectedService.relatedWork || '',
          quantity: Math.max(1, selectedQuantity),
          price: effectiveUnitPrice,
          category: currentCategory?.name || '',
          currency,
          pricingProfileName: selectedProfile.name,
          priceOriginCurrency: resolvedPrice.priceOriginCurrency,
          priceInput: formatEditableMoney(effectiveUnitPrice, currency),
          basePrice: resolvedPrice.price,
          priceOverridden: priceWasOverridden,
          isOptional: false,
          optionGroup: '',
          optionLabel: '',
        },
        ...current,
      ];
    });

    showTimedToast('Servicio agregado', 'La cotización se recalculó con la opción de precio seleccionada.');
  }

  function changeQuantity(key: string, delta: number) {
    setItems((current) =>
      current.map((item) =>
        `${item.code}-${item.pricingProfileId}-${item.currency}` === key
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  }

  function removeItem(key: string) {
    setItems((current) =>
      current.filter((item) => `${item.code}-${item.pricingProfileId}-${item.currency}` !== key),
    );
  }

  function toggleOptionalItem(key: string) {
    setItems((current) =>
      current.map((item) =>
        `${item.code}-${item.pricingProfileId}-${item.currency}` === key
          ? { ...item, isOptional: !item.isOptional }
          : item,
      ),
    );
  }

  function updateOptionalMeta(key: string, field: 'optionGroup' | 'optionLabel', value: string) {
    setItems((current) =>
      current.map((item) =>
        `${item.code}-${item.pricingProfileId}-${item.currency}` === key
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  async function persistQuotation(saveModifiedPrices: boolean) {
    if (!clientId || !items.length || !exchangeRate) {
      return;
    }

    const payload = {
      clientId,
      createdById: user.id,
      title,
      coverTitle,
      executiveSummary,
      serviceType,
      templateType,
      pricingRule,
      validityDays: Number(validityDays || 30),
      reusableBlockIds: selectedReusableBlockIds,
      durationOfWork:
        commercialSections.find((section) => section.title === 'Duracion de los trabajos:')?.content,
      notes:
        commercialSections.find((section) => section.title === 'Notas importantes:')?.content,
      termsAndConditions:
        commercialSections.find((section) => section.title === 'CONDICIONES DE PAGO:')?.content,
      commercialSections: normalizeCommercialSections(commercialSections),
      specialConsiderations: specialConsiderations.map((item, index) =>
        item.type === 'PERCENTAGE'
          ? {
              type: 'PERCENTAGE' as const,
              concept: item.concept,
              quantity: Number(item.quantity || 1),
              percentage: item.mode === 'PERCENTAGE' ? Number(item.percentage || 0) : undefined,
              mxnAmount:
                item.mode === 'FIXED' ? Number(parseFormattedDecimal(item.mxnAmount) || 0) : undefined,
              usdAmount:
                item.mode === 'FIXED' ? Number(parseFormattedDecimal(item.usdAmount) || 0) : undefined,
              sortOrder: index,
            }
          : {
              type: 'TRAVEL' as const,
              location: item.location,
              mxnAmount: Number(parseFormattedDecimal(item.mxnAmount) || 0),
              usdAmount: Number(parseFormattedDecimal(item.usdAmount) || 0),
              sortOrder: index,
            },
      ),
      currency,
      exchangeRate,
      items: items.map((item) => ({
        serviceId: item.serviceId,
        pricingProfileId: item.pricingProfileId,
        quantity: item.quantity,
        unitPriceOverride: item.priceOverridden ? item.price : undefined,
        isOptional: item.isOptional,
        optionGroup: item.optionGroup || undefined,
        optionLabel: item.optionLabel || undefined,
      })),
    };

    if (editingId) {
      await updateBuilderMutation.mutateAsync({
        id: editingId,
        payload,
      });
    } else {
      await createMutation.mutateAsync(payload);
    }

    if (saveModifiedPrices && modifiedPriceItems.length) {
      const profilesByService = new Map<
        string,
        Array<{
          id: string;
          code: string;
          name: string;
          sortOrder?: number;
          mxnPrice?: number;
          usdPrice?: number;
          validFrom: string;
          source: string;
        }>
      >();

      for (const item of modifiedPriceItems) {
        const service = allServices.find((entry) => entry.id === item.serviceId);
        const profile = service?.pricingProfiles.find((entry) => entry.id === item.pricingProfileId);
        if (!service || !profile) {
          continue;
        }

        const mxnPrice =
          currency === 'MXN'
            ? item.price
            : truncateToTwoDecimals(item.price * exchangeRate);
        const usdPrice =
          currency === 'USD'
            ? item.price
            : truncateToTwoDecimals(item.price / exchangeRate);

        const serviceProfiles = profilesByService.get(service.id) || [];
        serviceProfiles.push({
          id: profile.id,
          code: profile.code,
          name: profile.name,
          sortOrder: profile.sortOrder,
          mxnPrice,
          usdPrice,
          validFrom: new Date().toISOString().slice(0, 10),
          source: 'quotation-builder',
        });
        profilesByService.set(service.id, serviceProfiles);
      }

      for (const [serviceId, profiles] of profilesByService.entries()) {
        await updatePricingProfilesMutation.mutateAsync({
          serviceId,
          profiles,
        });
      }
    }

    await updateQuotationTemplateMutation.mutateAsync(normalizeCommercialSections(commercialSections));

    setItems([]);
    showTimedToast(
      editingId ? 'Cotización actualizada' : 'Cotización creada',
      saveModifiedPrices && modifiedPriceItems.length
        ? 'La cotización quedó guardada y los precios editados se versionaron en el catálogo.'
        : editingId
          ? 'Los cambios de la cotización quedaron guardados y el pipeline se actualizó.'
          : 'La API registró la cotización y actualizó el pipeline.',
    );
    router.push('/quotations');
  }

  async function submitQuotation() {
    if (modifiedPriceItems.length) {
      setCatalogUpdateModalOpen(true);
      return;
    }

    await persistQuotation(false);
  }

  if (
    catalogQuery.isLoading ||
    clientsQuery.isLoading ||
    exchangeRateQuery.isLoading ||
    quotationTemplateQuery.isLoading ||
    quotationsQuery.isLoading ||
    serviceTemplatesQuery.isLoading ||
    workItemCatalogQuery.isLoading ||
    specialConsiderationCatalogQuery.isLoading
  ) {
    return (
      <div className="grid gap-6 xl:grid-cols-[220px_1.1fr_0.85fr]">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-4 py-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (user.displayRole === 'VIEWER') {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            Tu rol actual solo puede consultar tableros y reportes. Para crear cotizaciones necesitas un usuario editor o administrador.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (catalogQuery.isError || clientsQuery.isError || exchangeRateQuery.isError || quotationTemplateQuery.isError || quotationsQuery.isError || serviceTemplatesQuery.isError || workItemCatalogQuery.isError || specialConsiderationCatalogQuery.isError || !uiCatalog.length) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            No fue posible cargar catalogo, clientes o tipo de cambio.
          </p>
        </CardContent>
      </Card>
    );
  }

  const resolvedPrice = resolveProfilePrice();
  const createBlockedReason = !clientsQuery.data?.length
      ? 'Primero necesitas al menos un cliente.'
    : !clientId
      ? 'Selecciona un cliente.'
      : !items.length
          ? 'Agrega al menos un concepto al resumen.'
          : !exchangeRate
            ? 'Configura el tipo de cambio antes de generar.'
            : null;
  const canAdvanceFromClient = Boolean(clientId && currency);
  const canAdvanceFromServices = items.length > 0;
  const canAdvanceFromConsiderations = true;
  const canAdvanceFromWork = true;
  const stepItems = [
    { id: 'client', label: 'Configuración inicial' },
    { id: 'services', label: 'Conceptos' },
    { id: 'considerations', label: 'Consideraciones' },
    { id: 'work', label: 'Actividades' },
    { id: 'conditions', label: 'Condiciones' },
    { id: 'preview', label: 'Preview' },
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={editingId ? 'Editar cotización' : 'Nueva cotización'}
        title="Pipeline de cotización"
        description={
          editingId
            ? 'Estás editando una cotización existente. Ajusta cliente, conceptos y condiciones antes de guardar.'
            : 'Primero defines la configuración inicial, luego armas los conceptos, después ajustas condiciones y al final revisas el preview antes de generar.'
        }
      />

      {showToast ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastTitle} description={toastDescription} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {stepItems.map((item, index) => {
          const active = step === item.id;
          const completed =
            (item.id === 'client' && canAdvanceFromClient) ||
            (item.id === 'services' && canAdvanceFromServices) ||
            (item.id === 'considerations' && canAdvanceFromConsiderations) ||
            (item.id === 'work' && canAdvanceFromWork) ||
            (item.id === 'conditions' && commercialSections.length > 0);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                active
                  ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-[var(--color-primary)] text-white' : completed ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--color-panel-subtle)] text-[var(--color-text-muted)]'}`}>
                {index + 1}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>

      {step === 'client' ? (
          <Card>
          <CardHeader title="Paso 1. Configuración inicial" description="Define cliente, moneda y servicio base. El vendedor se toma automáticamente del usuario autenticado." />
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Buscar cliente</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                  <Input
                    value={clientQuery}
                    onFocus={() => setClientPaletteOpen(true)}
                    onBlur={() => window.setTimeout(() => setClientPaletteOpen(false), 120)}
                    onChange={(event) => {
                      setClientQuery(event.target.value);
                      setClientPaletteOpen(true);
                      setHighlightedClientIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (!clientPaletteOpen || !filteredClients.length) {
                        return;
                      }
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setHighlightedClientIndex((current) => Math.min(current + 1, filteredClients.length - 1));
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setHighlightedClientIndex((current) => Math.max(current - 1, 0));
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        chooseClient(filteredClients[highlightedClientIndex]?.id || filteredClients[0].id);
                      }
                      if (event.key === 'Escape') {
                        setClientPaletteOpen(false);
                      }
                    }}
                    className="pl-10"
                    placeholder="Buscar cliente o contacto"
                  />
                  {clientPaletteOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-2xl">
                      <div className="max-h-[320px] overflow-y-auto p-2">
                        {filteredClients.length ? (
                          filteredClients.slice(0, 12).map((client, index) => (
                            <button
                              key={client.id}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                chooseClient(client.id);
                              }}
                              className={`flex w-full items-start justify-between gap-4 rounded-2xl px-4 py-3 text-left transition ${highlightedClientIndex === index ? 'bg-[var(--color-panel-subtle)]' : 'hover:bg-[var(--color-panel-subtle)]'}`}
                            >
                              <div>
                                <p className="font-medium text-[var(--color-text)]">{client.legalName}</p>
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                  {client.rfc} · {client.contacts[0]?.fullName || 'Sin contacto'}
                                </p>
                              </div>
                              {selectedClient?.id === client.id ? <Check className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" /> : null}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-sm text-[var(--color-text-muted)]">No hay clientes que coincidan con la búsqueda.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Servicio</p>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Describe aquí tu servicio" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Título comercial</p>
                <Input value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} placeholder="Título visible para el cliente" />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Resumen ejecutivo</p>
                <Textarea value={executiveSummary} onChange={(event) => setExecutiveSummary(event.target.value)} rows={4} placeholder="Objetivo, alcance, entregables y valor comercial." />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cliente</p>
                <Select value={clientId} onChange={(event) => chooseClient(event.target.value)}>
                  <option value="">Selecciona cliente</option>
                  {filteredClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.legalName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vendedor</p>
                <div className="flex min-h-11 items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 text-sm text-[var(--color-text)]">
                  {selectedSeller?.name || 'Sin vendedor'}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Moneda</p>
                <Select value={currency} onChange={(event) => setCurrency(event.target.value as 'MXN' | 'USD')}>
                  <option value="MXN">Cotización en MXN</option>
                  <option value="USD">Cotización en DLLS</option>
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Catálogo de servicios</p>
                <Select
                  value={selectedTemplateId}
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    preloadFromQuotationTemplate(event.target.value);
                  }}
                >
                  <option value="">Selecciona servicio guardado</option>
                  {filteredServiceTemplates.map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>
                      {quotation.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Tipo de servicio</p>
                <Select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
                  <option value="General">General</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Diagnóstico">Diagnóstico</option>
                  <option value="Puesta en marcha">Puesta en marcha</option>
                  <option value="Proyecto">Proyecto</option>
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Plantilla comercial</p>
                <Select value={templateType} onChange={(event) => setTemplateType(event.target.value)}>
                  <option value="General">General</option>
                  <option value="Servicio">Servicio</option>
                  <option value="Proyecto">Proyecto</option>
                  <option value="Urgente">Urgente</option>
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Regla de precio</p>
                <Select value={pricingRule} onChange={(event) => setPricingRule(event.target.value)}>
                  <option value="STANDARD">Tarifa estándar</option>
                  <option value="URGENT">Urgencia alta</option>
                  <option value="PREFERRED_CLIENT">Cliente preferente</option>
                  <option value="WEEKEND">Fin de semana</option>
                </Select>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vigencia (días)</p>
                <Input value={validityDays} onChange={(event) => setValidityDays(event.target.value.replace(/[^\d]/g, ''))} placeholder="30" />
              </div>
            </div>

            {reusableTextBlocks.length ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Bloques reutilizables</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Puedes inyectar exclusiones, entregables, supuestos o garantías predefinidas.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {reusableTextBlocks.map((block) => {
                    const selected = selectedReusableBlockIds.includes(block.id);
                    return (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() =>
                          setSelectedReusableBlockIds((current) =>
                            current.includes(block.id) ? current.filter((id) => id !== block.id) : [...current, block.id],
                          )
                        }
                        className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          selected
                            ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                            : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                        }`}
                      >
                        <p className="font-medium">{block.name}</p>
                        <p className="mt-1 text-xs opacity-75">{block.type}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  const matched = filteredServiceTemplates.find(
                    (quotation) => quotation.name.trim().toLowerCase() === title.trim().toLowerCase(),
                  );
                  if (matched) {
                    preloadFromQuotationTemplate(matched.id);
                  } else {
                    showTimedToast('Sin coincidencias', 'No existe un servicio catalogado con ese nombre para precargar suministros.');
                  }
                }}
                disabled={!title.trim()}
              >
                Precargar suministros
              </Button>
            </div>

            {(selectedClient || selectedSeller) ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedClient ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cliente seleccionado</p>
                    <p className="mt-2 font-semibold text-[var(--color-text)]">{selectedClient.legalName}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedClient.rfc}</p>
                  </div>
                ) : null}
                {selectedSeller ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vendedor responsable</p>
                    <p className="mt-2 font-semibold text-[var(--color-text)]">{selectedSeller.name}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={() => setStep('services')} disabled={!canAdvanceFromClient}>
                Continuar a suministros
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'services' ? (
        <div className="grid gap-6 xl:grid-cols-[240px_1fr_0.85fr]">
          <Card>
            <CardHeader title="Categorías" description="Filtra por familia de suministros." />
            <CardContent className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Buscar por clave</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                  <Input
                    value={serviceQuery}
                    onChange={(event) => {
                      setServiceQuery(event.target.value);
                    }}
                    className="pl-10"
                    placeholder="Ej. metalc"
                  />
                </div>
              </div>
              {uiCatalog.map((category) => (
                <button
                  key={category.code}
                  onClick={() => {
                    setActiveCategory(category.code);
                    setServiceQuery('');
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                    resolvedActiveCategory === category.code
                      ? 'bg-[var(--color-secondary)] text-white'
                      : 'bg-[var(--color-panel-subtle)] text-[var(--color-text)] hover:bg-white'
                  }`}
                >
                  <p className="font-medium">{category.name}</p>
                  <p className={`mt-1 text-xs ${resolvedActiveCategory === category.code ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}>
                    {category.services.length} suministros
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Paso 2. Suministros" description="Agrega todos los suministros necesarios antes de pasar a condiciones." action={<Badge variant="info">Ordenados por clave</Badge>} />
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  {serviceQuery.trim()
                    ? `${filteredServices.length} resultados por clave`
                    : `${filteredServices.length} suministros visibles`}
                </div>
                <Select value={selectedService?.id || ''} onChange={(event) => chooseService(event.target.value)}>
                  {filteredServices.length ? null : <option value="">Sin suministros</option>}
                  {filteredServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.code}
                    </option>
                  ))}
                </Select>
              </div>

              <Select value={selectedProfile?.id || ''} onChange={(event) => setSelectedPricingProfileId(event.target.value)}>
                {availableProfiles.length ? null : <option value="">Sin opciones de precio</option>}
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </Select>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{selectedService?.name || 'Selecciona un suministro'}</p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{selectedService?.code || 'SIN CLAVE'}</p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {selectedService?.description || 'Elige suministro y opción de precio configurable.'}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                      {(selectedService?.categoryName || currentCategory?.name || 'SIN CATEGORIA') + (selectedProfile ? ` · ${selectedProfile.name}` : '')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">
                      {selectedUnitPriceInput ? formatCurrency(parseFormattedDecimal(selectedUnitPriceInput) || 0, currency) : resolvedPrice ? formatCurrency(resolvedPrice.price, currency) : '-'}
                    </p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedQuantity((current) => Math.max(1, current - 1))}
                        className="rounded-xl border border-[var(--color-border)] bg-white p-2 hover:bg-[var(--color-panel-subtle)]"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <Input
                        value={String(selectedQuantity)}
                        onChange={(event) => {
                          const nextQuantity = Number(event.target.value.replace(/[^0-9]/g, ''));
                          setSelectedQuantity(nextQuantity > 0 ? nextQuantity : 1);
                        }}
                        className="h-10 w-20 text-center"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedQuantity((current) => current + 1)}
                        className="rounded-xl border border-[var(--color-border)] bg-white p-2 hover:bg-[var(--color-panel-subtle)]"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 w-44">
                      <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">P.U. editable</p>
                      <Input
                        value={selectedUnitPriceInput}
                        onFocus={() => {
                          const parsed = parseFormattedDecimal(selectedUnitPriceInput);
                          setSelectedUnitPriceInput(parsed === null ? '' : parsed.toFixed(2));
                        }}
                        onChange={(event) => setSelectedUnitPriceInput(event.target.value)}
                        onBlur={() => {
                          const parsed = parseFormattedDecimal(selectedUnitPriceInput);
                          setSelectedUnitPriceInput(
                            parsed === null ? '' : formatEditableMoney(parsed, currency),
                          );
                        }}
                        className="h-10 text-right"
                      />
                    </div>
                    <button
                      onClick={addConfiguredService}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgba(249,115,22,0.1)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between pt-4">
                <Button variant="secondary" onClick={() => setStep('client')}>
                  Regresar
                </Button>
                <Button onClick={() => setStep('considerations')} disabled={!canAdvanceFromServices}>
                  Continuar a consideraciones
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Resumen de suministros" description="Siempre puedes regresar y ajustar antes de continuar." />
            <CardContent className="space-y-4">
              {items.map((item) => {
                const key = `${item.code}-${item.pricingProfileId}-${item.currency}`;
                return (
                  <div key={key} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-text)]">{item.code}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {item.pricingProfileName} · P.U. {formatCurrency(item.price, item.currency)}
                        </p>
                      </div>
                      <button onClick={() => removeItem(key)} className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-danger)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 rounded-2xl bg-white p-1">
                        <button onClick={() => changeQuantity(key, -1)} className="rounded-xl p-2 hover:bg-[var(--color-panel-subtle)]">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button onClick={() => changeQuantity(key, 1)} className="rounded-xl p-2 hover:bg-[var(--color-panel-subtle)]">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="min-w-36 text-right font-semibold">{formatCurrency(item.price * item.quantity, item.currency)}</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_1fr]">
                      <button
                        type="button"
                        onClick={() => toggleOptionalItem(key)}
                        className={`rounded-2xl border px-4 py-3 text-sm transition ${
                          item.isOptional
                            ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] text-[var(--color-text)]'
                            : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]'
                        }`}
                      >
                        {item.isOptional ? 'Concepto opcional' : 'Marcar opcional'}
                      </button>
                      <Input
                        value={item.optionGroup || ''}
                        onChange={(event) => updateOptionalMeta(key, 'optionGroup', event.target.value)}
                        placeholder="Grupo alternativo"
                      />
                      <Input
                        value={item.optionLabel || ''}
                        onChange={(event) => updateOptionalMeta(key, 'optionLabel', event.target.value)}
                        placeholder="Etiqueta comercial"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="rounded-[28px] bg-[var(--color-secondary)] p-5 text-white">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-white/70">Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-white/70">IVA</span><span>{formatCurrency(tax, currency)}</span></div>
                  <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold"><span>Total</span><span>{formatCurrency(total, currency)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 'considerations' ? (
        <Card>
          <CardHeader
            title="Paso 3. Consideraciones especiales"
            description="Agrega conceptos adicionales y viáticos. Los conceptos, porcentajes y lugares quedan guardados para reutilizarlos en siguientes cotizaciones."
          />
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Conceptos adicionales</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Cada concepto puede sumarse por porcentaje o como monto fijo.</p>
                </div>
                <Button variant="secondary" onClick={addPercentageConsideration}>
                  <Plus className="h-4 w-4" />
                  Agregar concepto
                </Button>
              </div>

              {specialConsiderations.filter((item) => item.type === 'PERCENTAGE').map((item) => (
                <div
                  key={item.localId}
                  className={`grid gap-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4 ${
                    item.mode === 'PERCENTAGE'
                      ? 'md:grid-cols-[84px_minmax(0,0.8fr)_220px_180px_48px]'
                      : 'md:grid-cols-[84px_minmax(0,0.8fr)_220px_190px_190px_48px]'
                  }`}
                >
                  <Input
                    value={item.quantity}
                    onChange={(event) => updatePercentageConsideration(item.localId, 'quantity', event.target.value)}
                    placeholder="Cantidad"
                    className="text-right"
                  />
                  <div>
                    <Input
                      list={`percentage-catalog-${item.localId}`}
                      value={item.concept}
                      onChange={(event) => updatePercentageConsideration(item.localId, 'concept', event.target.value)}
                      onBlur={(event) => applyPercentageSuggestion(item.localId, event.target.value)}
                      placeholder="Concepto"
                    />
                    <datalist id={`percentage-catalog-${item.localId}`}>
                      {percentageCatalog.map((entry) => (
                        <option key={`${entry.concept}-${entry.percentage}`} value={entry.concept} />
                      ))}
                    </datalist>
                  </div>
                  <Select
                    value={item.mode}
                    onChange={(event) => updatePercentageMode(item.localId, event.target.value as PercentageConsideration['mode'])}
                    className="text-right"
                  >
                    <option value="PERCENTAGE">Aumento en porcentaje</option>
                    <option value="FIXED">Aumento en pesos</option>
                  </Select>
                  {item.mode === 'PERCENTAGE' ? (
                    <Input
                      value={item.percentage}
                      onChange={(event) => updatePercentageConsideration(item.localId, 'percentage', event.target.value)}
                      placeholder="% adicional"
                      className="text-right"
                    />
                  ) : (
                    <>
                      <Input
                        value={item.mxnAmount}
                        onFocus={() => focusMoneyField(item.localId, 'PERCENTAGE', 'mxnAmount')}
                        onBlur={() => blurMoneyField(item.localId, 'PERCENTAGE', 'mxnAmount')}
                        onChange={(event) => syncConvertedAmount(item.localId, 'PERCENTAGE', 'mxnAmount', event.target.value)}
                        className="text-right"
                      />
                      <Input
                        value={item.usdAmount}
                        onFocus={() => focusMoneyField(item.localId, 'PERCENTAGE', 'usdAmount')}
                        onBlur={() => blurMoneyField(item.localId, 'PERCENTAGE', 'usdAmount')}
                        onChange={(event) => syncConvertedAmount(item.localId, 'PERCENTAGE', 'usdAmount', event.target.value)}
                        className="text-right"
                      />
                    </>
                  )}
                  <Button variant="secondary" onClick={() => removeSpecialConsideration(item.localId)} className="h-11 w-11 min-w-11 px-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Viáticos</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Define lugar y monto en pesos y dólares para reutilizarlos después.</p>
                </div>
                <Button variant="secondary" onClick={addTravelConsideration}>
                  <Plus className="h-4 w-4" />
                  Agregar viático
                </Button>
              </div>

              {specialConsiderations.filter((item) => item.type === 'TRAVEL').map((item) => (
                <div key={item.localId} className="grid gap-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4 md:grid-cols-[1fr_180px_180px_48px]">
                  <div>
                    <Input
                      list={`travel-catalog-${item.localId}`}
                      value={item.location}
                      onChange={(event) => updateTravelConsideration(item.localId, 'location', event.target.value)}
                      onBlur={(event) => applyTravelSuggestion(item.localId, event.target.value)}
                      placeholder="Lugar"
                    />
                    <datalist id={`travel-catalog-${item.localId}`}>
                      {travelCatalog.map((entry) => (
                        <option key={`${entry.location}-${entry.mxnAmount}-${entry.usdAmount}`} value={entry.location} />
                      ))}
                    </datalist>
                  </div>
                  <Input
                    value={item.mxnAmount}
                    onFocus={() => focusMoneyField(item.localId, 'TRAVEL', 'mxnAmount')}
                    onBlur={() => blurMoneyField(item.localId, 'TRAVEL', 'mxnAmount')}
                    onChange={(event) => syncConvertedAmount(item.localId, 'TRAVEL', 'mxnAmount', event.target.value)}
                    className="text-right"
                  />
                  <Input
                    value={item.usdAmount}
                    onFocus={() => focusMoneyField(item.localId, 'TRAVEL', 'usdAmount')}
                    onBlur={() => blurMoneyField(item.localId, 'TRAVEL', 'usdAmount')}
                    onChange={(event) => syncConvertedAmount(item.localId, 'TRAVEL', 'usdAmount', event.target.value)}
                    className="text-right"
                  />
                  <Button variant="secondary" onClick={() => removeSpecialConsideration(item.localId)} className="h-11 w-11 min-w-11 px-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Subtotal suministros</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(serviceSubtotal, currency)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Adicionales %</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(percentageSubtotal, currency)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Adicionales fijos</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(fixedConsiderationsSubtotal, currency)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Viáticos</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(travelSubtotal, currency)}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep('services')}>
                Regresar a suministros
              </Button>
              <Button onClick={() => setStep('work')} disabled={!canAdvanceFromConsiderations}>
                Continuar a actividades
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'work' ? (
        <Card>
          <CardHeader title="Paso 4. Actividades" description="Las actividades automáticas se ordenan por clave del suministro y se muestran como un solo bloque de prosa." />
          <CardContent className="space-y-4">
            {commercialSections
              .filter((section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:')
              .map((section, index) => {
                const sourceIndex = commercialSections.findIndex(
                  (entry) => normalizeSectionTitle(entry.title) === normalizeSectionTitle(section.title),
                );
                const workItems = combinedWorkItems;

                return (
                  <div key={`${section.title}-${index}`} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <Input
                      value={section.title}
                      onChange={(event) => updateCommercialSection(sourceIndex, 'title', event.target.value)}
                      placeholder="Título de sección"
                    />
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <Select value={selectedWorkItem} onChange={(event) => setSelectedWorkItem(event.target.value)}>
                          <option value="">Selecciona actividad guardada</option>
                          {workItemCatalog.map((item) => (
                            <option key={item.id} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </Select>
                        <Button variant="secondary" onClick={addWorkItemFromCatalog}>
                          <Plus className="h-4 w-4" />
                          Agregar
                        </Button>
                      </div>

                      {workItems.length ? (
                        <div className="rounded-2xl bg-white px-4 py-4">
                          <p className="whitespace-pre-line text-sm leading-7 text-[var(--color-text)]">
                            {workItems.join('\n')}
                          </p>
                          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                            Las actividades se ordenan por clave del suministro. “Entrega de reporte” siempre se envía al final.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white px-4 py-4 text-sm text-[var(--color-text-muted)]">
                          Agrega actividades desde el catálogo o escríbelas manualmente abajo.
                        </div>
                      )}

                      <Textarea
                        value={manualWorkItems.join('\n')}
                        onChange={(event) => updateWorkItemsContent(splitWorkItems(event.target.value))}
                        placeholder="Actividades adicionales. Cada renglón será una actividad independiente"
                        className="min-h-[180px]"
                      />
                    </div>
                  </div>
                );
              })}

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep('considerations')}>
                Regresar a consideraciones
              </Button>
              <Button onClick={() => setStep('conditions')} disabled={!canAdvanceFromWork}>
                Continuar a condiciones
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'conditions' ? (
        <Card>
          <CardHeader title="Paso 5. Condiciones generales" description="Estas secciones quedan como último valor usado para la siguiente cotización." />
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {commercialSections
                .filter((section) => normalizeSectionTitle(section.title) !== 'trabajos a realizar:')
                .map((section, index) => {
                  const sourceIndex = commercialSections.findIndex(
                    (entry, entryIndex) =>
                      entryIndex >= 0 &&
                      entry.title === section.title &&
                      entry.content === section.content &&
                      normalizeSectionTitle(entry.title) !== 'trabajos a realizar:',
                  );

                  return (
                    <div key={`${section.title}-${index}`} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                      <Input
                        value={section.title}
                        onChange={(event) => updateCommercialSection(sourceIndex, 'title', event.target.value)}
                        placeholder="Título de sección"
                      />
                      <Textarea
                        value={section.content}
                        onChange={(event) => updateCommercialSection(sourceIndex, 'content', event.target.value)}
                        placeholder="Contenido de la sección"
                        className="mt-3 min-h-[180px]"
                      />
                    </div>
                  );
                })}
              <Button variant="secondary" onClick={addCommercialSection}>
                <Plus className="h-4 w-4" />
                Agregar sección
              </Button>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep('work')}>
                Regresar a actividades
              </Button>
              <Button onClick={() => setStep('preview')}>
                Ir al preview
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'preview' ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
          <CardHeader title="Paso 6. Preview de la cotización" description="Revisa cliente, suministros, actividades, consideraciones y condiciones antes de generar la cotización." />
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Portada comercial</p>
                <p className="mt-2 font-semibold text-[var(--color-text)]">{coverTitle || title || 'Sin título'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)] whitespace-pre-line">{executiveSummary || 'Agrega un resumen ejecutivo para reforzar el valor comercial.'}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Tipo</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{serviceType}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Plantilla</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{templateType}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vigencia</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{validityDays || '30'} días</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cliente</p>
                <p className="mt-2 font-semibold text-[var(--color-text)]">{selectedClient?.legalName || 'Sin cliente'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedClient?.rfc || ''}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vendedor</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedSeller?.name || 'Sin vendedor'}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Regla de precio</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{pricingRule}</p>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Conceptos agregados</p>
                <div className="mt-4 space-y-3">
                  {previewConceptRows.map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-3 rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-[var(--color-text)]">{item.code}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {item.detail}
                        </p>
                      </div>
                      <p className="font-semibold">{formatCurrency(item.total, currency)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Actividades</p>
                <div className="mt-4 space-y-3">
                  {combinedWorkItems.length ? (
                    <div className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-4">
                      <p className="whitespace-pre-line text-sm leading-7 text-[var(--color-text)]">
                        {combinedWorkItems.join('\n')}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                      No agregaste actividades.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Condiciones generales</p>
                <div className="mt-4 space-y-3">
                  {generalSections.map((section, index) => (
                    <div key={`${section.title}-${index}`} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-4">
                      <p className="font-medium">{section.title}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">{section.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Consideraciones especiales</p>
                <div className="mt-4 space-y-3">
                  {specialConsiderations.length ? (
                    specialConsiderations.map((item) => (
                      <div key={item.localId} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-4">
                        {item.type === 'PERCENTAGE' ? (
                          <>
                            <p className="font-medium">{item.concept || 'Concepto sin nombre'}</p>
                            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                              {item.mode === 'PERCENTAGE'
                                ? `${item.percentage || '0'} % adicional`
                                : `Cantidad ${item.quantity || '1'} · ${item.mxnAmount || formatCurrency(0, 'MXN')} · ${item.usdAmount || formatCurrency(0, 'USD')}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium">{item.location || 'Lugar sin nombre'}</p>
                            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                              {formatCurrency(Number(item.mxnAmount || 0), 'MXN')} · {formatCurrency(Number(item.usdAmount || 0), 'USD')}
                            </p>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                      No agregaste consideraciones especiales para esta cotización.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Totales y acción final" description="Siempre puedes regresar a un paso anterior para hacer ajustes." />
            <CardContent className="space-y-4">
              <div className="rounded-[28px] bg-[var(--color-secondary)] p-5 text-white">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-white/70">Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-white/70">IVA</span><span>{formatCurrency(tax, currency)}</span></div>
                  <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold"><span>Total</span><span>{formatCurrency(total, currency)}</span></div>
                </div>
                <Button
                  className="mt-5 w-full"
                  onClick={submitQuotation}
                  disabled={
                    Boolean(createBlockedReason) ||
                    createMutation.isPending ||
                    updateBuilderMutation.isPending ||
                    updatePricingProfilesMutation.isPending
                  }
                >
                  {createMutation.isPending || updateBuilderMutation.isPending || updatePricingProfilesMutation.isPending
                    ? editingId
                      ? 'Guardando...'
                      : 'Generando...'
                    : editingId
                      ? 'Guardar cambios'
                      : 'Generar cotización'}
                </Button>
                {createBlockedReason ? <p className="mt-3 text-xs text-white/70">{createBlockedReason}</p> : null}
              </div>

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep('conditions')}>
                  Regresar a condiciones
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Modal
        open={catalogUpdateModalOpen}
        onClose={() => setCatalogUpdateModalOpen(false)}
        title="Guardar precios modificados"
        description="Detectamos precios unitarios ajustados manualmente. Puedes dejar el descuento solo en esta cotización o versionarlo en el catálogo."
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {modifiedPriceItems.map((item) => (
              <div key={`${item.code}-${item.pricingProfileId}`} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3">
                <p className="font-medium text-[var(--color-text)]">{item.name}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.code} · {item.pricingProfileName}</p>
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  Anterior {formatCurrency(item.basePrice, item.currency)} · Nuevo {formatCurrency(item.price, item.currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                setCatalogUpdateModalOpen(false);
                await persistQuotation(false);
              }}
            >
              Solo esta cotización
            </Button>
            <Button
              onClick={async () => {
                setCatalogUpdateModalOpen(false);
                await persistQuotation(true);
              }}
            >
              Guardar y reemplazar catálogo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

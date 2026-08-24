'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, Minus, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  useCatalog,
  useClients,
  useCompanyProfile,
  useCreateQuotation,
  useCreateWorkItemCatalog,
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

import {
  createLocalId,
  getSummaryItemKey,
  getItemLineTotal,
  isActivityConcept,
  normalizeConceptName,
  getNextActivityCode,
  isDerivedSpecialConsiderationItem,
  formatPercentageLabel,
  normalizeDecimalInput,
  truncateToTwoDecimals,
  parseFormattedDecimal,
  formatMoneyInputDisplay,
  formatEditableMoney,
  DEFAULT_COMMERCIAL_SECTIONS,
  PARTS_METADATA_SECTION_TITLE,
  WORK_ITEMS_METADATA_SECTION_TITLE,
  buildDefaultCommercialSections,
  normalizeSectionTitle,
  normalizeCommercialSections,
  isPartsMetadataSection,
  isWorkItemsMetadataSection,
  isInternalMetadataSection,
  stripInternalMetadata,
  buildPartDefinitions,
  serializePartDefinitionsSection,
  parsePartDefinitionsSection,
  mergeCommercialSectionsWithPartDefinitions,
  serializeWorkItemsMetadataSection,
  parseWorkItemsMetadataSection,
  mergeCommercialSectionsWithMetadata,
  getPartDisplayTitle,
  getPartSelectorLabel,
  splitWorkItems,
  mergeUniqueStrings,
  mergeWorkItemsPreservingOrder,
  normalizeWorkLabel,
  isReportDeliveryWorkItem,
  orderWorkItemsWithReportLast,
  compareWorkItemCodes,
  deriveAutoWorkItemsFromSeed,
  extractManualWorkItems,
} from './quotation-builder.utils';
import type {
  SummaryItem,
  CommercialSection,
  PartDefinition,
  PercentageConsideration,
  TravelConsideration,
  SpecialConsideration,
} from './quotation-builder.utils';

export function QuotationBuilder() {
  const { user } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get('edit');
  const isEditingQuotationMode = Boolean(editingId);
  const catalogQuery = useCatalog();
  const clientsQuery = useClients();
  const companyProfileQuery = useCompanyProfile();
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
  const createWorkItemCatalogMutation = useCreateWorkItemCatalog();
  const updateBuilderMutation = useUpdateQuotationFromBuilder();

  const uiCatalog = useMemo(
    () => (catalogQuery.data ? mapCatalogForUi(catalogQuery.data) : []),
    [catalogQuery.data],
  );

  const [activeCategory, setActiveCategory] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
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
  const [partCount, setPartCount] = useState(0);
  const [currentPartNumber, setCurrentPartNumber] = useState(1);
  const [partQuantities, setPartQuantities] = useState<Record<number, number>>({});
  const [partTitles, setPartTitles] = useState<Record<number, string>>({});
  const [partDraftNumber, setPartDraftNumber] = useState('1');
  const [partDraftTitle, setPartDraftTitle] = useState('');
  const [finalChargeRateInput, setFinalChargeRateInput] = useState('16');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedCatalogActivityId, setSelectedCatalogActivityId] = useState('');
  const [selectedPricingProfileId, setSelectedPricingProfileId] = useState('');
  const [selectedConceptName, setSelectedConceptName] = useState('');
  const [selectedConceptCode, setSelectedConceptCode] = useState('');
  const [suggestedActivityCode, setSuggestedActivityCode] = useState('');
  const [preparingNewActivity, setPreparingNewActivity] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedDays, setSelectedDays] = useState(1);
  const [selectedUnitPriceInput, setSelectedUnitPriceInput] = useState('');
  const [commercialSections, setCommercialSections] = useState<CommercialSection[]>([]);
  const [manualWorkItems, setManualWorkItems] = useState<string[]>([]);
  const [hiddenAutoWorkItems, setHiddenAutoWorkItems] = useState<string[]>([]);
  const [specialConsiderations, setSpecialConsiderations] = useState<SpecialConsideration[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastTitle, setToastTitle] = useState('Servicio agregado');
  const [toastDescription, setToastDescription] = useState('El resumen se recalculo en tiempo real.');
  const [didHydrateEdit, setDidHydrateEdit] = useState(false);
  const [draftQuotationId, setDraftQuotationId] = useState<string | null>(null);
  const [catalogUpdateModalOpen, setCatalogUpdateModalOpen] = useState(false);
  const [selectedWorkItem, setSelectedWorkItem] = useState('');
  const [workItemInputMode, setWorkItemInputMode] = useState<'CATALOG' | 'FREE_TEXT'>('CATALOG');
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
  const isPreparingNewActivityMode = resolvedActiveCategory === 'ACT' && preparingNewActivity;
  const isActivityForm = resolvedActiveCategory === 'ACT';
  const hasExplicitActivitySelection = Boolean(selectedCatalogActivityId || selectedServiceId);
  const isBlankActivityMode = isActivityForm && !hasExplicitActivitySelection;
  const activityTemplateService = allServices.find((service) => service.categoryCode === 'ACT');
  const selectedService =
    allServices.find((service) => service.id === (isActivityForm ? selectedCatalogActivityId : selectedServiceId));
  const conceptBaseService = selectedService || ((isBlankActivityMode || isPreparingNewActivityMode) ? activityTemplateService : undefined);
  const availableProfiles = conceptBaseService?.pricingProfiles || [];
  const selectedProfile =
    availableProfiles.find((profile) => profile.id === selectedPricingProfileId) || availableProfiles[0];
  const previewSelectedCode = useMemo(() => {
    if (!selectedService && !(isPreparingNewActivityMode || isBlankActivityMode)) {
      return 'SIN CLAVE';
    }

    if (!selectedService && (isPreparingNewActivityMode || isBlankActivityMode)) {
      return suggestedActivityCode || getNextActivityCode(allServices);
    }

    if (!selectedService) {
      return 'SIN CLAVE';
    }

    if (!isActivityConcept(selectedService)) {
      return selectedService.code;
    }

    const normalizedSelectedName = normalizeConceptName(selectedService.name);
    const normalizedConcept = normalizeConceptName(selectedConceptName);
    const normalizedCode = selectedConceptCode.trim().toUpperCase();
    if (normalizedCode) {
      return normalizedCode;
    }

    if (!normalizedConcept) {
      return suggestedActivityCode || getNextActivityCode(allServices);
    }

    if (normalizedConcept === normalizedSelectedName) {
      return selectedService.code;
    }

    if (suggestedActivityCode) {
      return suggestedActivityCode;
    }

    const existingActivity = allServices.find(
      (service) =>
        isActivityConcept(service) &&
        normalizeConceptName(service.name) === normalizedConcept,
    );

    return existingActivity?.code || getNextActivityCode(allServices);
  }, [allServices, isBlankActivityMode, isPreparingNewActivityMode, selectedConceptCode, selectedConceptName, selectedService, suggestedActivityCode]);
  const filteredClients = useMemo(() => {
    const clients = clientsQuery.data || [];
    const normalizedQuery = clientName.trim().toLowerCase();
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
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)),
    );
  }, [clientName, clientsQuery.data]);
  const exactClientByName = useMemo(() => {
    const normalizedName = clientName.trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }

    return (
      (clientsQuery.data || []).find(
        (client) => client.legalName.trim().toLowerCase() === normalizedName,
      ) || null
    );
  }, [clientName, clientsQuery.data]);
  const selectedClient =
    (clientId
      ? (clientsQuery.data || []).find((client) => client.id === clientId) || null
      : exactClientByName);
  const availableClientContacts = selectedClient?.contacts || [];
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
  const activityNameSuggestions = useMemo(() => {
    if (!isActivityForm) {
      return [];
    }

    const query = normalizeConceptName(selectedConceptName);
    if (!query) {
      return [];
    }

    const words = query.split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [];
    }

    return allServices
      .filter((service) => isActivityConcept(service))
      .filter((service) => {
        const candidate = normalizeConceptName(service.name);
        return candidate !== query && words.every((word) => candidate.includes(word));
      })
      .slice(0, 6);
  }, [allServices, isActivityForm, selectedConceptName]);
  const partDefinitions = useMemo(
    () => buildPartDefinitions(partCount, partQuantities, partTitles),
    [partCount, partQuantities, partTitles],
  );
  const hasPartDefinitions = partDefinitions.length > 0;
  const currentPartItems = useMemo(
    () =>
      items.filter((item) =>
        hasPartDefinitions
          ? item.partNumber === currentPartNumber
          : item.partNumber <= 0,
      ),
    [currentPartNumber, hasPartDefinitions, items],
  );
  const currentPartDefinition =
    partDefinitions.find((part) => part.partNumber === currentPartNumber) ||
    partDefinitions[0] ||
    null;
  const currentPartQuantity = Math.max(1, partQuantities[currentPartNumber] || 1);
  const companyDefaultSections = useMemo(
    () => buildDefaultCommercialSections(companyProfileQuery.data),
    [companyProfileQuery.data],
  );

  const exchangeRate = Number(exchangeRateQuery.data?.rate || 0);
  const serviceSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + getItemLineTotal(item), 0),
    [items],
  );
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
  const finalChargeRate = Math.max(0, Number(normalizeDecimalInput(finalChargeRateInput) || 16));
  const finalChargeLabel = Math.abs(finalChargeRate - 16) < 0.0001 ? 'IVA' : 'Utilidad';
  const tax = subtotal * (finalChargeRate / 100);
  const total = subtotal + tax;
  const modifiedPriceItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.sourceType === 'SERVICE' &&
          item.priceOverridden &&
          Math.abs(item.price - item.basePrice) > 0.009,
      ),
    [items],
  );
  const previewConceptRows = useMemo<Array<{
    key: string;
    name: string;
    partNumber: number;
    partQuantity: number;
    code: string;
    detail: string;
    total: number;
  }>>(() => {
    const conceptRows = items.map((item) => ({
      key: item.localId,
      name: item.name,
      partNumber: item.partNumber,
      partQuantity: item.partQuantity,
      code: item.code,
      detail:
        item.sourceType === 'ACTIVITY'
          ? `${item.pricingProfileName} · P.U./día ${formatCurrency(item.price, item.currency)} · Cantidad ${item.quantity} · Días ${item.days}${item.partQuantity > 1 ? ` · Partida x ${item.partQuantity}` : ''}`
          : `${item.pricingProfileName} · P.U. ${formatCurrency(item.price, item.currency)} · Cantidad ${item.quantity}${item.partQuantity > 1 ? ` · Partida x ${item.partQuantity}` : ''}`,
      total: getItemLineTotal(item),
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
            partNumber: 0,
            partQuantity: 1,
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
          partNumber: 0,
          partQuantity: 1,
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
        partNumber: 0,
        partQuantity: 1,
        code: 'VIATICOS',
        detail: `Monto fijo · P.U. ${formatCurrency(totalAmount, currency)} · Cantidad 1`,
        total: totalAmount,
      }];
    });

    return [...conceptRows, ...specialRows];
  }, [currency, exchangeRate, items, serviceSubtotal, specialConsiderations]);
  const previewConceptRowsByPart = useMemo(() => {
    const grouped = new Map<number, typeof previewConceptRows>();

    previewConceptRows.forEach((item) => {
      const partNumber = item.partNumber || 0;
      const current = grouped.get(partNumber) || [];
      current.push(item);
      grouped.set(partNumber, current);
    });

    return Array.from(grouped.entries()).sort((left, right) => left[0] - right[0]);
  }, [previewConceptRows]);

  useEffect(() => {
    setPartQuantities((current) => {
      const next: Record<number, number> = {};
      for (let part = 1; part <= partCount; part += 1) {
        next[part] = Math.max(1, current[part] || 1);
      }
      return next;
    });
    setPartTitles((current) => {
      const next: Record<number, string> = {};
      for (let part = 1; part <= partCount; part += 1) {
        next[part] = current[part] || '';
      }
      return next;
    });
    setItems((current) => current.filter((item) => item.partNumber <= partCount));
    setCurrentPartNumber((current) => {
      if (partCount <= 0) {
        return 1;
      }

      return Math.max(1, Math.min(current, partCount));
    });
    setPartDraftNumber((current) => {
      const parsed = Number(current.replace(/[^0-9]/g, ''));
      if (!parsed || parsed > partCount + 1) {
        return String(partCount + 1);
      }

      return current;
    });
  }, [partCount]);
  const autoWorkItems = useMemo(
    () => deriveAutoWorkItemsFromSeed(items),
    [items],
  );
  const visibleAutoWorkItems = useMemo(
    () => autoWorkItems.filter((item) => !hiddenAutoWorkItems.includes(item)),
    [autoWorkItems, hiddenAutoWorkItems],
  );
  const workSection = useMemo(
    () =>
      commercialSections.find(
        (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
      ) || null,
    [commercialSections],
  );
  const combinedWorkItems = useMemo(
    () => splitWorkItems(workSection?.content || ''),
    [workSection?.content],
  );
  const generalSections = useMemo(
    () =>
      stripInternalMetadata(commercialSections).filter(
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
    if (!filteredClients.length) {
      setHighlightedClientIndex(0);
      return;
    }

    setHighlightedClientIndex((current) => Math.min(current, filteredClients.length - 1));
  }, [filteredClients]);

  useEffect(() => {
    if (isPreparingNewActivityMode || isBlankActivityMode) {
      return;
    }

    if (selectedService && !selectedPricingProfileId && selectedService.pricingProfiles[0]) {
      setSelectedPricingProfileId(selectedService.pricingProfiles[0].id);
    }
  }, [isBlankActivityMode, isPreparingNewActivityMode, selectedPricingProfileId, selectedService]);

  useEffect(() => {
    if (isBlankActivityMode) {
      setSelectedConceptName('');
      setSelectedConceptCode('');
      setSuggestedActivityCode(getNextActivityCode(allServices));
      setSelectedUnitPriceInput('');
      setSelectedQuantity(1);
      setSelectedDays(1);
      return;
    }

    if (selectedService && isActivityConcept(selectedService)) {
      if (preparingNewActivity) {
        setSelectedConceptName('');
        setSelectedConceptCode('');
        setSuggestedActivityCode(getNextActivityCode(allServices));
      } else {
        setSelectedConceptName('');
        setSelectedConceptCode('');
        setSuggestedActivityCode(getNextActivityCode(allServices));
      }
    } else {
      setSelectedConceptName('');
      setSelectedConceptCode('');
      setSuggestedActivityCode('');
    }
    setSelectedDays(1);
  }, [allServices, isBlankActivityMode, preparingNewActivity, selectedService?.id]);

  useEffect(() => {
    if (!(isPreparingNewActivityMode || isBlankActivityMode)) {
      return;
    }

    setSelectedServiceId('');
    setSelectedPricingProfileId('');
    setSelectedConceptName('');
    setSelectedConceptCode('');
    setSelectedUnitPriceInput('');
    setSelectedQuantity(1);
    setSelectedDays(1);
    setSuggestedActivityCode(getNextActivityCode(allServices));
  }, [allServices, isBlankActivityMode, isPreparingNewActivityMode]);

  useEffect(() => {
    if (selectedService?.categoryCode && selectedService.categoryCode !== resolvedActiveCategory) {
      setActiveCategory(selectedService.categoryCode);
    }
  }, [resolvedActiveCategory, selectedService]);

  useEffect(() => {
    if (!selectedService || executiveSummary.trim()) {
      return;
    }

    const fallback =
      selectedService.description ||
      selectedService.relatedWork ||
      selectedService.name ||
      '';
    if (fallback.trim()) {
      setExecutiveSummary(fallback.trim());
    }
  }, [selectedService, executiveSummary]);

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
      const templatePartDefinitions = parsePartDefinitionsSection(normalizedSections, 0, {});
      const workItemsMetadata = parseWorkItemsMetadataSection(normalizedSections);
      setCommercialSections(normalizedSections);
      setPartCount(templatePartDefinitions.length);
      setPartTitles(
        templatePartDefinitions.reduce<Record<number, string>>((acc, part) => {
          acc[part.partNumber] = part.title;
          return acc;
        }, {}),
      );
      setPartQuantities(
        templatePartDefinitions.reduce<Record<number, number>>((acc, part) => {
          acc[part.partNumber] = part.quantity;
          return acc;
        }, {}),
      );
      setCurrentPartNumber(1);
      setPartDraftNumber(String(templatePartDefinitions.length + 1));
      setPartDraftTitle('');
      setHiddenAutoWorkItems(workItemsMetadata.hiddenAutoWorkItems);
      const initialWorkSection = normalizedSections.find(
        (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
      );
      setManualWorkItems([]);
      return;
    }

    setCommercialSections(companyDefaultSections);
    setPartCount(0);
    setPartTitles({});
    setPartQuantities({});
    setCurrentPartNumber(1);
    setPartDraftNumber('1');
    setPartDraftTitle('');
    setManualWorkItems([]);
    setHiddenAutoWorkItems([]);
  }, [companyDefaultSections, quotationTemplateQuery.data]);

  useEffect(() => {
    setDidHydrateEdit(false);
    setDraftQuotationId(null);
  }, [editingId]);

  useEffect(() => {
    if (!editingQuotation || didHydrateEdit || !allServices.length) {
      return;
    }

    setClientId(editingQuotation.client.id);
    setClientName(editingQuotation.client.legalName || '');
    setContactName(editingQuotation.contactName || '');
    setTitle(editingQuotation.title);
    setCoverTitle(editingQuotation.coverTitle || editingQuotation.title);
    setExecutiveSummary(editingQuotation.executiveSummary || '');
    setServiceType(editingQuotation.serviceType || 'General');
    setTemplateType(editingQuotation.templateType || 'General');
    setPricingRule(editingQuotation.pricingRule || 'STANDARD');
    setFinalChargeRateInput(String(Number((editingQuotation as { finalChargeRate?: number }).finalChargeRate || 16)));
    setValidityDays('30');
    setCurrency((editingQuotation.currency || 'MXN') as 'MXN' | 'USD');
    const hydratedItems = editingQuotation.items
      .filter((item) => item.supplyId || item.supplyName)
      .filter(
        (item) =>
          !isDerivedSpecialConsiderationItem({
            code: item.supplyCode,
            categoryName: item.categoryName,
          }),
      )
      .map((item) => ({
        localId: createLocalId('summary-item'),
        serviceId: item.supplyId as string | undefined,
        pricingProfileId: item.pricingProfileId as string | undefined,
        sourceType: isActivityConcept({
          code: item.supplyCode,
          categoryName: item.categoryName,
          categoryCode: allServices.find((service) => service.id === item.supplyId)?.categoryCode,
        })
          ? 'ACTIVITY' as const
          : 'SERVICE' as const,
        partNumber:
          (item as { partNumber?: number | null }).partNumber == null
            ? 0
            : Number((item as { partNumber?: number | null }).partNumber),
        partQuantity: Number((item as { partQuantity?: number | null }).partQuantity || 1),
        code: item.supplyCode,
        name: item.supplyName,
        relatedWork:
          allServices.find((service) => service.id === item.supplyId)?.relatedWork ||
          (!item.supplyId ? item.supplyName : ''),
        quantity: Number(item.quantity),
        days: Number((item as { activityDays?: number | null }).activityDays || 1),
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
        priceOverridden: !(item.supplyId && item.pricingProfileId),
      }));
    const fallbackPartCount = Math.max(
      0,
      Number((editingQuotation as { partCount?: number }).partCount || 0),
      hydratedItems.reduce((max, item) => Math.max(max, item.partNumber), 0),
    );
    const hydratedPartQuantities = hydratedItems.reduce<Record<number, number>>((acc, item) => {
      acc[item.partNumber] = Math.max(1, item.partQuantity || 1);
      return acc;
    }, {});
    const storedSections = Array.isArray((editingQuotation as { commercialSections?: CommercialSection[] }).commercialSections)
      ? ((editingQuotation as { commercialSections?: CommercialSection[] }).commercialSections as CommercialSection[])
      : companyDefaultSections;
    const normalizedSections = normalizeCommercialSections(storedSections);
    const hydratedPartDefinitions = parsePartDefinitionsSection(
      normalizedSections,
      fallbackPartCount,
      hydratedPartQuantities,
    );
    const workItemsMetadata = parseWorkItemsMetadataSection(normalizedSections);
    setPartCount(hydratedPartDefinitions.length);
    setCurrentPartNumber(1);
    setPartTitles(
      hydratedPartDefinitions.reduce<Record<number, string>>((acc, part) => {
        acc[part.partNumber] = part.title;
        return acc;
      }, {}),
    );
    setPartQuantities(
      hydratedPartDefinitions.reduce<Record<number, number>>((acc, part) => {
        acc[part.partNumber] = part.quantity;
        return acc;
      }, {}),
    );
    setPartDraftNumber(String(hydratedPartDefinitions.length + 1));
    setPartDraftTitle('');
    setHiddenAutoWorkItems(workItemsMetadata.hiddenAutoWorkItems);
    setCommercialSections(
      (() => {
        const initialWorkSection = normalizedSections.find(
          (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
        );
        setManualWorkItems(
          extractManualWorkItems(
            initialWorkSection?.content || '',
            deriveAutoWorkItemsFromSeed(hydratedItems),
          ),
        );
        setHiddenAutoWorkItems([]);
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
    if (!serviceId) {
      setPreparingNewActivity(false);
      setSelectedServiceId('');
      setSelectedPricingProfileId('');
      setSelectedConceptName('');
      setSelectedConceptCode('');
      setSelectedUnitPriceInput('');
      setSelectedQuantity(1);
      setSelectedDays(1);
      return;
    }

    const nextService = allServices.find((service) => service.id === serviceId);
    if (!nextService) {
      return;
    }

    setPreparingNewActivity(false);
    setSelectedCatalogActivityId('');
    setSelectedServiceId(nextService.id);
    setSelectedPricingProfileId(nextService.pricingProfiles[0]?.id || '');
    setSelectedConceptName('');
    setSelectedConceptCode('');
    setSelectedQuantity(1);
    setSelectedDays(1);
    setActiveCategory(nextService.categoryCode);
  }

  function focusPart(partNumber: number) {
    setCurrentPartNumber(partNumber);
    setPartDraftNumber(String(partNumber));
  }

  function chooseCatalogActivity(serviceId: string) {
    if (!serviceId) {
      setPreparingNewActivity(true);
      setSelectedCatalogActivityId('');
      setSelectedPricingProfileId('');
      setSelectedConceptName('');
      setSelectedConceptCode('');
      setSelectedUnitPriceInput('');
      setSelectedQuantity(1);
      setSelectedDays(1);
      setSuggestedActivityCode(getNextActivityCode(allServices));
      return;
    }

    const nextService = allServices.find((service) => service.id === serviceId);
    if (!nextService) {
      return;
    }

    setPreparingNewActivity(false);
    setSelectedCatalogActivityId(nextService.id);
    setSelectedPricingProfileId(nextService.pricingProfiles[0]?.id || '');
    setSelectedConceptName('');
    setSelectedConceptCode('');
    setSelectedQuantity(1);
    setSelectedDays(1);
  }

  function applyActivitySuggestion(serviceId: string) {
    const suggestedService = allServices.find((service) => service.id === serviceId);
    if (!suggestedService) {
      return;
    }

    setPreparingNewActivity(false);
    setSelectedCatalogActivityId(suggestedService.id);
    setSelectedPricingProfileId(
      suggestedService.pricingProfiles.find((profile) => profile.code === 'BASE')?.id ||
        suggestedService.pricingProfiles[0]?.id ||
        '',
    );
    setSelectedConceptName(suggestedService.name);
    setSelectedConceptCode(suggestedService.code || '');
  }

  function chooseClient(nextClientId: string) {
    const nextClient = (clientsQuery.data || []).find((client) => client.id === nextClientId);
    if (!nextClient) {
      return;
    }

    setClientId(nextClient.id);
    setClientName(nextClient.legalName);
    setContactName(nextClient.contacts[0]?.fullName || '');
    setClientPaletteOpen(false);
  }

  function addOrUpdatePartDefinition() {
    const nextPartNumber = Math.max(1, Number(partDraftNumber.replace(/[^0-9]/g, '')) || 1);
    const nextTitle = partDraftTitle.trim();

    setPartCount((current) => Math.max(current, nextPartNumber));
    setCurrentPartNumber(nextPartNumber);
    setPartTitles((current) => ({
      ...current,
      [nextPartNumber]: nextTitle,
    }));
    setPartQuantities((current) => ({
      ...current,
      [nextPartNumber]: Math.max(1, current[nextPartNumber] || 1),
    }));
    setPartDraftNumber(String(nextPartNumber + 1));
    setPartDraftTitle('');
  }

  function editPartDefinition(partNumber: number) {
    setPartDraftNumber(String(partNumber));
    setPartDraftTitle(partTitles[partNumber] || '');
    focusPart(partNumber);
  }

  function removePartDefinition(partNumber: number) {
    if (partCount <= 0) {
      return;
    }

    setItems((current) =>
      current
        .filter((item) => item.partNumber !== partNumber)
        .map((item) =>
          item.partNumber > partNumber
            ? { ...item, partNumber: item.partNumber - 1 }
            : item,
        ),
    );
    setPartTitles((current) => {
      const next: Record<number, string> = {};
      for (let index = 1; index <= partCount; index += 1) {
        if (index === partNumber) {
          continue;
        }

        next[index > partNumber ? index - 1 : index] = current[index] || '';
      }
      return next;
    });
    setPartQuantities((current) => {
      const next: Record<number, number> = {};
      for (let index = 1; index <= partCount; index += 1) {
        if (index === partNumber) {
          continue;
        }

        next[index > partNumber ? index - 1 : index] = Math.max(1, current[index] || 1);
      }
      return next;
    });
    setPartCount((current) => Math.max(0, current - 1));
    setCurrentPartNumber((current) => {
      if (partCount <= 1) {
        return 1;
      }

      if (current === partNumber) {
        return Math.max(1, Math.min(partNumber, partCount - 1));
      }

      return current > partNumber ? current - 1 : current;
    });
    setPartDraftNumber(String(Math.max(1, partCount)));
  }

  useEffect(() => {
    if (isEditingQuotationMode) {
      return;
    }

    if (!selectedClient || !availableClientContacts.length) {
      return;
    }

    if (!contactName) {
      setContactName(availableClientContacts[0].fullName);
    }
  }, [availableClientContacts, contactName, isEditingQuotationMode, selectedClient]);

  function preloadFromQuotationTemplate(templateId: string) {
    const template = savedServiceTemplates.find((quotation) => quotation.id === templateId);
    if (!template) {
      return;
    }

    setTitle(template.name || '');
    setCoverTitle(template.name || '');
    setExecutiveSummary((template as { executiveSummary?: string }).executiveSummary || '');
    setTemplateType(template.templateType || 'General');
    const hydratedItems = template.items
      .filter((item) => item.serviceId || item.name)
      .filter(
        (item) =>
          !isDerivedSpecialConsiderationItem({
            code: item.code,
            categoryName: item.categoryName,
          }),
      )
      .map((item) => ({
        localId: createLocalId('summary-item'),
        serviceId: item.serviceId,
        pricingProfileId: item.pricingProfileId,
        sourceType: isActivityConcept({
          code: allServices.find((service) => service.id === item.serviceId)?.code || item.code,
          categoryName:
            allServices.find((service) => service.id === item.serviceId)?.categoryName || item.categoryName,
          categoryCode: allServices.find((service) => service.id === item.serviceId)?.categoryCode,
        })
          ? 'ACTIVITY' as const
          : 'SERVICE' as const,
        partNumber: item.partNumber == null ? 0 : Number(item.partNumber),
        partQuantity: Number(item.partQuantity || 1),
        code:
          allServices.find((service) => service.id === item.serviceId)?.code || item.code || 'ACTIVIDAD',
        name:
          allServices.find((service) => service.id === item.serviceId)?.name || item.name || 'Concepto precargado',
        relatedWork:
          allServices.find((service) => service.id === item.serviceId)?.relatedWork || item.name || '',
        quantity: Number(item.quantity),
        days: Number(item.activityDays || 1),
        price:
          !item.serviceId || !item.pricingProfileId
            ? Number(item.unitPriceOverride || 0)
            : typeof item.unitPriceOverride === 'number'
            ? item.unitPriceOverride
            : resolveProfilePrice(
                allServices
                  .find((service) => service.id === item.serviceId)
                  ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
                currency,
              )?.price || 0,
        category:
          allServices.find((service) => service.id === item.serviceId)?.categoryName || item.categoryName || 'Actividades',
        currency,
        pricingProfileName:
          allServices
            .find((service) => service.id === item.serviceId)
            ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId)?.name || item.pricingProfileName || 'Manual',
        isOptional: Boolean(item.isOptional),
        optionGroup: item.optionGroup || '',
        optionLabel: item.optionLabel || '',
        priceOriginCurrency:
          (!item.serviceId || !item.pricingProfileId)
            ? currency
            : resolveProfilePrice(
            allServices
              .find((service) => service.id === item.serviceId)
              ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
            currency,
          )?.priceOriginCurrency || currency,
        priceInput:
          (
            !item.serviceId || !item.pricingProfileId
              ? Number(item.unitPriceOverride || 0)
              : typeof item.unitPriceOverride === 'number'
              ? item.unitPriceOverride
              : resolveProfilePrice(
                  allServices
                    .find((service) => service.id === item.serviceId)
                    ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
                  currency,
                )?.price || 0
          ).toFixed(2),
        basePrice:
          (!item.serviceId || !item.pricingProfileId)
            ? Number(item.unitPriceOverride || 0)
            : resolveProfilePrice(
            allServices
              .find((service) => service.id === item.serviceId)
              ?.pricingProfiles.find((profile) => profile.id === item.pricingProfileId),
            currency,
          )?.price || 0,
        priceOverridden: !item.serviceId || !item.pricingProfileId || typeof item.unitPriceOverride === 'number',
      }));
    const hydratedPartCount = hydratedItems.reduce((max, item) => Math.max(max, item.partNumber), 0);
    setPartCount(hydratedPartCount);
    setCurrentPartNumber(1);
    setPartQuantities(
      hydratedItems.reduce<Record<number, number>>((acc, item) => {
        if (item.partNumber > 0) {
          acc[item.partNumber] = Math.max(1, item.partQuantity || 1);
        }
        return acc;
      }, {}),
    );
    setCommercialSections(
      (() => {
        const normalizedSections = normalizeCommercialSections(
          Array.isArray(template.commercialSections)
            ? (template.commercialSections as CommercialSection[])
            : companyDefaultSections,
        );
        const workItemsMetadata = parseWorkItemsMetadataSection(normalizedSections);
        const initialWorkSection = normalizedSections.find(
          (section) => normalizeSectionTitle(section.title) === 'trabajos a realizar:',
        );
        setManualWorkItems(
          extractManualWorkItems(
            initialWorkSection?.content || '',
            deriveAutoWorkItemsFromSeed(hydratedItems),
          ),
        );
        setHiddenAutoWorkItems(workItemsMetadata.hiddenAutoWorkItems);
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

  function updateWorkSectionContent(nextItems: string[]) {
    setCommercialSections((current) =>
      current.map((section) =>
        normalizeSectionTitle(section.title) === 'trabajos a realizar:'
          ? { ...section, content: nextItems.join('\n') }
          : section,
      ),
    );
  }

  function updateWorkItemsContent(nextItems: string[]) {
    updateWorkSectionContent(nextItems);
  }

  function addWorkItemFromCatalog() {
    const nextValue = selectedWorkItem.trim();
    if (!nextValue) {
      return;
    }

    const currentItems = mergeUniqueStrings(combinedWorkItems);
    if (currentItems.includes(nextValue)) {
      setSelectedWorkItem('');
      return;
    }

    updateWorkItemsContent([...currentItems, nextValue]);
    setSelectedWorkItem('');
  }

  function removeWorkItem(itemIndex: number) {
    updateWorkItemsContent(combinedWorkItems.filter((_, index) => index !== itemIndex));
  }

  function editWorkItem(itemIndex: number) {
    const currentValue = combinedWorkItems[itemIndex];
    if (typeof currentValue !== 'string') {
      return;
    }

    const nextValue = window.prompt('Editar actividad', currentValue)?.trim();
    if (!nextValue) {
      return;
    }

    updateWorkItemsContent(
      combinedWorkItems.map((item, index) => (index === itemIndex ? nextValue : item)),
    );
  }

  function moveWorkItem(itemIndex: number, direction: 'up' | 'down') {
    const currentItems = [...combinedWorkItems];
    if (itemIndex < 0 || itemIndex >= currentItems.length) {
      return;
    }

    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentItems.length) {
      return;
    }

    const nextItems = [...currentItems];
    const [movedItem] = nextItems.splice(itemIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);

    setCommercialSections((current) =>
      current.map((section) =>
        normalizeSectionTitle(section.title) === 'trabajos a realizar:'
          ? { ...section, content: nextItems.join('\n') }
          : section,
      ),
    );
  }

  useEffect(() => {
    if (workItemInputMode !== 'FREE_TEXT') {
      return;
    }

    setSelectedWorkItem('');
    updateWorkSectionContent([]);
  }, [workItemInputMode]);

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

    const hasMxnPrice = profile.mxnPrice !== '';
    const hasUsdPrice = profile.usdPrice !== '';
    const mxnPrice = profile.mxnPrice === '' ? 0 : Number(profile.mxnPrice || 0);
    const usdPrice = profile.usdPrice === '' ? 0 : Number(profile.usdPrice || 0);

    if (targetCurrency === 'MXN') {
      if (hasMxnPrice) {
        return { price: mxnPrice, priceOriginCurrency: 'MXN' as const };
      }
      if (hasUsdPrice) {
        return {
          price: Number((usdPrice * exchangeRate).toFixed(2)),
          priceOriginCurrency: 'USD' as const,
        };
      }
    }

    if (hasUsdPrice) {
      return { price: usdPrice, priceOriginCurrency: 'USD' as const };
    }

    if (hasMxnPrice) {
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
        if (item.sourceType === 'ACTIVITY') {
          const convertedPrice = truncateToTwoDecimals(
            item.currency === currency
              ? item.price
              : item.currency === 'MXN'
                ? item.price / exchangeRate
                : item.price * exchangeRate,
          );

          return {
            ...item,
            currency,
            price: convertedPrice,
            priceInput: formatEditableMoney(convertedPrice, currency),
            priceOriginCurrency: currency,
          };
        }

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
          name: item.name || service.name,
          relatedWork: item.relatedWork || service.relatedWork || '',
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

  async function addConfiguredService() {
    const isActivity = conceptBaseService ? isActivityConcept(conceptBaseService) : isActivityForm;
    const isManualServiceConcept = !isActivity && !conceptBaseService;
    const conceptName = selectedConceptName.trim() || conceptBaseService?.name || '';
    if (!conceptName) {
      showTimedToast('Concepto incompleto', 'Escribe el nombre del concepto antes de agregarlo.');
      return;
    }

    const resolvedPrice = selectedProfile ? resolveProfilePrice() : null;
    if (!isActivity && !isManualServiceConcept && (!conceptBaseService || !selectedProfile || !resolvedPrice)) {
      showTimedToast('Concepto incompleto', 'Selecciona un suministro y una opción de precio antes de agregarlo.');
      return;
    }

    const parsedSelectedUnitPrice = parseFormattedDecimal(selectedUnitPriceInput);
    const effectiveUnitPrice = parsedSelectedUnitPrice ?? resolvedPrice?.price ?? 0;
    const priceWasOverridden = resolvedPrice
      ? Math.abs(effectiveUnitPrice - resolvedPrice.price) > 0.009
      : true;
    const conceptCode = previewSelectedCode.trim().toUpperCase();
    const activityDays = isActivity ? Math.max(1, selectedDays) : 1;
    let availableActivityServices = allServices;

    if (isActivity) {
      const duplicatedCode = allServices.find(
        (service) =>
          isActivityConcept(service) &&
          service.code === conceptCode &&
          normalizeConceptName(service.name) !== normalizeConceptName(conceptName),
      );

      if (duplicatedCode) {
        const nextAvailableCode = getNextActivityCode(allServices);
        setSelectedConceptCode(nextAvailableCode);
        setSuggestedActivityCode(nextAvailableCode);
        showTimedToast(
          'Clave ya existe',
          `La clave ${conceptCode} ya está ocupada. Prueba con ${nextAvailableCode}.`,
        );
        return;
      }
    }

    let matchingCatalogActivity = isActivity
      ? allServices.find(
          (service) =>
            isActivityConcept(service) &&
            (
              service.code === conceptCode ||
              normalizeConceptName(service.name) === normalizeConceptName(conceptName)
            ),
        )
      : undefined;

    if (
      isActivity &&
      !matchingCatalogActivity
    ) {
      try {
        await createWorkItemCatalogMutation.mutateAsync({
          name: conceptName,
          code: conceptCode,
          unitPrice: effectiveUnitPrice,
        });
      } catch {
        const refreshedCatalog = await catalogQuery.refetch();
        const refreshedUiCatalog = mapCatalogForUi(refreshedCatalog.data || []);
        const refreshedServices = refreshedUiCatalog.flatMap((category) =>
          category.services.map((service) => ({
            ...service,
            categoryCode: category.code,
            categoryName: category.name,
          })),
        );
        const nextAvailableCode = getNextActivityCode(refreshedServices);
        setSelectedConceptCode(nextAvailableCode);
        setSuggestedActivityCode(nextAvailableCode);
        showTimedToast(
          'Clave no disponible',
          `La clave ${conceptCode} ya existe. Se sugiere ${nextAvailableCode}.`,
        );
        return;
      }

      const refreshedCatalog = await catalogQuery.refetch();
      const refreshedUiCatalog = mapCatalogForUi(refreshedCatalog.data || []);
      const refreshedServices = refreshedUiCatalog.flatMap((category) =>
        category.services.map((service) => ({
          ...service,
          categoryCode: category.code,
          categoryName: category.name,
        })),
      );
      availableActivityServices = refreshedServices;

      matchingCatalogActivity = refreshedServices.find(
        (service) =>
          isActivityConcept(service) &&
          (
            service.code === conceptCode ||
            normalizeConceptName(service.name) === normalizeConceptName(conceptName)
          ),
      );

    }

    const shouldUseManualActivity =
      isActivity &&
      !matchingCatalogActivity &&
      normalizeConceptName(conceptName) !== normalizeConceptName(conceptBaseService?.name);
    const shouldUseManualConcept = shouldUseManualActivity || isManualServiceConcept;
    const effectiveService = shouldUseManualConcept ? undefined : matchingCatalogActivity || conceptBaseService;
    if (!effectiveService && !shouldUseManualConcept) {
      showTimedToast('No fue posible agregar', 'No se pudo sincronizar el concepto con el catálogo.');
      return;
    }

    const effectiveProfile =
      effectiveService?.pricingProfiles.find((profile) => profile.code === 'BASE') ||
      effectiveService?.pricingProfiles.find((profile) => profile.id === selectedProfile?.id) ||
      effectiveService?.pricingProfiles[0] ||
      selectedProfile;
    if (!effectiveProfile && !shouldUseManualConcept) {
      showTimedToast('Sin precio base', 'El concepto no tiene una opción de precio base configurada.');
      return;
    }
    const effectiveResolvedPrice = resolvedPrice || {
      price: effectiveUnitPrice,
      priceOriginCurrency: currency,
    };

    const targetPartNumber = hasPartDefinitions ? currentPartNumber : 0;
    const targetPartQuantity = hasPartDefinitions ? currentPartQuantity : 1;
    const effectiveCode =
      conceptCode && conceptCode !== 'SIN CLAVE'
        ? conceptCode
        : effectiveService?.code || (isActivity ? 'ACTIVIDAD' : currentCategory?.code || 'SERVICIO');

    setItems((current) => {
      const partCompositeKey = getSummaryItemKey({
        sourceType: isActivity ? 'ACTIVITY' : 'SERVICE',
        partNumber: targetPartNumber,
        code: effectiveCode,
        pricingProfileId: effectiveProfile?.id,
        currency,
      });
      const existing = current.find(
        (item) => getSummaryItemKey(item) === partCompositeKey,
      );

      if (existing) {
        const updated = {
          ...existing,
          name: conceptName,
          partQuantity: targetPartQuantity,
          quantity: existing.quantity + Math.max(1, selectedQuantity),
          days: activityDays,
        };

        return [
          updated,
          ...current.filter((item) => getSummaryItemKey(item) !== partCompositeKey),
        ];
      }

      return [
        {
          localId: createLocalId('summary-item'),
          serviceId: effectiveService?.id,
          pricingProfileId: effectiveProfile?.id,
          sourceType: isActivity ? 'ACTIVITY' : 'SERVICE',
          partNumber: targetPartNumber,
          partQuantity: targetPartQuantity,
          code: effectiveCode,
          name: conceptName,
          relatedWork: effectiveService?.relatedWork || '',
          quantity: Math.max(1, selectedQuantity),
          days: activityDays,
          price: effectiveUnitPrice,
          category: effectiveService?.categoryName || currentCategory?.name || 'Actividades',
          currency,
          pricingProfileName: effectiveProfile?.name || 'Manual',
          priceOriginCurrency: effectiveResolvedPrice.priceOriginCurrency,
          priceInput: formatEditableMoney(effectiveUnitPrice, currency),
          basePrice: effectiveResolvedPrice.price,
          priceOverridden: priceWasOverridden,
          isOptional: false,
          optionGroup: '',
          optionLabel: '',
        },
        ...current,
      ];
    });

    showTimedToast(
      'Servicio agregado',
      isActivity && effectiveCode !== conceptBaseService?.code
        ? `La actividad quedó registrada en catálogo con clave ${effectiveCode}.`
        : 'La cotización se recalculó con la opción de precio seleccionada.',
    );

    if (isActivity) {
      const nextAvailableCode = getNextActivityCode(availableActivityServices);
      setPreparingNewActivity(true);
      setSelectedConceptName('');
      setSelectedConceptCode('');
      setSuggestedActivityCode(nextAvailableCode);
      setSelectedQuantity(1);
      setSelectedDays(1);
      setSelectedUnitPriceInput('');
      return;
    }
  }

  function changeQuantity(localId: string, delta: number) {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  }

  function removeItem(localId: string) {
    setItems((current) =>
      current.filter((item) => item.localId !== localId),
    );
  }

  function editItem(localId: string) {
    const item = items.find((current) => current.localId === localId);
    if (!item) {
      return;
    }

    const matchedService =
      (item.serviceId ? allServices.find((service) => service.id === item.serviceId) : undefined) ||
      allServices.find((service) => service.code === item.code) ||
      selectedService;

    if (matchedService) {
      setPreparingNewActivity(false);
      setActiveCategory(matchedService.categoryCode || activeCategory);
      setSelectedServiceId(matchedService.id);
      setSelectedPricingProfileId(
        item.pricingProfileId ||
          matchedService.pricingProfiles.find((profile) => profile.code === 'BASE')?.id ||
          matchedService.pricingProfiles[0]?.id ||
          '',
      );
    }

    if (item.partNumber > 0) {
      focusPart(item.partNumber);
      setPartQuantities((current) => ({
        ...current,
        [item.partNumber]: Math.max(1, item.partQuantity || 1),
      }));
    }
    setSelectedConceptName(item.name);
    setSelectedConceptCode(item.code);
    setSuggestedActivityCode('');
    setSelectedQuantity(item.quantity);
    setSelectedDays(item.days);
    setSelectedUnitPriceInput(formatEditableMoney(item.price, item.currency));
    removeItem(localId);
  }

  function updateItemDays(localId: string, value: string) {
    const nextDays = Math.max(1, Number(value.replace(/[^0-9]/g, '')) || 1);
    setItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              days: nextDays,
            }
          : item,
      ),
    );
  }

  function changeItemDays(localId: string, delta: number) {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, days: Math.max(1, item.days + delta) }
          : item,
      ),
    );
  }

  async function persistQuotation(options?: { saveModifiedPrices?: boolean; asDraft?: boolean }) {
    const saveModifiedPrices = options?.saveModifiedPrices || false;
    const asDraft = options?.asDraft || false;

    const normalizedClientName = clientName.trim();
    if ((!clientId && !normalizedClientName) || !exchangeRate) {
      return;
    }

    const payload = {
      clientId: clientId || undefined,
      clientName: normalizedClientName || undefined,
      contactName: contactName.trim() || undefined,
      createdById: user.id,
      title: title.trim() || 'Borrador sin título',
      coverTitle: coverTitle.trim() || title.trim() || 'Borrador sin título',
      executiveSummary,
      serviceType,
      templateType,
      pricingRule,
      partCount,
      finalChargeRate,
      validityDays: Number(validityDays || 30),
      reusableBlockIds: selectedReusableBlockIds,
      durationOfWork:
        commercialSections.find((section) => section.title === 'Duracion de los trabajos:')?.content,
      notes:
        commercialSections.find((section) => section.title === 'Notas importantes:')?.content,
      termsAndConditions:
        commercialSections.find((section) => section.title === 'CONDICIONES DE PAGO:')?.content,
      commercialSections: mergeCommercialSectionsWithMetadata(
        normalizeCommercialSections(commercialSections),
        partDefinitions,
        hiddenAutoWorkItems,
      ),
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
        code: item.code,
        name: item.name,
        categoryName: item.category,
        pricingProfileName: item.pricingProfileName,
        partNumber: item.partNumber > 0 ? item.partNumber : undefined,
        partQuantity: item.partNumber > 0 ? item.partQuantity : undefined,
        activityDays: item.sourceType === 'ACTIVITY' ? item.days : undefined,
        quantity: item.quantity,
        unitPriceOverride: item.sourceType === 'ACTIVITY' || item.priceOverridden ? item.price : undefined,
        isOptional: item.isOptional,
        optionGroup: item.optionGroup || undefined,
        optionLabel: item.optionLabel || undefined,
      })),
    };

    let persistedQuotationId: string | null = null;

    const targetQuotationId = editingId || draftQuotationId;

    if (targetQuotationId) {
      const persistedQuotation = await updateBuilderMutation.mutateAsync({
        id: targetQuotationId,
        payload,
      });
      persistedQuotationId =
        persistedQuotation && typeof persistedQuotation === 'object' && 'id' in persistedQuotation
          ? String(persistedQuotation.id)
          : targetQuotationId;
    } else {
      const persistedQuotation = await createMutation.mutateAsync(payload);
      persistedQuotationId =
        persistedQuotation && typeof persistedQuotation === 'object' && 'id' in persistedQuotation
          ? String(persistedQuotation.id)
          : null;
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

    if (asDraft) {
      if (!editingId && persistedQuotationId) {
        setDraftQuotationId(persistedQuotationId);
      }

      showTimedToast(
        'Borrador guardado',
        'La cotización quedó guardada como borrador y puedes retomarla después desde Cotizaciones.',
      );
      return;
    }

    setItems([]);
    showTimedToast(
      editingId ? 'Cotización actualizada' : 'Cotización creada',
      saveModifiedPrices && modifiedPriceItems.length
        ? 'La cotización quedó guardada y los precios editados se versionaron en el catálogo.'
        : editingId
          ? 'Los cambios de la cotización quedaron guardados y el pipeline se actualizó.'
          : 'La cotización quedó guardada sin asignarse al pipeline.',
    );
    router.push('/quotations');
  }

  async function submitQuotation() {
    if (modifiedPriceItems.length) {
      setCatalogUpdateModalOpen(true);
      return;
    }

    await persistQuotation({ saveModifiedPrices: false });
  }

  async function saveDraft() {
    await persistQuotation({ asDraft: true });
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
  const hasClientName = Boolean(clientName.trim());
  const createBlockedReason = !hasClientName
      ? 'Escribe el nombre de la compañía.'
      : !items.length
          ? 'Agrega al menos un concepto al resumen.'
          : !exchangeRate
            ? 'Configura el tipo de cambio antes de generar.'
            : null;
  const draftBlockedReason = !hasClientName
    ? 'Escribe el nombre de la compañía.'
      : !exchangeRate
        ? 'Configura el tipo de cambio antes de guardar.'
        : null;
  const canAdvanceFromClient = Boolean(hasClientName && currency);
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Guardado de borrador</p>
          <p className="text-sm text-[var(--color-text-muted)]">Puedes guardar la cotización incompleta en cualquier paso y retomarla después desde Cotizaciones.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {draftBlockedReason ? <p className="text-xs text-[var(--color-text-faint)]">{draftBlockedReason}</p> : null}
          <Button
            variant="secondary"
            onClick={saveDraft}
            disabled={
              Boolean(draftBlockedReason) ||
              createMutation.isPending ||
              updateBuilderMutation.isPending ||
              updatePricingProfilesMutation.isPending
            }
          >
            {createMutation.isPending || updateBuilderMutation.isPending || updatePricingProfilesMutation.isPending
              ? 'Guardando...'
              : 'Guardar borrador'}
          </Button>
        </div>
      </div>

      {step === 'client' ? (
          <Card>
          <CardHeader title="Paso 1. Configuración inicial" description="Define cliente, moneda y servicio base. El vendedor se toma automáticamente del usuario autenticado." />
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex h-full flex-col justify-between gap-2">
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
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Nombre de compañía</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
                  <Input
                    value={clientName}
                    onFocus={() => setClientPaletteOpen(true)}
                    onBlur={() => window.setTimeout(() => setClientPaletteOpen(false), 120)}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      const matchedClient =
                        (clientsQuery.data || []).find(
                          (client) => client.legalName.trim().toLowerCase() === nextName.trim().toLowerCase(),
                        ) || null;
                      setClientName(nextName);
                      setClientId(matchedClient?.id || '');
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
                    placeholder="Escribe o busca una compañía"
                    list={(clientsQuery.data || []).length ? 'builder-client-options' : undefined}
                  />
                  {(clientsQuery.data || []).length ? (
                    <datalist id="builder-client-options">
                      {(clientsQuery.data || []).map((client) => (
                        <option key={client.id} value={client.legalName} />
                      ))}
                    </datalist>
                  ) : null}
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
                                  {client.rfc || 'Sin RFC'} · {client.contacts[0]?.fullName || 'Sin contacto'}
                                </p>
                              </div>
                              {selectedClient?.id === client.id ? <Check className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" /> : null}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-sm text-[var(--color-text-muted)]">Se creará como cliente nuevo al guardar.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Título comercial</p>
                <Input value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} placeholder="Título visible para el cliente" />
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Nombre de contacto</p>
                <Input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Ej. Ing. Juan Pérez"
                  list={availableClientContacts.length ? 'builder-contact-options' : undefined}
                />
                {availableClientContacts.length ? (
                  <datalist id="builder-contact-options">
                    {availableClientContacts.map((contact) => (
                      <option key={contact.id} value={contact.fullName} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Resumen ejecutivo</p>
                <Textarea value={executiveSummary} onChange={(event) => setExecutiveSummary(event.target.value)} rows={4} placeholder="Objetivo, alcance, entregables y valor comercial." />
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-5">
              <div className="grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_52px]">
                  <Input
                    value={partDraftNumber}
                    onChange={(event) => setPartDraftNumber(event.target.value.replace(/[^0-9]/g, '') || '1')}
                    placeholder="Partida #"
                  />
                  <Textarea
                    value={partDraftTitle}
                    onChange={(event) => setPartDraftTitle(event.target.value)}
                    placeholder="Título de partida"
                    rows={3}
                  />
                  <Button
                    type="button"
                    onClick={addOrUpdatePartDefinition}
                    className="h-full min-h-[96px]"
                    disabled={!partDraftNumber.trim()}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {partDefinitions.length ? null : (
                    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white/70 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                      Esta cotización nueva no crea una partida inicial. Agrega la primera para comenzar.
                    </div>
                  )}
                  {partDefinitions.map((part) => (
                    <div
                      key={part.partNumber}
                      className={`grid items-center gap-3 rounded-2xl border px-4 py-3 transition lg:grid-cols-[120px_minmax(0,1fr)_44px] ${
                        currentPartNumber === part.partNumber
                          ? 'border-[var(--color-primary)] bg-white'
                          : 'border-[var(--color-border)] bg-white/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => focusPart(part.partNumber)}
                        className="text-left text-sm font-semibold text-[var(--color-text)]"
                      >
                        Partida {part.partNumber}
                      </button>
                      <button
                        type="button"
                        onClick={() => focusPart(part.partNumber)}
                        className="text-left text-sm text-[var(--color-text-muted)]"
                      >
                        {part.title.trim() || 'Sin título'}
                      </button>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => editPartDefinition(part.partNumber)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePartDefinition(part.partNumber)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cliente</p>
                <Input
                  value={clientName}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    const matchedClient =
                      (clientsQuery.data || []).find(
                        (client) => client.legalName.trim().toLowerCase() === nextName.trim().toLowerCase(),
                      ) || null;
                    setClientName(nextName);
                    setClientId(matchedClient?.id || '');
                  }}
                  placeholder="Compañía"
                  list={(clientsQuery.data || []).length ? 'builder-client-options-compact' : undefined}
                />
                {(clientsQuery.data || []).length ? (
                  <datalist id="builder-client-options-compact">
                    {(clientsQuery.data || []).map((client) => (
                      <option key={client.id} value={client.legalName} />
                    ))}
                  </datalist>
                ) : null}
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vendedor</p>
                <div className="flex min-h-11 items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 text-sm text-[var(--color-text)]">
                  {selectedSeller?.name || 'Sin vendedor'}
                </div>
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Moneda</p>
                <Select value={currency} onChange={(event) => setCurrency(event.target.value as 'MXN' | 'USD')}>
                  <option value="MXN">Cotización en MXN</option>
                  <option value="USD">Cotización en DLLS</option>
                </Select>
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
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
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Tipo de servicio</p>
                <Select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
                  <option value="General">General</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Diagnóstico">Diagnóstico</option>
                  <option value="Puesta en marcha">Puesta en marcha</option>
                  <option value="Proyecto">Proyecto</option>
                </Select>
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Plantilla comercial</p>
                <Select value={templateType} onChange={(event) => setTemplateType(event.target.value)}>
                  <option value="General">General</option>
                  <option value="Servicio">Servicio</option>
                  <option value="Suministro">Suministro</option>
                  <option value="Proyecto">Proyecto</option>
                  <option value="Urgente">Urgente</option>
                </Select>
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Regla de precio</p>
                <Select value={pricingRule} onChange={(event) => setPricingRule(event.target.value)}>
                  <option value="STANDARD">Tarifa estándar</option>
                  <option value="URGENT">Urgencia alta</option>
                  <option value="PREFERRED_CLIENT">Cliente preferente</option>
                  <option value="WEEKEND">Fin de semana</option>
                </Select>
              </div>
              <div className="flex h-full flex-col justify-between gap-2">
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
                  const normalizedTitle = title.trim().toLowerCase();
                  const matched = filteredServiceTemplates.find(
                    (quotation) => quotation.name.trim().toLowerCase() === normalizedTitle,
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

            {(clientName.trim() || selectedSeller) ? (
              <div className="grid gap-3 md:grid-cols-2">
                {clientName.trim() ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cliente seleccionado</p>
                    <p className="mt-2 font-semibold text-[var(--color-text)]">{selectedClient?.legalName || clientName.trim()}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedClient?.rfc || 'Sin RFC'}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contactName || selectedClient?.contacts[0]?.fullName || 'Sin contacto asignado'}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Configuración de partidas</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{partCount} partida(s) definidas.</p>
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
                    placeholder="Buscar"
                  />
                </div>
              </div>
              {uiCatalog.map((category) => (
                <button
                  key={category.code}
                  onClick={() => {
                    if (category.code === 'ACT') {
                      const nextAvailableCode = getNextActivityCode(allServices);
                      setPreparingNewActivity(true);
                      setSelectedServiceId('');
                      setSelectedCatalogActivityId('');
                      setSelectedPricingProfileId('');
                      setSelectedConceptName('');
                      setSelectedConceptCode('');
                      setSuggestedActivityCode(nextAvailableCode);
                      setSelectedQuantity(1);
                      setSelectedDays(1);
                      setSelectedUnitPriceInput('');
                    } else {
                      setPreparingNewActivity(false);
                      setSelectedCatalogActivityId('');
                    }
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
            <CardHeader title="Paso 2. Conceptos" description="Agrega suministros y actividades cotizables antes de pasar a condiciones." action={<Badge variant="info">Ordenados por clave</Badge>} />
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-[var(--color-primary)] bg-[rgba(249,115,22,0.08)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Agregando conceptos a</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {hasPartDefinitions ? (
                    <>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
                        Partida #{currentPartNumber}
                      </span>
                      <p className="text-lg font-semibold text-[var(--color-text)]">
                        {currentPartDefinition?.title?.trim() || 'Sin título'}
                      </p>
                    </>
                  ) : (
                    <p className="text-lg font-semibold text-[var(--color-text)]">Cotización sin partida asignada</p>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {hasPartDefinitions
                    ? 'Todo lo que agregues aquí se asignará a esta partida.'
                    : 'Los conceptos que captures aquí quedarán sin partida.'}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  {serviceQuery.trim()
                    ? `${filteredServices.length} resultados por clave`
                    : `${filteredServices.length} suministros visibles`}
                </div>
                {isBlankActivityMode || isPreparingNewActivityMode ? (
                  <Select value={selectedCatalogActivityId} onChange={(event) => chooseCatalogActivity(event.target.value)}>
                    <option value="">Buscar</option>
                    {filteredServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {service.code}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Select value={selectedService?.id || ''} onChange={(event) => chooseService(event.target.value)}>
                    <option value="">{filteredServices.length ? 'Buscar' : 'Sin suministros'}</option>
                    {filteredServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {service.code}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {isBlankActivityMode || isPreparingNewActivityMode ? (
                <div className="flex h-11 items-center rounded-2xl border border-[var(--color-border)] bg-white px-4 text-sm text-[var(--color-text-muted)]">
                  {selectedProfile?.name || 'Actividad base'}
                </div>
              ) : (
                <Select value={selectedProfile?.id || ''} onChange={(event) => setSelectedPricingProfileId(event.target.value)}>
                  {availableProfiles.length ? null : <option value="">Sin opciones de precio</option>}
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                    {hasPartDefinitions ? 'Partida actual' : 'Asignación actual'}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                    {currentPartDefinition
                      ? getPartDisplayTitle(currentPartDefinition.partNumber, currentPartDefinition.title)
                      : 'Sin partida'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {hasPartDefinitions ? `Partida ${currentPartNumber} de ${partCount}` : 'Puedes capturar conceptos sin crear partidas'}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-wrap gap-2">
                  {partDefinitions.map((part) => (
                    <button
                      key={part.partNumber}
                      type="button"
                      onClick={() => focusPart(part.partNumber)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        currentPartNumber === part.partNumber
                          ? 'bg-[var(--color-secondary)] text-white'
                          : 'bg-white text-[var(--color-text-muted)]'
                      }`}
                      title={part.title || `Partida ${part.partNumber}`}
                    >
                      {getPartSelectorLabel(part.partNumber, part.title)}
                    </button>
                  ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <div className="grid gap-4">
                  <div>
                    <Textarea
                      value={selectedConceptName}
                      onChange={(event) => {
                        setPreparingNewActivity(false);
                        setSelectedConceptName(event.target.value);
                      }}
                      placeholder="Nombre del concepto"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="min-h-[96px]"
                    />
                    {isActivityForm && activityNameSuggestions.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activityNameSuggestions.map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => applyActivitySuggestion(service.id)}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:bg-white hover:text-[var(--color-text)]"
                          >
                            {service.name} · {service.code}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {isActivityForm || !selectedService ? (
                      <div className="mt-3 max-w-[180px]">
                        <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Clave</p>
                        <Input
                          value={selectedConceptCode}
                          onChange={(event) => {
                            setPreparingNewActivity(false);
                            setSelectedConceptCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                          }}
                          placeholder={isActivityForm ? previewSelectedCode : currentCategory?.code || 'SERVICIO'}
                          className="h-10 text-center"
                        />
                      </div>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {selectedService?.description || (!isActivityForm ? 'Selecciona un suministro para empezar.' : 'Selecciona o captura una actividad para empezar.')}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                      {(currentCategory?.name || selectedService?.categoryName || 'SIN CATEGORIA') + (selectedProfile ? ` · ${selectedProfile.name}` : '')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-col gap-4">
                      <div className="w-36">
                        <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cantidad</p>
                        <div className="flex items-center gap-2">
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
                          className="h-10 w-32 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedQuantity((current) => current + 1)}
                          className="rounded-xl border border-[var(--color-border)] bg-white p-2 hover:bg-[var(--color-panel-subtle)]"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        </div>
                      </div>
                      {isActivityForm ? (
                        <div className="w-36">
                          <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Días</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDays((current) => Math.max(1, current - 1))}
                              className="rounded-xl border border-[var(--color-border)] bg-white p-2 hover:bg-[var(--color-panel-subtle)]"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <Input
                              value={String(selectedDays)}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value.replace(/[^0-9]/g, ''));
                                setSelectedDays(nextValue > 0 ? nextValue : 1);
                              }}
                              className="h-10 w-32 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedDays((current) => current + 1)}
                              className="rounded-xl border border-[var(--color-border)] bg-white p-2 hover:bg-[var(--color-panel-subtle)]"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-[220px]">
                      <p className="mb-1 text-lg font-semibold text-[var(--color-text)]">
                        {formatCurrency(
                          ((isActivityForm && preparingNewActivity)
                            ? 0
                            : selectedUnitPriceInput
                              ? parseFormattedDecimal(selectedUnitPriceInput) || 0
                              : resolvedPrice
                                ? resolvedPrice.price
                                : 0) *
                            selectedQuantity *
                            (isActivityForm ? selectedDays : 1),
                          currency,
                        )}
                      </p>
                      <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                        {isActivityForm ? 'Costo por día' : 'P.U. editable'}
                      </p>
                      <Input
                        value={selectedUnitPriceInput}
                        onFocus={() => {
                          const parsed = parseFormattedDecimal(selectedUnitPriceInput);
                          setSelectedUnitPriceInput(parsed === null ? '' : parsed.toFixed(2));
                        }}
                        onChange={(event) => {
                          setPreparingNewActivity(false);
                          setSelectedUnitPriceInput(event.target.value);
                        }}
                        onBlur={() => {
                          const parsed = parseFormattedDecimal(selectedUnitPriceInput);
                          setSelectedUnitPriceInput(
                            parsed === null ? '' : formatEditableMoney(parsed, currency),
                          );
                        }}
                        className="h-10 text-right"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={addConfiguredService}
                        className="inline-flex items-center gap-2 rounded-full bg-[rgba(249,115,22,0.1)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between pt-4">
                <Button variant="secondary" onClick={() => setStep('client')}>
                  Regresar
                </Button>
                <div className="flex gap-2">
                  {currentPartNumber < partCount ? (
                    <Button
                      variant="secondary"
                      onClick={() => focusPart(Math.min(currentPartNumber + 1, partCount))}
                      disabled={!currentPartItems.length}
                    >
                      Guardar partida y seguir
                    </Button>
                  ) : null}
                  <Button onClick={() => setStep('considerations')} disabled={!canAdvanceFromServices}>
                    Continuar a consideraciones
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Resumen de conceptos" description="Siempre puedes regresar y ajustar antes de continuar." />
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">Servicio solicitado</p>
                <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">{title || 'Sin servicio descrito'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{executiveSummary || 'Resumen ejecutivo no proporcionado.'}</p>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">Partida en edición</p>
                <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
                  {currentPartDefinition
                    ? getPartDisplayTitle(currentPartDefinition.partNumber, currentPartDefinition.title)
                    : 'Sin partida'}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {hasPartDefinitions
                    ? currentPartItems.length
                      ? `${currentPartItems.length} concepto(s) cargados en esta partida.`
                      : 'Agrega conceptos a esta partida para continuar.'
                    : currentPartItems.length
                      ? `${currentPartItems.length} concepto(s) cargados sin partida.`
                      : 'Los conceptos nuevos se mostrarán aquí aunque no exista partida.'}
                </p>
              </div>
              {currentPartItems.map((item) => {
                const localId = item.localId;
                return (
                  <div key={localId} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-text)]">
                          {item.partNumber > 0
                            ? `${getPartDisplayTitle(item.partNumber, partTitles[item.partNumber])}${item.partQuantity > 1 ? ` x ${item.partQuantity}` : ''} · ${item.code}`
                            : item.code}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {item.sourceType === 'ACTIVITY'
                            ? `${item.pricingProfileName} · ${item.quantity} ${item.quantity === 1 ? 'técnico' : 'técnicos'} × ${item.days} ${item.days === 1 ? 'día' : 'días'} × ${formatCurrency(item.price, item.currency)}`
                            : `${item.pricingProfileName} · P.U. ${formatCurrency(item.price, item.currency)}`}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-faint)]">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => editItem(localId)}
                          className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-secondary)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => removeItem(localId)} className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-danger)]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="w-28">
                        <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Cantidad</p>
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-white p-1">
                          <button onClick={() => changeQuantity(localId, -1)} className="rounded-xl p-2 hover:bg-[var(--color-panel-subtle)]">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="min-w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button onClick={() => changeQuantity(localId, 1)} className="rounded-xl p-2 hover:bg-[var(--color-panel-subtle)]">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {item.sourceType === 'ACTIVITY' ? (
                        <div className="flex items-center gap-3">
                          <div className="w-32">
                            <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Días</p>
                            <Input
                              value={String(item.days)}
                              onChange={(event) => updateItemDays(localId, event.target.value)}
                              className="h-10 text-center"
                            />
                          </div>
                          <p className="min-w-36 text-right font-semibold">{formatCurrency(getItemLineTotal(item), item.currency)}</p>
                        </div>
                      ) : (
                        <p className="min-w-36 text-right font-semibold">{formatCurrency(getItemLineTotal(item), item.currency)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="rounded-[28px] bg-[var(--color-secondary)] p-5 text-white">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-white/70">Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-white/70">{finalChargeLabel} {formatPercentageLabel(finalChargeRate)}</span><span>{formatCurrency(tax, currency)}</span></div>
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

              {specialConsiderations.filter((item) => item.type === 'PERCENTAGE').length ? (
                <div className="grid gap-3 text-xs font-semibold text-[var(--color-text-muted)] md:grid-cols-[84px_minmax(0,0.8fr)_220px_180px_190px_48px]">
                  <span>Cantidad</span>
                  <span>Concepto</span>
                  <span>Tipo</span>
                  <span className="text-right">Pesos</span>
                  <span className="text-right">Dólares</span>
                  <span className="sr-only">Acción</span>
                </div>
              ) : null}
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
                        placeholder="MXN (Pesos)"
                        className="text-right"
                      />
                      <Input
                        value={item.usdAmount}
                        onFocus={() => focusMoneyField(item.localId, 'PERCENTAGE', 'usdAmount')}
                        onBlur={() => blurMoneyField(item.localId, 'PERCENTAGE', 'usdAmount')}
                        onChange={(event) => syncConvertedAmount(item.localId, 'PERCENTAGE', 'usdAmount', event.target.value)}
                        placeholder="USD (Dólares)"
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

              {specialConsiderations.filter((item) => item.type === 'TRAVEL').length ? (
                <div className="grid gap-3 text-xs font-semibold text-[var(--color-text-muted)] md:grid-cols-[1fr_180px_180px_48px]">
                  <span>Lugar</span>
                  <span className="text-right">MXN</span>
                  <span className="text-right">USD</span>
                  <span className="sr-only">Acción</span>
                </div>
              ) : null}
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
                    placeholder="MXN (Pesos)"
                    className="text-right"
                  />
                  <Input
                    value={item.usdAmount}
                    onFocus={() => focusMoneyField(item.localId, 'TRAVEL', 'usdAmount')}
                    onBlur={() => blurMoneyField(item.localId, 'TRAVEL', 'usdAmount')}
                    onChange={(event) => syncConvertedAmount(item.localId, 'TRAVEL', 'usdAmount', event.target.value)}
                    placeholder="USD (Dólares)"
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

            <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
              <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-end">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">{finalChargeLabel}</p>
                  <Input
                    value={finalChargeRateInput}
                    onChange={(event) => setFinalChargeRateInput(normalizeDecimalInput(event.target.value))}
                    placeholder="16"
                  />
                </div>
                <div className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  {finalChargeLabel} {formatPercentageLabel(finalChargeRate)} aplicado sobre el subtotal final de la cotización.
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
          <CardHeader title="Paso 4. Actividades" description="Puedes agregar, borrar y reordenar las actividades según el orden en que las captures." />
          <CardContent className="space-y-4">
            {commercialSections
              .filter((section) => !isPartsMetadataSection(section))
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
                      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                        <Select
                          value={workItemInputMode}
                          onChange={(event) => setWorkItemInputMode(event.target.value as 'CATALOG' | 'FREE_TEXT')}
                        >
                          <option value="CATALOG">Actividad guardada</option>
                          <option value="FREE_TEXT">Texto libre</option>
                        </Select>
                        {workItemInputMode === 'CATALOG' ? (
                          <Select value={selectedWorkItem} onChange={(event) => setSelectedWorkItem(event.target.value)}>
                            <option value="">Selecciona actividad guardada</option>
                            {workItemCatalog.map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <div className="hidden md:block" />
                        )}
                        {workItemInputMode === 'CATALOG' ? (
                          <Button
                            variant="secondary"
                            onClick={addWorkItemFromCatalog}
                          >
                            <Plus className="h-4 w-4" />
                            Agregar
                          </Button>
                        ) : (
                          <div className="hidden md:block" />
                        )}
                      </div>

                      {workItemInputMode === 'FREE_TEXT' ? (
                        <Textarea
                          value={section.content}
                          onChange={(event) => updateCommercialSection(sourceIndex, 'content', event.target.value)}
                          placeholder="Escribe el texto libre tal cual debe salir en actividades."
                          rows={20}
                          className="min-h-[420px]"
                        />
                      ) : workItems.length ? (
                        <div className="rounded-2xl bg-white px-4 py-4">
                          <div className="space-y-2">
                            {workItems.map((item, itemIndex) => {
                              return (
                                <div key={`${item}-${itemIndex}`} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2">
                                  <div>
                                    <p className="text-sm leading-6 text-[var(--color-text)]">{item}</p>
                                    <p className="text-[11px] text-[var(--color-text-muted)]">
                                      {workItemCatalog.some((entry) => entry.name === item)
                                        ? 'Actividad guardada'
                                        : 'Texto libre'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => moveWorkItem(itemIndex, 'up')}
                                      disabled={itemIndex === 0}
                                      className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Mover arriba"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveWorkItem(itemIndex, 'down')}
                                      disabled={itemIndex === workItems.length - 1}
                                      className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Mover abajo"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => editWorkItem(itemIndex)}
                                      className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-secondary)]"
                                      title="Editar actividad"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeWorkItem(itemIndex)}
                                      className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-danger)]"
                                      title="Borrar actividad"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                            El bloque respeta el orden en que dejas capturadas las actividades.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white px-4 py-4 text-sm text-[var(--color-text-muted)]">
                          Agrega actividades desde el catálogo o escríbelas manualmente abajo.
                        </div>
                      )}

                      {workItemInputMode === 'CATALOG' ? (
                        <Textarea
                          value={combinedWorkItems.join('\n')}
                          onChange={(event) => updateWorkItemsContent(splitWorkItems(event.target.value))}
                          placeholder="Puedes capturar directamente el bloque de actividades. Cada renglón será una actividad."
                          className="min-h-[180px]"
                        />
                      ) : null}
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
                .filter((section) => !isPartsMetadataSection(section))
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
                <p className="mt-2 font-semibold text-[var(--color-text)]">{selectedClient?.legalName || clientName.trim() || 'Sin cliente'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedClient?.rfc || 'Sin RFC'}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Contacto</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contactName || selectedClient?.contacts[0]?.fullName || 'Sin contacto asignado'}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Vendedor</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{selectedSeller?.name || 'Sin vendedor'}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Regla de precio</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{pricingRule}</p>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Conceptos agregados</p>
                <div className="mt-4 space-y-3">
                  {previewConceptRowsByPart.map(([partNumber, rows]) => (
                    <div key={`preview-part-${partNumber || 'extras'}`} className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                        {partNumber > 0
                          ? `${getPartDisplayTitle(partNumber, partTitles[partNumber])}${rows[0]?.partQuantity > 1 ? ` x ${rows[0].partQuantity}` : ''}`
                          : 'Complementarios'}
                      </p>
                      <div className="mt-3 space-y-3">
                        {rows.map((item) => (
                          <div key={item.key} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3">
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
                  <div className="flex justify-between"><span className="text-white/70">{finalChargeLabel} {formatPercentageLabel(finalChargeRate)}</span><span>{formatCurrency(tax, currency)}</span></div>
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
                await persistQuotation({ saveModifiedPrices: false });
              }}
            >
              Solo esta cotización
            </Button>
            <Button
              onClick={async () => {
                setCatalogUpdateModalOpen(false);
                await persistQuotation({ saveModifiedPrices: true });
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

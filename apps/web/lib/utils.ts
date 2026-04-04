import { clsx, type ClassValue } from 'clsx';

export type SupportedCurrency = 'MXN' | 'USD';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(value: number, currency: SupportedCurrency = 'MXN') {
  const locale = currency === 'USD' ? 'en-US' : 'en-US';

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return `${formatted} ${currency}`;
}

export function formatCompactCurrency(value: number, currency: SupportedCurrency = 'MXN') {
  const locale = currency === 'USD' ? 'en-US' : 'en-US';

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

  return `${formatted} ${currency}`;
}

export function formatCurrencyBare(value: number, currency: SupportedCurrency = 'MXN') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactCurrencyBare(value: number, currency: SupportedCurrency = 'MXN') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function normalizeCurrency(value?: string | null): SupportedCurrency {
  return value === 'USD' ? 'USD' : 'MXN';
}

export function convertCurrencyAmount(
  value: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  exchangeRate: number,
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (fromCurrency === toCurrency) {
    return value;
  }

  if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return value;
  }

  if (fromCurrency === 'MXN' && toCurrency === 'USD') {
    return value / exchangeRate;
  }

  return value * exchangeRate;
}

export function getInitials(value: string, limit = 2) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '--';
}

export function getAvatarTone(value: string) {
  const palette = [
    {
      background: 'linear-gradient(135deg, #f97316, #ea580c)',
      border: 'rgba(194,65,12,0.42)',
      color: '#fff7ed',
    },
    {
      background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
      border: 'rgba(15,118,110,0.38)',
      color: '#f0fdfa',
    },
    {
      background: 'linear-gradient(135deg, #0284c7, #2563eb)',
      border: 'rgba(3,105,161,0.38)',
      color: '#eff6ff',
    },
    {
      background: 'linear-gradient(135deg, #16a34a, #22c55e)',
      border: 'rgba(21,128,61,0.38)',
      color: '#f0fdf4',
    },
    {
      background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
      border: 'rgba(109,40,217,0.38)',
      color: '#faf5ff',
    },
    {
      background: 'linear-gradient(135deg, #be123c, #f43f5e)',
      border: 'rgba(159,18,57,0.4)',
      color: '#fff1f2',
    },
  ];

  const hash = Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

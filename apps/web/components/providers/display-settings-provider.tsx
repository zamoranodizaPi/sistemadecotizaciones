'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useExchangeRate } from '@/lib/api/hooks';
import type { SupportedCurrency } from '@/lib/utils';

const DISPLAY_CURRENCY_STORAGE_KEY = 'sieza-display-currency';

type DisplaySettingsContextValue = {
  displayCurrency: SupportedCurrency;
  setDisplayCurrency: (currency: SupportedCurrency) => void;
  exchangeRate: number;
  exchangeRateSource: string;
  exchangeRateUpdatedAt: string | null;
  isExchangeRateLoading: boolean;
};

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const exchangeRateQuery = useExchangeRate();
  const [displayCurrency, setDisplayCurrencyState] = useState<SupportedCurrency>('MXN');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedCurrency = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    if (storedCurrency === 'MXN' || storedCurrency === 'USD') {
      setDisplayCurrencyState(storedCurrency);
    }
  }, []);

  function setDisplayCurrency(currency: SupportedCurrency) {
    setDisplayCurrencyState(currency);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, currency);
    }
  }

  const value = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      exchangeRate: Number(exchangeRateQuery.data?.rate || 0),
      exchangeRateSource: exchangeRateQuery.data?.source || 'manual',
      exchangeRateUpdatedAt: exchangeRateQuery.data?.updatedAt || null,
      isExchangeRateLoading: exchangeRateQuery.isLoading,
    }),
    [displayCurrency, exchangeRateQuery.data, exchangeRateQuery.isLoading],
  );

  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>;
}

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext);

  if (!context) {
    throw new Error('useDisplaySettings must be used within DisplaySettingsProvider');
  }

  return context;
}

WITH rate_cte AS (
  SELECT COALESCE(
    (
      SELECT rate::numeric
      FROM "ExchangeRateSetting"
      WHERE "baseCurrency" = 'USD'
        AND "quoteCurrency" = 'MXN'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    ),
    18::numeric
  ) AS rate
)
UPDATE "ServicePricingProfile" spp
SET "mxnPrice" = COALESCE(NULLIF(spp."mxnPrice", 0), ROUND((spp."usdPrice" * rate_cte.rate)::numeric, 2)),
    "usdPrice" = NULL,
    "updatedAt" = NOW()
FROM rate_cte
WHERE spp."usdPrice" IS NOT NULL
  AND spp."usdPrice" > 0;

WITH rate_cte AS (
  SELECT COALESCE(
    (
      SELECT rate::numeric
      FROM "ExchangeRateSetting"
      WHERE "baseCurrency" = 'USD'
        AND "quoteCurrency" = 'MXN'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    ),
    18::numeric
  ) AS rate
)
UPDATE "ServicePricingProfileVersion" sppv
SET "mxnPrice" = COALESCE(NULLIF(sppv."mxnPrice", 0), ROUND((sppv."usdPrice" * rate_cte.rate)::numeric, 2)),
    "usdPrice" = NULL
FROM rate_cte
WHERE sppv."usdPrice" IS NOT NULL
  AND sppv."usdPrice" > 0;

UPDATE "SpecialConsiderationCatalog"
SET "usdAmount" = NULL,
    "updatedAt" = NOW()
WHERE "usdAmount" IS NOT NULL
  AND "usdAmount" > 0;

UPDATE "QuotationSpecialConsideration"
SET "usdAmount" = NULL,
    "updatedAt" = NOW()
WHERE "usdAmount" IS NOT NULL
  AND "usdAmount" > 0;

WITH rate_cte AS (
  SELECT COALESCE(
    (
      SELECT rate::numeric
      FROM "ExchangeRateSetting"
      WHERE "baseCurrency" = 'USD'
        AND "quoteCurrency" = 'MXN'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    ),
    18::numeric
  ) AS rate
)
UPDATE "QuotationItem" qi
SET "unitPrice" = ROUND((qi."unitPrice" * rate_cte.rate)::numeric, 2),
    "totalPrice" = ROUND((qi."totalPrice" * rate_cte.rate)::numeric, 2),
    "exchangeRateUsed" = COALESCE(qi."exchangeRateUsed", rate_cte.rate),
    "priceOriginCurrency" = 'MXN'
FROM rate_cte
WHERE qi."priceOriginCurrency" = 'USD';

WITH rate_cte AS (
  SELECT COALESCE(
    (
      SELECT rate::numeric
      FROM "ExchangeRateSetting"
      WHERE "baseCurrency" = 'USD'
        AND "quoteCurrency" = 'MXN'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    ),
    18::numeric
  ) AS rate
)
UPDATE "Quotation" q
SET "subtotal" = ROUND((q."subtotal" * rate_cte.rate)::numeric, 2),
    "tax" = ROUND((q."tax" * rate_cte.rate)::numeric, 2),
    "total" = ROUND((q."total" * rate_cte.rate)::numeric, 2),
    "currency" = 'MXN',
    "updatedAt" = NOW()
FROM rate_cte
WHERE q."currency" = 'USD';

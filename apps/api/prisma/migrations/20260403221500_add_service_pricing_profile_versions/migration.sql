CREATE TABLE "ServicePricingProfileVersion" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "mxnPrice" DECIMAL(12,2),
    "usdPrice" DECIMAL(12,2),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePricingProfileVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServicePricingProfileVersion_pricingProfileId_validFrom_key"
ON "ServicePricingProfileVersion"("pricingProfileId", "validFrom");

CREATE INDEX "ServicePricingProfileVersion_pricingProfileId_validFrom_validTo_idx"
ON "ServicePricingProfileVersion"("pricingProfileId", "validFrom", "validTo");

ALTER TABLE "ServicePricingProfileVersion"
ADD CONSTRAINT "ServicePricingProfileVersion_pricingProfileId_fkey"
FOREIGN KEY ("pricingProfileId") REFERENCES "ServicePricingProfile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ServicePricingProfileVersion" (
    "id",
    "pricingProfileId",
    "mxnPrice",
    "usdPrice",
    "validFrom",
    "validTo",
    "source",
    "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || spp."id"),
    spp."id",
    spp."mxnPrice",
    spp."usdPrice",
    COALESCE(sp."validFrom", spp."createdAt"),
    NULL,
    COALESCE(sp."source", 'migration-bootstrap'),
    NOW()
FROM "ServicePricingProfile" spp
LEFT JOIN LATERAL (
    SELECT sp."validFrom", sp."source"
    FROM "ServicePrice" sp
    WHERE sp."serviceId" = spp."serviceId"
    ORDER BY sp."validFrom" DESC
    LIMIT 1
) sp ON TRUE
WHERE spp."mxnPrice" IS NOT NULL OR spp."usdPrice" IS NOT NULL;

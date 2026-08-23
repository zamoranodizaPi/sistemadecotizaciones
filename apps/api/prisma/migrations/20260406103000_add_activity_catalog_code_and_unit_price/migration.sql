ALTER TABLE "WorkItemCatalog"
ADD COLUMN "code" TEXT,
ADD COLUMN "unitPrice" DECIMAL(12, 2);

UPDATE "WorkItemCatalog" AS w
SET
  "code" = s."code",
  "unitPrice" = COALESCE(sp."mxnPrice", 0)
FROM "Service" AS s
JOIN "Category" AS c
  ON c."id" = s."categoryId"
LEFT JOIN "ServicePricingProfile" AS sp
  ON sp."serviceId" = s."id"
  AND sp."code" = 'BASE'
WHERE c."code" = 'ACT'
  AND s."name" = w."name"
  AND w."code" IS NULL;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "name") AS seq
  FROM "WorkItemCatalog"
  WHERE "code" IS NULL
)
UPDATE "WorkItemCatalog" AS w
SET "code" = 'ACT-' || LPAD(numbered.seq::text, 2, '0')
FROM numbered
WHERE w."id" = numbered."id";

UPDATE "WorkItemCatalog"
SET "unitPrice" = COALESCE("unitPrice", 0)
WHERE "unitPrice" IS NULL;

CREATE UNIQUE INDEX "WorkItemCatalog_code_key" ON "WorkItemCatalog"("code");

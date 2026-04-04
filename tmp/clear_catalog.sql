UPDATE "Service"
SET "deletedAt" = NOW()
WHERE "deletedAt" IS NULL;

UPDATE "Category"
SET "deletedAt" = NOW()
WHERE "deletedAt" IS NULL;

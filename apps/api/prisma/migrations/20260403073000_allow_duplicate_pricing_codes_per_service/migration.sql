DROP INDEX IF EXISTS "ServicePricingProfile_serviceId_code_key";

CREATE UNIQUE INDEX "ServicePricingProfile_serviceId_code_name_key"
ON "ServicePricingProfile"("serviceId", "code", "name");

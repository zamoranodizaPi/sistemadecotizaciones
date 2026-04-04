import type { CatalogResponse } from '@/lib/api/types';

export function mapCatalogForUi(catalog: CatalogResponse) {
  return catalog.map((category) => ({
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description || `${category.services.length} servicios activos`,
    services: category.services.map((service) => ({
      id: service.id,
      code: service.code,
      name: service.name,
      description: service.description || 'Sin descripción operacional',
      unit: service.unit,
      relatedWork: service.relatedWork || '',
      price: Number(service.prices[0]?.price || 0),
      history: service.prices.map((price) => ({
        date: new Date(price.validFrom).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        source: price.source,
        price: Number(price.price),
        validTo: price.validTo,
      })),
      pricingProfiles: service.pricingProfiles.map((profile) => ({
        id: profile.id,
        code: profile.code,
        name: profile.name,
        sortOrder: profile.sortOrder,
        mxnPrice: profile.mxnPrice === null ? '' : Number(profile.mxnPrice),
        usdPrice: profile.usdPrice === null ? '' : Number(profile.usdPrice),
      })),
    })),
  }));
}

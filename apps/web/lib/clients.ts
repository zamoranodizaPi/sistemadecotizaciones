import type { ClientResponse } from '@/lib/api/types';
import type { SupportedCurrency } from '@/lib/utils';

/**
 * Catalogo cerrado de industrias de cliente — debe coincidir con
 * apps/api/src/modules/clients/domain/client-industries.ts.
 */
export const CLIENT_INDUSTRIES = [
  'Minería',
  'Industria general',
  'Subestaciones',
  'Integrador industrial',
  'Generación de energía',
  'Otro',
] as const;

export function mapClientsForUi(clients: ClientResponse) {
  return clients.map((client) => ({
    id: client.id,
    legalName: client.legalName,
    commercialName: client.commercialName || '',
    segment: client.commercialName || 'Cuenta empresarial',
    industry: client.industry || '',
    rfc: client.rfc || '',
    address: client.address || '',
    contacts: client.contacts.map((contact) => ({
      id: contact.id,
      name: contact.fullName,
      role: contact.position || 'Sin cargo',
      email: contact.email || 'Sin correo',
      phone: contact.phone || '',
    })),
    activeQuotations: client.quotations.length,
    quotations: client.quotations.map((quotation) => ({
      id: quotation.id,
      total: Number(quotation.total),
      currency: (quotation.currency === 'USD' ? 'USD' : 'MXN') as SupportedCurrency,
    })),
  }));
}

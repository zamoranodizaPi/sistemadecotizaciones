import type { ClientResponse } from '@/lib/api/types';
import type { SupportedCurrency } from '@/lib/utils';

export function mapClientsForUi(clients: ClientResponse) {
  return clients.map((client) => ({
    id: client.id,
    legalName: client.legalName,
    commercialName: client.commercialName || '',
    segment: client.commercialName || 'Cuenta empresarial',
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

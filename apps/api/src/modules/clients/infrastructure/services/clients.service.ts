import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import {
  CloneClientDto,
  CreateClientDto,
  UpdateClientDto,
} from '../../application/dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeContact(contact: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    position?: string | null;
  }) {
    return {
      fullName: contact.fullName.trim(),
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
      position: contact.position?.trim() || null,
    };
  }

  listClients() {
    return this.prisma.client.findMany({
      where: { deletedAt: null },
      include: {
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        quotations: true,
      },
      orderBy: { legalName: 'asc' },
    });
  }

  createClient(dto: CreateClientDto) {
    const contacts = dto.contacts.map((contact) => this.normalizeContact(contact));

    return this.prisma.client.create({
      data: {
        legalName: dto.legalName,
        commercialName: dto.commercialName,
        rfc: dto.rfc?.trim() || null,
        address: dto.address?.trim() || null,
        contacts: {
          create: contacts.map((contact, index) => ({
            ...contact,
            isPrimary: index === 0,
          })),
        },
      },
      include: { contacts: true },
    });
  }

  async updateClient(id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const nextPrimaryContact = dto.contacts[0]
      ? this.normalizeContact(dto.contacts[0])
      : null;
    const currentPrimaryContact =
      client.contacts.find((contact) => contact.isPrimary) || client.contacts[0] || null;
    const primaryNameChanged =
      Boolean(currentPrimaryContact && nextPrimaryContact) &&
      currentPrimaryContact.fullName.trim().toLowerCase() !==
        (nextPrimaryContact?.fullName || '').trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      if (!nextPrimaryContact) {
        return tx.client.update({
          where: { id },
          data: {
            legalName: dto.legalName,
            commercialName: dto.commercialName,
            rfc: dto.rfc?.trim() || null,
            address: dto.address?.trim() || null,
          },
          include: {
            contacts: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
            quotations: true,
          },
        });
      }

      if (primaryNameChanged) {
        await tx.contact.updateMany({
          where: { clientId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.client.update({
        where: { id },
        data: {
          legalName: dto.legalName,
          commercialName: dto.commercialName,
          rfc: dto.rfc?.trim() || null,
          address: dto.address?.trim() || null,
          ...(primaryNameChanged
            ? {
                contacts: {
                  create: {
                    ...nextPrimaryContact,
                    isPrimary: true,
                  },
                },
              }
            : currentPrimaryContact
              ? {
                  contacts: {
                    update: {
                      where: { id: currentPrimaryContact.id },
                      data: {
                        ...nextPrimaryContact,
                        isPrimary: true,
                      },
                    },
                  },
                }
              : {
                  contacts: {
                    create: {
                      ...nextPrimaryContact,
                      isPrimary: true,
                    },
                  },
                }
                ),
        },
        include: {
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          quotations: true,
        },
      });
    });
  }

  async cloneClient(id: string, dto: CloneClientDto) {
    const source = await this.prisma.client.findUnique({
      where: { id },
      include: { contacts: true },
    });

    if (!source || source.deletedAt) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return this.prisma.client.create({
      data: {
        legalName: dto.legalName,
        commercialName: dto.commercialName ?? source.commercialName,
        rfc: dto.rfc?.trim() || null,
        address: dto.address?.trim() || source.address,
        contacts: {
          create: source.contacts.map((contact, index) => ({
            fullName: contact.fullName,
            email: contact.email,
            phone: contact.phone,
            position: contact.position,
            isPrimary: index === 0,
          })),
        },
      },
      include: {
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        quotations: true,
      },
    });
  }

  async deleteClient(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return this.prisma.client.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

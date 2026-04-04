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

  listClients() {
    return this.prisma.client.findMany({
      where: { deletedAt: null },
      include: { contacts: true, quotations: true },
      orderBy: { legalName: 'asc' },
    });
  }

  createClient(dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        legalName: dto.legalName,
        commercialName: dto.commercialName,
        rfc: dto.rfc,
        address: dto.address,
        contacts: {
          create: dto.contacts.map((contact, index) => ({
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
      include: { contacts: true },
    });

    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.contact.deleteMany({
        where: { clientId: id },
      });

      return tx.client.update({
        where: { id },
        data: {
          legalName: dto.legalName,
          commercialName: dto.commercialName,
          rfc: dto.rfc,
          address: dto.address,
          contacts: {
            create: dto.contacts.map((contact, index) => ({
              ...contact,
              isPrimary: index === 0,
            })),
          },
        },
        include: { contacts: true, quotations: true },
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
        rfc: dto.rfc,
        address: dto.address ?? source.address,
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
      include: { contacts: true, quotations: true },
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

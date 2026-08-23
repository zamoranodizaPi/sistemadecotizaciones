import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { CreateUserDto } from '../../application/dto/auth.dto';

const scrypt = promisify(scryptCallback);
const DEFAULT_BOOTSTRAP_ADMIN_NAME = 'Administrador';

@Injectable()
export class AuthService {
  private readonly bootstrapAdminEmail: string;
  private readonly bootstrapAdminName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.bootstrapAdminEmail = (
      this.configService.get<string>('BOOTSTRAP_ADMIN_EMAIL') || 'admin@sieza.mx'
    )
      .toLowerCase()
      .trim();
    this.bootstrapAdminName =
      this.configService.get<string>('BOOTSTRAP_ADMIN_NAME') || DEFAULT_BOOTSTRAP_ADMIN_NAME;
  }

  async login(email: string, password: string) {
    await this.ensureBootstrapAdmin();

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await this.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: this.serializeUser(user),
    };
  }

  async me(userId: string) {
    await this.ensureBootstrapAdmin();

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida');
    }

    return this.serializeUser(user);
  }

  async listUsers() {
    await this.ensureBootstrapAdmin();

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => this.serializeUser(user));
  }

  async listAssignableUsers() {
    await this.ensureBootstrapAdmin();

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: [UserRole.ADMIN, UserRole.SALES],
        },
      },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => this.serializeUser(user));
  }

  async createUser(dto: CreateUserDto) {
    await this.ensureBootstrapAdmin();

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new BadRequestException('Ya existe un usuario con ese correo');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const role = this.mapRole(dto.role);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role,
        isActive: true,
      },
    });

    return this.serializeUser(user);
  }

  async verifyUserPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inválido');
    }

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    return user;
  }

  async verifyAdminPassword(userId: string, password: string) {
    const user = await this.verifyUserPassword(userId, password);

    if (user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Solo un administrador puede confirmar esta acción');
    }

    return user;
  }

  async ensureBootstrapAdmin() {
    const existing = await this.prisma.user.findUnique({
      where: { email: this.bootstrapAdminEmail },
    });

    if (existing) {
      const needsRefresh = existing.role !== UserRole.ADMIN || !existing.isActive;
      if (!needsRefresh) {
        return existing;
      }

      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role: UserRole.ADMIN,
          isActive: true,
        },
      });
    }

    const password = this.resolveBootstrapPassword();

    return this.prisma.user.create({
      data: {
        name: this.bootstrapAdminName,
        email: this.bootstrapAdminEmail,
        passwordHash: await this.hashPassword(password),
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
  }

  private resolveBootstrapPassword() {
    const configured = this.configService.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    if (configured) {
      return configured;
    }

    const generated = randomBytes(12).toString('base64url');
    console.log(
      `[auth] BOOTSTRAP_ADMIN_PASSWORD no está configurada. Se generó una contraseña temporal ` +
        `para ${this.bootstrapAdminEmail}: ${generated}\n` +
        '[auth] Defínela en el .env para fijarla de forma permanente (esta se pierde al reiniciar el proceso).',
    );
    return generated;
  }

  private serializeUser(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      displayRole: this.toDisplayRole(user.role),
      isActive: user.isActive,
    };
  }

  private toDisplayRole(role: UserRole) {
    if (role === UserRole.SALES) {
      return 'EDITOR';
    }
    return role;
  }

  private mapRole(role: 'ADMIN' | 'EDITOR' | 'VIEWER') {
    if (role === 'EDITOR') {
      return UserRole.SALES;
    }
    if (role === 'VIEWER') {
      return UserRole.VIEWER;
    }
    return UserRole.ADMIN;
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
      return false;
    }

    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(key, 'hex');

    if (storedBuffer.length !== derived.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, derived);
  }
}

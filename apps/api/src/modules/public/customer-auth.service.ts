/**
 * CUSTOMER AUTH SERVICE — Customer Portal Phase 1
 * ──────────────────────────────────────────────────────────────────────────────
 * Phone OTP tabanlı customer doğrulama.
 * Customer ≠ User — ayrı session mekanizması.
 * Tenant-scoped: her OTP isteği slug ile tenant'a bağlanır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';

const OTP_EXPIRY_MS   = 5 * 60 * 1000; // 5 dakika
const OTP_COOLDOWN_MS = 60 * 1000;     // 1 dakika — spam koruması

export interface CustomerSessionPayload {
  customerId: string;
  tenantId:   string;
  type:       'customer';
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt:    JwtService,
  ) {}

  /**
   * OTP oluştur ve customer'a kaydet.
   * Gerçek SMS/email gönderimi bu fazda YOK — OTP response'ta döner (dev mode).
   * Production'da SMS provider entegrasyonu Faz-2 scope.
   */
  async requestOtp(slug: string, phone: string): Promise<{ message: string; otpCode?: string }> {
    // 1. Tenant resolve
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Salon bulunamadı.');

    // 2. Customer lookup (phone + tenant)
    const customer = await this.prisma.customer.findFirst({
      where: { phone, tenantId: tenant.id, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundException('Bu telefon numarasıyla kayıtlı müşteri bulunamadı. Lütfen önce randevu alın.');
    }

    // 3. Cooldown check
    if (customer.otpExpiresAt) {
      const cooldownEnd = new Date(customer.otpExpiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS);
      if (new Date() < cooldownEnd) {
        throw new BadRequestException('Lütfen 1 dakika bekleyip tekrar deneyin.');
      }
    }

    // 4. Generate 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { otpCode, otpExpiresAt },
    });

    this.logger.log(`OTP generated for customer=${customer.id} tenant=${tenant.id}`);

    // Dev mode: OTP response'ta döner. Production'da SMS gönderilir.
    const isDev = process.env['NODE_ENV'] !== 'production';
    return {
      message: 'Doğrulama kodu gönderildi.',
      ...(isDev ? { otpCode } : {}),
    };
  }

  /**
   * OTP doğrula ve session token (JWT) oluştur.
   */
  async verifyOtp(slug: string, phone: string, otpCode: string): Promise<{ token: string }> {
    // 1. Tenant resolve
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Salon bulunamadı.');

    // 2. Customer lookup
    const customer = await this.prisma.customer.findFirst({
      where: { phone, tenantId: tenant.id, isDeleted: false },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı.');

    // 3. OTP validation
    if (!customer.otpCode || !customer.otpExpiresAt) {
      throw new BadRequestException('Önce doğrulama kodu isteyiniz.');
    }
    if (new Date() > customer.otpExpiresAt) {
      throw new BadRequestException('Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.');
    }
    if (customer.otpCode !== otpCode) {
      throw new BadRequestException('Doğrulama kodu hatalı.');
    }

    // 4. Clear OTP + update lastLoginAt
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { otpCode: null, otpExpiresAt: null, lastLoginAt: new Date() },
    });

    // 5. Create customer session JWT (ayrı secret ile imzalanabilir ama
    //    MVP'de aynı secret, farklı payload type ile ayrıştırılır)
    const payload: CustomerSessionPayload = {
      customerId: customer.id,
      tenantId:   tenant.id,
      type:       'customer',
    };

    const token = this.jwt.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Customer session created: customer=${customer.id} tenant=${tenant.id}`);
    return { token };
  }
}

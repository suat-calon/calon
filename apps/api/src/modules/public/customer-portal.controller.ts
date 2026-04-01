/**
 * CUSTOMER PORTAL CONTROLLER — Phase 1
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/public/customer
 *
 * Auth endpoints (public, rate-limited):
 *   POST /request-otp   — OTP iste
 *   POST /verify-otp    — OTP doğrula, session token al
 *
 * Portal endpoints (CustomerAuthGuard korumalı):
 *   GET  /me            — Profil + loyalty özeti
 *   GET  /appointments  — Randevu listesi (upcoming + past)
 *   GET  /appointments/:id  — Randevu detay
 *   PATCH /appointments/:id/cancel — Randevu iptali
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';
import { Request, Response } from 'express';
import { Public }           from '../iam/guards/tenant.guard';
import { AllowPastDue }     from '../billing/decorators/allow-past-due.decorator';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthGuard }   from './customer-auth.guard';
import { PrismaService }       from '../../common/prisma.service';

// ── DTOs ────────────────────────────────────────────────────────────────────

class RequestOtpDto {
  @IsString() @IsNotEmpty()
  slug!: string;

  @IsString() @IsNotEmpty()
  phone!: string;
}

class VerifyOtpDto {
  @IsString() @IsNotEmpty()
  slug!: string;

  @IsString() @IsNotEmpty()
  phone!: string;

  @IsString() @IsNotEmpty() @Matches(/^\d{6}$/, { message: '6 haneli doğrulama kodu gerekli.' })
  otpCode!: string;
}

// ── Controller ──────────────────────────────────────────────────────────────

@Public()
@AllowPastDue()
@Controller('public/customer')
export class CustomerPortalController {
  constructor(
    private readonly authService: CustomerAuthService,
    private readonly prisma:      PrismaService,
  ) {}

  // ── Auth endpoints (public) ─────────────────────────────────────────────

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.slug, dto.phone);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.authService.verifyOtp(dto.slug, dto.phone, dto.otpCode);

    // HttpOnly cookie ile session set
    res.cookie('calon_customer', token, {
      httpOnly: true,
      secure:   process.env['NODE_ENV'] !== 'development',
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 gün
      path:     '/',
    });

    return { message: 'Giriş başarılı.' };
  }

  // ── Portal endpoints (CustomerAuthGuard) ────────────────────────────────

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  async getMe(@Req() req: Request & { customerId: string; customerTenantId: string }) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: req.customerId, tenantId: req.customerTenantId, isDeleted: false },
      select: {
        id: true, firstName: true, lastName: true, phone: true, email: true,
        loyaltyTier: true, loyaltyPoints: true, createdAt: true,
      },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı.');
    return customer;
  }

  @Get('appointments')
  @UseGuards(CustomerAuthGuard)
  async getAppointments(
    @Req() req: Request & { customerId: string; customerTenantId: string },
    @Query('status') status?: string, // 'upcoming' | 'past'
  ) {
    const now = new Date();
    const where: Record<string, unknown> = {
      customerId: req.customerId,
      tenantId:   req.customerTenantId,
      isDeleted:  false,
    };

    if (status === 'upcoming') {
      where['startTime'] = { gte: now };
      where['status']    = { in: ['PENDING', 'CONFIRMED', 'PAID', 'PENDING_PAYMENT'] };
    } else if (status === 'past') {
      where['OR'] = [
        { startTime: { lt: now } },
        { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
      ];
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { startTime: status === 'past' ? 'desc' : 'asc' },
      take: 20,
      select: {
        id: true, startTime: true, endTime: true, status: true,
        notes: true, cancelledAt: true, cancellationReason: true,
        service:  { select: { id: true, name: true, durationMin: true, price: true, currency: true } },
        staff:    { select: { id: true, firstName: true, lastName: true, title: true, colorHex: true } },
        location: { select: { id: true, name: true, address: true, city: true, phone: true } },
      },
    });

    return appointments;
  }

  @Get('appointments/:id')
  @UseGuards(CustomerAuthGuard)
  async getAppointmentDetail(
    @Req()   req: Request & { customerId: string; customerTenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        customerId: req.customerId,
        tenantId:   req.customerTenantId,
        isDeleted:  false,
      },
      select: {
        id: true, startTime: true, endTime: true, status: true,
        notes: true, cancelledAt: true, cancellationReason: true,
        createdAt: true,
        service:  { select: { id: true, name: true, durationMin: true, price: true, currency: true } },
        staff:    { select: { id: true, firstName: true, lastName: true, title: true, colorHex: true, avatarUrl: true } },
        location: { select: { id: true, name: true, address: true, city: true, phone: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Randevu bulunamadı.');
    return appointment;
  }

  @Patch('appointments/:id/cancel')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelAppointment(
    @Req()   req: Request & { customerId: string; customerTenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // 1. Randevuyu bul ve sahipliğini doğrula
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        customerId: req.customerId,
        tenantId:   req.customerTenantId,
        isDeleted:  false,
      },
    });

    if (!appointment) throw new NotFoundException('Randevu bulunamadı.');

    // 2. İptal edilebilir status kontrolü
    const cancellableStatuses = ['PENDING', 'CONFIRMED', 'PAID', 'PENDING_PAYMENT'];
    if (!cancellableStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        `Bu randevu iptal edilemez (mevcut durum: ${appointment.status}).`,
      );
    }

    // 3. Geçmiş randevu kontrolü (başlangıç zamanı geçmişse iptal edilemez)
    if (new Date() > appointment.startTime) {
      throw new BadRequestException('Başlangıç zamanı geçmiş randevular iptal edilemez.');
    }

    // 4. İptal et
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status:             'CANCELLED',
        cancelledAt:        new Date(),
        cancellationReason: 'Müşteri tarafından iptal edildi (portal)',
      },
      select: {
        id: true, status: true, cancelledAt: true, cancellationReason: true,
      },
    });

    return updated;
  }
}

/**
 * STAFF SERVICE — Personel Profili, Çalışma Saatleri ve Vardiya Yönetimi
 * ─────────────────────────────────────────────────────────────────────────────
 * İş kuralları:
 *   • create()           — Yeni personel profili oluşturur
 *   • findAll()          — Sayfalı liste, isteğe bağlı arama + lokasyon filtresi
 *   • findOne()          — Detay getir (findUnique → manuel tenantId kontrolü)
 *   • setWorkingHours()  — Haftalık programı atomik olarak upsert eder
 *   • createShift()      — Özel vardiya / istisna gün ekler
 *   • listShifts()       — Tarih aralığıyla vardiya listesi
 *
 * Güvenlik:
 *   • PrismaService middleware findMany/count'a tenantId + isDeleted:false ekler
 *   • findUnique middleware'den hariç → manuel tenantId + isDeleted kontrolü zorunlu
 *   • StaffWorkingHour ve StaffShift'in tenantId alanı YOK; güvenlik
 *     StaffProfile.tenantId → staffId chain'ine dayalıdır
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StaffProfile,
  StaffWorkingHour,
  StaffShift,
} from '@prisma/client';

import { PrismaService }       from '../../common/prisma.service';
import { CreateStaffDto }      from './dto/create-staff.dto';
import { ListStaffQueryDto }   from './dto/list-staff-query.dto';
import { SetWorkingHoursDto }  from './dto/set-working-hours.dto';
import { CreateShiftDto, ListShiftsQueryDto } from './dto/create-shift.dto';

export interface PaginatedStaff {
  data:  StaffProfile[];
  total: number;
  take:  number;
  skip:  number;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  // ── create ──────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateStaffDto): Promise<StaffProfile> {
    return this.prisma.staffProfile.create({
      data: {
        tenantId,
        locationId:     dto.locationId,
        userId:         dto.userId ?? null,
        firstName:      dto.firstName,
        lastName:       dto.lastName,
        phone:          dto.phone ?? null,
        avatarUrl:      dto.avatarUrl ?? null,
        title:          dto.title ?? null,
        colorHex:       dto.colorHex ?? '#6366f1',
        commissionRate: dto.commissionRate ?? 0,
        isActive:       dto.isActive ?? true,
      },
    });
  }

  // ── findAll ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListStaffQueryDto): Promise<PaginatedStaff> {
    const take = query.take ?? 20;
    const skip = query.skip ?? 0;

    const where: Prisma.StaffProfileWhereInput = {
      tenantId,
      isDeleted: false,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.search ? {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName:  { contains: query.search, mode: 'insensitive' } },
          { title:     { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where,
        take,
        skip,
        orderBy:  { firstName: 'asc' },
        include:  { workingHours: true },
      }),
      this.prisma.staffProfile.count({ where }),
    ]);

    return { data, total, take, skip };
  }

  // ── findOne ─────────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string): Promise<StaffProfile & { workingHours: StaffWorkingHour[] }> {
    const staff = await this.prisma.staffProfile.findFirst({
      where:   { id, tenantId },
      include: { workingHours: true },
    });

    if (!staff || staff.isDeleted) {
      throw new NotFoundException('Personel bulunamadı');
    }

    return staff;
  }

  // ── setWorkingHours ─────────────────────────────────────────────────────────

  /**
   * Personelin haftalık programını upsert eder.
   * Her gün için @@unique([staffId, dayOfWeek]) kısıtlaması var.
   * $transaction: Tüm günler atomik olarak güncellenir.
   */
  async setWorkingHours(
    tenantId: string,
    staffId:  string,
    dto:      SetWorkingHoursDto,
  ): Promise<StaffWorkingHour[]> {
    // Personelin bu tenant'a ait olduğunu doğrula
    const staff = await this.prisma.staffProfile.findFirst({ where: { id: staffId, tenantId } });
    if (!staff || staff.isDeleted) {
      throw new NotFoundException('Personel bulunamadı');
    }

    await this.prisma.$transaction(
      dto.hours.map((entry) =>
        this.prisma.staffWorkingHour.upsert({
          where: {
            staffId_dayOfWeek: { staffId, dayOfWeek: entry.dayOfWeek },
          },
          create: {
            tenantId,
            staffId,
            dayOfWeek:    entry.dayOfWeek,
            isWorkingDay: entry.isWorkingDay,
            startTime:    entry.startTime,
            endTime:      entry.endTime,
            breakStart:   entry.breakStart ?? null,
            breakEnd:     entry.breakEnd   ?? null,
          },
          update: {
            isWorkingDay: entry.isWorkingDay,
            startTime:    entry.startTime,
            endTime:      entry.endTime,
            breakStart:   entry.breakStart ?? null,
            breakEnd:     entry.breakEnd   ?? null,
          },
        }),
      ),
    );

    // Güncel listeyi döndür
    return this.prisma.staffWorkingHour.findMany({
      where:   { staffId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  // ── createShift ─────────────────────────────────────────────────────────────

  /**
   * Özel vardiya / istisna gün ekler (izin, rapor, fazla mesai).
   */
  async createShift(
    tenantId: string,
    staffId:  string,
    dto:      CreateShiftDto,
  ): Promise<StaffShift> {
    const staff = await this.prisma.staffProfile.findFirst({ where: { id: staffId, tenantId } });
    if (!staff || staff.isDeleted) {
      throw new NotFoundException('Personel bulunamadı');
    }

    return this.prisma.staffShift.create({
      data: {
        tenantId,  // Faz 23: StaffShift.tenantId zorunlu alan (RLS + availability query)
        staffId,
        date:      new Date(dto.date),
        startTime: new Date(dto.startTime),
        endTime:   new Date(dto.endTime),
        notes:     dto.notes ?? null,
      },
    });
  }

  // ── listShifts ──────────────────────────────────────────────────────────────

  async listShifts(
    tenantId: string,
    staffId:  string,
    query:    ListShiftsQueryDto,
  ): Promise<StaffShift[]> {
    const staff = await this.prisma.staffProfile.findFirst({ where: { id: staffId, tenantId } });
    if (!staff || staff.isDeleted) {
      throw new NotFoundException('Personel bulunamadı');
    }

    const dateFilter: Prisma.StaffShiftWhereInput = {
      staffId,
      ...(query.from || query.to ? {
        date: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to   ? { lte: new Date(query.to)   } : {}),
        },
      } : {}),
    };

    return this.prisma.staffShift.findMany({
      where:   dateFilter,
      orderBy: { date: 'asc' },
    });
  }
}

/**
 * PAYMENT REPOSITORY — Prisma Implementation
 */

import { Injectable }    from '@nestjs/common';
import { Prisma }        from '@prisma/client';
import { Appointment, mapToDomainError } from '@calon/database';

import { PrismaService }    from '../../common/prisma.service';
import { getActiveTxClient } from '../../common/tx.context';
import {
  IPaymentRepository,
  AppointmentDepositUpdateInput,
  AppointmentCheckoutInput,
} from './payment.repository.interface';

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): Prisma.TransactionClient {
    return getActiveTxClient(this.prisma as unknown as Prisma.TransactionClient);
  }

  async findAppointmentById(id: string, tenantId: string): Promise<Appointment | null> {
    return this.db.appointment.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
  }

  async updateAppointmentDeposit(
    id:   string,
    data: AppointmentDepositUpdateInput,
  ): Promise<Appointment> {
    try {
      return await this.db.appointment.update({
        where: { id },
        data:  { depositPaid: data.depositPaid as never },
      });
    } catch (err) {
      throw mapToDomainError(err);
    }
  }

  async checkoutAppointment(
    id:   string,
    data: AppointmentCheckoutInput,
  ): Promise<Appointment> {
    try {
      return await this.db.appointment.update({
        where: { id },
        data: {
          status:     data.status,
          totalPrice: data.totalPrice as never,
        },
      });
    } catch (err) {
      throw mapToDomainError(err);
    }
  }
}

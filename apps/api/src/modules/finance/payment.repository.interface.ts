/**
 * IPaymentRepository — Domain repository contract for payments.
 * Used by both finance/payment.service.ts and public/payment.service.ts.
 */

import { Appointment, AppointmentStatus, PaymentStatus } from '@calon/database';

export const PAYMENT_REPO = Symbol('IPaymentRepository');

export interface PaymentCreateInput {
  tenantId:      string;
  appointmentId: string;
  amount:        unknown;   // Money or Decimal-compatible
  currency:      string;
  status:        PaymentStatus;
  paymentUrl?:   string | null;
}

export interface AppointmentDepositUpdateInput {
  depositPaid: unknown;  // Money or Decimal-compatible
}

export interface AppointmentCheckoutInput {
  status:     AppointmentStatus;
  totalPrice: unknown;  // Money or Decimal-compatible
}

export interface IPaymentRepository {
  // ── Appointment (finance operations) ────────────────────────────────────────

  findAppointmentById(id: string, tenantId: string): Promise<Appointment | null>;
  updateAppointmentDeposit(id: string, data: AppointmentDepositUpdateInput): Promise<Appointment>;
  checkoutAppointment(id: string, data: AppointmentCheckoutInput): Promise<Appointment>;
}

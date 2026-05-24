export type UserRole = 'ROLE_CLIENT' | 'ROLE_PROFESSIONAL' | 'ROLE_ADMIN';

export interface User {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  roles: UserRole[];
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Professional {
  id: string;
  userId: string;
  bio?: string;
  acceptancePolicy: 'OPEN' | 'FILTER_LOW_TRUST' | 'REQUIRE_MANUAL_CONFIRMATION' | 'REQUIRE_DEPOSIT_FOR_LOW_TRUST';
  cancellationPolicy: 'standard' | 'flexible' | 'strict';
  depositAmountCents?: number;
  portfolioUrls?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Service {
  id: string;
  userId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceCents: number;
  bufferMinutesAfter: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ReservationStatus =
  | 'CONFIRMED'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_DEPOSIT'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED_BY_CLIENT'
  | 'CANCELLED_BY_PROFESSIONAL'
  | 'DECLINED_BY_PROFESSIONAL';

export interface Reservation {
  id: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  serviceNameSnapshot: string;
  serviceDurationMinutesSnapshot: number;
  servicePriceCentsSnapshot: number;
  clientNotes?: string;
  professionalNotes?: string;
  createdAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  startUtc: Date;
  endUtc: Date;
  displayLocal: string;
}

export interface ClientTrustProfile {
  id: string;
  clientId: string;
  trustScore: number;
  lastUpdatedAt: Date;
  createdAt: Date;
}

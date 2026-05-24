# Plan d'Agents Autonomes - Torim (Vercel + Supabase)

**Date:** Mai 2026  
**Stack:** Vercel + Supabase + Fastify + React Native  
**Objectif:** Orchestrer des agents pour créer l'app de manière complètement autonome  
**Coûts:** €0/an jusqu'à 100k users

---

## 1. Vue d'Ensemble - Architecture d'Agents

```
                    ┌──────────────────────────────────┐
                    │   ORCHESTRATOR (Toi)             │
                    │   Lance agents, valide checkpoints
                    └────────────────┬─────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
   PHASE 1: SETUP              PHASE 2: CODE                PHASE 3: DEPLOY
   (1-2 heures)                (2-3 jours)                 (4-6 heures)
        │                            │                            │
   Agents parallèles          Agents parallèles            Agents séquentiels
        │                            │                            │
   ┌────┴────┐          ┌────┬──────┴──────┬────┐           ┌────┴────┐
   │          │          │    │             │    │           │         │
 Arch      Auth      Backend Booking Mobile Trust         Testing  DevOps
 Agent    Agent      Agent   Engine  Agent  Agent         Agent    Agent
                              Agent
```

---

## 2. Agents et Responsabilités Complètes

### **PHASE 1: SETUP & FOUNDATION (Jour 1 matin - ~2h)**

#### **1.1 Architecture Agent** ⚙️
**Responsabilité:** Créer la structure complète du projet + config Vercel/Supabase  
**Dépendances:** Aucune (START HERE)  
**Durée estimée:** 1.5-2 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
Root Structure:
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc.json
├── .gitignore
├── package.json (workspace root)
├── .env.example
├── .env.local (gitignored)
├── vercel.json (deployment config)
└── .supabaserc (Supabase config)

Packages:
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env.example
│   │
│   ├── mobile/
│   │   ├── app/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env.example
│   │
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json

Documentation:
├── docs/
│   ├── SETUP.md
│   ├── ARCHITECTURE.md (updated for Vercel+Supabase)
│   ├── AGENTS.md (this file)
│   └── API.md (empty, filled by agents)

CI/CD:
├── .github/workflows/
│   ├── ci.yml (lint, type check, tests)
│   └── deploy.yml (auto-deploy to Vercel on main)
```

**Checklist Architecture Agent:**
- [ ] `pnpm init -w` (workspace)
- [ ] Create packages/* directories
- [ ] Setup TypeScript (tsconfig.base.json + per-package configs)
- [ ] Setup ESLint + Prettier
- [ ] Create vercel.json (API + Web config)
- [ ] Create .supabaserc (project info)
- [ ] Setup GitHub Actions CI (skeleton)
- [ ] Create .env.example with all required vars
- [ ] Git init + initial commit

**Key Files to Create:**
```
pnpm-workspace.yaml:
workspace:
  - 'packages/**'

turbo.json:
{
  "pipeline": {
    "build": {},
    "test": {
      "outputs": ["coverage/**"],
      "cache": false
    },
    "lint": {
      "cache": false
    }
  }
}

vercel.json:
{
  "buildCommand": "pnpm turbo run build",
  "installCommand": "pnpm install",
  "outputDirectory": "packages/backend/dist"
}

.env.example:
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxx...

# App
NODE_ENV=development
API_URL=http://localhost:3000
DATABASE_URL=postgresql://...

# Stripe (optional)
STRIPE_PUBLIC_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx

# Email
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=xxx.mailgun.org
```

**Success Criteria:**
- ✅ Repo structure clean and organized
- ✅ `pnpm install` works
- ✅ `pnpm turbo run lint` runs (even if fails)
- ✅ All .env vars documented
- ✅ Vercel project created and linked
- ✅ Supabase project created and linked

---

#### **1.2 Supabase Setup Agent** 🗄️
**Responsibilité:** Database schema + Auth setup + Realtime  
**Dépendances:** ✅ Architecture Agent  
**Durée estimée:** 1-1.5 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
Supabase Project (created manually via UI, then configured via CLI):
├── Database (PostgreSQL 15)
│   ├── Tables (SQL migrations)
│   ├── Row Level Security (RLS)
│   └── Indexes + Constraints
│
├── Auth
│   ├── Email/Password provider
│   ├── Auth policies
│   └── JWT config
│
├── Realtime
│   ├── Enable on specific tables
│   └── Broadcast settings
│
└── Storage
    └── avatars & portfolio bucket

Code Files:
├── packages/backend/supabase/
│   ├── migrations/
│   │   └── 001_initial.sql
│   ├── seed.sql
│   └── types.ts (auto-generated)
│
└── packages/shared/src/types/
    └── supabase.ts (Supabase auto-types)
```

**Database Schema (SQL):**
```sql
-- Users (managed by Supabase Auth, but extended)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  roles TEXT[] DEFAULT ARRAY['ROLE_CLIENT'],
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Professional Profiles
CREATE TABLE professional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  acceptance_policy TEXT DEFAULT 'OPEN', -- OPEN, FILTER_LOW_TRUST, REQUIRE_MANUAL_CONFIRMATION, REQUIRE_DEPOSIT_FOR_LOW_TRUST
  cancellation_policy TEXT DEFAULT 'standard', -- standard, flexible, strict
  deposit_amount_cents INT,
  portfolio_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Professional Schedules (Weekly recurring)
CREATE TABLE professional_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL, -- 0 = Monday, 6 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

-- Services
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL, -- 30, 60, 90, 120
  price_cents INT NOT NULL,
  buffer_minutes_after INT DEFAULT 15,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reservations (Core entity)
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  
  -- Time (always UTC)
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED, AWAITING_CONFIRMATION, AWAITING_DEPOSIT, COMPLETED, NO_SHOW, CANCELLED_BY_CLIENT, CANCELLED_BY_PROFESSIONAL, DECLINED_BY_PROFESSIONAL
  
  -- Immutable snapshots
  service_name_snapshot TEXT NOT NULL,
  service_duration_minutes_snapshot INT NOT NULL,
  service_price_cents_snapshot INT NOT NULL,
  
  -- Notes
  client_notes TEXT,
  professional_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT no_self_booking CHECK (client_id != professional_id),
  CONSTRAINT valid_time_range CHECK (start_time < end_time),
  UNIQUE(professional_id, start_time, end_time) WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PROFESSIONAL', 'NO_SHOW')
);

-- Payments (For deposits only)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE,
  amount_cents INT NOT NULL,
  currency TEXT DEFAULT 'ILS',
  status TEXT DEFAULT 'PENDING', -- PENDING, SUCCEEDED, FAILED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  succeeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client Trust Profiles
CREATE TABLE client_trust_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  trust_score INT DEFAULT 50,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trust Events (Log)
CREATE TABLE trust_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id),
  event_type TEXT NOT NULL, -- booking_completed, no_show, cancellation_0_24h, cancellation_24h_plus, booking_confirmed
  points_delta INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- Reservation, Payment, User, etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, CANCEL
  user_id UUID REFERENCES users(id),
  changes_before JSONB,
  changes_after JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (Critical for performance)
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_professional_schedules_user ON professional_schedules(user_id);
CREATE INDEX idx_services_user ON services(user_id);
CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_professional ON reservations(professional_id);
CREATE INDEX idx_reservations_professional_time ON reservations(professional_id, start_time, end_time) WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PROFESSIONAL', 'NO_SHOW');
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_payments_reservation ON payments(reservation_id);
CREATE INDEX idx_payments_stripe_id ON payments(stripe_payment_intent_id);
CREATE INDEX idx_trust_profiles_client ON client_trust_profiles(client_id);
CREATE INDEX idx_trust_events_client ON trust_events(client_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

**Checklist Supabase Agent:**
- [ ] Create Supabase project
- [ ] Link to GitHub repo
- [ ] Create all tables (SQL above)
- [ ] Setup Row Level Security (RLS) policies
  - [ ] Users can only read their own data
  - [ ] Professionals can read reservations for their services
  - [ ] Clients can read their own reservations
- [ ] Enable Realtime on: reservations, professional_schedules
- [ ] Create Storage bucket: "avatars"
- [ ] Create Storage bucket: "portfolio"
- [ ] Run seed.sql (test data)
- [ ] Setup Auth (email/password provider)
- [ ] Generate TypeScript types (`supabase gen types typescript`)
- [ ] Create `.supabaserc` with project info
- [ ] Document schema in docs/DATABASE.md

**Success Criteria:**
- ✅ All tables created with correct constraints
- ✅ Indexes optimized
- ✅ RLS policies working (test via Supabase dashboard)
- ✅ Realtime enabled on critical tables
- ✅ Seed data loaded (test professionals + services)
- ✅ TypeScript types generated
- ✅ No migration errors

---

### **PHASE 2: IMPLEMENTATION (Jours 2-3 - ~2-3 jours)**

#### **2.1 Backend Agent** 🚀
**Responsabilité:** API, routes, middleware, services (sauf booking engine + trust system)  
**Dépendances:** ✅ Architecture Agent, ✅ Supabase Agent  
**Durée estimée:** 3-4 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
packages/backend/src/
├── main.ts (Fastify server)
├── middleware/
│   ├── auth.ts (Supabase JWT verification)
│   ├── validation.ts (Zod schemas)
│   ├── errorHandler.ts (AppError hierarchy)
│   └── logging.ts (Structured logging)
├── routes/
│   ├── auth.ts (signup, login, logout)
│   ├── users.ts (profile, timezone, etc.)
│   ├── professionals.ts (list, detail, schedule, services)
│   ├── reservations.ts (list, detail - logic in services)
│   ├── bookings.ts (POST create, empty logic - filled by 2.2)
│   └── health.ts (liveness check)
├── services/
│   ├── AuthService.ts (login/signup, no JWT - Supabase handles)
│   ├── UserService.ts (profile management)
│   ├── ProfessionalService.ts (schedule, services CRUD)
│   ├── NotificationService.ts (email via Mailgun, stub for now)
│   └── TimeZoneService.ts (zonedTimeToUtc, utcToZonedTime)
├── repositories/
│   ├── UserRepository.ts
│   ├── ProfessionalRepository.ts
│   ├── ServiceRepository.ts
│   ├── ReservationRepository.ts (queries only, no logic)
│   ├── PaymentRepository.ts
│   └── BaseRepository.ts
├── models/
│   ├── User.ts
│   ├── Professional.ts
│   ├── Service.ts
│   ├── Reservation.ts
│   ├── Payment.ts
│   └── TimeSlot.ts
├── schemas/
│   ├── auth.ts
│   ├── users.ts
│   ├── professionals.ts
│   ├── services.ts
│   ├── reservations.ts
│   └── bookings.ts
├── utils/
│   ├── errors.ts (AppError, specific errors)
│   ├── logger.ts (Pino setup)
│   ├── supabase.ts (Supabase client factory)
│   └── validators.ts (custom validations)
├── config/
│   └── env.ts (environment validation)
└── tests/
    ├── unit/
    └── integration/
```

**Key Implementation Details:**

```typescript
// main.ts - Fastify setup
import Fastify from 'fastify';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { supabaseClient } from './utils/supabase';

const app = Fastify({ logger: true });

// Middleware
app.register(errorHandler);
app.register(authMiddleware); // Verify Supabase JWT

// Routes
app.register(authRoutes, { prefix: '/api/v1/auth' });
app.register(usersRoutes, { prefix: '/api/v1/users' });
app.register(professionalsRoutes, { prefix: '/api/v1/professionals' });
app.register(reservationsRoutes, { prefix: '/api/v1/reservations' });
app.register(bookingsRoutes, { prefix: '/api/v1/bookings' });

app.listen({ port: 3000 }, (err, address) => {
  if (err) app.log.error(err);
  app.log.info(`Server listening on ${address}`);
});

// supabase.ts - Client setup
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Server-side only
);

// auth.ts - Routes
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: SignupInput }>('/signup', async (request, reply) => {
    const { email, password, fullName } = request.body;
    
    // Use Supabase Auth directly
    const { data, error } = await supabase.auth.signUpWithPassword({
      email,
      password,
    });
    
    if (error) throw new AuthenticationError(error.message);
    
    // Create user profile (optional extended data)
    await supabaseAdmin
      .from('users')
      .insert({ id: data.user.id, email, full_name: fullName });
    
    return { user: data.user, session: data.session };
  });

  app.post<{ Body: LoginInput }>('/login', async (request, reply) => {
    const { email, password } = request.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw new AuthenticationError(error.message);
    
    return { user: data.user, session: data.session };
  });
}

// TimeZoneService.ts
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

export class TimeZoneService {
  static zonedTimeToUtc(localTime: Date, timezone: string): Date {
    return zonedTimeToUtc(localTime, timezone);
  }

  static utcToZonedTime(utcTime: Date, timezone: string): Date {
    return utcToZonedTime(utcTime, timezone);
  }

  static formatForDisplay(utcTime: Date, timezone: string): string {
    const zoned = this.utcToZonedTime(utcTime, timezone);
    return zoned.toISOString().split('T')[1].substring(0, 5); // HH:mm
  }
}
```

**Checklist Backend Agent:**
- [ ] Fastify server setup + middleware stack
- [ ] Supabase client initialization
- [ ] Error handling (AppError hierarchy)
- [ ] Zod validation schemas
- [ ] Logging setup (Pino)
- [ ] Auth routes (signup, login, logout via Supabase)
- [ ] Users routes (get profile, update timezone, etc.)
- [ ] Professionals routes (list, detail, schedule CRUD, services CRUD)
- [ ] Reservations routes (GET /reservations/:id, GET /my-reservations)
- [ ] Bookings routes (POST /bookings - empty, filled by 2.2)
- [ ] Health check endpoint
- [ ] Rate limiting setup (simple: just configure)
- [ ] CORS setup
- [ ] Environment validation

**Success Criteria:**
- ✅ Server starts: `npm run dev`
- ✅ Auth routes work (signup/login)
- ✅ Can query professionals from Supabase
- ✅ No Booking Engine logic yet (stub endpoints OK)
- ✅ TypeScript strict mode passes
- ✅ ESLint clean

---

#### **2.2 Booking Engine Agent** 📅
**Responsabilité:** Logique de réservation complexe (le cœur)  
**Dépendances:** ✅ Backend Agent, ✅ Supabase Agent  
**Durée estimée:** 4-5 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
packages/backend/src/services/
├── BookingEngine.ts (500+ lignes, most complex)
├── ReservationService.ts (orchestration)
└── routes/bookings.ts (completed endpoints)

Tests:
└── tests/unit/BookingEngine.test.ts (30+ test cases)

Key Functions:
├── calculateAvailability(professional_id, date, service_id, ...)
├── validateNoOverlap(professional_id, start_utc, end_utc)
├── createReservation(client_id, professional_id, service_id, start_utc, end_utc)
├── evaluateAcceptancePolicy(professional_id, client_id, policy)
├── cancelReservation(reservation_id, cancelled_by)
└── calculateRefundAmount(reservation, policy)
```

**Implementation (Pseudo-code):**

```typescript
export class BookingEngine {
  // STEP 1: Calculate available slots
  async calculateAvailability(
    professionalId: string,
    date: string, // YYYY-MM-DD in client's timezone
    serviceId: string,
    clientTz: string,
    proTz: string
  ): Promise<TimeSlot[]> {
    // 1.1 Get professional schedule for day_of_week
    const schedule = await this.supabase
      .from('professional_schedules')
      .select('*')
      .eq('user_id', professionalId)
      .eq('day_of_week', getDayOfWeek(date))
      .eq('is_available', true)
      .single();

    if (!schedule) return []; // Pro doesn't work this day

    // 1.2 Convert pro's schedule to UTC
    const proScheduleStart = TimeZoneService.zonedTimeToUtc(
      `${date}T${schedule.start_time}`,
      proTz
    );
    const proScheduleEnd = TimeZoneService.zonedTimeToUtc(
      `${date}T${schedule.end_time}`,
      proTz
    );

    // 1.3 Get service duration
    const service = await this.supabase
      .from('services')
      .select('duration_minutes, buffer_minutes_after')
      .eq('id', serviceId)
      .single();

    const serviceDuration = service.duration_minutes * 60; // seconds
    const bufferAfter = service.buffer_minutes_after * 60; // seconds

    // 1.4 Fetch existing reservations (no overlaps)
    const existing = await this.supabase
      .from('reservations')
      .select('start_time, end_time')
      .eq('professional_id', professionalId)
      .gte('start_time', proScheduleStart)
      .lte('end_time', proScheduleEnd)
      .in('status', ['CONFIRMED', 'AWAITING_CONFIRMATION', 'AWAITING_DEPOSIT'])
      .order('start_time');

    // 1.5 Build available slots (15-minute granularity)
    const slots: TimeSlot[] = [];
    let current = proScheduleStart;
    const GRANULARITY = 15 * 60; // 15 minutes in seconds

    while (current + serviceDuration <= proScheduleEnd) {
      const slotEnd = current + serviceDuration;
      const slotEndWithBuffer = slotEnd + bufferAfter;

      // Check overlap with existing reservations
      const hasOverlap = existing.some((ex) => {
        const exStart = new Date(ex.start_time).getTime() / 1000;
        const exEnd = new Date(ex.end_time).getTime() / 1000;
        return !(slotEnd <= exStart || current >= exEnd + bufferAfter);
      });

      // Check buffer doesn't overflow past pro schedule
      if (!hasOverlap && slotEndWithBuffer <= proScheduleEnd) {
        const slotStartLocal = TimeZoneService.utcToZonedTime(
          new Date(current * 1000),
          clientTz
        );
        slots.push({
          start_utc: new Date(current * 1000),
          end_utc: new Date(slotEnd * 1000),
          display_local: this.formatTimeRange(slotStartLocal, clientTz),
        });
      }

      current += GRANULARITY;
    }

    return slots;
  }

  // STEP 2: Create reservation (atomic)
  async createReservation(
    clientId: string,
    professionalId: string,
    serviceId: string,
    startUtc: Date,
    endUtc: Date
  ): Promise<Reservation> {
    try {
      // 2.1 Validate preconditions
      const errors = await this.validatePreconditions(
        clientId,
        professionalId,
        serviceId,
        startUtc,
        endUtc
      );
      if (errors.length > 0) throw new ValidationError(errors.join(', '));

      // 2.2 Recalculate availability (race condition prevention)
      const service = await this.supabase
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId)
        .single();

      const availableSlots = await this.calculateAvailability(
        professionalId,
        formatDate(startUtc),
        serviceId,
        'UTC',
        'UTC'
      );

      const slotExists = availableSlots.some(
        (s) =>
          s.start_utc.getTime() === startUtc.getTime() &&
          s.end_utc.getTime() === endUtc.getTime()
      );

      if (!slotExists) {
        throw new ConflictError('This time slot is no longer available');
      }

      // 2.3 Get professional's acceptance policy
      const prof = await this.supabase
        .from('professional_profiles')
        .select('acceptance_policy')
        .eq('user_id', professionalId)
        .single();

      const policy = prof.acceptance_policy || 'OPEN';

      // 2.4 Evaluate trust score
      const trustProfile = await this.supabase
        .from('client_trust_profiles')
        .select('trust_score')
        .eq('client_id', clientId)
        .single();

      const trustScore = trustProfile?.trust_score ?? 50;

      // 2.5 Decide final status based on policy
      const { finalStatus, requiresPayment } = this.evaluatePolicy(
        policy,
        trustScore
      );

      if (finalStatus === 'SILENT_REJECTION') {
        throw new ConflictError('Professional unavailable at this time');
      }

      // 2.6 Create reservation (atomic transaction)
      const { data: reservation, error } = await this.supabase
        .from('reservations')
        .insert({
          client_id: clientId,
          professional_id: professionalId,
          service_id: serviceId,
          start_time: startUtc,
          end_time: endUtc,
          status: finalStatus,
          service_name_snapshot: service.name,
          service_duration_minutes_snapshot: service.duration_minutes,
          service_price_cents_snapshot: service.price_cents,
          created_at: new Date(),
        })
        .select()
        .single();

      if (error) throw new DatabaseError(error.message);

      // 2.7 Create payment if needed
      if (requiresPayment && finalStatus === 'AWAITING_DEPOSIT') {
        const { data: payment } = await this.supabase
          .from('payments')
          .insert({
            reservation_id: reservation.id,
            amount_cents: service.price_cents,
            currency: 'ILS',
            status: 'PENDING',
            created_at: new Date(),
          })
          .select()
          .single();

        // Integrate Stripe here if needed (future)
        // payment.stripe_payment_intent_id = await createStripeIntent(...)
      }

      // 2.8 Create audit log
      await this.supabase.from('audit_logs').insert({
        entity_type: 'Reservation',
        entity_id: reservation.id,
        action: 'CREATE',
        user_id: clientId,
        changes_after: reservation,
        description: `Reservation created, status=${finalStatus}`,
        created_at: new Date(),
      });

      // 2.9 Cache invalidation (if using Vercel KV or simple cache)
      // await this.invalidateCache(`availability:${professionalId}:${formatDate(startUtc)}`);

      return reservation;
    } catch (error) {
      // Transaction rollback happens automatically via Supabase
      throw error;
    }
  }

  // STEP 3: Cancel reservation
  async cancelReservation(
    reservationId: string,
    cancelledBy: 'CLIENT' | 'PROFESSIONAL'
  ): Promise<Reservation> {
    const reservation = await this.supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (!reservation) throw new NotFoundError('Reservation not found');

    // Get professional's cancellation policy
    const prof = await this.supabase
      .from('professional_profiles')
      .select('cancellation_policy')
      .eq('user_id', reservation.professional_id)
      .single();

    const refundPercentage = this.calculateRefundPercentage(
      prof.cancellation_policy,
      reservation.start_time,
      cancelledBy
    );

    const refundAmount = Math.floor(
      (reservation.service_price_cents_snapshot * refundPercentage) / 100
    );

    // Update reservation
    const { data: updated } = await this.supabase
      .from('reservations')
      .update({
        status:
          cancelledBy === 'CLIENT'
            ? 'CANCELLED_BY_CLIENT'
            : 'CANCELLED_BY_PROFESSIONAL',
        cancelled_at: new Date(),
      })
      .eq('id', reservationId)
      .select()
      .single();

    // Issue refund (if payment was made)
    if (reservation.payment && refundAmount > 0) {
      // Call Stripe API here
      // await stripe.refunds.create({...});
    }

    // Log event for trust system
    if (cancelledBy === 'CLIENT') {
      const pointsDelta = this.calculateTrustDelta(
        'cancellation',
        reservation.start_time
      );
      await this.supabase.from('trust_events').insert({
        client_id: reservation.client_id,
        reservation_id: reservationId,
        event_type: 'cancellation_' + (pointsDelta < 0 ? '0_24h' : '24h_plus'),
        points_delta: pointsDelta,
        reason: `Cancelled ${
          pointsDelta < 0 ? 'less than 24h' : '24h or more'
        } before`,
        created_at: new Date(),
      });
    }

    return updated;
  }

  // Helper: Evaluate policy
  private evaluatePolicy(
    policy: string,
    trustScore: number
  ): { finalStatus: string; requiresPayment: boolean } {
    switch (policy) {
      case 'OPEN':
        return { finalStatus: 'CONFIRMED', requiresPayment: false };

      case 'FILTER_LOW_TRUST':
        if (trustScore >= 70) {
          return { finalStatus: 'CONFIRMED', requiresPayment: false };
        } else {
          return { finalStatus: 'SILENT_REJECTION', requiresPayment: false };
        }

      case 'REQUIRE_MANUAL_CONFIRMATION':
        return { finalStatus: 'AWAITING_CONFIRMATION', requiresPayment: false };

      case 'REQUIRE_DEPOSIT_FOR_LOW_TRUST':
        if (trustScore >= 70) {
          return { finalStatus: 'CONFIRMED', requiresPayment: false };
        } else {
          return { finalStatus: 'AWAITING_DEPOSIT', requiresPayment: true };
        }

      default:
        return { finalStatus: 'CONFIRMED', requiresPayment: false };
    }
  }

  // Helper: Calculate refund
  private calculateRefundPercentage(
    policy: string,
    startTime: Date,
    cancelledBy: string
  ): number {
    const now = new Date();
    const hoursBefore = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (cancelledBy === 'PROFESSIONAL') return 100; // Pro always refunds 100%

    switch (policy) {
      case 'standard':
        if (hoursBefore > 24) return 100;
        if (hoursBefore > 2) return 80;
        return 0;
      case 'flexible':
        return 100;
      case 'strict':
        return 0;
      default:
        return 100;
    }
  }
}
```

**Checklist Booking Engine Agent:**
- [ ] `calculateAvailability()` - Slot calculation avec timezone handling
- [ ] `validateNoOverlap()` - Détection des chevauchements
- [ ] `createReservation()` - Transaction atomique
- [ ] Policy evaluation (4 policies: OPEN, FILTER_LOW_TRUST, REQUIRE_MANUAL_CONFIRMATION, REQUIRE_DEPOSIT_FOR_LOW_TRUST)
- [ ] Refund calculation (standard/flexible/strict)
- [ ] Cancellation flows (client + pro)
- [ ] No-show handling
- [ ] Idempotency keys
- [ ] TimeZoneService perfect (DST, edge cases)
- [ ] Routes: POST /bookings, GET /availability, POST /:id/cancel
- [ ] All errors properly typed
- [ ] Audit logging for all critical actions
- [ ] Unit tests (30+ cases)
- [ ] Integration tests with real Supabase DB

**Success Criteria:**
- ✅ Availability calc works (slot granularity 15 min)
- ✅ No double-booking (overlap detection perfect)
- ✅ Timezone conversions correct (test DST)
- ✅ Policies applied correctly
- ✅ Refunds calculated correctly
- ✅ All test cases pass
- ✅ No TypeScript errors

---

#### **2.3 Trust System Agent** 🛡️
**Responsabilité:** Système de scoring de confiance  
**Dépendances:** ✅ Backend Agent, ✅ Booking Engine Agent  
**Durée estimée:** 2 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
packages/backend/src/services/
├── TrustService.ts (score calculation, event logging)
└── repositories/TrustRepository.ts

Key Functions:
├── initializeClientTrustProfile(client_id)
├── getTrustScore(client_id)
├── recordTrustEvent(client_id, event_type, reservation_id)
├── decayScoreOverTime()
└── getClientTrustCategory(trust_score) // Internal only
```

**Implementation:**

```typescript
export class TrustService {
  // Initialize on first booking
  async initializeClientTrustProfile(clientId: string): Promise<void> {
    const existing = await this.supabase
      .from('client_trust_profiles')
      .select('id')
      .eq('client_id', clientId)
      .single();

    if (!existing) {
      await this.supabase.from('client_trust_profiles').insert({
        client_id: clientId,
        trust_score: 50, // Default
        created_at: new Date(),
      });
    }
  }

  // Read-only: Get current trust score (Booking Engine uses this)
  async getTrustScore(clientId: string): Promise<number> {
    const profile = await this.supabase
      .from('client_trust_profiles')
      .select('trust_score')
      .eq('client_id', clientId)
      .single();

    return profile?.trust_score ?? 50;
  }

  // Record event after booking completion
  async recordTrustEvent(
    clientId: string,
    eventType:
      | 'booking_completed'
      | 'no_show'
      | 'cancellation_0_24h'
      | 'cancellation_24h_plus'
      | 'booking_confirmed',
    reservationId: string
  ): Promise<void> {
    // Map event to points delta
    const pointsDelta = {
      booking_completed: 2,
      no_show: -8,
      cancellation_0_24h: -5,
      cancellation_24h_plus: -2,
      booking_confirmed: 1,
    }[eventType];

    // Create event log
    await this.supabase.from('trust_events').insert({
      client_id: clientId,
      reservation_id: reservationId,
      event_type: eventType,
      points_delta: pointsDelta,
      created_at: new Date(),
    });

    // Update score (apply decay, cap at 0-100)
    const current = await this.getTrustScore(clientId);
    let newScore = current + pointsDelta;

    // Apply decay (optional: events older than 180 days have less weight)
    // For V1: Simple addition, no decay

    // Cap between 0-100
    newScore = Math.max(0, Math.min(100, newScore));

    await this.supabase
      .from('client_trust_profiles')
      .update({
        trust_score: newScore,
        last_updated_at: new Date(),
      })
      .eq('client_id', clientId);
  }

  // Admin-only: View trust score (never shown to users)
  async getClientTrustProfile(clientId: string): Promise<any> {
    return this.supabase
      .from('client_trust_profiles')
      .select('*')
      .eq('client_id', clientId)
      .single();
  }
}
```

**Integration with Booking Engine:**
- When `createReservation()` creates with status = CONFIRMED, DO NOT record event yet
- When professional marks `status = COMPLETED`, call TrustService.recordTrustEvent('booking_completed')
- When professional marks `status = NO_SHOW`, call TrustService.recordTrustEvent('no_show')
- When client cancels < 24h, call TrustService.recordTrustEvent('cancellation_0_24h')

**Checklist Trust System Agent:**
- [ ] Trust score initialization (default 50)
- [ ] Event logging (5 event types)
- [ ] Score update logic (cap 0-100)
- [ ] Read-only getTrustScore() for Booking Engine
- [ ] Integration hooks (record events after booking state changes)
- [ ] Admin endpoint to view client scores (never returned in public APIs)
- [ ] No score visibility to end-users
- [ ] Unit tests

**Success Criteria:**
- ✅ Scores initialize correctly
- ✅ Events logged correctly
- ✅ Scores update correctly (0-100 bounds)
- ✅ Booking Engine can read scores
- ✅ No score visibility leaks
- ✅ Tests pass

---

#### **2.4 Mobile Agent** 📱
**Responsabilité:** React Native + Expo app  
**Dépendances:** ✅ Architecture Agent, ✅ Backend Agent (API contract)  
**Durée estimée:** 3-4 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
packages/mobile/
├── app.json (Expo config)
├── app/
│   ├── _layout.tsx (Root layout)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (client)/
│   │   ├── _layout.tsx
│   │   ├── search.tsx (List professionals)
│   │   ├── [id]/availability.tsx (Pick slot)
│   │   └── [id]/book.tsx (Confirm booking)
│   ├── (app)/
│   │   ├── _layout.tsx
│   │   ├── my-reservations.tsx
│   │   ├── profile.tsx
│   │   └── settings.tsx
│   └── _error.tsx
├── components/
│   ├── BookingCard.tsx
│   ├── AvailabilityGrid.tsx
│   ├── ReservationList.tsx
│   ├── ProfileCard.tsx
│   ├── Form inputs (TextInput, Picker, etc.)
│   └── Common (Button, Card, Text, etc.)
├── lib/
│   ├── api.ts (Axios + TanStack Query setup)
│   ├── auth.ts (Supabase Auth context)
│   ├── storage.ts (AsyncStorage utils)
│   └── notifications.ts (Expo Notifications setup)
├── hooks/
│   ├── useAuth.ts
│   ├── useAPI.ts
│   ├── useAvailability.ts
│   └── useReservations.ts
└── utils/
    ├── timezone.ts
    └── dates.ts
```

**Key Implementation:**

```typescript
// app/_layout.tsx - Root navigation
import { useAuth } from '@/lib/auth';
import { Stack } from 'expo-router';

export default function RootLayout() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Stack>
      {!user ? (
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="(client)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="(app)"
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack>
  );
}

// lib/auth.ts - Auth context
import { createContext, useContext } from 'react';
import { supabase } from '@/utils/supabase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user);
      setLoading(false);
    });

    // Listen for auth changes
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user);
    });

    return () => data?.subscription.unsubscribe();
  }, []);

  const signup = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUpWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// lib/api.ts - API client
import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/utils/supabase';

export const queryClient = new QueryClient();

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
});

// Add JWT to requests
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

// (client)/search.tsx - List professionals
import { useQuery } from '@tanstack/react-query';

export default function SearchScreen() {
  const { data: professionals, isLoading } = useQuery({
    queryKey: ['professionals'],
    queryFn: () => api.get('/professionals').then((r) => r.data),
  });

  return (
    <ScrollView>
      {professionals?.map((pro) => (
        <ProfessionalCard
          key={pro.id}
          professional={pro}
          onPress={() => navigation.push('details', { id: pro.id })}
        />
      ))}
    </ScrollView>
  );
}

// (client)/[id]/availability.tsx - Pick slot
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AvailabilityScreen({ route }) {
  const { id } = route.params;
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: slots } = useQuery({
    queryKey: ['availability', id, selectedDate],
    queryFn: () =>
      api
        .get(`/professionals/${id}/availability`, {
          params: { date: selectedDate.toISOString().split('T')[0] },
        })
        .then((r) => r.data),
  });

  const handleSelectSlot = (slot) => {
    navigation.push('book', { professionalId: id, slot });
  };

  return (
    <View>
      <DateTimePicker
        value={selectedDate}
        onChange={(event, date) => setSelectedDate(date)}
        mode="date"
      />
      <FlatList
        data={slots}
        renderItem={({ item: slot }) => (
          <Pressable onPress={() => handleSelectSlot(slot)}>
            <Text>{slot.display_local}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
```

**Checklist Mobile Agent:**
- [ ] Expo init + setup
- [ ] Navigation (Expo Router)
- [ ] Auth screens (login, signup)
- [ ] Supabase Auth integration
- [ ] Search professionals screen
- [ ] Availability picker (calendar + slots)
- [ ] Booking confirmation screen
- [ ] My reservations screen (list)
- [ ] Profile screen (edit timezone, etc.)
- [ ] Settings screen
- [ ] API client (axios + TanStack Query)
- [ ] Error boundaries
- [ ] Loading states
- [ ] Timezone handling in UI
- [ ] Push notifications setup (Expo)

**Success Criteria:**
- ✅ App compiles (`npm run start`)
- ✅ Can navigate between screens
- ✅ Auth flow works (signup/login)
- ✅ Can load professionals list
- ✅ Can pick available slot
- ✅ Can book reservation
- ✅ Can view my reservations
- ✅ No API calls fail (integration with Backend)

---

### **PHASE 3: TESTING, INTEGRATION & DEPLOYMENT (Jour 4 - ~6h)**

#### **3.1 Testing Agent** 🧪
**Responsabilité:** Tests complets (unit, integration, e2e)  
**Dépendances:** ✅ Tous les agents des phases 1-2  
**Durée estimée:** 2-3 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
packages/backend/tests/
├── unit/
│   ├── BookingEngine.test.ts (30+ tests)
│   ├── TrustService.test.ts (10+ tests)
│   └── TimeZoneService.test.ts (DST tests)
├── integration/
│   ├── reservations.test.ts (full flow)
│   └── auth.test.ts
└── fixtures/
    ├── seed.sql (test data)
    └── test.env

packages/mobile/tests/
├── components/
│   └── BookingCard.test.tsx
└── hooks/
    └── useAvailability.test.ts

jest.config.js
setup.ts (test DB connection)
```

**Test Suite (Booking Engine):**

```typescript
describe('BookingEngine', () => {
  describe('calculateAvailability', () => {
    test('Empty professional → No slots', async () => {
      const slots = await engine.calculateAvailability(
        'nonexistent-pro-id',
        '2025-06-01',
        'service-id',
        'UTC',
        'UTC'
      );
      expect(slots).toEqual([]);
    });

    test('15-minute granularity → Slots at 09:00, 09:15, 09:30...', async () => {
      const slots = await engine.calculateAvailability(
        'pro-id',
        '2025-06-01',
        'service-id',
        'UTC',
        'UTC'
      );
      const times = slots.map((s) => s.start_utc.getMinutes());
      expect(times).toEqual([0, 15, 30, 45, ...]);
    });

    test('DST transition (Mar 31) → Correct UTC times', async () => {
      // Pro works 09:00-18:00 Jerusalem time on Mar 31
      // Mar 31 2025: Clock jumps 02:00 → 03:00
      const slots = await engine.calculateAvailability(
        'pro-id',
        '2025-03-31',
        'service-id',
        'Asia/Jerusalem',
        'Asia/Jerusalem'
      );
      // Should still calculate correctly despite DST
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].start_utc).toBeDefined();
    });

    test('Existing reservation → Blocks slot', async () => {
      // Create existing reservation 10:00-11:00
      await db.reservations.insert({
        start_time: '2025-06-01T10:00:00Z',
        end_time: '2025-06-01T11:00:00Z',
        professional_id: 'pro-id',
      });

      const slots = await engine.calculateAvailability(
        'pro-id',
        '2025-06-01',
        'service-id',
        'UTC',
        'UTC'
      );

      // Should not have slot at 10:00
      const hasConflict = slots.some(
        (s) => s.start_utc.getHours() === 10
      );
      expect(hasConflict).toBe(false);
    });

    test('Buffer after service → Slot pushed back', async () => {
      // Service: 60 min, buffer 15 min after
      // If 10:00-11:00 taken, next slot can't start before 11:15
      const slots = await engine.calculateAvailability(
        'pro-id',
        '2025-06-01',
        'service-id', // 60 min duration, 15 min buffer
        'UTC',
        'UTC'
      );

      // Existing: 10:00-11:00
      // Next available: 11:15, not 11:00
      const has11am = slots.some((s) => s.start_utc.getHours() === 11);
      expect(has11am).toBe(false); // Blocked by buffer
    });
  });

  describe('createReservation', () => {
    test('Happy path → Reservation created with CONFIRMED', async () => {
      const res = await engine.createReservation(
        'client-id',
        'pro-id',
        'service-id',
        new Date('2025-06-01T10:00:00Z'),
        new Date('2025-06-01T11:00:00Z')
      );
      expect(res.status).toBe('CONFIRMED');
      expect(res.id).toBeDefined();
    });

    test('Self-booking → Error', async () => {
      await expect(
        engine.createReservation(
          'same-id',
          'same-id',
          'service-id',
          new Date('2025-06-01T10:00:00Z'),
          new Date('2025-06-01T11:00:00Z')
        )
      ).rejects.toThrow('cannot book yourself');
    });

    test('Race condition → Second client gets 409', async () => {
      // Both clients try to book same slot
      const promise1 = engine.createReservation(
        'client-1',
        'pro-id',
        'service-id',
        new Date('2025-06-01T10:00:00Z'),
        new Date('2025-06-01T11:00:00Z')
      );
      const promise2 = engine.createReservation(
        'client-2',
        'pro-id',
        'service-id',
        new Date('2025-06-01T10:00:00Z'),
        new Date('2025-06-01T11:00:00Z')
      );

      const [res1, error2] = await Promise.allSettled([
        promise1,
        promise2,
      ]);
      expect(res1.status).toBe('fulfilled');
      expect(error2.status).toBe('rejected');
      expect(error2.reason.message).toMatch('no longer available');
    });

    test('Policy FILTER_LOW_TRUST + low score → SILENT_REJECTION', async () => {
      // Pro's policy: FILTER_LOW_TRUST
      // Client trust score: 40 (< 70)
      // Result: Should get 423 error, not know why
      await expect(
        engine.createReservation(
          'low-trust-client',
          'filter-pro-id',
          'service-id',
          new Date('2025-06-01T10:00:00Z'),
          new Date('2025-06-01T11:00:00Z')
        )
      ).rejects.toThrow('unavailable');
    });

    test('Policy REQUIRE_DEPOSIT_FOR_LOW_TRUST + low score → AWAITING_DEPOSIT', async () => {
      // Pro's policy: REQUIRE_DEPOSIT_FOR_LOW_TRUST
      // Client trust score: 40
      // Result: Reservation with status AWAITING_DEPOSIT, payment created
      const res = await engine.createReservation(
        'low-trust-client',
        'deposit-pro-id',
        'service-id',
        new Date('2025-06-01T10:00:00Z'),
        new Date('2025-06-01T11:00:00Z')
      );
      expect(res.status).toBe('AWAITING_DEPOSIT');

      const payment = await db.payments.findOne({
        reservation_id: res.id,
      });
      expect(payment).toBeDefined();
      expect(payment.status).toBe('PENDING');
    });
  });

  describe('cancelReservation', () => {
    test('Cancel > 24h before → 100% refund', async () => {
      const res = await engine.cancelReservation('res-id', 'CLIENT');
      const refund = await db.refunds.findOne({ reservation_id: 'res-id' });
      expect(refund.amount_cents).toBe(originalPrice);
    });

    test('Cancel < 2h before → 0% refund (standard policy)', async () => {
      const res = await engine.cancelReservation('res-id', 'CLIENT');
      const refund = await db.refunds.findOne({ reservation_id: 'res-id' });
      expect(refund.amount_cents).toBe(0);
    });

    test('Pro cancels → Always 100% refund', async () => {
      const res = await engine.cancelReservation('res-id', 'PROFESSIONAL');
      const refund = await db.refunds.findOne({ reservation_id: 'res-id' });
      expect(refund.amount_cents).toBe(originalPrice);
    });
  });

  describe('Timezone conversions', () => {
    test('Jerusalem 14:00 → UTC 11:00 (summer)', async () => {
      // Jun 1 in Jerusalem = UTC+3
      const utc = TimeZoneService.zonedTimeToUtc(
        new Date('2025-06-01T14:00:00'),
        'Asia/Jerusalem'
      );
      expect(utc.getUTCHours()).toBe(11);
    });

    test('Different client/pro timezones → Correct slot', async () => {
      // Client in New York, Pro in Jerusalem
      // Client picks 14:00 New York on Jun 1
      // Pro's timezone: Jerusalem
      const slots = await engine.calculateAvailability(
        'pro-id',
        '2025-06-01', // Which date? Client's or pro's?
        'service-id',
        'America/New_York', // Client TZ
        'Asia/Jerusalem' // Pro TZ
      );
      // Should return slots in client's timezone, offset for pro's schedule
      expect(slots).toBeDefined();
    });
  });
});
```

**Checklist Testing Agent:**
- [ ] Jest setup + PostgreSQL test DB
- [ ] BookingEngine unit tests (30+ cases)
- [ ] TrustService unit tests
- [ ] TimeZoneService DST tests
- [ ] Integration tests (full booking flow)
- [ ] Auth tests
- [ ] Concurrency tests (race conditions)
- [ ] Idempotency tests
- [ ] Mobile component tests
- [ ] Coverage > 80%
- [ ] E2E smoke test (Playwright if time)

**Success Criteria:**
- ✅ `npm run test` passes (all tests green)
- ✅ Coverage > 80% (critical paths)
- ✅ No flaky tests
- ✅ DST edge cases covered

---

#### **3.2 DevOps Agent** 🔧
**Responsabilité:** CI/CD, Vercel + Supabase setup, deployment  
**Dépendances:** ✅ Tous les agents ci-dessus  
**Durée estimée:** 2 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
.github/workflows/
├── ci.yml (Lint, type check, test)
└── deploy.yml (Auto-deploy to Vercel)

vercel.json (deployment config)
.supabaserc (Supabase config)
scripts/
└── migrate.sh (DB migration script)

Documentation:
├── docs/DEPLOYMENT.md
└── docs/SETUP.md (updated for Vercel+Supabase)
```

**CI Pipeline (GitHub Actions):**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm turbo run lint

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm turbo run build

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: torim_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm turbo run test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/torim_test
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: [lint, type-check, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          scope: ${{ secrets.VERCEL_ORG_ID }}
```

**Vercel Setup:**

```json
{
  "buildCommand": "pnpm turbo run build --filter=backend",
  "installCommand": "pnpm install",
  "outputDirectory": "packages/backend/dist",
  "framework": "other",
  "env": [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "STRIPE_SECRET_KEY"
  ]
}
```

**Checklist DevOps Agent:**
- [ ] GitHub Actions CI setup (lint, type, test)
- [ ] Vercel connection configured
- [ ] Auto-deploy on `git push origin main`
- [ ] Supabase CLI setup (`.supabaserc`)
- [ ] Database migrations scripted
- [ ] Secrets configured in Vercel (SUPABASE_*, STRIPE_*)
- [ ] Environment variables documented
- [ ] Deployment documentation written
- [ ] Rollback procedure documented (if needed)

**Success Criteria:**
- ✅ Push to main → GitHub Actions runs
- ✅ All checks pass → Auto-deploys to Vercel
- ✅ Health check endpoint returns 200
- ✅ API responds from Vercel URL
- ✅ Mobile can talk to production backend

---

#### **3.3 Documentation Agent** 📚
**Responsabilité:** Documentation complète  
**Dépendances:** ✅ Tous les agents ci-dessus (readthrough finale)  
**Durée estimée:** 1.5-2 heures  
**Status:** `pending` → `in_progress` → `completed`

**Outputs Critiques:**
```
docs/
├── SETUP.md (Quick start guide)
├── ARCHITECTURE.md (Tech choices, Vercel+Supabase)
├── API.md (All endpoints + schemas)
├── DATABASE.md (Schema, migrations, indexes)
├── DEPLOYMENT.md (CI/CD, Vercel, Supabase)
├── TESTING.md (How to run tests)
└── AGENTS.md (This document, for future runs)

Root:
├── README.md (Updated with new stack)
├── backend/README.md
└── mobile/README.md
```

**Checklist Documentation Agent:**
- [ ] README.md with quick start
- [ ] Setup guide (GitHub → Vercel → Supabase)
- [ ] API documentation (all endpoints)
- [ ] Database schema explanation
- [ ] Deployment guide
- [ ] Testing instructions
- [ ] Troubleshooting section
- [ ] Contributing guidelines
- [ ] Code examples in docs

**Success Criteria:**
- ✅ Comprehensive guides for onboarding
- ✅ All APIs documented with examples
- ✅ Clear setup instructions
- ✅ Deployment step-by-step

---

## 3. Timeline Complète

```
DAY 1 (Jour 1 - Lundi)
├─ 08:00 START
├─ 08:00-10:00 → Architecture Agent ✓ (BLOCKER)
├─ 10:00-11:30 → Supabase Agent ✓ (PARALLEL with Backend setup)
├─ 11:30-13:00 → Lunch
│
└─ CHECKPOINT: Repo structure + DB schema ready

DAY 2-3 (Jours 2-3 - Mardi-Mercredi)
├─ 08:00-12:00 → Backend Agent ✓ (PARALLEL)
├─ 08:00-13:00 → Booking Engine Agent ✓ (PARALLEL, depends on Backend)
├─ 08:00-12:00 → Trust System Agent ✓ (PARALLEL)
├─ 08:00-12:00 → Mobile Agent ✓ (PARALLEL, can work independently)
│
└─ CHECKPOINT: All implementation done, can call APIs

DAY 4 (Jour 4 - Jeudi)
├─ 08:00-11:00 → Testing Agent ✓
├─ 11:00-13:00 → DevOps Agent ✓ (PARALLEL)
├─ 11:00-13:00 → Documentation Agent ✓ (PARALLEL)
│
└─ CHECKPOINT: All tests green, CI/CD working

TOTAL: ~3-4 days for complete MVP
```

---

## 4. Dépendances & Ordre Strict

```
Architecture (1.1)
    ↓
Supabase (1.2) ←┐
    ↓           │
Backend (2.1) ←┘
    ↓
Booking Engine (2.2)
    ↓
Trust System (2.3)

Mobile (2.4) ← CAN RUN IN PARALLEL WITH 2.1-2.3

All above ↓
Testing (3.1) ← MUST RUN AFTER ALL CODE
    ↓
DevOps (3.2) ← PARALLEL WITH 3.1
Docs (3.3) ← PARALLEL WITH 3.1
```

---

## 5. Points d'Intégration Critiques

### **Backend ↔ Mobile**
- API Contract: `/api/v1/*` endpoints
- Sync: Mobile calls Backend, Backend returns JSON
- Auth: Bearer token (Supabase JWT)
- Testing: Integration tests verify match

### **Booking Engine ↔ Trust System**
- Interface: `getTrustScore(client_id)` → READ ONLY
- Sync: Trust System records events AFTER reservation state change
- No circular dependencies

### **Backend ↔ Supabase**
- Contract: Supabase types auto-generated
- Sync: Schema is source of truth
- Migration: Supabase CLI handles

### **CI/CD Pipeline**
1. Code push → GitHub Actions
2. Lint + Type + Test
3. If all pass → Auto-deploy to Vercel
4. Vercel calls `vercel.json` build script

---

## 6. Success Criteria (Final)

**MVP is DONE when:**

- ✅ All agents completed without errors
- ✅ Tests: Coverage > 80%, all pass
- ✅ API: All endpoints respond (tested)
- ✅ Mobile: Can navigate + book (tested)
- ✅ Database: All migrations applied
- ✅ Deployment: `git push` → live on Vercel
- ✅ Documentation: Setup guide works for onboarding

**All green?** → Ready for beta testing! 🚀

---

## 7. Next Steps

1. **Valide ce plan** (feedback? changements?)
2. **Crée les secrets GitHub/Vercel** (env vars)
3. **Crée les projets Vercel + Supabase** (manuellement)
4. **Lance Architecture Agent** (let's build! 🚀)

---

**Prêt?** On lance l'Architecture Agent dès maintenant? ✅

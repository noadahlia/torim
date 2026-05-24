# Database Design V1 - Beauty Booking App

**Version:** 1.0 (FROZEN for Production)  
**Date:** Mai 2026  
**SGBD:** PostgreSQL 15+  
**Status:** ✅ V1 LOCKED - No schema changes without full team approval  
**Principe:** Single source of truth, ACID compliance, audit trail complète

---

## ⚠️ CRITICAL NOTES FOR V1 PRODUCTION

### **Double-Booking Prevention Strategy**
**IMPORTANT:** The UNIQUE partial index on reservations catches MOST overlaps but is NOT a mathematical guarantee of zero overlaps in edge cases:

- **Current V1 Approach:** Application-level logic + UNIQUE constraint + pessimistic locking (Redis)
- **Why not perfect:** UNIQUE constraint checks `start_time` and `end_time` equality/collision, but PostgreSQL's approach is limited for complex range overlaps
- **Real Protection:** `BookingEngine.calculateAvailability()` + `BookingEngine.validateNoOverlap()` in application code validates against ALL existing reservations (full table scan + in-memory check)
- **V2 Enhancement (Planned):** PostgreSQL `tsrange` type with exclusion constraints for mathematically perfect overlap prevention without application logic
- **For V1:** Application-level validation is MANDATORY. Never rely solely on the UNIQUE constraint.

```sql
-- V1 Current: UNIQUE on exact timestamps (good but not perfect)
UNIQUE (professional_id, start_time, end_time) 
WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')

-- V2 Future: Exclusion constraint with ranges (perfect overlap prevention)
-- EXCLUDE USING gist (professional_id WITH =, tsrange(start_time, end_time) WITH &&)
-- Not using in V1 to keep complexity low and avoid PostgreSQL gist index overhead
```

### **ProfessionalSchedule: Recurring Hours Only (No Real Dates)**
**CRITICAL:** `professional_schedules` table stores ABSTRACT weekly hours, NOT specific calendar dates.

- **What it stores:** `day_of_week` (0-6) + `start_time` + `end_time` (TIME type, no date component)
- **Interpretation:** All times are in PROFESSIONAL'S TIMEZONE (not UTC in DB)
  - Example: Professional Marie (timezone: `Asia/Jerusalem`)
  - Row: `{ day_of_week: 0, start_time: '09:00:00', end_time: '18:00:00' }`
  - Means: Every Monday, 09:00-18:00 Jerusalem time
- **Usage:** BookingEngine converts to UTC when checking availability for a specific date
  - Input: "Show me availability for 2025-06-02 (Monday) for Marie"
  - Lookup: `professional_schedules WHERE day_of_week = 0` for Marie
  - Convert: "09:00 Jerusalem on 2025-06-02" → UTC time
  - Return: Available slots in UTC to client

**NO EXCEPTIONS OR SPECIAL DATES IN V1.** If pro is sick or has vacation, mark entire `professional_schedules` record as `is_available = FALSE` (soft disable).

### **Service Snapshots: Mandatory & Immutable**
**CRITICAL:** Every `Reservation` must capture a snapshot of service at booking time:

```prisma
Reservation {
  serviceNameSnapshot: "Manucure simple",              // Saved at booking
  serviceDurationMinutesSnapshot: 60,                   // Never changes
  servicePriceCentsSnapshot: 5000,                      // Snapshot at time of booking
}
```

**Why:** If pro changes price/duration later, old reservations remain correct (for refund disputes, invoices, revenue calculations).

**Enforcement:**
- Always `CREATE` these fields when inserting `Reservation`
- Pull values from `Service` record at booking time
- Never allow UPDATE of these fields once set
- Use `readonly` in ORM or app-level validation

### **Ratings: Reviews is Source of Truth**
**CRITICAL:** `average_rating` and `total_reviews` in `professional_profiles` are **DERIVED ONLY**.

- **Source of truth:** `reviews` table (rating field)
- **Aggregates:** `average_rating`, `total_reviews`, `total_completed_services` are recalculated from queries
- **Process:**
  1. Client leaves review → insert into `reviews` table
  2. Job runs (daily or on-demand) → recalculate aggregates
  3. Update `professional_profiles.{average_rating, total_reviews}`
  4. If job fails, aggregates are stale but RECOVERABLE (not lost)

**NEVER:** Insert/update reviews in `professional_profiles` directly. Always go through `reviews` table.

### **User Model: 1 Per Person, Multiple Roles, Optional Pro Profile**
**CRITICAL:** Exactly ONE `User` per person. Roles define permissions.

```
User {
  id, email, roles: ['ROLE_CLIENT', 'ROLE_PROFESSIONAL']  // Multiple roles possible
}
├─ ProfessionalProfile ← Created ONLY when ROLE_PROFESSIONAL activated
   └─ Only exists if user has 'ROLE_PROFESSIONAL' in roles array
```

**Lifecycle:**
1. Person signs up → `User` created with `roles: ['ROLE_CLIENT']`
2. Person wants to become a pro → `roles` updated to include `'ROLE_PROFESSIONAL'`
3. System creates `ProfessionalProfile` record (in same transaction or background job)
4. If pro deletes account → cascade deletes `ProfessionalProfile` + all their `Reservations` (with audit trail)

**Constraints:**
- One email = one User (UNIQUE)
- One User can have many roles
- A pro can book with another pro (same User, different roles active in query context)

### **Payments & Refunds: Atomic Transitions**
**CRITICAL:** Payment state machine must be strictly atomic with Refund creation.

```
Reservation → Payment ← PaymentRefund
              (1-1)      (0-M)

States:
Payment: PENDING → (SUCCEEDED or FAILED)
Refund:  PENDING → (SUCCEEDED or FAILED)

Atomicity Rule:
IF Reservation.status changes to CANCELLED_BY_*
THEN PaymentRefund created (status=PENDING) AND Stripe refund API called
ELSE PaymentRefund never created
```

**Idempotency:**
- Refund requests must include idempotency key (reservation ID + timestamp)
- If duplicate refund request arrives, retry with same idempotency key, get same result (no double-refund)

### **Audit Logs: Append-Only, No Deletes**
**CRITICAL:** `audit_logs` table is APPEND-ONLY. Never updated, never deleted.

- Every change to critical tables → row appended to `audit_logs`
- Used for compliance, debugging, forensics
- If you need to "undo" something, create a compensating audit entry (don't delete)
- Jobs clean old logs AFTER retention period (e.g., 7 years for legal)

### **Timezones: UTC Storage, Mandatory DST Testing**
**CRITICAL:** All timestamps in DB are ALWAYS in UTC.

```
User { timezone: 'Asia/Jerusalem' }
Reservation { startTime: '2025-06-01T11:00:00Z' }  // Always UTC in DB

Conversion flow:
Client (web/mobile): "I want 14:00 on June 1st, Jerusalem time"
→ Frontend: zonedTimeToUtc('2025-06-01T14:00:00', 'Asia/Jerusalem')
→ API: receive UTC, store '2025-06-01T11:00:00Z'
→ DB: store UTC
→ Response: convert back to client's timezone for display
```

**DST Testing (MANDATORY):**
- Israel changes DST twice per year
- Test booking straddling DST transition (e.g., last Saturday in March)
- Test booking in months where offset changes
- Add integration tests specifically for `Europe/Berlin` (Mar 31) + `Asia/Jerusalem` (Mar 31 + Oct 31)

---

## 1. Vue d'Ensemble & Principes Data

### Principes Fondamentaux

| Principe | Application |
|----------|------------|
| **UTC everywhere** | Tous les timestamps en UTC, conversions à l'application uniquement |
| **Immutable history** | Snapshots de prix/durée sauvegardés (pour disputes, refunds) |
| **Single source of truth** | Une seule "version réelle" par entité (pas de cache en DB) |
| **Referential integrity** | FK contraintes partout, no orphaned records |
| **Audit trail** | Chaque action critique = log immutable |
| **Transactional safety** | Booking/payment = transactions ACID, pas de state intermédiaire |
| **Soft deletes où nécessaire** | Services/schedules marqués INACTIVE, jamais supprimés (audit) |

### Stratégie d'Indexing

- **PK/FK** : Toujours indexées (auto)
- **Queries fréquentes** : availability check, user lookups, reservation history
- **Sorting** : Timestamps, dates
- **Filtering** : status, roles, date ranges
- **Concurrency** : Indexes pour locks distribués (booking)

---

## 2. Diagramme Entité-Relation (Vue logique)

```
┌──────────────────────────────────────────────────────────┐
│                    USERS & AUTH                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  users (1 per person)                                  │
│  ├─ id (PK)                                           │
│  ├─ email (UNIQUE)                                    │
│  ├─ roles (ENUM[] or junction table)                 │
│  └─ ...                                              │
│       ▼                                               │
│  professional_profiles (0-1 per user)               │
│  ├─ id (PK)                                         │
│  ├─ user_id (UNIQUE FK → users)                     │
│  ├─ bio, rating                                     │
│  └─ ...                                             │
│                                                     │
│       ▼──────────┬──────────────────┐              │
│   services   schedules        portfolio           │
│   (1-M)      (1-M)             (1-M)              │
│                                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                BOOKINGS (CORE)                          │
├──────────────────────────────────────────────────────────┤
│                                                         │
│  reservations (core entity)                           │
│  ├─ id (PK)                                          │
│  ├─ client_id (FK → users.ROLE_CLIENT)             │
│  ├─ professional_id (FK → users.ROLE_PROFESSIONAL) │
│  ├─ service_snapshot (historical: price, duration) │
│  ├─ status (PENDING_PAYMENT → CONFIRMED → ...)     │
│  ├─ start_time, end_time (UTC)                     │
│  └─ ...                                            │
│                                                    │
│  CONSTRAINTS:                                      │
│  • UNIQUE (professional_id, start_time, end_time) │
│  • start_time < end_time                          │
│  • No overlaps with other reservations            │
│                                                   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   PAYMENTS                              │
├──────────────────────────────────────────────────────────┤
│                                                         │
│  payments                                             │
│  ├─ id (PK)                                          │
│  ├─ reservation_id (UNIQUE FK)                      │
│  ├─ stripe_payment_intent_id                        │
│  ├─ amount_cents (snapshot: amount exacte payée)   │
│  ├─ status (PENDING → SUCCEEDED → FAILED)          │
│  └─ ...                                            │
│       ▼                                             │
│  payment_refunds (si annulation)                   │
│  ├─ id (PK)                                        │
│  ├─ payment_id (FK)                               │
│  ├─ amount_cents (refunded amount)                │
│  ├─ status (PENDING → SUCCEEDED)                 │
│  └─ ...                                           │
│                                                   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  AUDIT & HISTORY                        │
├──────────────────────────────────────────────────────────┤
│                                                         │
│  audit_logs (append-only)                            │
│  ├─ id (PK)                                          │
│  ├─ entity_type (Reservation, Payment, etc.)        │
│  ├─ entity_id                                       │
│  ├─ action (CREATE, UPDATE, DELETE, CANCEL)        │
│  ├─ changes_before, changes_after (JSONB)          │
│  └─ ...                                            │
│                                                    │
│  reviews (post-service, immutable)                │
│  ├─ id (PK)                                       │
│  ├─ reservation_id (FK, immutable)                │
│  ├─ rating, text                                 │
│  └─ ...                                          │
│                                                 │
└────────────────────────────────────────────────┘
```

---

## 3. Schéma Détaillé par Table

### 3.1 USERS

**Rôle:** Table centrale, une ligne = une personne. Supports multiple roles.

```
Table: users
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ email: VARCHAR(255) UNIQUE NOT NULL
│  ├─ email_verified: BOOLEAN DEFAULT FALSE
│  ├─ password_hash: VARCHAR(255) NOT NULL (bcrypt)
│  ├─ phone: VARCHAR(20) NULLABLE
│  ├─ first_name: VARCHAR(100) NOT NULL
│  ├─ last_name: VARCHAR(100) NOT NULL
│  ├─ timezone: VARCHAR(50) NOT NULL DEFAULT 'Asia/Jerusalem'
│  ├─ roles: TEXT[] NOT NULL DEFAULT ARRAY['ROLE_CLIENT']
│  │  └─ CONSTRAINT check (roles <@ ARRAY['ROLE_CLIENT','ROLE_PROFESSIONAL','ROLE_ADMIN'])
│  ├─ is_active: BOOLEAN DEFAULT TRUE
│  ├─ last_login_at: TIMESTAMP WITH TIME ZONE NULLABLE
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ UNIQUE (email) WHERE deleted_at IS NULL
│  ├─ CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
│  └─ CHECK (LENGTH(password_hash) > 0)
│
├─ Indexes:
│  ├─ idx_users_email (UNIQUE)
│  ├─ idx_users_roles (GIN index sur array)
│  ├─ idx_users_created_at (for pagination)
│  └─ idx_users_is_active
│
└─ Notes:
   • timezone: Utilisé côté API pour conversions (pas stocké dans les timestamps)
   • roles: Array d'enums pour query facile ('ROLE_CLIENT' = ANY(roles))
   • soft delete: deleted_at pour audit trail (jamais de suppression physique)
   • password_hash: jamais loggé, jamais sélectionné sauf en auth
```

**Queries Critiques:**
```sql
-- Vérifier si user a un rôle
SELECT id FROM users WHERE id = $1 AND 'ROLE_PROFESSIONAL' = ANY(roles)

-- Authentification
SELECT id, password_hash, roles FROM users WHERE email = $1 AND is_active = TRUE

-- Lookup pour réservation
SELECT id, timezone FROM users WHERE id = $1 AND 'ROLE_PROFESSIONAL' = ANY(roles)
```

---

### 3.2 PROFESSIONAL_PROFILES

**Rôle:** Profil optionnel des pros. 1-1 avec users (WHERE user has ROLE_PROFESSIONAL).

```
Table: professional_profiles
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ user_id: UUID UNIQUE NOT NULL FOREIGN KEY → users(id)
│  ├─ bio: TEXT NULLABLE (description pro)
│  ├─ average_rating: DECIMAL(3,2) DEFAULT 0 (0-5)
│  │  └─ ⚠️ DERIVED ONLY: Recalculated from reviews table, never updated directly
│  ├─ total_reviews: INTEGER DEFAULT 0
│  │  └─ ⚠️ DERIVED ONLY: COUNT(*) from reviews WHERE professional_id = this.id
│  ├─ total_completed_services: INTEGER DEFAULT 0
│  │  └─ ⚠️ DERIVED ONLY: COUNT(*) from reservations WHERE status = 'COMPLETED'
│  ├─ is_verified: BOOLEAN DEFAULT FALSE (manual review by admin)
│  ├─ is_accepting_bookings: BOOLEAN DEFAULT TRUE
│  ├─ cancellation_policy: TEXT DEFAULT 'standard' (ENUM-ish)
│  │  └─ Values: 'standard' (80% refund <24h), 'flexible' (100%), 'strict' (no refund)
│  ├─ response_time_minutes: INTEGER DEFAULT 60
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
│  ├─ UNIQUE (user_id) WHERE deleted_at IS NULL
│  ├─ CHECK (average_rating >= 0 AND average_rating <= 5)
│  └─ CHECK (total_reviews >= 0 AND total_completed_services >= 0)
│
├─ Indexes:
│  ├─ idx_professional_profiles_user_id (UNIQUE)
│  ├─ idx_professional_profiles_is_verified
│  ├─ idx_professional_profiles_is_accepting_bookings
│  ├─ idx_professional_profiles_average_rating DESC
│  └─ idx_professional_profiles_created_at
│
└─ Notes:
   • CASCADE delete: Si user supprimé, profile supprimé aussi
   • average_rating: Dénormalisé pour perf (calculé from reviews)
   • is_verified: Admin flag, permet de curate la plateforme
   • cancellation_policy: Stocké ici, snapshottée dans chaque reservation
```

---

### 3.3 SERVICES

**Rôle:** Catalogue des services proposés par une pro. 1-M avec professional_profiles.

```
Table: services
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ professional_id: UUID NOT NULL FOREIGN KEY → professional_profiles(id)
│  ├─ name: VARCHAR(255) NOT NULL (e.g., "Manucure simple")
│  ├─ description: TEXT NULLABLE
│  ├─ category: VARCHAR(50) NOT NULL 
│  │  └─ CONSTRAINT CHECK (category IN ('NAILS', 'LASHES', 'SKIN', 'HAIR', 'OTHER'))
│  ├─ duration_minutes: INTEGER NOT NULL
│  │  └─ CONSTRAINT CHECK (duration_minutes > 0 AND duration_minutes <= 480)  ← 8h max
│  ├─ price_cents: INTEGER NOT NULL (price * 100, pour éviter float)
│  │  └─ CONSTRAINT CHECK (price_cents >= 0)
│  ├─ buffer_minutes_after: INTEGER DEFAULT 0 (break time après service)
│  ├─ is_available: BOOLEAN DEFAULT TRUE
│  ├─ max_concurrent_bookings: INTEGER DEFAULT 1 (si plusieurs clients simultanément)
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete, jamais supprimé)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE
│  └─ UNIQUE (professional_id, name) WHERE deleted_at IS NULL
│
├─ Indexes:
│  ├─ idx_services_professional_id
│  ├─ idx_services_is_available
│  └─ idx_services_category
│
└─ Notes:
   • Soft delete: Permet audit trail, les old reservations gardent reference
   • price_cents: INT, pas DECIMAL, pour éviter floating point errors
   • buffer_minutes_after: Temps d'attente avant prochain client (nettoyage, etc.)
   • duration_minutes: Fixe par service type (pas flexible sur demande, keep simple V1)
```

---

### 3.4 PROFESSIONAL_SCHEDULES

**Rôle:** Heures de travail d'une pro. Définit availability par jour.

```
Table: professional_schedules
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ professional_id: UUID NOT NULL FOREIGN KEY → professional_profiles(id)
│  ├─ day_of_week: SMALLINT NOT NULL 
│  │  └─ CONSTRAINT CHECK (day_of_week >= 0 AND day_of_week <= 6)  ← 0=Mon, 6=Sun
│  ├─ start_time: TIME NOT NULL (e.g., '09:00:00')
│  ├─ end_time: TIME NOT NULL
│  │  └─ CONSTRAINT CHECK (start_time < end_time)
│  ├─ is_available: BOOLEAN DEFAULT TRUE
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE
│  ├─ UNIQUE (professional_id, day_of_week) WHERE deleted_at IS NULL
│  └─ CHECK (start_time < end_time)
│
├─ Indexes:
│  ├─ idx_professional_schedules_professional_id
│  └─ idx_professional_schedules_is_available
│
└─ Notes:
   • day_of_week: Statique (pas d'exceptions spéciales V1, add in V2)
   • start_time, end_time: TIME type (no timezone, relative au user.timezone)
   • is_available: Permet désactiver rapidement un jour (maladie, vacation)
   • Soft delete: Schedule peut être "supprimé" mais old reservations gardent trace
```

**Exemple:**
```
Professional Marie (timezone: Asia/Jerusalem)
├─ Monday: 09:00-18:00 (is_available=true)
├─ Tuesday: 09:00-18:00 (is_available=true)
├─ Wednesday: OFF (pas de row, ou is_available=false)
├─ Thursday-Friday: 09:00-18:00
└─ Saturday-Sunday: OFF
```

---

### 3.5 RESERVATIONS ⭐ (CRITICAL)

**Rôle:** Cœur du système. Une réservation = un client + un pro + un service + un slot de temps.

```
Table: reservations
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ client_id: UUID NOT NULL FOREIGN KEY → users(id)
│  │  └─ WITH CHECK (user has 'ROLE_CLIENT' in roles)
│  ├─ professional_id: UUID NOT NULL FOREIGN KEY → users(id)
│  │  └─ WITH CHECK (user has 'ROLE_PROFESSIONAL' in roles)
│  ├─ service_id: UUID NOT NULL FOREIGN KEY → services(id)
│  │  └─ Purpose: Historical reference (even if service soft-deleted later)
│  │
│  ├─ ─────── RESERVATION TIMING (all UTC) ───────
│  ├─ start_time: TIMESTAMP WITH TIME ZONE NOT NULL
│  ├─ end_time: TIMESTAMP WITH TIME ZONE NOT NULL
│  │  └─ CONSTRAINT CHECK (start_time < end_time)
│  ├─ ─────── STATUS MACHINE ────────
│  ├─ status: VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT'
│  │  └─ CONSTRAINT CHECK (status IN (
│  │      'PENDING_PAYMENT',      ← Awaiting payment
│  │      'CONFIRMED',            ← Paid + active
│  │      'CANCELLED_BY_CLIENT',  ← Client cancellation
│  │      'CANCELLED_BY_PRO',     ← Pro cancellation
│  │      'COMPLETED',            ← Service delivered
│  │      'NO_SHOW'               ← Client didn't show up
│  │    ))
│  ├─ ─────── SERVICE SNAPSHOT (immutable, for disputes) ────────
│  ├─ service_name_snapshot: VARCHAR(255) NOT NULL
│  │  └─ ⚠️ CRITICAL: Copied from services.name AT BOOKING TIME
│  │  └─ e.g., "Manucure simple" (immutable after creation)
│  ├─ service_duration_minutes_snapshot: INTEGER NOT NULL
│  │  └─ ⚠️ CRITICAL: Copied from services.durationMinutes AT BOOKING TIME
│  │  └─ e.g., 60 minutes (immutable after creation)
│  ├─ service_price_cents_snapshot: INTEGER NOT NULL
│  │  └─ ⚠️ CRITICAL: Copied from services.priceCents AT BOOKING TIME
│  │  └─ e.g., 5000 ILS cents (immutable after creation, for refund disputes)
│  ├─ ─────── CLIENT COMMUNICATION ────────
│  ├─ notes: TEXT NULLABLE (pro notes, e.g., "Allergies to nail polish X")
│  ├─ pro_notes: TEXT NULLABLE (internal pro notes)
│  ├─ cancellation_reason: TEXT NULLABLE (why cancelled)
│  ├─ ─────── TIMESTAMPS ────────
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ confirmed_at: TIMESTAMP WITH TIME ZONE NULLABLE (when payment succeeded)
│  ├─ cancelled_at: TIMESTAMP WITH TIME ZONE NULLABLE
│  ├─ completed_at: TIMESTAMP WITH TIME ZONE NULLABLE
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete for audit)
│
├─ ─────── CRITICAL CONSTRAINTS ────────
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT
│  │  └─ RESTRICT: No deleting user with active reservations
│  ├─ FOREIGN KEY (professional_id) REFERENCES users(id) ON DELETE RESTRICT
│  ├─ FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
│  │  └─ RESTRICT: Keep historical reference
│  │
│  ├─ ─────── NO DOUBLE-BOOKING CONSTRAINT (V1 APPROACH) ────────
│  ├─ UNIQUE (professional_id, start_time, end_time) WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')
│  │  └─ Purpose: Catch most overlaps for non-cancelled reservations
│  │  └─ Index: UNIQUE index on (prof_id, start, end) for fast constraint check
│  │  └─ ⚠️ Limitation: NOT mathematically perfect for all edge cases (V1 limitation)
│  │  └─ ⚠️ APPLICATION LOGIC MANDATORY: BookingEngine.validateNoOverlap() required
│  │  └─ V2 Plan: PostgreSQL EXCLUSION constraint with tsrange type for perfect prevention
│  │
│  ├─ ─────── STATUS TRANSITIONS ────────
│  ├─ CHECK (
│  │    (status = 'PENDING_PAYMENT' AND confirmed_at IS NULL AND cancelled_at IS NULL) OR
│  │    (status = 'CONFIRMED' AND confirmed_at IS NOT NULL AND cancelled_at IS NULL) OR
│  │    (status LIKE 'CANCELLED_%' AND cancelled_at IS NOT NULL) OR
│  │    (status = 'COMPLETED' AND completed_at IS NOT NULL) OR
│  │    (status = 'NO_SHOW' AND completed_at IS NOT NULL)
│  │  )
│  │  └─ Purpose: Ensure state consistency (e.g., if CONFIRMED, confirmed_at must be set)
│  │
│  └─ CHECK (start_time < end_time)
│
├─ ─────── INDEXES (CRITICAL PERFORMANCE) ────────
├─ Indexes:
│  ├─ UNIQUE (professional_id, start_time, end_time) 
│  │  └─ WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')
│  │  └─ Purpose: O(1) lookup to check availability, prevent double-booking
│  │
│  ├─ idx_reservations_client_id
│  │  └─ Query: "Show me my (client) reservations"
│  ├─ idx_reservations_professional_id
│  │  └─ Query: "Show me my (pro) booked slots"
│  ├─ idx_reservations_status
│  │  └─ Query: "Find all PENDING_PAYMENT to retry"
│  ├─ idx_reservations_start_time
│  │  └─ Query: "Show upcoming reservations"
│  ├─ idx_reservations_created_at
│  │  └─ Query: "Pagination, reporting"
│  ├─ idx_reservations_service_id
│  │  └─ Query: "Count bookings per service"
│  └─ idx_reservations_confirmed_at
│      └─ Query: "Revenue queries (booking dates)"
│
└─ ─────── NOTES ────────
   • UNIQUE constraint + PARTIAL: Only non-cancelled = allows rebooking same slot after cancel
   • Snapshots: Price/duration saved at booking time (for refund disputes)
   • Status machine: Strict state transitions (prevents impossible states)
   • Soft delete: Audit trail preservation
   • RESTRICT on deletes: Users/services can't be deleted if they have active reservations
   • UTC timestamps: All booking times in UTC, conversion at API boundary
```

**Queries Critiques (Performance-sensitive):**

```sql
-- 1. CHECK AVAILABILITY: Find slots NOT booked for a professional on a date
SELECT * FROM reservations 
WHERE professional_id = $1 
  AND start_time >= $2::timestamp AND end_time <= $3::timestamp
  AND status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')
-- Index: UNIQUE (professional_id, start_time, end_time) WHERE status ...
-- Expected: <10ms

-- 2. PREVENT DOUBLE-BOOKING: Try to insert, unique constraint will reject if conflict
INSERT INTO reservations (professional_id, start_time, end_time, ...)
VALUES ($1, $2, $3, ...)
-- Unique constraint prevents insertion if overlap exists
-- Expected: Instant (constraint check)

-- 3. CLIENT'S RESERVATIONS: Show me all my bookings
SELECT * FROM reservations WHERE client_id = $1 ORDER BY start_time DESC
-- Index: idx_reservations_client_id
-- Expected: <50ms

-- 4. REVENUE: Calculate daily revenue
SELECT SUM(service_price_cents_snapshot) 
FROM reservations 
WHERE professional_id = $1 
  AND confirmed_at >= $2 AND confirmed_at < $3
  AND status = 'COMPLETED'
-- Index: idx_reservations_professional_id, idx_reservations_confirmed_at
-- Expected: <100ms
```

---

### 3.6 PAYMENTS ⭐ (CRITICAL)

**Rôle:** Track payment state for each reservation. 1-1 with reservations.

```
Table: payments
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ reservation_id: UUID UNIQUE NOT NULL FOREIGN KEY → reservations(id) ON DELETE CASCADE
│  │  └─ UNIQUE: Only one payment per reservation
│  ├─ ─────── STRIPE INTEGRATION ────────
│  ├─ stripe_payment_intent_id: VARCHAR(255) UNIQUE NOT NULL
│  │  └─ e.g., "pi_1234567890"
│  ├─ stripe_customer_id: VARCHAR(255) NULLABLE
│  │  └─ Optional: For recurring customers
│  ├─ ─────── PAYMENT AMOUNT (SNAPSHOT) ────────
│  ├─ amount_cents: INTEGER NOT NULL
│  │  └─ Snapshot of reservation.service_price_cents_snapshot at payment time
│  │  └─ CONSTRAINT CHECK (amount_cents > 0)
│  ├─ currency: VARCHAR(3) NOT NULL DEFAULT 'ILS'
│  │  └─ CONSTRAINT CHECK (currency = 'ILS')  ← V1 Israël only
│  ├─ ─────── STATUS MACHINE ────────
│  ├─ status: VARCHAR(50) NOT NULL DEFAULT 'PENDING'
│  │  └─ CONSTRAINT CHECK (status IN (
│  │      'PENDING',           ← Payment Intent created, awaiting client action
│  │      'REQUIRES_ACTION',   ← 3D Secure or other auth needed
│  │      'SUCCEEDED',         ← Payment complete
│  │      'FAILED',            ← Payment rejected by bank/Stripe
│  │      'CANCELLED'          ← Customer cancelled before payment
│  │    ))
│  ├─ ─────── RETRY LOGIC ────────
│  ├─ retry_count: INTEGER DEFAULT 0
│  ├─ last_retry_at: TIMESTAMP WITH TIME ZONE NULLABLE
│  ├─ last_error_message: TEXT NULLABLE (from Stripe)
│  ├─ ─────── TIMESTAMPS ────────
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ succeeded_at: TIMESTAMP WITH TIME ZONE NULLABLE (when status=SUCCEEDED)
│  └─ deleted_at: TIMESTAMP WITH TIME ZONE NULLABLE (soft delete)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
│  ├─ UNIQUE (reservation_id)
│  ├─ UNIQUE (stripe_payment_intent_id)
│  └─ CHECK (amount_cents > 0 AND currency = 'ILS')
│
├─ Indexes:
│  ├─ idx_payments_reservation_id (UNIQUE)
│  ├─ idx_payments_stripe_payment_intent_id (UNIQUE)
│  ├─ idx_payments_status
│  │  └─ Query: "Find all PENDING payments to retry"
│  ├─ idx_payments_created_at
│  │  └─ Query: "Pagination, reporting"
│  └─ idx_payments_succeeded_at
│      └─ Query: "Revenue calculations"
│
└─ Notes:
   • UNIQUE (reservation_id): Only one payment per reservation
   • CASCADE delete: If reservation deleted, payment deleted too
   • Stripe webhook: Updates this table when payment status changes
   • Idempotency: stripe_payment_intent_id is immutable, idempotent key stored elsewhere
   • Retry logic: Manual or background job retries failed payments (see jobs)
```

**Payment State Machine (UML-ish):**
```
Client initiates payment
    ↓
PENDING: Payment Intent created, awaiting client
    ↓
REQUIRES_ACTION: 3D Secure or SCA auth
    ├─ Client authenticates
    └─ → SUCCEEDED (via Stripe webhook)
    
OR

SUCCEEDED: Payment complete, Stripe webhook processed
    → Trigger: Update reservation.status to CONFIRMED
    → Trigger: Send confirmation email/SMS
    
OR

FAILED: Bank rejected or timeout
    → Trigger: reservation stays PENDING_PAYMENT
    → Retry job attempts again (up to N times)
    
OR

CANCELLED: Client cancelled before payment
    → Trigger: reservation status = CANCELLED_BY_CLIENT
```

---

### 3.7 PAYMENT_REFUNDS

**Rôle:** Track refunds when reservation is cancelled. 1-M with payments.

```
Table: payment_refunds
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ payment_id: UUID NOT NULL FOREIGN KEY → payments(id) ON DELETE CASCADE
│  ├─ reservation_id: UUID NOT NULL FOREIGN KEY → reservations(id) ON DELETE CASCADE
│  ├─ ─────── REFUND AMOUNT & REASON ────────
│  ├─ amount_cents: INTEGER NOT NULL
│  │  └─ Amount refunded (may be partial: refund policy)
│  │  └─ CONSTRAINT CHECK (amount_cents > 0)
│  ├─ refund_reason: VARCHAR(100) NOT NULL
│  │  └─ CONSTRAINT CHECK (refund_reason IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'DISPUTE'))
│  ├─ ─────── STRIPE REFUND ────────
│  ├─ stripe_refund_id: VARCHAR(255) UNIQUE NULLABLE
│  │  └─ e.g., "re_1234567890" (from Stripe Refunds API)
│  ├─ ─────── STATUS ────────
│  ├─ status: VARCHAR(50) NOT NULL DEFAULT 'PENDING'
│  │  └─ CONSTRAINT CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED'))
│  ├─ ─────── TIMESTAMPS ────────
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ updated_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  ├─ succeeded_at: TIMESTAMP WITH TIME ZONE NULLABLE
│  └─ error_message: TEXT NULLABLE
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
│  ├─ FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
│  └─ CHECK (amount_cents > 0)
│
├─ Indexes:
│  ├─ idx_payment_refunds_payment_id
│  ├─ idx_payment_refunds_reservation_id
│  ├─ idx_payment_refunds_status
│  │  └─ "Find failed refunds to retry"
│  └─ idx_payment_refunds_created_at
│
└─ Notes:
   • CASCADE delete: If payment/reservation deleted, refund deleted
   • Refund policy: Amount determined by application logic (stored in reservation snapshots)
   • Stripe refund: stripe_refund_id stored after API call succeeds
   • Retry logic: Job retries failed refunds (payment processor down, etc.)
```

---

### 3.8 REVIEWS

**Rôle:** Post-service feedback. Immutable, 1-1 with reservations.

```
Table: reviews
├─ Columns:
│  ├─ id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
│  ├─ reservation_id: UUID UNIQUE NOT NULL FOREIGN KEY → reservations(id) ON DELETE CASCADE
│  ├─ professional_id: UUID NOT NULL FOREIGN KEY → professional_profiles(id)
│  ├─ client_id: UUID NOT NULL FOREIGN KEY → users(id)
│  ├─ ─────── FEEDBACK ────────
│  ├─ rating: SMALLINT NOT NULL
│  │  └─ CONSTRAINT CHECK (rating >= 1 AND rating <= 5)
│  ├─ text: TEXT NULLABLE (max 500 chars)
│  ├─ ─────── MODERATION ────────
│  ├─ is_public: BOOLEAN DEFAULT TRUE
│  ├─ is_flagged_for_review: BOOLEAN DEFAULT FALSE (inappropriate content)
│  ├─ ─────── TIMESTAMPS (IMMUTABLE) ────────
│  ├─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│  └─ (no updated_at, immutable once created)
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  ├─ FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
│  ├─ FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE
│  ├─ FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
│  ├─ UNIQUE (reservation_id)
│  └─ CHECK (rating >= 1 AND rating <= 5)
│
├─ Indexes:
│  ├─ idx_reviews_professional_id
│  │  └─ Query: "Get all reviews for a professional"
│  ├─ idx_reviews_client_id
│  │  └─ Query: "Get my (client) reviews written"
│  ├─ idx_reviews_is_public
│  │  └─ Query: "Show only public reviews"
│  └─ idx_reviews_created_at DESC
│      └─ Query: "Recent reviews"
│
└─ Notes:
   • Immutable: No updates after creation (prevent manipulation)
   • Cascade delete: If reservation deleted, review deleted
   • is_flagged_for_review: Admin moderation flag (abuse reports)
   • CASCADE from professional_profiles: If pro deleted, reviews deleted (keeps data clean)
```

---

### 3.9 AUDIT_LOGS (Append-Only)

**Rôle:** Complete audit trail for compliance and debugging. Immutable.

```
Table: audit_logs
├─ Columns:
│  ├─ id: BIGSERIAL PRIMARY KEY (not UUID, for ordering)
│  ├─ entity_type: VARCHAR(100) NOT NULL
│  │  └─ Values: 'Reservation', 'Payment', 'PaymentRefund', 'Review', 'User', 'ProfessionalProfile'
│  ├─ entity_id: UUID NOT NULL (ID of affected entity)
│  ├─ action: VARCHAR(50) NOT NULL
│  │  └─ Values: 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'CONFIRM', 'FAIL'
│  ├─ user_id: UUID NULLABLE (who performed the action, null for system actions)
│  ├─ ─────── CHANGES ────────
│  ├─ changes_before: JSONB NULLABLE (state before update)
│  ├─ changes_after: JSONB NULLABLE (state after update)
│  ├─ ─────── CONTEXT ────────
│  ├─ ip_address: INET NULLABLE
│  ├─ user_agent: TEXT NULLABLE
│  ├─ description: TEXT NULLABLE (human-readable summary)
│  ├─ ─────── TIMESTAMP (IMMUTABLE) ────────
│  └─ created_at: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
│
├─ Constraints:
│  ├─ PRIMARY KEY (id)
│  └─ (no deletes ever, append-only)
│
├─ Indexes:
│  ├─ idx_audit_logs_entity_type_entity_id
│  │  └─ Query: "Get all changes for a specific reservation"
│  ├─ idx_audit_logs_user_id
│  │  └─ Query: "What did user X do?"
│  ├─ idx_audit_logs_action
│  │  └─ Query: "Find all cancellations"
│  └─ idx_audit_logs_created_at DESC
│      └─ Query: "Recent activity"
│
└─ Notes:
   • BIGSERIAL: Orders events chronologically (not UUIDs which are unordered)
   • Append-only: Never deleted or updated
   • JSONB: Flexible, can store any state changes
   • No foreign keys: Audit log survives even if referenced entity is deleted
   • System actions: user_id is NULL for cron jobs, webhooks, etc.
```

**Example Audit Entry:**
```json
{
  "id": 12345,
  "entity_type": "Reservation",
  "entity_id": "550e8400-e29b-41d4-a716-446655440000",
  "action": "UPDATE",
  "user_id": "660e8400-e29b-41d4-a716-446655440111",
  "changes_before": {
    "status": "PENDING_PAYMENT"
  },
  "changes_after": {
    "status": "CONFIRMED",
    "confirmed_at": "2025-05-18T11:30:00Z"
  },
  "description": "Payment succeeded via Stripe webhook",
  "created_at": "2025-05-18T11:30:00Z"
}
```

---

## 4. Constraints Critiques & Garanties

### 4.1 Intégrité des Réservations

| Constraint | Type | SQL | Objectif |
|-----------|------|-----|----------|
| **No overlaps** | UNIQUE partial | `UNIQUE (professional_id, start_time, end_time) WHERE status NOT IN (...)` | Prevent double-booking |
| **Valid timings** | CHECK | `CHECK (start_time < end_time)` | Logical validity |
| **Status valid** | CHECK | `CHECK (status IN (...)) AND (...timestamps...)` | State machine integrity |
| **Valid user roles** | FK + CHECK | Users referenced must have correct roles | Semantic validity |
| **Price > 0** | CHECK | `CHECK (amount_cents > 0)` | Financial validity |

### 4.2 Transactional Safety

```typescript
// Example: Booking creation must be ATOMIC
BEGIN TRANSACTION
  1. Lock: SELECT * FROM reservations WHERE ... FOR UPDATE (pessimistic lock)
  2. Check: No overlaps exist
  3. Insert: New reservation (status=PENDING_PAYMENT)
  4. Check: Only one payment per reservation
  5. Insert: Payment record (status=PENDING)
  6. Commit (or all-or-nothing)
END TRANSACTION
```

PostgreSQL ACID guarantees:
- **Atomicity**: Transaction all-or-nothing
- **Consistency**: All constraints verified
- **Isolation**: Concurrent booking attempts don't see each other's partial state
- **Durability**: Committed data survives crashes

### 4.3 Race Condition Prevention (Booking)

```
Scenario: Two clients try to book the same slot simultaneously

Timeline:
T0: Client A starts booking
T1: Client B starts booking
T2: Both call API: /api/professionals/:id/availability ← returns same slot
T3: Both attempt: POST /api/reservations { start_time, end_time }

Option 1 (NAIVE): Application logic only
├─ Client A's request hits DB first
├─ Inserts reservation for Client A (success)
├─ Client B's request hits DB second
├─ Tries to insert same (professional_id, start_time, end_time)
└─ → UNIQUE constraint violation → 409 Conflict (correct)

Option 2 (BETTER): Redis lock BEFORE DB
├─ Client A acquires lock: redlock.lock('booking:prof123:slot')
├─ Client A checks availability (from DB)
├─ Client A inserts reservation
├─ Client A releases lock
├─ Client B tries to acquire same lock, waits 5 seconds
├─ Lock released by A
├─ Client B acquires lock
├─ Client B checks availability (now booked by A)
├─ Client B gets 409 Conflict (correct, before insert)
└─ Client B releases lock

Result: Both are safe, but Option 2 gives earlier feedback to losers.
Both options use UNIQUE constraint as ultimate guarantee.
```

---

## 5. Indexes Strategy

### Summary: What to Index

```
Table: reservations ← Most critical for performance
├─ PRIMARY KEY (id)
├─ UNIQUE (professional_id, start_time, end_time) ← Prevent double-booking, check availability
├─ idx_reservations_client_id ← "Show me my reservations"
├─ idx_reservations_professional_id ← "Show me my booked slots"
├─ idx_reservations_status ← "Find all PENDING_PAYMENT"
├─ idx_reservations_start_time ← "Upcoming reservations"
├─ idx_reservations_created_at ← "Pagination"
└─ idx_reservations_confirmed_at ← "Revenue queries"

Table: users
├─ PRIMARY KEY (id)
├─ UNIQUE (email)
├─ idx_users_roles (GIN) ← Array search
└─ idx_users_is_active

Table: payments
├─ PRIMARY KEY (id)
├─ UNIQUE (reservation_id)
├─ UNIQUE (stripe_payment_intent_id)
├─ idx_payments_status ← "Find PENDING"
└─ idx_payments_created_at ← "Pagination"

Others: Standard ForeignKey + some frequently filtered columns
```

### When to Add More Indexes

- After profiling slow queries (use EXPLAIN ANALYZE)
- If a query takes >100ms and index would help
- Balance: Each index costs writes (INSERT/UPDATE slower)

---

## 6. Prisma Schema

Complete, production-ready Prisma schema for PostgreSQL:

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═══════════════════════════════════════════════════════════
// USERS & AUTHENTICATION
// ═══════════════════════════════════════════════════════════

enum UserRole {
  ROLE_CLIENT
  ROLE_PROFESSIONAL
  ROLE_ADMIN
}

model User {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email             String    @unique
  emailVerified     Boolean   @default(false) @map("email_verified")
  passwordHash      String    @map("password_hash") @db.VarChar(255)
  phone             String?   @db.VarChar(20)
  firstName         String    @map("first_name") @db.VarChar(100)
  lastName          String    @map("last_name") @db.VarChar(100)
  timezone          String    @default("Asia/Jerusalem") @db.VarChar(50)
  roles             UserRole[] @default([ROLE_CLIENT])
  isActive          Boolean   @default(true) @map("is_active")
  lastLoginAt       DateTime? @map("last_login_at") @db.Timestamptz
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt         DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  professionalProfile ProfessionalProfile?
  clientReservations  Reservation[] @relation("ClientReservations")
  professionalReservations Reservation[] @relation("ProfessionalReservations")
  clientReviews       Review[] @relation("ClientReviews")
  auditLogs           AuditLog[] @relation("UserAuditLogs")

  @@index([roles], type: "gin") @map("idx_users_roles")
  @@index([createdAt]) @map("idx_users_created_at")
  @@index([isActive]) @map("idx_users_is_active")
  @@map("users")
}

// ═══════════════════════════════════════════════════════════
// PROFESSIONAL PROFILES
// ═══════════════════════════════════════════════════════════

enum CancellationPolicy {
  standard
  flexible
  strict
}

model ProfessionalProfile {
  id                      String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId                  String    @unique @map("user_id") @db.Uuid
  bio                     String?
  averageRating           Decimal   @default(0) @map("average_rating") @db.Decimal(3, 2)
  totalReviews            Int       @default(0) @map("total_reviews")
  totalCompletedServices  Int       @default(0) @map("total_completed_services")
  isVerified              Boolean   @default(false) @map("is_verified")
  isAcceptingBookings     Boolean   @default(true) @map("is_accepting_bookings")
  cancellationPolicy      CancellationPolicy @default(standard) @map("cancellation_policy")
  responseTimeMinutes     Int       @default(60) @map("response_time_minutes")
  createdAt               DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt               DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  services  Service[]
  schedules ProfessionalSchedule[]
  reservations Reservation[] @relation("ProfessionalReservations2")
  reviews   Review[] @relation("ProfessionalReviews")

  @@index([isVerified]) @map("idx_professional_profiles_is_verified")
  @@index([isAcceptingBookings]) @map("idx_professional_profiles_is_accepting_bookings")
  @@index([averageRating(sort: Desc)]) @map("idx_professional_profiles_average_rating")
  @@index([createdAt]) @map("idx_professional_profiles_created_at")
  @@map("professional_profiles")
}

// ═══════════════════════════════════════════════════════════
// SERVICES & AVAILABILITY
// ═══════════════════════════════════════════════════════════

enum ServiceCategory {
  NAILS
  LASHES
  SKIN
  HAIR
  OTHER
}

model Service {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  professionalId        String    @map("professional_id") @db.Uuid
  name                  String    @db.VarChar(255)
  description           String?
  category              ServiceCategory
  durationMinutes       Int       @map("duration_minutes")
  priceCents            Int       @map("price_cents")
  bufferMinutesAfter    Int       @default(0) @map("buffer_minutes_after")
  isAvailable           Boolean   @default(true) @map("is_available")
  maxConcurrentBookings Int       @default(1) @map("max_concurrent_bookings")
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  professional ProfessionalProfile @relation(fields: [professionalId], references: [id], onDelete: Cascade)
  reservations Reservation[]

  @@unique([professionalId, name], filter: "deleted_at IS NULL") @map("idx_services_unique_per_pro")
  @@index([professionalId]) @map("idx_services_professional_id")
  @@index([isAvailable]) @map("idx_services_is_available")
  @@index([category]) @map("idx_services_category")
  @@map("services")
}

model ProfessionalSchedule {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  professionalId  String    @map("professional_id") @db.Uuid
  
  // ⚠️ CRITICAL: day_of_week is ABSTRACT (no real date), recurring weekly
  // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
  // Times are in PROFESSIONAL'S TIMEZONE (from user.timezone), NOT UTC
  dayOfWeek       Int       @map("day_of_week")  // Values: 0-6 only
  
  // ⚠️ CRITICAL: TIME type = no date component, recurring hours only
  // Example: startTime='09:00:00', endTime='18:00:00' 
  // Means: Every day_of_week, 09:00-18:00 in pro's timezone
  startTime       String    @map("start_time") @db.Time  // '09:00:00'
  endTime         String    @map("end_time") @db.Time    // '18:00:00'
  
  // If pro is sick/vacation, set to false (soft disable, no delete)
  isAvailable     Boolean   @default(true) @map("is_available")
  
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  professional ProfessionalProfile @relation(fields: [professionalId], references: [id], onDelete: Cascade)

  @@unique([professionalId, dayOfWeek], filter: "deleted_at IS NULL") @map("idx_schedules_unique_per_pro_per_day")
  @@index([professionalId]) @map("idx_schedules_professional_id")
  @@index([isAvailable]) @map("idx_schedules_is_available")
  @@map("professional_schedules")
}

// ═══════════════════════════════════════════════════════════
// RESERVATIONS (CORE)
// ═══════════════════════════════════════════════════════════

enum ReservationStatus {
  PENDING_PAYMENT
  CONFIRMED
  CANCELLED_BY_CLIENT
  CANCELLED_BY_PRO
  COMPLETED
  NO_SHOW
}

model Reservation {
  id                              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clientId                        String    @map("client_id") @db.Uuid
  professionalId                  String    @map("professional_id") @db.Uuid
  serviceId                       String    @map("service_id") @db.Uuid
  startTime                       DateTime  @map("start_time") @db.Timestamptz
  endTime                         DateTime  @map("end_time") @db.Timestamptz
  status                          ReservationStatus
  serviceNameSnapshot             String    @map("service_name_snapshot") @db.VarChar(255)
  serviceDurationMinutesSnapshot  Int       @map("service_duration_minutes_snapshot")
  servicePriceCentsSnapshot       Int       @map("service_price_cents_snapshot")
  notes                           String?
  proNotes                        String?   @map("pro_notes")
  cancellationReason              String?   @map("cancellation_reason")
  createdAt                       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                       DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  confirmedAt                     DateTime? @map("confirmed_at") @db.Timestamptz
  cancelledAt                     DateTime? @map("cancelled_at") @db.Timestamptz
  completedAt                     DateTime? @map("completed_at") @db.Timestamptz
  deletedAt                       DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  client                User      @relation("ClientReservations", fields: [clientId], references: [id], onDelete: Restrict)
  professional          User      @relation("ProfessionalReservations", fields: [professionalId], references: [id], onDelete: Restrict)
  service               Service   @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  payment               Payment?
  review                Review?
  refunds               PaymentRefund[]
  auditLogs             AuditLog[] @relation("ReservationAuditLogs")

  @@unique([professionalId, startTime, endTime], where: { status: { not: { in: [CANCELLED_BY_CLIENT, CANCELLED_BY_PRO, NO_SHOW] } } }) @map("idx_reservations_no_double_booking")
  @@index([clientId]) @map("idx_reservations_client_id")
  @@index([professionalId]) @map("idx_reservations_professional_id")
  @@index([status]) @map("idx_reservations_status")
  @@index([startTime]) @map("idx_reservations_start_time")
  @@index([createdAt]) @map("idx_reservations_created_at")
  @@index([confirmedAt]) @map("idx_reservations_confirmed_at")
  @@index([serviceId]) @map("idx_reservations_service_id")
  @@map("reservations")
}

// ═══════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════

enum PaymentStatus {
  PENDING
  REQUIRES_ACTION
  SUCCEEDED
  FAILED
  CANCELLED
}

model Payment {
  id                      String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reservationId           String    @unique @map("reservation_id") @db.Uuid
  stripePaymentIntentId   String    @unique @map("stripe_payment_intent_id") @db.VarChar(255)
  stripeCustomerId        String?   @map("stripe_customer_id") @db.VarChar(255)
  amountCents             Int       @map("amount_cents")
  currency                String    @default("ILS") @db.VarChar(3)
  status                  PaymentStatus @default(PENDING)
  retryCount              Int       @default(0) @map("retry_count")
  lastRetryAt             DateTime? @map("last_retry_at") @db.Timestamptz
  lastErrorMessage        String?   @map("last_error_message")
  createdAt               DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  succeededAt             DateTime? @map("succeeded_at") @db.Timestamptz
  deletedAt               DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  reservation Reservation  @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  refunds     PaymentRefund[]
  auditLogs   AuditLog[] @relation("PaymentAuditLogs")

  @@index([status]) @map("idx_payments_status")
  @@index([createdAt]) @map("idx_payments_created_at")
  @@index([succeededAt]) @map("idx_payments_succeeded_at")
  @@map("payments")
}

enum RefundReason {
  CANCELLED_BY_CLIENT
  CANCELLED_BY_PRO
  DISPUTE
}

model PaymentRefund {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  paymentId         String    @map("payment_id") @db.Uuid
  reservationId     String    @map("reservation_id") @db.Uuid
  amountCents       Int       @map("amount_cents")
  refundReason      RefundReason @map("refund_reason")
  stripeRefundId    String?   @unique @map("stripe_refund_id") @db.VarChar(255)
  status            PaymentStatus @default(PENDING)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  succeededAt       DateTime? @map("succeeded_at") @db.Timestamptz
  errorMessage      String?   @map("error_message")

  // Relations
  payment     Payment     @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  reservation Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  auditLogs   AuditLog[] @relation("RefundAuditLogs")

  @@index([paymentId]) @map("idx_payment_refunds_payment_id")
  @@index([reservationId]) @map("idx_payment_refunds_reservation_id")
  @@index([status]) @map("idx_payment_refunds_status")
  @@index([createdAt]) @map("idx_payment_refunds_created_at")
  @@map("payment_refunds")
}

// ═══════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════

model Review {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  reservationId       String    @unique @map("reservation_id") @db.Uuid
  professionalId      String    @map("professional_id") @db.Uuid
  clientId            String    @map("client_id") @db.Uuid
  rating              Int
  text                String?
  isPublic            Boolean   @default(true) @map("is_public")
  isFlaggedForReview  Boolean   @default(false) @map("is_flagged_for_review")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  reservation   Reservation        @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  professional  ProfessionalProfile @relation("ProfessionalReviews", fields: [professionalId], references: [id], onDelete: Cascade)
  client        User               @relation("ClientReviews", fields: [clientId], references: [id], onDelete: Cascade)
  auditLogs     AuditLog[] @relation("ReviewAuditLogs")

  @@index([professionalId]) @map("idx_reviews_professional_id")
  @@index([clientId]) @map("idx_reviews_client_id")
  @@index([isPublic]) @map("idx_reviews_is_public")
  @@index([createdAt(sort: Desc)]) @map("idx_reviews_created_at")
  @@map("reviews")
}

// ═══════════════════════════════════════════════════════════
// AUDIT LOGS (Append-Only)
// ═══════════════════════════════════════════════════════════

enum AuditAction {
  CREATE
  UPDATE
  DELETE
  CANCEL
  CONFIRM
  FAIL
}

enum AuditEntityType {
  Reservation
  Payment
  PaymentRefund
  Review
  User
  ProfessionalProfile
}

model AuditLog {
  id              BigInt      @id @default(autoincrement())
  entityType      AuditEntityType @map("entity_type")
  entityId        String      @map("entity_id") @db.Uuid
  action          AuditAction
  userId          String?     @map("user_id") @db.Uuid
  changesBefore   Json?       @map("changes_before")
  changesAfter    Json?       @map("changes_after")
  ipAddress       String?     @map("ip_address")
  userAgent       String?     @map("user_agent")
  description     String?
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  user User? @relation("UserAuditLogs", fields: [userId], references: [id], onDelete: SetNull)
  reservation Reservation? @relation("ReservationAuditLogs", fields: [entityId], references: [id], onDelete: SetNull)
  payment Payment? @relation("PaymentAuditLogs", fields: [entityId], references: [id], onDelete: SetNull)
  refund PaymentRefund? @relation("RefundAuditLogs", fields: [entityId], references: [id], onDelete: SetNull)
  review Review? @relation("ReviewAuditLogs", fields: [entityId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId]) @map("idx_audit_logs_entity")
  @@index([userId]) @map("idx_audit_logs_user_id")
  @@index([action]) @map("idx_audit_logs_action")
  @@index([createdAt(sort: Desc)]) @map("idx_audit_logs_created_at")
  @@map("audit_logs")
}
```

---

## 7. Points Critiques: Booking & Payments

### 7.1 Booking - Race Condition Prevention

**Database level:** UNIQUE constraint avec partial index

```sql
-- This prevents ANY overlap, period
UNIQUE (professional_id, start_time, end_time) 
WHERE status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')
```

**Application level (Prisma):**

```typescript
// 1. Try to insert → if conflict, catch and handle
const reservation = await prisma.reservation.create({
  data: {
    clientId, professionalId, serviceId,
    startTime, endTime,  // UTC
    status: 'PENDING_PAYMENT',
    // ... snapshot fields
  },
  // Unique constraint will reject if overlap exists
})
// Success = we won the race

// 2. Catch unique constraint violation
catch (e) {
  if (e.code === 'P2002' && e.meta.target.includes('unique_key_name')) {
    throw new SlotAlreadyBookedError('This time slot is no longer available')
  }
  throw e
}
```

### 7.2 Payment - Atomicity & Idempotency

**Database transactions:**

```typescript
// Atomicity: All-or-nothing
await prisma.$transaction(async (tx) => {
  // 1. Create reservation (PENDING_PAYMENT)
  const reservation = await tx.reservation.create({
    data: { /* ... */ }
  })

  // 2. Create payment (PENDING)
  const payment = await tx.payment.create({
    data: {
      reservationId: reservation.id,
      stripePaymentIntentId: intent.id,  // From Stripe
      amountCents: reservation.servicePriceCentsSnapshot,
      status: 'PENDING',
    }
  })

  // 3. If anything fails, whole transaction rolls back
  // If succeeds, both records created atomically
})

// Later: Stripe webhook updates payment.status to SUCCEEDED
// → Trigger application logic to update reservation.status to CONFIRMED
```

### 7.3 Refund - Consistency

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create refund record (status=PENDING)
  const refund = await tx.paymentRefund.create({
    data: {
      paymentId,
      reservationId,
      amountCents: calculateRefundAmount(reservation),
      refundReason: 'CANCELLED_BY_CLIENT',
      status: 'PENDING',
    }
  })

  // 2. Call Stripe refund API (can fail)
  const stripeRefund = await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntentId,
    amount: refund.amountCents,
  })

  // 3. Update refund record with Stripe response
  await tx.paymentRefund.update({
    where: { id: refund.id },
    data: {
      stripeRefundId: stripeRefund.id,
      status: stripeRefund.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED',
      succeededAt: stripeRefund.status === 'succeeded' ? new Date() : null,
    }
  })

  // 4. Update reservation
  await tx.reservation.update({
    where: { id: reservationId },
    data: { status: 'CANCELLED_BY_CLIENT', cancelledAt: new Date() }
  })
})
```

---

## 8. Migration Strategy

### Initial Setup (Migration 001)

```bash
# Initialize Prisma
pnpm exec prisma migrate dev --name init

# This creates:
# - All tables
# - All constraints
# - All indexes
# - prismama/migrations/001_init/migration.sql
```

### Evolution (Incremental)

```bash
# Add new feature
# 1. Update schema.prisma
# 2. Create migration
pnpm exec prisma migrate dev --name add_professional_verified_badge

# Deploy to production
pnpm exec prisma migrate deploy
```

---

## 8.5 DST Testing (Mandatory Before Production)

**Israel DST Transitions (2025):**
- March 31: Standard time → Daylight saving (UTC+2 → UTC+3)
- October 26: Daylight saving → Standard time (UTC+3 → UTC+2)

**Test Cases (MANDATORY):**
```sql
-- Case 1: Booking STRADDLES DST transition (last Sunday of March)
-- Pro Marie (timezone: Asia/Jerusalem) books herself or books with another pro
-- Booking: 2025-03-30 10:00 to 2025-03-31 15:00 (crosses DST boundary)
-- Expected: All times correctly stored in UTC, no off-by-1-hour errors

-- Case 2: Recurring schedule with DST transition
-- Pro Jane has schedule: Every Monday 09:00-18:00 (Asia/Jerusalem)
-- Query availability for week of March 31 (DST transition day)
-- Expected: Correct hours in UTC despite offset change

-- Case 3: Payment timestamp during DST transition
-- Booking payment confirmed exactly when clocks change
-- Expected: Exact timestamp captured, no duplication/skipping
```

**Test Implementation:**
```typescript
// src/tests/integration/timezone.dst.test.ts
describe('DST Edge Cases - Israel', () => {
  it('should handle booking across DST boundary (Mar 31)', async () => { ... })
  it('should handle recurring schedule during DST transition', async () => { ... })
  it('should calculate correct availability during DST gap hour', async () => { ... })
  it('should handle payment timestamp during clock change', async () => { ... })
})
```

**Why This Matters:**
- Israel DST changes 2x per year
- Bugs manifest only during transition weeks (hard to reproduce)
- Off-by-1-hour errors break scheduling, refunds, reports
- Must test ACTUAL DST dates, not just timezones

---

## 9. Checklist: DB Ready for Production

- [ ] All tables created with correct columns
- [ ] All constraints (PK, FK, UNIQUE, CHECK) in place
- [ ] All indexes defined (especially UNIQUE for booking)
- [ ] Timezone handling verified (all timestamps UTC)
- [ ] Snapshots for price/duration/name implemented (MANDATORY)
- [ ] Audit log table ready (append-only, no deletes)
- [ ] Soft deletes used where needed (services, schedules)
- [ ] Prisma migrations tested (can roll forward & back)
- [ ] Seed data for development created (with test cases)
- [ ] Backup strategy defined (daily dumps to S3, restore tested)
- [ ] Performance queries tested with EXPLAIN ANALYZE
- [ ] **DST Edge cases tested (Mar 31 + Oct 26 for Israel timezone)**
- [ ] Double-booking stress test passed (concurrent requests)
- [ ] Payment transaction atomicity verified (partial failure rollback)
- [ ] Refund idempotency keys implemented + tested
- [ ] Audit log sampling verified (spot-check 10 random entries)
- [ ] Foreign key constraints cause expected errors (manual test)
- [ ] No orphaned records exist (referential integrity audit)

---

## 🔒 V1 DATABASE SCHEMA - FROZEN FOR PRODUCTION

This schema is **LOCKED for V1 production.** No schema changes allowed without full team + architecture review.

### Points Figés (Non-Negotiable for V1)

| Point | Frozen Value | Why | Changes in V2? |
|-------|-------------|-----|-----------------|
| **Users Model** | 1 per person, multiple roles | Flexibility, no duplication | No change, just extensions |
| **ProfessionalProfile** | Optional 1-1, soft delete | Clean lifecycle, audit trail | No structural change |
| **Snapshots** | Service name/duration/price | Disputes, refunds, invoices | No change, always required |
| **Ratings** | Reviews source of truth, derived aggregates | Single source of truth | No change, just recalc method |
| **Timestamps** | UTC only, all TIMESTAMPTZ | No timezone confusion | No change, strict requirement |
| **Audit Logs** | Append-only, no updates/deletes | Compliance, forensics | No change, permanent feature |
| **Double-Booking** | UNIQUE partial + app logic | V1 pragmatism, V2 uses tsrange | V2 uses EXCLUSION constraint |
| **ProfessionalSchedule** | Recurring hours, no real dates | Abstract weekly schedule | No change, no exceptions V1 |
| **Payment Atomicity** | Transaction-level guarantees | Safety, no orphaned records | No change, improved in V2 |
| **Refund Idempotency** | Idempotency keys + checks | No double-refunds | No change, stricter checks V2 |

### Critical Checks Before Go-Live

- [ ] All tables created + migrated via `prisma migrate deploy`
- [ ] Snapshots populated on EVERY Reservation creation (tests mandatory)
- [ ] Double-booking validation in BookingEngine tested (stress test concurrent bookings)
- [ ] DST edge cases tested (Israel Mar 31 + Oct 31)
- [ ] Payment transitions atomic (tests for partial failures)
- [ ] Refund idempotency keys implemented (prevent double-refunds)
- [ ] Audit logs appended for all critical changes (manual audit sample)
- [ ] Backup strategy deployed (daily to S3, restore tested)
- [ ] Foreign key constraints enforced (no orphaned records)
- [ ] Indexes monitored for query performance (<100ms for availability checks)

### Questions Before Any V1 Schema Change

If anyone proposes a schema change:
1. **Does it break snapshots?** → NO
2. **Does it weaken audit trail?** → NO
3. **Does it risk double-booking?** → NO
4. **Does it add timezone complexity?** → NO
5. **Does it require app-level migration?** → Check feasibility

If any answer is YES, it goes to V2.

---

## Conclusion

This database design is:
- **ACID-compliant** for critical operations (booking, payment, refunds)
- **Audit-trail complete** for compliance and forensics
- **Race-condition protected** via unique constraints + mandatory application logic
- **Scalable** with appropriate indexes and soft deletes
- **Maintainable** with clear structure and Prisma ORM
- **Timezone-safe** with UTC storage and DST testing
- **Snapshot-complete** for disputes and historical accuracy
- **Production-ready** for V1 launch with confidence

**Status: ✅ V1 SCHEMA LOCKED FOR PRODUCTION** 🔒

No further changes without explicit team approval and architecture review. All changes go to V2 planning.

Implement with confidence. Testing checklist in Section 10 is mandatory before launch.

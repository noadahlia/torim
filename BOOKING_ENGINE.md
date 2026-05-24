# BOOKING_ENGINE - Moteur de Réservation V1

**Version:** 1.0 (FROZEN for Production)  
**Date:** Mai 2026  
**Classification:** Core System - No Compromises  
**Statut:** Contrat Fonctionnel + Spécification Implémentation

---

## Executive Summary

The Booking Engine is the heart of the platform. It orchestrates:
- Calculation of available time slots based on professional schedule + existing bookings
- Atomic creation of reservations (Reservation + Payment records)
- Race condition prevention for concurrent booking attempts
- State transitions from booking creation through completion/cancellation

**Non-Negotiable Guarantees:**
1. Two clients can never book the same time slot (database + application level)
2. All availability calculations deterministic and server-side
3. All dates stored and calculated in UTC; conversion to local timezone at API boundaries only
4. Reservation creation is atomic (all-or-nothing with payment initiation)
5. Complete audit trail of all state changes

---

## 1. Objectifs et Invariants

### 1.1 Invariants Mathématiques (Never Violated)

**Invariant #1: No Overlapping Reservations**
```
For a given professional_id, at most ONE non-cancelled reservation can exist
such that: new_start < existing_end AND new_end > existing_start

In other words:
- No two reservations can occupy the same time window
- No two reservations can partially overlap
- Once a slot is taken, it is unavailable until cancellation
```

**Proof of Enforcement:**
- Layer 1 (Database): UNIQUE partial index prevents most overlap attempts
- Layer 2 (Application): `validateNoOverlap()` checks ALL existing reservations before creation
- Layer 3 (Transaction): Entire booking transaction fails atomically if overlap detected
- Layer 4 (Idempotency): Same booking request retried = same error, never creates duplicate

**Invariant #2: Deterministic Availability**
```
Given:
- professional_id
- date (YYYY-MM-DD)
- service_id

calculateAvailability() always returns the SAME slots
regardless of who calls it, when it's called, or from which client.

No non-determinism allowed. No "lucky" vs "unlucky" time.
```

**Why:** Fairness, debugging, repeatability. If slot calc non-deterministic, some clients get slots others don't.

**Invariant #3: UTC Storage, Local Interpretation**
```
Reservation.start_time = '2025-06-01T11:00:00Z'  (UTC, always)
Reservation.end_time = '2025-06-01T12:00:00Z'    (UTC, always)

User.timezone = 'Asia/Jerusalem'
Professional.timezone = 'Asia/Jerusalem'

Conversion happens at API boundary:
Request: "I want 14:00 on June 1"
→ Frontend: zonedTimeToUtc('2025-06-01T14:00', 'Asia/Jerusalem')
→ API receives: '2025-06-01T11:00:00Z'
→ Database stores: '2025-06-01T11:00:00Z'
→ Response: convert back to local for display
```

**Never:**
- Mix UTC and local times in same operation
- Assume client timezone matches professional timezone
- Store times without UTC conversion
- Perform arithmetic on unconverted timestamps

**Invariant #4: Server-Side Logic Only**
```
The client (web/mobile) is a dumb UI.

FORBIDDEN for client:
- Calculate available slots
- Decide if booking is possible
- Apply business rules (buffers, cutoff times, etc.)
- Determine pricing or refund amounts
- Modify reservation details

Client CAN:
- Display slots returned by server
- Submit booking request with selected slot
- Show error messages from server
```

---

## 2. Modèle de Données (Rappel Schéma V1)

### 2.1 Tables Critiques pour Booking Engine

**professional_schedules** (Heures de travail récurrentes)
- `id, professional_id, day_of_week (0-6), start_time (TIME), end_time (TIME), is_available`
- Stores abstract weekly hours in PROFESSIONAL'S TIMEZONE
- No real calendar dates
- Example: "Every Monday, 09:00-18:00 (Jerusalem time)"

**services** (Offerings d'une pro)
- `id, professional_id, name, duration_minutes, price_cents, buffer_minutes_after`
- Duration is FIXED (not flexible per booking)
- buffer_minutes_after = cool-down time before next client

**reservations** (The core entity)
- `id, client_id, professional_id, service_id`
- `start_time (UTC), end_time (UTC)` ← ALWAYS UTC
- `status` (PENDING_PAYMENT, CONFIRMED, CANCELLED_BY_*, COMPLETED, NO_SHOW)
- `service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot` ← Immutable
- `created_at, updated_at, confirmed_at, cancelled_at, completed_at`

**payments** (Payment state for reservation)
- `id, reservation_id (UNIQUE FK), stripe_payment_intent_id`
- `amount_cents, status (PENDING, SUCCEEDED, FAILED)`
- `created_at, updated_at, succeeded_at`

**audit_logs** (Immutable trail)
- Every state change logged here
- Used for debugging, compliance, forensics

---

## 3. Calcul des Disponibilités

### 3.1 Inputs

```
Input to calculateAvailability():
├─ professional_id (UUID)
├─ date (YYYY-MM-DD in client's local timezone)
├─ service_id (UUID)
├─ client_timezone (e.g., 'Asia/Jerusalem', can differ from pro's timezone)
└─ professional_timezone (e.g., 'Asia/Jerusalem', from User.timezone)
```

### 3.2 Étapes du Calcul (Ordre Critique)

**Step 1: Interpret Professional's Schedule**
```
Lookup: SELECT * FROM professional_schedules 
        WHERE professional_id = $1 
        AND day_of_week = dayOfWeek(input_date)
        AND is_available = TRUE

Result:
├─ If row found: pro works on this day
│  ├─ start_time = '09:00:00' (TIME type, in pro's timezone)
│  └─ end_time = '18:00:00' (TIME type, in pro's timezone)
├─ If no row: pro doesn't work this day
│  └─ Return: [] (no slots)
└─ If row exists but is_available = FALSE:
   └─ Return: [] (pro marked unavailable, soft delete)
```

**Step 2: Convert Professional's Schedule to UTC**
```
Input:
├─ date = '2025-06-01' (YYYY-MM-DD, logical date)
├─ start_time = '09:00:00' (TIME, in pro's timezone)
├─ end_time = '18:00:00' (TIME, in pro's timezone)
└─ professional_timezone = 'Asia/Jerusalem'

Process:
├─ Construct datetime: '2025-06-01T09:00:00' (naive, in pro's timezone)
├─ Convert to UTC: zonedTimeToUtc('2025-06-01T09:00:00', 'Asia/Jerusalem')
│  └─ Result: '2025-06-01T06:00:00Z' (UTC, if no DST offset)
└─ Similarly convert end_time to UTC
   └─ Result: '2025-06-01T15:00:00Z'

Output:
├─ pro_schedule_start_utc = '2025-06-01T06:00:00Z'
├─ pro_schedule_end_utc = '2025-06-01T15:00:00Z'
└─ duration_seconds = (end - start) = 32400 seconds = 9 hours
```

**Step 3: Get Service Duration & Buffers**
```
Lookup: SELECT duration_minutes, buffer_minutes_after
        FROM services
        WHERE id = $1

Result:
├─ service_duration_minutes = 60
└─ buffer_minutes_after = 15

Convert to seconds:
├─ service_duration_seconds = 3600
└─ buffer_total_seconds = 900  (service + buffer)
```

**Step 4: Fetch Existing Reservations (Exclude Overlaps)**
```
Lookup: SELECT start_time, end_time, status
        FROM reservations
        WHERE professional_id = $1
        AND start_time >= $2  (pro_schedule_start_utc)
        AND end_time <= $3    (pro_schedule_end_utc + buffer)
        AND status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')

Result:
├─ existing_reservation_1: 10:00-11:00 UTC
├─ existing_reservation_2: 14:00-15:00 UTC
└─ (cancellations are IGNORED for availability, they free up slots)
```

**Step 5: Build Available Slots (Granularity)**
```
Parameters:
├─ pro_schedule_start_utc = '2025-06-01T06:00:00Z'
├─ pro_schedule_end_utc = '2025-06-01T15:00:00Z'
├─ service_duration_seconds = 3600
├─ buffer_total_seconds = 900
├─ slot_granularity_minutes = 15  (V1: hardcoded, not flexible)
└─ existing_reservations = [10:00-11:00, 14:00-15:00]

Algorithm (Pseudocode):
├─ current_time_utc = pro_schedule_start_utc
├─ available_slots = []
│
├─ WHILE current_time_utc + service_duration_seconds <= pro_schedule_end_utc:
│  ├─ slot_start_utc = current_time_utc
│  ├─ slot_end_utc = current_time_utc + service_duration_seconds
│  │
│  ├─ Check overlap with existing reservations:
│  │  ├─ is_overlapping = FALSE
│  │  ├─ FOR EACH existing_res:
│  │  │  ├─ IF (slot_start < existing_res.end AND slot_end > existing_res.start):
│  │  │  │  └─ is_overlapping = TRUE
│  │  │  └─ IF (slot_end + buffer > existing_res.start AND slot_start < existing_res.end + buffer):
│  │  │     └─ is_overlapping = TRUE  (account for buffer after service)
│  │  └─
│  │
│  ├─ IF is_overlapping = FALSE:
│  │  └─ available_slots.add({ start_utc: slot_start_utc, end_utc: slot_end_utc })
│  │
│  ├─ Advance current_time_utc by slot_granularity_minutes (15 min)
│  └─
│
└─ RETURN available_slots (list of UTC times)

Example output:
├─ Slot 1: 06:00-07:00 UTC
├─ Slot 2: 06:15-07:15 UTC
├─ ...
├─ Slot 9: 09:00-10:00 UTC  (BLOCKED by existing 10:00-11:00, starts too late)
├─ Slot 10: 13:00-14:00 UTC  (OK)
├─ ...
└─ (No slot after 15:00 UTC because pro ends at 15:00)
```

**Step 6: Convert Slots back to Client's Timezone (Response Only)**
```
For each available slot:
├─ slot_start_utc = '2025-06-01T06:00:00Z'
├─ client_timezone = 'Asia/Jerusalem'
│
├─ Convert to local: utcToZonedTime(slot_start_utc, client_timezone)
│  └─ Result: '2025-06-01T09:00:00' (local time in Jerusalem)
│
└─ Response includes BOTH UTC (for booking) and local (for display)
   ├─ display: "09:00-10:00 Jerusalem time"
   └─ api_payload: { start_utc: '2025-06-01T06:00:00Z', end_utc: '2025-06-01T07:00:00Z' }
```

### 3.3 Buffers (Before & After Service)

**Buffer BEFORE Service (V1: Not Implemented)**
- Future: Pro setup time, hygiene break, etc.
- V1: Always zero

**Buffer AFTER Service**
- Defined in `services.buffer_minutes_after`
- Applied AFTER service ends
- Prevents booking two clients back-to-back
- Example: Service 10:00-11:00, buffer 15min → next slot earliest 11:15

**Buffer Enforcement:**
```
Existing reservation: 10:00-11:00 (60 min service)
Service buffer: 15 minutes

Next available slot:
├─ Cannot start before: 11:15 (11:00 + 15 min buffer)
└─ Therefore slot 11:00-12:00 is BLOCKED
```

### 3.4 Granularité des Slots (V1: 15 minutes)

**Definition:** Slots can only start at 15-minute intervals.

**Rationale:**
- Prevents infinite granularity (0.001 second slots)
- UX: Clean time picks (09:00, 09:15, 09:30, etc.)
- Simplifies grid display on mobile

**Implementation:**
- Loop through schedule in 15-minute increments
- For each potential start time, check if service fits
- If yes, add to available slots

**No Flexibility V1:**
- Cannot pick arbitrary granularity
- Cannot pick 10-minute or 30-minute increments per booking
- Hardcoded to 15 minutes globally

---

## 4. Trust & Acceptance Policy (Pre-Booking Gate)

### 4.0 Ordre de Décision Explicite (Non Ambigu, V1)

**When:** After slot validation, BEFORE Reservation creation

**Decision Order (MUST FOLLOW THIS SEQUENCE):**

```
1. ✅ VALIDATE SLOT
   ├─ Is the slot available?
   ├─ Does it fit professional's schedule?
   ├─ Are there no conflicting reservations?
   └─ If NO → Error 409, stop here

2. ✅ READ PROFESSIONAL'S ACCEPTANCE POLICY
   ├─ Lookup: professional_profiles.acceptance_policy
   ├─ Default if not set: ACCEPT_ALL
   └─ Possible values: OPEN, FILTER_LOW_TRUST, REQUIRE_MANUAL_CONFIRMATION, REQUIRE_DEPOSIT_FOR_LOW_TRUST

3. ✅ EVALUATE CLIENT TRUST SCORE (OPAQUE)
   ├─ Lookup: client_trust_profiles.trust_score (or 50 if new client)
   ├─ Professional NEVER sees this score
   ├─ Client NEVER sees this score
   └─ Used only for policy gating

4. ✅ DECIDE FINAL STATUS
   ├─ Based on policy + score combination
   ├─ Determine: CONFIRMED vs AWAITING_CONFIRMATION vs AWAITING_DEPOSIT vs SILENT_REJECTION
   └─ Create reservation with appropriate status

5. ✅ CREATE RESERVATION
   ├─ Atomic DB transaction
   ├─ Immutable snapshots
   └─ Audit log entry
```

### 4.1 Professional Acceptance Policies (V1 Enum, Stable)

**Policy Enum: Four Options (Choose Exactly One)**

```
enum AcceptancePolicy {
  OPEN = "Accept all bookings, no questions"
  FILTER_LOW_TRUST = "Accept only clients with trust_score >= 70"
  REQUIRE_MANUAL_CONFIRMATION = "All bookings pending professional approval"
  REQUIRE_DEPOSIT_FOR_LOW_TRUST = "Deposit required for clients with trust_score < 70"
}
```

### 4.2 Policy Evaluation Logic (V1 Specification)

```
Input: professional_id, client_id, policy, client_trust_score

POLICY: OPEN
├─ Result: CONFIRMED (immediate)
├─ Payment: None required
└─ Client Experience: "Booking confirmed!"

POLICY: FILTER_LOW_TRUST
├─ IF client_trust_score >= 70:
│  └─ Result: CONFIRMED (immediate)
│     Payment: None required
│     Client Experience: "Booking confirmed!"
│
└─ IF client_trust_score < 70:
   └─ Result: SILENT_REJECTION
      Client sees: "Professional unavailable at this time"
      Client never knows why (no score, no rejection language)
      Professional never sees the attempt

POLICY: REQUIRE_MANUAL_CONFIRMATION
├─ Result: AWAITING_CONFIRMATION (always, regardless of score)
├─ Payment: None required yet
├─ Professional sees: "New booking - Approve or Decline?"
├─ Client sees: "Booking pending professional's approval"
├─ Timeout: Auto-decline after 6 hours
├─ On approval → status = CONFIRMED
└─ On decline → status = DECLINED_BY_PROFESSIONAL

POLICY: REQUIRE_DEPOSIT_FOR_LOW_TRUST
├─ IF client_trust_score >= 70:
│  └─ Result: CONFIRMED (immediate)
│     Payment: None required
│     Client Experience: "Booking confirmed!"
│
└─ IF client_trust_score < 70:
   └─ Result: AWAITING_DEPOSIT
      Payment: Deposit required
      Client sees: "Professional requires deposit to confirm"
      (framed as pro's rule, NOT as client's score)
      Status becomes CONFIRMED after payment succeeds
```

### 4.3 Key Principles (Alignment with Trust System)

```
OPAQUE (Professional Perspective):
├─ Professional chooses one abstract policy
├─ Professional NEVER sees client scores
├─ Professional NEVER sees trust categories
├─ Professional sees only: "Policy active" and booking statuses
└─ Platform handles all trust logic invisibly

OPAQUE (Client Perspective):
├─ Client NEVER sees their own score
├─ Client NEVER sees they're "filtered" or "low-trust"
├─ Client sees only: Generic messages ("unavailable", "deposit required")
├─ No shaming, no rejection language, no appeals needed
└─ Client may try different time/service/professional

TRANSPARENT (Admin Perspective):
├─ Admins can see all scores and events
├─ Admins can review policy applications
├─ Admins can override policies manually (with audit trail)
└─ Used for: Debugging, dispute resolution, fairness audits

THRESHOLDS (V1 Hardcoded):
├─ Trust threshold: 70 (not configurable by professional in V1)
├─ Deposit amount: Configurable per professional, not score-based
└─ Manual approval timeout: 6 hours (not configurable)
```

---

## 5. Algorithme de Réservation (Happy Path)

### 5.0 Clarification: Payment Is NEVER Mandatory in V1

```
CRITICAL RULE:
├─ Payment is NEVER required by default
├─ Payment is OPTIONAL and CONFIGURABLE
├─ The Booking Engine works FULLY without Stripe enabled
│
WHEN PAYMENT IS INVOLVED:
├─ ONLY if professional uses REQUIRE_DEPOSIT_FOR_LOW_TRUST policy
├─ ONLY for clients with trust_score < 70
├─ Deposit amount is professional's choice (not system-enforced)
│
WHEN BOOKING ENGINE RUNS WITHOUT PAYMENT:
├─ Professional uses OPEN policy → No payment needed
├─ Professional uses FILTER_LOW_TRUST → No payment needed
├─ Professional uses REQUIRE_MANUAL_CONFIRMATION → No payment needed
├─ Client uses REQUIRE_DEPOSIT_FOR_LOW_TRUST with score >= 70 → No payment needed
│
CONSEQUENCES:
├─ Stripe integration is OPTIONAL
├─ Booking system is independent of payment system
├─ All reservation flows work without Stripe
├─ No "PENDING_PAYMENT" status unless deposit policy triggered
```

### 5.1 Preconditions

Before attempting a reservation, all of these MUST be true:

1. **User authenticated** → client_id known
2. **Professional exists** → professional_id valid, user has ROLE_PROFESSIONAL
3. **Service exists** → service_id valid, belongs to this professional
4. **Slot is available** → returned from `calculateAvailability()`
5. **Slot is still available at booking time** → checked again (race condition safety)
6. **Client is not the professional** → client_id ≠ professional_id

---

### 5.2 Exact Steps (In Order, No Deviations)

**Phase 1: Validation & Pre-Booking Checks**

```
Step 1.1: Parse & Validate Input
├─ Input: {
│   professional_id, service_id, start_time_utc, end_time_utc,
│   client_timezone, pro_timezone, client_id
│  }
├─ Validate start_time < end_time
├─ Validate times are in valid RFC3339 UTC format (Z suffix)
├─ Return: ERROR if any validation fails (400 Bad Request)
└─ Continue to Step 1.2 if OK

Step 1.2: Fetch & Validate Entities
├─ SELECT professional FROM users WHERE id = $1 AND ROLE_PROFESSIONAL = ANY(roles)
├─ SELECT service FROM services WHERE id = $2 AND professional_id = $professional.id
├─ SELECT client FROM users WHERE id = $3 AND ROLE_CLIENT = ANY(roles)
├─ SELECT acceptance_policy FROM professional_profiles WHERE user_id = $professional.id
├─ Return: ERROR 404 if any entity not found or roles invalid
├─ Return: ERROR 422 if client_id = professional_id (self-booking not allowed)
└─ Continue to Step 1.3 if OK

Step 1.3: Validate Slot Duration Matches Service
├─ slot_duration = (end_time_utc - start_time_utc)
├─ service_duration = service.duration_minutes * 60 seconds
├─ IF slot_duration ≠ service_duration:
│  └─ Return: ERROR 400 "Slot duration doesn't match service duration"
└─ Continue to Step 1.4 if OK

Step 1.4: Recalculate Availability (Anti-Race Condition)
├─ Call calculateAvailability(professional_id, date, service_id, ...)
├─ Check if requested slot is in returned available slots
├─ IF NOT found:
│  └─ Return: ERROR 409 "This time slot is no longer available"
│      (Another client booked it while this client was thinking)
└─ Continue to Step 1.5 if OK

Step 1.5: Evaluate Acceptance Policy (Opaque to Client)
├─ SELECT trust_score FROM client_trust_profiles WHERE client_id = $1
├─ trust_score = value or 50 if new client (NULL)
│
├─ IF policy = OPEN:
│  └─ Decision: CONFIRMED, no payment
│
├─ IF policy = FILTER_LOW_TRUST:
│  ├─ IF trust_score >= 70:
│  │  └─ Decision: CONFIRMED, no payment
│  └─ IF trust_score < 70:
│     └─ Decision: SILENT_REJECTION
│        Return: ERROR 423 "Professional unavailable at this time"
│
├─ IF policy = REQUIRE_MANUAL_CONFIRMATION:
│  └─ Decision: AWAITING_CONFIRMATION, no payment required yet
│
├─ IF policy = REQUIRE_DEPOSIT_FOR_LOW_TRUST:
│  ├─ IF trust_score >= 70:
│  │  └─ Decision: CONFIRMED, no payment
│  └─ IF trust_score < 70:
│     └─ Decision: AWAITING_DEPOSIT, payment required
│
└─ Continue to Phase 2 with decision
```

**Phase 2: Atomic Reservation Creation (DB Transaction)**

```
Transaction Boundary: BEGIN
│
Step 2.1: Acquire Distributed Lock (Redis, Optional Optimization)
├─ lock_key = "booking:professional_{professional_id}:{start_time_utc}:{end_time_utc}"
├─ Attempt: redis.lock(lock_key, timeout=5_seconds)
├─ IF lock unavailable after 1 second:
│  └─ Return: ERROR 429 "Too many booking attempts, please retry"
│      (Another client is booking this exact slot)
│
Step 2.2: Final Overlap Check (Before Insert)
├─ SELECT * FROM reservations
│  WHERE professional_id = $1
│  AND start_time < $end_time_utc
│  AND end_time > $start_time_utc
│  AND status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')
│
├─ IF any rows found:
│  └─ Transaction ROLLBACK
│  └─ Release lock
│  └─ Return: ERROR 409 "This time slot is no longer available"
│      (Overlap detected, this is the race condition catch)
│
├─ IF no overlap:
│  └─ Proceed to Step 2.3

Step 2.3: Create Snapshot of Service
├─ service_name_snapshot = service.name
├─ service_duration_minutes_snapshot = service.duration_minutes
├─ service_price_cents_snapshot = service.price_cents
└─ (These are IMMUTABLE, never change)

Step 2.4: Create Reservation Record (Status Depends on Policy Decision)
├─ Determine final_status from Phase 1, Step 1.5:
│  ├─ If decision = CONFIRMED → status = 'CONFIRMED'
│  ├─ If decision = AWAITING_CONFIRMATION → status = 'AWAITING_CONFIRMATION'
│  ├─ If decision = AWAITING_DEPOSIT → status = 'AWAITING_DEPOSIT'
│  └─ If decision = SILENT_REJECTION → DON'T create reservation, error already returned
│
├─ INSERT INTO reservations (
│   id (new UUID),
│   client_id, professional_id, service_id,
│   start_time, end_time,
│   status = final_status,
│   service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot,
│   created_at = NOW()
│ )
├─ ON CONFLICT (UNIQUE constraint): ROLLBACK (shouldn't reach here if lock held)
├─ Result: reservation created with appropriate status
└─ Continue to Step 2.5

Step 2.5: Create Payment Record (Only if Deposit Required)
├─ IF status = AWAITING_DEPOSIT:
│  ├─ INSERT INTO payments (
│  │   id (new UUID),
│  │   reservation_id,
│  │   stripe_payment_intent_id = (call Stripe API to create intent),
│  │   amount_cents = professional.deposit_amount_cents,
│  │   currency = 'ILS',
│  │   status = 'PENDING',
│  │   created_at = NOW()
│  │ )
│  ├─ ON CONFLICT or Stripe error: ROLLBACK entire transaction
│  │  └─ Return: ERROR 500 "Payment initiation failed, please retry"
│  └─ Continue to Step 2.6
│
└─ IF status != AWAITING_DEPOSIT:
   └─ No payment record created, skip to Step 2.6

Step 2.6: Create Audit Log Entry
├─ INSERT INTO audit_logs (
│   entity_type = 'Reservation',
│   entity_id = reservation.id,
│   action = 'CREATE',
│   user_id = client_id,
│   changes_before = NULL,
│   changes_after = { reservation object as JSON },
│   description = f"Reservation created for {service.name}, status={final_status}",
│   created_at = NOW()
│ )
└─ Continue to Commit

Transaction Boundary: COMMIT
│
Step 2.7: Release Locks & Cleanup
├─ Release Redis lock (if acquired)
└─ Cache invalidation: Clear "availability:{professional_id}:{date}" from cache
│
└─ Return: SUCCESS 201 (Created)
   Response (varies by status):
   
   IF status = CONFIRMED:
   ├─ id: reservation.id
   ├─ status: 'CONFIRMED'
   ├─ message: "Your booking is confirmed!"
   └─ next_action: None
   
   IF status = AWAITING_CONFIRMATION:
   ├─ id: reservation.id
   ├─ status: 'AWAITING_CONFIRMATION'
   ├─ message: "Booking pending professional's approval"
   └─ next_action: "Wait for professional response (6-hour timeout)"
   
   IF status = AWAITING_DEPOSIT:
   ├─ id: reservation.id
   ├─ status: 'AWAITING_DEPOSIT'
   ├─ message: "Professional requires deposit to confirm"
   ├─ payment_intent_id: stripe_payment_intent_id
   └─ next_action: "Redirect to Stripe Checkout"
```

---

## 5. Concurrence & Conditions de Course

### 5.1 Scénario Classique: Deux Clients Réservent Même Créneau

```
Timeline:

T0.0: Client A calls GET /availability
     ├─ Response: [09:00-10:00, 10:00-11:00, 11:00-12:00]

T0.1: Client B calls GET /availability
     ├─ Response: [09:00-10:00, 10:00-11:00, 11:00-12:00]
     └─ Both A & B see the same slots (deterministic ✓)

T0.5: Client A selects 10:00-11:00, starts payment flow

T0.6: Client B selects 10:00-11:00, starts payment flow

T1.0: Client A submits POST /reservations {start_time: 10:00, end_time: 11:00}
     ├─ Server: calculateAvailability() → [09:00, 10:00, 11:00] (still available)
     ├─ Server: Acquire Redis lock ✓
     ├─ Server: Final overlap check → No overlaps ✓
     ├─ Server: INSERT Reservation A ✓
     ├─ Server: INSERT Payment A ✓
     ├─ Server: COMMIT ✓
     └─ Client A: Response 201 "Booking confirmed, go to payment"

T1.1: Client B submits POST /reservations {start_time: 10:00, end_time: 11:00}
     ├─ Server: calculateAvailability() → [09:00, 11:00] (10:00 GONE)
     ├─ Check: requested slot NOT in available_slots
     └─ Server: Response 409 "This time slot is no longer available"
     └─ Client B: Show error, retry with different slot
```

### 5.2 Stratégie de Protection (Layered)

**Layer 1: Redlock (Redis Distributed Lock)**
- Purpose: Fast rejection if another request in-flight for same slot
- Timeout: 5 seconds (long enough for transaction)
- If unavailable: Return 429 "Too many attempts, retry in a moment"
- NOT required for correctness, just optimization

**Layer 2: UNIQUE Partial Index (Database)**
- Purpose: Last-resort protection if all else fails
- Constraint: `UNIQUE (professional_id, start_time, end_time) WHERE status NOT IN (...)`
- If violated: INSERT fails, transaction ROLLBACK
- If violated: Return 409 "This time slot is no longer available"

**Layer 3: Application Logic**
- Purpose: Fail fast, good UX, detailed error messages
- `validateNoOverlap()` checks ALL existing reservations
- Checks with buffer times (before & after)
- Provides specific error message, not generic 500

**Which layer catches double-booking?**
```
Most likely: Layer 1 (Redis lock) + Layer 3 (app logic)
├─ Catches 99% of cases with good error message

Fallback: Layer 2 (DB constraint)
├─ If Layer 1 fails AND Layer 3 misses
├─ Rare, but database always wins
└─ Transaction ROLLBACK ensures atomicity
```

### 5.3 Idempotency (Same Request, Twice)

```
Scenario: Client A submits booking, network hiccup, client retries same request

Attempt 1:
├─ Request: POST /reservations {start_time, end_time, ...}
├─ Server: Creates Reservation A, Payment A
├─ Response 201 sent to client
└─ Network: Response lost, client never receives it

Attempt 2 (Client retries same request):
├─ Request: POST /reservations {start_time, end_time, ...}  (SAME payload)
├─ Server: UNIQUE constraint check on (professional_id, start_time, end_time)
├─ Server: Row already exists (Reservation A from Attempt 1)
├─ Server: Transaction ROLLBACK
├─ Server: Response 409 "This time slot is already booked"

Problem: Client thinks booking failed, but it actually succeeded!

Solution: Idempotency Keys
├─ Each request includes: idempotency_key = SHA256(user_id + slot + timestamp)
├─ Server stores: {idempotency_key → (response_code, response_body)}
├─ Attempt 2 (with same key):
│  ├─ Lookup idempotency_key in cache/DB
│  ├─ Found: Return same response 201 from Attempt 1
│  └─ Client gets correct success response
└─ This is handled at API layer, not Booking Engine layer
```

---

## 7. Paiement & Confirmation (Deposit-Only Path, V1)

### 7.0 When Payment Is Involved (V1)

```
Payment ONLY occurs when:
├─ Professional's policy = REQUIRE_DEPOSIT_FOR_LOW_TRUST
├─ AND client's trust_score < 70
└─ Result: Reservation created with status AWAITING_DEPOSIT

In all other cases:
├─ No payment record created
├─ No Stripe integration needed
├─ Reservation status = CONFIRMED (or AWAITING_CONFIRMATION)
└─ Booking is immediately confirmed
```

### 7.1 Deposit Payment Flow

```
Step 1: Reservation created with status AWAITING_DEPOSIT
├─ Reservation record inserted ✓
├─ Payment record created (stripe_payment_intent_id, status PENDING) ✓
└─ Client sees: "Professional requires deposit to confirm"

Step 2: Client redirected to Stripe Checkout (hosted)
├─ Stripe handles payment UI
├─ Client may abandon (X button) → payment never completes
└─ OR Client completes payment → Stripe calls webhook

Step 3: Stripe Webhook arrives at backend (asynchronous)
├─ Event: payment_intent.succeeded
├─ Stripe sends: {payment_intent_id, status: 'succeeded', ...}
├─ Backend verifies signature ✓
├─ Backend looks up: SELECT payment WHERE stripe_payment_intent_id = $1
├─ Found: Payment record created in Step 1 ✓
│
├─ Update Payment: status = SUCCEEDED, succeeded_at = NOW()
├─ Update Reservation: status = CONFIRMED, confirmed_at = NOW()
├─ Create Audit Log: "Deposit payment succeeded"
├─ Queue Job: Send confirmation email/SMS to client & pro
│
└─ Webhook response: 200 OK

Step 4: Confirmation notification sent (async)
├─ Client receives: "Your booking is confirmed for Sat, June 1 at 14:00"
├─ Professional receives: "New booking from Alice on June 1 at 14:00"
└─ Both can view booking details, communicate, etc.

Timeline:
T0: Reservation created (AWAITING_DEPOSIT)
T0+30s: Client completes payment on Stripe
T0+32s: Webhook arrives, payment marked SUCCEEDED
T0+33s: Reservation marked CONFIRMED, notifications queued
T0+35s: Email/SMS sent to both parties
```

### 7.2 Webhook Idempotency (Deposit Payment)

```
Scenario: Payment webhook arrives twice (network retry)

Webhook 1 (First time):
├─ Event: payment_intent.succeeded
├─ Backend: SELECT payment WHERE stripe_payment_intent_id = intent123
├─ Found: Payment with status PENDING
├─ Update: status = SUCCEEDED
├─ Reservation: status = AWAITING_DEPOSIT → CONFIRMED
└─ Response: 200 OK

Webhook 2 (Retry, same event):
├─ Event: payment_intent.succeeded (same intent123)
├─ Backend: SELECT payment WHERE stripe_payment_intent_id = intent123
├─ Found: Payment with status SUCCEEDED (already processed!)
│
├─ Check: IF payment.status ALREADY = SUCCEEDED
│  ├─ Log: "Duplicate webhook received, idempotent, ignoring"
│  └─ Response: 200 OK  (don't error, Stripe gets 200)
│
├─ Note: Reservation already CONFIRMED, no double-processing
└─ Idempotency achieved: same webhook twice = same result once
```

### 7.3 Deposit Payment Failure (Soft Decline)

```
Scenario: Client submits card, bank declines

Stripe Webhook:
├─ Event: payment_intent.payment_failed
├─ stripe_payment_intent_id = intent123
│
├─ Backend: SELECT payment WHERE stripe_payment_intent_id = intent123
├─ Update: Payment.status = FAILED
├─ Check: Reservation.status still AWAITING_DEPOSIT (good, not confirmed yet)
│
├─ Queue Job: Send email to client "Deposit payment failed, please retry"
└─ Response: 200 OK

Client sees:
├─ Stripe Checkout: "Payment declined, try another card"
├─ Retries with different card ✓
│
└─ New payment_intent (if Stripe flow allows), same reservation
```

### 7.4 Deposit Payment Timeout (Webhook Lost, Cleanup Job)

```
Scenario: Client completes payment on Stripe, webhook lost

T0: Reservation created (AWAITING_DEPOSIT)
T0+1min: Client completes payment
T0+2min: Webhook lost (network issue)
T30min: Client checks status, still shows AWAITING_DEPOSIT (confusing!)

Cleanup Job (runs every 5 minutes):
├─ Find: Reservations with status AWAITING_DEPOSIT created > 1 hour ago
├─ For each: Check Stripe API directly
│  ├─ Query: stripe.paymentIntents.retrieve(stripe_payment_intent_id)
│  ├─ If Stripe says SUCCEEDED:
│  │  └─ Manually update Reservation.status to CONFIRMED
│  │  └─ Queue notification (better late than never)
│  │
│  ├─ If Stripe says FAILED or no intent:
│  │  └─ Mark Reservation for cleanup (after cutoff)
│  │
│  └─ If Stripe says PENDING (>1 hour old):
│     └─ Auto-cancel reservation (client didn't pay in time)
│        Status: CANCELLED_BY_PROFESSIONAL (system auto-cancel)
│        No refund (no payment was made)
│
└─ This is a safety net, not normal path
```

---

## 8. Annulation (Cancellation)

### 8.1 Annulation par Client

```
Preconditions:
├─ Reservation.status = CONFIRMED (must have paid)
├─ Reservation.start_time > NOW()  (can't cancel past bookings)
├─ Cancellation policy allows refund (from professional_profiles.cancellation_policy)
└─ HTTP request authenticated as client_id

Cancellation Policy Determination:
├─ Professional.cancellation_policy = 'standard' (default)
│  ├─ If cancelled > 24h before: Refund 100%
│  ├─ If cancelled 2h-24h before: Refund 80%
│  ├─ If cancelled < 2h before: Refund 0%
│
├─ Professional.cancellation_policy = 'flexible'
│  ├─ Any time: Refund 100%
│
└─ Professional.cancellation_policy = 'strict'
   ├─ Any time: Refund 0%

Process:

Step 1: Determine Refund Amount
├─ NOW() = current time (UTC)
├─ time_until_start = reservation.start_time - NOW()
├─ refund_percentage = calculateRefundPercentage(policy, time_until_start)
├─ refund_amount = reservation.payment.amount_cents * refund_percentage / 100
└─ Example: 5000 cents * 80% = 4000 cents refunded

Step 2: Create Refund Record (Atomic with Reservation update)
├─ BEGIN TRANSACTION
├─ INSERT INTO payment_refunds (
│   payment_id, reservation_id,
│   amount_cents = refund_amount,
│   refund_reason = 'CANCELLED_BY_CLIENT',
│   status = 'PENDING'
│  )
├─ UPDATE reservations SET status = 'CANCELLED_BY_CLIENT', cancelled_at = NOW()
├─ CREATE audit_log entry
├─ COMMIT
│
└─ If any step fails: ROLLBACK, return error

Step 3: Call Stripe API (After Transaction Committed)
├─ stripe.refunds.create({
│   payment_intent: reservation.payment.stripe_payment_intent_id,
│   amount: refund_amount_cents,
│   reason: 'requested_by_customer'
│  })
├─ Stripe processes refund asynchronously
└─ Stripe sends webhook: charge.refunded

Step 4: Update Refund Status (Via Webhook)
├─ Event: charge.refunded
├─ stripe_refund_id = refund123
├─ Backend: SELECT payment_refunds WHERE stripe_refund_id = NULL
│           (match by amount + payment_intent)
├─ Update: payment_refunds.status = SUCCEEDED, stripe_refund_id = refund123
├─ Queue Job: Send confirmation to client & pro
└─ Money back to client in 2-5 business days

Timeline:
T0: Client submits cancellation request
T0+1s: Reservation marked CANCELLED_BY_CLIENT, refund record created
T0+2s: Stripe refund API called
T0+5s: Stripe webhook received, refund marked SUCCEEDED
T0+10s: Confirmation email sent
T1-5 days: Money appears in client's account
```

### 8.2 Annulation par Professional

```
Similar to cancellation by client, but:

Differences:
├─ Professional must have ROLE_PROFESSIONAL
├─ refund_reason = 'CANCELLED_BY_PRO' (tracked separately)
├─ Refund policy is ALWAYS 100% (pro cancelling = their problem)
│  ├─ Regardless of cancellation_policy
│  └─ Professional pays the cost, not client
│
└─ Otherwise: Same atomic refund flow as client cancellation

Reason: Professional cancellations are rare, should be punished
└─ Forces pro to think twice before cancelling
└─ Maintains client trust (never lose money to pro cancellation)
```

### 8.3 No-Show (Pro Marks After Time)

```
Scenario: Time of booking has passed, client didn't show up

Timing:
├─ Reservation.start_time = 14:00 UTC
├─ Reservation.end_time = 15:00 UTC
├─ Current time = 15:30 UTC (30 minutes after service should end)

Pro Action:
├─ Pro can mark "No-show" in dashboard
├─ Status: CONFIRMED → NO_SHOW
├─ NO REFUND (client didn't show, already paid)
│
└─ Audit log: Who marked, when, proof

Why Track?
├─ Repeated no-shows → future bookings may require prepayment
├─ Helps pros manage unreliable clients
└─ Fair: Pro reserved time, client wasted it
```

---

## 9. Modifications (After Booking)

### 9.1 Reschedule (Move to Different Time)

**V1: Not Supported**

Rationale:
- Adds complexity (need to release old slot, check new slot, atomic swap)
- Rare use case (client can cancel + rebook)
- Stripe payment state complicates refund/charge logic
- Saves development time for MVP

Workaround:
```
If client wants different time:
├─ Cancel existing booking (gets refund per policy)
├─ Search availability for new date/time
├─ Create new booking (new payment)
└─ If < 2h before old booking: 0% refund, client pays for cancellation
```

### 9.2 Modify Service Details (Price, Duration)

**V1: Not Supported**

Why:
- Reservation has snapshots (immutable)
- Payment already processed
- Changing details = new booking

Workaround:
```
If pro changes service details:
├─ Old bookings keep old price/duration (snapshot protects)
├─ New bookings use new price/duration
└─ Pro must cancel old booking and rebook if change needed
```

### 9.3 Modify Notes (Client → Pro Communication)

**V1: Supported**

Example:
```
Client can add/update notes:
├─ "I have allergy to X polish, please avoid"
├─ "I prefer UV-free options"
└─ Notes stored in reservations.notes field

Pro can add/update pro_notes:
├─ Internal notes about client
├─ "Allergic to X, prefer Y"
├─ "Tends to be late"
└─ Notes stored in reservations.pro_notes field

Modifications allowed:
├─ Only before service time (start_time > NOW())
├─ After service: notes are immutable (for audit)
└─ Each update creates audit log entry
```

---

## 10. État Machine & Transitions (V1 Only)

### 10.1 Reservation Status Enum (V1 Locked)

```
enum ReservationStatus {
  CONFIRMED,                      // Booking is confirmed, ready for service
  AWAITING_CONFIRMATION,          // Pending professional approval
  AWAITING_DEPOSIT,               // Pending client payment of deposit
  COMPLETED,                      // Service delivered, booking finished
  NO_SHOW,                        // Client didn't show up
  CANCELLED_BY_CLIENT,            // Client cancelled
  CANCELLED_BY_PROFESSIONAL,      // Professional cancelled
  DECLINED_BY_PROFESSIONAL,       // Professional declined manual approval
}
```

**Note:** PENDING_PAYMENT is NOT a status in V1. Payment is handled via separate `payments` table, not via reservation status.

### 10.2 Diagramme État (Réservations V1)

```
┌─ CONFIRMED
│  (Reservation active, no further action needed)
│  │
│  ├─ Client cancels → CANCELLED_BY_CLIENT ✓
│  │  └─ Refund per professional's cancellation policy
│  │
│  ├─ Professional cancels → CANCELLED_BY_PROFESSIONAL ✓
│  │  └─ Refund 100% (pro's responsibility)
│  │
│  ├─ Service time arrives, client shows up → COMPLETED ✓
│  │  └─ Professional marks after service time
│  │
│  └─ Service time arrives, client doesn't show → NO_SHOW ✓
│     └─ Professional marks after service time (no refund)
│
├─ AWAITING_CONFIRMATION
│  (Professional must approve within 6 hours)
│  │
│  ├─ Professional approves → CONFIRMED ✓
│  │  └─ Booking becomes active
│  │
│  ├─ Professional declines → DECLINED_BY_PROFESSIONAL ✓
│  │  └─ Booking is rejected (no refund, never paid)
│  │
│  └─ Timeout (6 hours) → DECLINED_BY_PROFESSIONAL
│     └─ Auto-decline if pro doesn't respond
│
├─ AWAITING_DEPOSIT
│  (Client must pay deposit before booking is confirmed)
│  │
│  ├─ Payment succeeds → CONFIRMED ✓
│  │  └─ Booking becomes active (deposit paid)
│  │
│  ├─ Payment fails or client cancels → CANCELLED_BY_CLIENT
│  │  └─ Booking cancelled (no refund, payment failed)
│  │
│  └─ Timeout (24 hours) → CANCELLED_BY_PROFESSIONAL
│     └─ Auto-cancel if client doesn't pay
│
├─ COMPLETED
│  (Service delivered, final state)
│  │
│  ├─ Client can leave review (1:1, immutable)
│  └─ No further state changes
│
├─ NO_SHOW
│  (Client didn't show, final state)
│  │
│  ├─ No refund (client didn't follow through)
│  ├─ Counts as negative trust event
│  └─ No further state changes
│
├─ CANCELLED_BY_CLIENT
│  (Client cancelled, refund issued per policy)
│  └─ Terminal state
│
├─ CANCELLED_BY_PROFESSIONAL
│  (Professional cancelled, 100% refund issued)
│  └─ Terminal state
│
└─ DECLINED_BY_PROFESSIONAL
   (Professional rejected, no payment ever taken)
   └─ Terminal state
```

### 10.3 Transition Rules (Invariants, V1)

```
From CONFIRMED:
├─ TO CANCELLED_BY_CLIENT: Client action, refund issued per policy
├─ TO CANCELLED_BY_PROFESSIONAL: Pro action, refund 100%
├─ TO COMPLETED: Pro action after service time
├─ TO NO_SHOW: Pro action after service time
└─ TO any other: IMPOSSIBLE

From AWAITING_CONFIRMATION:
├─ TO CONFIRMED: Pro approves
├─ TO DECLINED_BY_PROFESSIONAL: Pro declines or timeout (6h)
└─ TO any other: IMPOSSIBLE

From AWAITING_DEPOSIT:
├─ TO CONFIRMED: Payment succeeds
├─ TO CANCELLED_BY_CLIENT: Client cancels or payment fails
├─ TO CANCELLED_BY_PROFESSIONAL: Timeout (24h, no payment)
└─ TO any other: IMPOSSIBLE

From COMPLETED: TERMINAL (no further transitions)
From NO_SHOW: TERMINAL (no further transitions)
From CANCELLED_BY_CLIENT: TERMINAL (no further transitions)
From CANCELLED_BY_PROFESSIONAL: TERMINAL (no further transitions)
From DECLINED_BY_PROFESSIONAL: TERMINAL (no further transitions)

Forbidden Transitions (NEVER allowed, even by admin):
├─ CONFIRMED → AWAITING_CONFIRMATION (can't go back to approval)
├─ CONFIRMED → AWAITING_DEPOSIT (can't un-confirm then require payment)
├─ COMPLETED → CANCELLED_* (can't un-do completed service)
├─ CANCELLED_* → CONFIRMED (can't resurrect cancelled booking)
├─ DECLINED_* → CONFIRMED (can't resurrect declined booking)
└─ Any state → same state (no-op transitions forbidden)
```

---

## 10. Cas Limites & Edge Cases

### 10.1 Changement d'Heure (DST Transition)

```
Scenario: Booking spans DST transition in Israel

Dates:
├─ March 31, 2025: Clock moves forward 02:00 → 03:00 (UTC+2 → UTC+3)
├─ Professional Marie, timezone: Asia/Jerusalem

Booking Request:
├─ Client: "I want 14:00 on March 31"
├─ Professional schedule: Every Sunday 09:00-18:00 Jerusalem time
│
├─ Problem: At 02:00 on March 31, clock jumps to 03:00
│           That hour (02:00-03:00) doesn't exist in Jerusalem!

Solution:
├─ TimeZoneService.zonedTimeToUtc() handles DST automatically
│  ├─ Input: 2025-03-31T14:00:00 (Jerusalem, skipped hour not relevant)
│  └─ Output: 2025-03-31T11:00:00Z (UTC)
│
├─ No hour jumps in UTC (UTC has no DST)
├─ Conversion is correct
└─ No special handling needed in Booking Engine
   (done by date-fns library)

Test Cases (MANDATORY):
├─ Booking that would span the non-existent hour (02:00-03:00) on Mar 31
│  └─ Should still work, library handles offset change
├─ Booking exactly during transition (01:59-03:01 local)
│  └─ Should calculate correct UTC times
└─ Recurring slot query on transition day
   └─ Should return correct available slots
```

### 10.2 Services Longs (>1 jour)

```
Scenario: Multi-day service (e.g., workshop)

Input:
├─ service_duration_minutes = 1440  (24 hours)
├─ start_time = 2025-06-01T09:00Z
├─ end_time = 2025-06-02T09:00Z

Problem:
├─ calculateAvailability() looks up professional_schedule
├─ Uses day_of_week of START date only
├─ Doesn't check day_of_week of END date
├─ If pro doesn't work June 2, availability calc is WRONG

Solution (V1):
├─ Restriction: No services > 1 day
├─ Schema: duration_minutes max 480 (8 hours)
├─ If violated: Return error 422

V2 Enhancement:
├─ Support multi-day services
├─ Check professional_schedule for ALL days spanned
├─ Ensure pro works all days
└─ Complex, defer to V2
```

### 10.3 Chevauchement Partiel

```
Scenario: Service doesn't fit in clean slot due to buffers

Example:
├─ Pro schedule: 09:00-18:00
├─ Service: 60 minutes
├─ Buffer after: 15 minutes
│
├─ Time: 17:00-18:00 (60 min service)
│        + 15 min buffer = until 18:15
├─ BUT pro stops at 18:00
│
├─ Problem: Buffer overflows past end of day!

Solution:
├─ calculateAvailability() checks: slot_end + buffer <= pro_schedule_end
├─ If not: slot is NOT included in available
├─ 17:00 slot DROPPED (can't fit with buffer)
├─ Last possible slot: ~16:45 (service until 17:45, buffer until 18:00)

Why:
├─ Otherwise, service ends at 18:15
├─ Next client (if pro had evening shift) would overlap
├─ Better to block slot than create conflict
```

### 10.4 Fuseaux Différents (Client vs Pro)

```
Scenario: Client in USA, Professional in Israel

Booking Request:
├─ Client timezone: America/New_York
├─ Professional timezone: Asia/Jerusalem
├─ Client: "I want 14:00 on June 1"
│
├─ Problem: 14:00 NY time ≠ 14:00 Jerusalem time!
│           Time difference = 7 hours (depending on DST)

Solution:
├─ Client submit time is in CLIENT's timezone
├─ API receives: client_timezone, professional_timezone (both provided)
├─ Conversion: 14:00 NY → 21:00 UTC (roughly, depending on DST)
├─ Professional sees: 00:00 (midnight) in their timezone
│  └─ If pro doesn't work nights: No available slots at that time
│  └─ Correct! Client booked outside pro's hours.
│
└─ All calculations use UTC, timezones handled at boundaries

Client Confusion Prevention:
├─ UI shows: "June 1 at 14:00 New York time"
├─ Also shows: "June 2 at 00:00 Jerusalem time"
├─ Client sees both, can confirm or change
└─ Clear communication = no surprises
```

### 10.5 Crash Serveur Pendant Transaction

```
Scenario: Server crashes mid-transaction during reservation creation

Example Timeline:
├─ T0: Transaction starts (BEGIN)
├─ T1: Reservation INSERT succeeds
├─ T2: Payment INSERT succeeds
├─ T3: Audit log INSERT starts...
├─ T4: DATABASE CRASHES (power failure, OOM, etc.)
│
├─ T5: Database restarts
├─ T6: Uncommitted transaction is ROLLED BACK by PostgreSQL
│      (This is ACID guarantee: D = Durability)
│
└─ Result: No reservation, no payment, no audit log
   Status: Booking attempt is LOST, as if request never arrived

Client Experience:
├─ Client submitted request
├─ Request timed out (connection dropped)
├─ Client retries (good UX practice)
├─ Retry succeeds (second attempt)
└─ No double-booking (UNIQUE constraint prevents it)

Why This is OK:
├─ Transaction didn't commit = no state change
├─ Database rollback is automatic
├─ Client will retry (smart app behavior)
├─ No orphaned records
├─ Audit log has entry for second attempt only

Monitoring:
├─ Log all timeout/500 errors
├─ Alert on high error rate
├─ Replay transactions if needed (idempotency keys)
```

### 10.6 Concurrent Modifications (Pro Updates Schedule During Booking)

```
Scenario: Professional disables a day while client is booking a slot on that day

Timeline:
├─ T0: Client calls GET /availability for Saturday
│      ├─ Response: [09:00, 09:15, 09:30, ...]
│      └─ Includes 14:00 slot
│
├─ T1: Professional manually updates:
│      ├─ SELECT professional_schedules WHERE day_of_week = 5 (Saturday)
│      ├─ UPDATE is_available = FALSE
│      └─ Saturday is now disabled
│
├─ T2: Client submits booking for 14:00 Saturday
│      ├─ Server: calculateAvailability() runs again
│      ├─ Looks up: professional_schedules WHERE day_of_week = 5, is_available = TRUE
│      ├─ No rows found (pro disabled it!)
│      ├─ Returns empty slots list
│      ├─ Requested slot NOT in available slots
│      └─ Server: Response 409 "This time slot is no longer available"
│
└─ Client: Sees error, selects different day

Why This Works:
├─ calculateAvailability() always checks current DB state
├─ If pro changes schedule between GET and POST: Detected!
├─ Client gets error, not silent failure
└─ No booking created for unavailable day
```

---

## 11. Performance & Monitoring

### 11.1 Performance Targets

| Operation | Target Latency | SLA |
|-----------|-----------------|------|
| calculateAvailability() | <100ms | p99 |
| validate overlap() | <50ms | p99 |
| create reservation (full txn) | <500ms | p95 |
| availability cache hit | <10ms | p99 |
| stripe payment intents creation | <2s | p95 |

### 11.2 Queries to Monitor

```
Slow Query: SELECT reservations WHERE professional_id = $1 AND start_time ...
├─ Should use idx_reservations_professional_id + idx_reservations_start_time
├─ If missing index: Query time explodes as bookings grow
├─ Alert if query > 50ms (p99)

Slow Query: SELECT professional_schedules WHERE professional_id = $1
├─ Should use idx_schedules_professional_id
├─ Typically <1ms
├─ If slow: Bug in caching or index

Slow Query: UNIQUE constraint check on INSERT
├─ Database does instant index lookup
├─ Should be <5ms
├─ If slow: Constraint might be corrupt, investigate
```

### 11.3 Metrics to Track

```
Business Metrics:
├─ Bookings per day
├─ Cancellation rate
├─ No-show rate
├─ Payment success rate
└─ Average booking lead time

Technical Metrics:
├─ calculateAvailability() latency (p50, p95, p99)
├─ Overlap validation latency
├─ Reservation creation latency (end-to-end)
├─ Database transaction times
├─ Cache hit rate (availability cache)
├─ Lock acquisition success rate (Redis)
├─ Stripe API latency
├─ Webhook processing latency
└─ Error rate by endpoint

Alerts:
├─ Booking creation error rate > 5%
├─ Availability calculation latency p99 > 200ms
├─ Stripe payment success rate < 95%
├─ Database query latency spike
└─ Webhook backlog growing
```

---

## 12. Trust System Integration (V1 Contract)

### 12.0 Alignment with TRUST_SYSTEM.md (Strict Separation)

```
BOOKING ENGINE RESPONSIBILITIES (Only):
├─ Slot validation (availability, no overlaps)
├─ Reservation creation (atomic transaction)
├─ Policy application (gating based on trust score)
├─ Status transitions (CONFIRMED, AWAITING_*, etc.)
└─ Refund logic (per professional's cancellation policy)

TRUST SYSTEM RESPONSIBILITIES (Only):
├─ Score calculation (from events)
├─ Event logging (AFTER booking completion/no-show)
├─ Threshold enforcement (70 = professional's threshold, V1 fixed)
├─ Decay over time (180-day memory)
└─ Recovery paths (positive behavior improves score)

STRICT SEPARATION (Not to Cross):
├─ Booking Engine NEVER modifies trust scores
├─ Booking Engine NEVER reads detailed trust history
├─ Booking Engine only reads: current_trust_score (scalar)
├─ Trust System NEVER creates reservations
├─ Trust System NEVER decides on refunds
├─ Trust System NEVER enforces timelines
```

### 12.1 When Trust Events Are Created

```
Trust Events Created AFTER Booking Completion:

booking_completed:
├─ Trigger: Professional marks reservation.status = COMPLETED
├─ Impact: +2 points to client's trust score
└─ Timing: Same transaction as status update

no_show:
├─ Trigger: Professional marks reservation.status = NO_SHOW
├─ Impact: -8 points to client's trust score
└─ Timing: Same transaction as status update

cancellation_0_24h:
├─ Trigger: Client or pro cancels < 24h before service time
├─ Impact: -5 points if client, -0 if pro (pro has other reasons)
└─ Timing: Same transaction as cancellation

cancellation_24h_plus:
├─ Trigger: Client or pro cancels >= 24h before service time
├─ Impact: -2 points if client (responsible cancellation), -0 if pro
└─ Timing: Same transaction as cancellation

booking_confirmed (Optional Signal):
├─ Trigger: Reservation reaches CONFIRMED status
├─ Impact: +1 point (shows client pays/commits)
└─ Timing: Same transaction as status change

on_time_arrival (V2+):
├─ Note: NOT implemented in V1
├─ V1 timing: No check-in system yet
└─ V2: Will be added when check-in exists
```

### 12.2 What Booking Engine Does NOT Do

```
NEVER (Even if Requested):
├─ Apply complex conditional rules based on trust
│  (e.g., "Require deposit AND manual approval if score < 50")
├─ Apply multiple policies per professional simultaneously
├─ Automatically impose sanctions (suspension, blacklist)
├─ Show professional the client's score or category
├─ Show client their own score
├─ Modify trust scores directly
├─ Implement scoring algorithms
├─ Track detailed trust history
└─ Make decisions beyond the 4 acceptance policies
```

---

## 13. Scope Explicitement Hors de V1

### 13.1 Advanced Scoring & Conditional Rules

**Not Supported V1:** Complex trust-based rules beyond 4 policies

```
NOT SUPPORTED:
├─ Professional custom thresholds (always 70 in V1)
├─ Multiple simultaneous policies
├─ Conditional rules ("If score < 50 AND it's Tuesday, require deposit")
├─ Score visibility dashboard for professionals
├─ Score visibility for clients
├─ Professional manual override of trust decisions
├─ Custom penalty amounts per professional
├─ Behavioral coaching or improvement suggestions
├─ Scoring adjustments based on seasonal factors
└─ AI-powered risk prediction

FUTURE (V2+):
├─ Custom thresholds per professional
├─ Conditional logic engine
├─ Client-facing score dashboard
├─ Appeals process for disputed events
└─ Machine learning on booking patterns
```

### 13.2 Automatic Sanctions

**Not Supported V1:** Automatic suspension or bans

```
NOT SUPPORTED:
├─ Automatic account suspension for low scores
├─ Auto-blacklisting (permanent or temporary)
├─ Automatic blocking from specific professionals
├─ Automatic refund holds for high-risk clients
└─ Automatic booking rejections without policy

ONLY ALLOWED (V1):
├─ Professional applies one of 4 policies
├─ Admin manual suspension (with audit trail)
├─ System auto-decline after timeout (6h approval, 24h deposit)
└─ System marks no-show (professional-triggered)

FUTURE (V2+):
├─ Graduated warnings to low-trust clients
├─ Temporary "probation" status
├─ Recommended actions to improve trust
└─ Professional guidelines for high-risk scenarios
```

### 13.3 Global Payment Requirements

**Not Supported V1:** Mandatory payments without exception

```
NOT SUPPORTED:
├─ All bookings require payment (even trusted clients)
├─ Stripe integration is mandatory
├─ Insurance or compensation for cancellations
├─ Automatic refund holds pending review
└─ Payment guarantees from platform

ACTUALLY SUPPORTED:
├─ Optional payments via deposit policies
├─ Professional-controlled deposit amounts
├─ Deposit only for low-trust clients (if policy chosen)
├─ Stripe integration is completely optional
└─ No platform refund guarantees (professional's policy rules)
```

### 13.4 Advanced Booking Features

**Not Supported V1:** Complex booking workflows

```
NOT SUPPORTED:
├─ Reschedule (move booking to different time)
├─ Waitlist or queue when fully booked
├─ Group bookings (one reservation for multiple people)
├─ Multi-professional team bookings
├─ Bundle bookings (discount for multiple services)
├─ Recurring bookings (series of appointments)
├─ Booking options (hold slot without paying)
├─ Transfer bookings to different client
└─ Professional-to-professional delegation

WORKAROUND:
├─ Cancel + rebook for reschedule
├─ Separate bookings for each person
├─ Separate bookings for each professional
└─ Manual pro-to-pro coordination
```

### 13.5 Dynamic Pricing & Promotions

**Not Supported V1:** Variable pricing

```
NOT SUPPORTED:
├─ Time-based pricing (peak vs. off-peak)
├─ Demand-based dynamic pricing
├─ Flash sales or limited-time discounts
├─ Professional referral bonuses
├─ Loyalty programs
├─ Volume discounts for multiple bookings
├─ Seasonal pricing adjustments
└─ Early-bird discounts

FIXED PRICES ONLY:
├─ Service.price_cents is immutable per professional
├─ No dynamic pricing
├─ Snapshots prevent price changes mid-booking
└─ All clients pay same price for same service
```

---

---

## 14. Contrat de Test Obligatoire (Before Go-Live)

### 14.1 Unit Tests (Booking Engine Logic)

**Test Suite: BookingEngine**

```
Category: Availability Calculation
├─ Test: Empty professional (no schedule) → No slots
├─ Test: Professional works 09:00-18:00 → Correct 15-min slot grid
├─ Test: Service 60 min with 15 min buffer → Correct end time
├─ Test: Service 60 min, 2 existing reservations → Blocked slots correct
├─ Test: Service longer than available window → No slots
├─ Test: Granularity 15 min → No slots at 10:07 (must be 15-min boundary)
├─ Test: Timezone conversion: 14:00 Jerusalem → correct UTC time
├─ Test: DST transition (Mar 31) → Correct UTC despite offset change
├─ Test: Slot at boundary (09:00-10:00, pro ends 10:00) → Included
└─ Test: Slot past boundary (17:00-18:00, pro ends 17:45) → Excluded (no buffer room)

Category: Overlap Detection
├─ Test: No overlaps → Slot available
├─ Test: Exact overlap (same start/end) → Blocked
├─ Test: Partial overlap (starts before, ends inside) → Blocked
├─ Test: Partial overlap (starts inside, ends after) → Blocked
├─ Test: Complete overlap (contains existing) → Blocked
├─ Test: Buffer overlap → Blocked (service + buffer collides)
├─ Test: Cancelled reservations ignored → Slots freed
└─ Test: Different professional → No collision

Category: Refund Calculation
├─ Test: Standard policy, >24h before → 100% refund
├─ Test: Standard policy, 12h before → 80% refund
├─ Test: Standard policy, <2h before → 0% refund
├─ Test: Flexible policy, any time → 100% refund
├─ Test: Strict policy, any time → 0% refund
└─ Test: Refund amount in cents, no rounding errors

Category: Edge Cases
├─ Test: DST spring forward → Availability still correct
├─ Test: DST fall back → No double-time issues
├─ Test: Leap year date → No off-by-one errors
├─ Test: Professional in one timezone, client in another → Correct times
└─ Test: Service exactly equal to window → Fits
```

### 14.2 Integration Tests (Full Transaction)

**Test Suite: Booking Creation**

```
Happy Path:
├─ Test: Complete booking flow → Reservation + Payment created
├─ Test: Status transitions PENDING_PAYMENT → CONFIRMED after payment
├─ Test: Slot is no longer available after booking
├─ Test: Audit log entry created
└─ Test: Client + Pro receive notification jobs queued

Concurrency:
├─ Test: Two concurrent bookings same slot → Second gets 409
├─ Test: Concurrent bookings different slots → Both succeed
├─ Test: Redis lock prevents double-booking (if implemented)
├─ Test: UNIQUE constraint catches overlaps if lock fails
└─ Test: Stress test: 100 concurrent requests → 1 succeeds, 99 fail gracefully

Idempotency:
├─ Test: Same request twice (same idempotency key) → Same response
├─ Test: Retry after 5 seconds → Correct error (already booked)
├─ Test: Webhook arrives twice → Idempotent, no double-confirmation

Failure Cases:
├─ Test: Payment API fails → Reservation ROLLBACK, clean state
├─ Test: Database constraint violation → Proper error message
├─ Test: Invalid service_id → 404 error, no booking created
├─ Test: Client = Professional → 422 error (self-booking forbidden)
├─ Test: Slot in past → 400 error (can't book past)
└─ Test: Slot doesn't match service duration → 400 error

Cancellation:
├─ Test: Cancel as client → Status = CANCELLED_BY_CLIENT, refund issued
├─ Test: Cancel as pro → Status = CANCELLED_BY_PRO, 100% refund
├─ Test: Cancel too late (< 2h) → Correct refund percentage
├─ Test: Refund status updated on webhook → Payment SUCCEEDED
└─ Test: No refund if <2h → Correct amount (0 cents)
```

### 14.3 DST Tests (Mandatory)

```
DST Transition Dates (Israel 2025):
├─ March 31: UTC+2 → UTC+3 (spring forward, 02:00 → 03:00)
└─ October 26: UTC+3 → UTC+2 (fall back, 03:00 → 02:00)

Test Cases:
├─ Booking on Mar 31, during transition hour (01:59-03:01 local)
│  └─ Expected: Correct UTC times, no off-by-one errors
├─ Recurring professional schedule spanning transition
│  └─ Expected: Correct availability despite offset change
├─ Payment webhook during transition (timestamp in non-existent hour)
│  └─ Expected: Handled correctly by library
├─ Client in UTC+0, Pro in UTC+3, booking during transition
│  └─ Expected: Timezones converted correctly
└─ Query for Oct 26 availability (fall-back date)
   └─ Expected: No time duplication, no gaps
```

### 14.4 Performance Tests

```
Load Test Setup:
├─ 100 concurrent users
├─ Each: GET /availability, then POST /reservations
├─ Measure latency, error rates

Acceptance Criteria:
├─ calculateAvailability() p99 < 100ms
├─ Reservation creation p95 < 500ms
├─ No errors due to overload (graceful degradation)
├─ Database response time stable (no queries >1s)
└─ Stripe API integration < 2s (p95)
```

### 14.5 Chaos Testing (Failure Injection)

```
Simulated Failures:
├─ Database timeout mid-transaction
│  └─ Expected: ROLLBACK, clean state, retry succeeds
├─ Stripe API unavailable (return 500)
│  └─ Expected: Graceful error, retry queue scheduled
├─ Redis down (lock unavailable)
│  └─ Expected: Booking proceeds (layer 2: DB constraint catches overlaps)
├─ Webhook lost (payment not confirmed)
│  └─ Expected: Cleanup job fixes state within N minutes
└─ Clock skew (server time jumps backward)
   └─ Expected: No timestamp bugs, idempotency saves the day
```

---

## 15. Reference pour l'Implémentation

### 15.1 Fonctions à Implémenter

```
Core Functions:
├─ calculateAvailability(professional_id, date, service_id, client_tz, pro_tz)
│  └─ Returns: [{start_utc, end_utc, display_local}, ...]
├─ validateNoOverlap(professional_id, start_time_utc, end_time_utc)
│  └─ Returns: Boolean (true = no overlap, safe to book)
├─ createReservation(client_id, professional_id, service_id, start_utc, end_utc)
│  └─ Returns: Reservation object or Error
├─ confirmReservation(reservation_id, stripe_payment_intent_status)
│  └─ Returns: Reservation with status = CONFIRMED
├─ cancelReservation(reservation_id, cancelled_by_role)
│  └─ Returns: Reservation with status = CANCELLED_*
├─ calculateRefundAmount(reservation, cancellation_policy)
│  └─ Returns: Integer (cents)
└─ updateReservationStatus(reservation_id, new_status)
   └─ Returns: Updated Reservation with audit log

Helper Functions:
├─ TimeZoneService.zonedTimeToUtc(local_time, timezone)
├─ TimeZoneService.utcToZonedTime(utc_time, timezone)
├─ doesOverlap(slot1_start, slot1_end, slot2_start, slot2_end)
│  └─ Returns: Boolean
├─ getBufferedEnd(end_time, buffer_minutes)
│  └─ Returns: end_time + buffer (UTC)
├─ isWithinProfessionalSchedule(professional_id, date, time_utc)
│  └─ Returns: Boolean
└─ getProfessionalScheduleForDate(professional_id, date)
   └─ Returns: {start_time_utc, end_time_utc} or NULL
```

### 15.2 Database Queries (Critical Path)

```
Query 1: Get Professional Schedule
SELECT * FROM professional_schedules
WHERE professional_id = $1
AND day_of_week = $2
AND is_available = TRUE
AND deleted_at IS NULL

Expected Index: (professional_id, day_of_week, is_available)

Query 2: Check Overlaps (Before Insert)
SELECT COUNT(*) FROM reservations
WHERE professional_id = $1
AND start_time < $3  (requested_end)
AND end_time > $2    (requested_start)
AND status NOT IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO', 'NO_SHOW')

Expected Index: UNIQUE (professional_id, start_time, end_time) WHERE status ...

Query 3: Get Client's Reservations
SELECT * FROM reservations
WHERE client_id = $1
ORDER BY start_time DESC
LIMIT 20

Expected Index: (client_id, start_time)

Query 4: Get Payment for Reservation
SELECT * FROM payments
WHERE reservation_id = $1

Expected Index: UNIQUE (reservation_id)

Query 5: Check Duplicates (Idempotency)
SELECT id FROM reservations
WHERE professional_id = $1
AND start_time = $2
AND end_time = $3
AND status NOT IN ('CANCELLED_*')

Expected: UNIQUE constraint prevents duplicates
```

---

## 16. Change Log & Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | May 18, 2026 | Initial release, FROZEN for V1 |

---

## 17. Conclusion - V1 FINAL SPECIFICATION (LOCKED)

### 17.1 Functional Contract for Implementation

**This document is the FROZEN, CANONICAL specification for Booking Engine V1.**

It defines with NO AMBIGUITY:

**What the system MUST do:**
- Validate availability (no overlaps, respect professional schedule)
- Create reservations atomically with immutable snapshots
- Apply professional acceptance policies (4 fixed enum options)
- Evaluate trust scores invisibly (no score visibility to users)
- Manage reservation states through defined transitions
- Handle refunds per professional cancellation policy

**How it MUST do it:**
1. Validate slot (availability calculation, no overlaps)
2. Read professional's acceptance policy (OPEN, FILTER_LOW_TRUST, REQUIRE_MANUAL_CONFIRMATION, REQUIRE_DEPOSIT_FOR_LOW_TRUST)
3. Evaluate client trust score (opaque, platform-side only)
4. Decide final status (CONFIRMED, AWAITING_CONFIRMATION, AWAITING_DEPOSIT)
5. Create reservation atomically (all-or-nothing transaction)
6. Handle payment only if deposit policy triggered
7. Create audit trail for compliance

**What the system MUST NOT do:**
- Require payment globally (payment optional, configurable only)
- Modify trust scores (Trust System owns this)
- Show scores to professionals or clients
- Apply multiple simultaneous policies
- Implement complex conditional rules
- Support reschedule, group bookings, waitlists (V2+)
- Integrate Stripe unless deposit policies used

**How to verify it works:**
- Unit tests: Availability calculation, overlap detection, refund math
- Integration tests: Full booking flows, concurrency, idempotency
- DST tests: Timezone edge cases (mandatory)
- Performance tests: <100ms availability, <500ms booking creation
- Chaos tests: Failure injection, recovery

### 17.2 Trust System Alignment (Strict Contract)

**Booking Engine and Trust System are SEPARATE systems:**

Booking Engine:
- Slot validation
- Reservation creation & state transitions
- Policy application (4 fixed options)
- Refund logic

Trust System:
- Score calculation
- Event logging (AFTER booking completion)
- Threshold enforcement (70 = fixed V1 threshold)
- Recovery paths

**No crossing of boundaries.** Booking Engine does NOT create trust events, modify scores, or implement scoring logic.

### 17.3 Payment is NOT Mandatory in V1

**CRITICAL:**
- Payment is NEVER required by default
- Stripe integration is completely OPTIONAL
- Booking Engine functions fully without payment
- Deposit is one option under REQUIRE_DEPOSIT_FOR_LOW_TRUST policy
- Payment required ONLY if:
  - Professional chooses REQUIRE_DEPOSIT_FOR_LOW_TRUST policy
  - AND client has trust_score < 70
  - AND client submits the deposit

All other flows = NO PAYMENT.

### 17.4 Reservation Status Enum (V1 LOCKED)

```
CONFIRMED                    (Booking ready for service)
AWAITING_CONFIRMATION        (Pending professional approval)
AWAITING_DEPOSIT             (Pending client payment of deposit)
COMPLETED                    (Service delivered)
NO_SHOW                      (Client didn't show)
CANCELLED_BY_CLIENT          (Client cancelled)
CANCELLED_BY_PROFESSIONAL    (Professional cancelled)
DECLINED_BY_PROFESSIONAL     (Professional rejected)
```

**NO OTHER STATUSES ALLOWED. PERIOD.**

### 17.5 Acceptance Policies (V1 LOCKED Enum)

```
OPEN                                 (All bookings accepted immediately)
FILTER_LOW_TRUST                     (Accept only score >= 70, reject others silently)
REQUIRE_MANUAL_CONFIRMATION          (All bookings pending approval)
REQUIRE_DEPOSIT_FOR_LOW_TRUST        (Deposit required for score < 70)
```

**NO OTHER POLICIES ALLOWED. NO CUSTOM THRESHOLDS IN V1.**

### 17.6 What's Out of Scope V1 (Explicitly)

❌ Scoring algorithms beyond simple rules
❌ Conditional policies (e.g., "deposit AND manual approval if score < 50")
❌ Multiple simultaneous policies per professional
❌ Custom thresholds (always 70 in V1)
❌ Automatic sanctions (suspension, blacklist, except admin manual)
❌ Complex booking features (reschedule, groups, waitlist)
❌ Dynamic pricing, flash sales, promotions
❌ Multi-professional bookings
❌ Score visibility to users
❌ Appeals process for clients

**ALL OF THE ABOVE ARE V2+ ONLY.**

---

## Status: ✅ VERSION 1.0 LOCKED FOR PRODUCTION

**Effective Date:** May 19, 2026

**No deviations from this specification without explicit written team approval.**

**This document supersedes all prior versions. Implement with confidence.**

**Questions? Reference this document. It is the source of truth for V1.**

---

**Document prepared by:** Platform Architecture Team  
**Last review:** May 19, 2026  
**Classification:** Core System Specification - Binding Contract for Implementation

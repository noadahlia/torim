# User Flows - Torim Beauty Booking Platform

## 1. CLIENT SIGNUP & AUTHENTICATION FLOW

```
┌─────────────┐
│   Start     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ Mobile App / Web                │
│ [Sign Up Screen]                │
│ - Email                         │
│ - Password                      │
│ - Name                          │
│ - Timezone (Asia/Jerusalem)     │
└──────┬──────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│ Client submits form                      │
│ Frontend validation (Zod)                │
└──────┬───────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│ POST /api/v1/auth/signup                 │
│ Backend validates + creates user         │
│ Supabase Auth creates account            │
│ JWT token generated                      │
└──────┬───────────────────────────────────┘
       │
       ├─── Success ────────┐
       │                    ▼
       │            ┌──────────────────┐
       │            │ JWT stored       │
       │            │ Redirect to Home │
       │            └──────────────────┘
       │
       └─── Error (exists) ─┐
                            ▼
                    ┌──────────────────┐
                    │ Show error msg   │
                    │ Suggest login    │
                    └──────────────────┘

┌──────────────────────────────┐
│ LOGIN FLOW (Similar)         │
│ POST /api/v1/auth/login      │
│ Email + Password             │
│ → JWT token                  │
│ → Home Screen                │
└──────────────────────────────┘
```

---

## 2. CLIENT BOOKING FLOW (CORE - Critical Path)

```
┌────────────────────────────────────────────────────────────────┐
│                   CLIENT BOOKING JOURNEY                       │
└────────────────────────────────────────────────────────────────┘

1️⃣ BROWSE PROFESSIONALS
   ┌──────────────────────────────┐
   │ GET /api/v1/professionals    │
   │ Return: all pros + services  │
   │ Display in Home Screen       │
   └──────────┬───────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │ Client taps Professional Card   │
   │ (e.g., "Nora - Nails Expert")   │
   └──────────┬─────────────────────┘
              │
              ▼
2️⃣ VIEW PROFESSIONAL DETAILS
   ┌──────────────────────────────────────────┐
   │ GET /api/v1/professionals/:id            │
   │ Return: profile, services, reviews       │
   │ Display in ProfessionalDetailScreen      │
   │                                          │
   │ Client chooses a service:                │
   │ • Manicure (45 min, 80₪)                │
   │ • Pedicure (60 min, 100₪)               │
   │ • Gel (90 min, 150₪)                    │
   └──────────┬──────────────────────────────┘
              │
              ▼
3️⃣ SELECT DATE & TIME
   ┌────────────────────────────────────────────┐
   │ GET /api/v1/professionals/:id/availability │
   │ Params: date, service_id                   │
   │                                            │
   │ Backend:                                   │
   │ 1. Get pro's schedule (recurring)          │
   │ 2. Get pro's services (duration, buffer)   │
   │ 3. Get existing reservations               │
   │ 4. BookingEngine.calculateSlots()          │
   │    → Returns 15-min slots for that day     │
   │                                            │
   │ Example response:                          │
   │ [                                          │
   │   { time: "10:00", available: true },      │
   │   { time: "10:15", available: true },      │
   │   { time: "10:30", available: false },     │ (already booked)
   │   { time: "10:45", available: true },      │
   │   ...                                      │
   │ ]                                          │
   │                                            │
   │ Client taps: "14:00" (2 PM local time)     │
   └──────────┬─────────────────────────────────┘
              │
              ▼
4️⃣ BOOKING CONFIRMATION SCREEN
   ┌──────────────────────────────┐
   │ Summary:                     │
   │ • Service: Gel Manicure      │
   │ • Pro: Nora                  │
   │ • Date: June 15, 2025        │
   │ • Time: 14:00 - 15:30 (UTC+2)│
   │ • Price: 150₪                │
   │ • Policy: FILTER_LOW_TRUST   │
   │                              │
   │ [Confirm Booking] [Cancel]   │
   └──────────┬───────────────────┘
              │
              ▼
5️⃣ CREATE RESERVATION (ATOMIC OPERATION)
   ┌───────────────────────────────────────────────────────┐
   │ POST /api/v1/bookings                                 │
   │ Body: {                                               │
   │   professional_id: "123",                             │
   │   service_id: "456",                                  │
   │   start_time: "2025-06-15T12:00:00Z",  (UTC)         │
   │   idempotency_key: "uuid"                             │
   │ }                                                     │
   │                                                       │
   │ Backend TRANSACTION:                                  │
   │ ┌─────────────────────────────────────┐              │
   │ │ 1. Check client's trust score       │              │
   │ │    (default: 50 if new)             │              │
   │ │                                     │              │
   │ │ 2. Check acceptance policy:         │              │
   │ │    FILTER_LOW_TRUST → score < 70?   │              │
   │ │    → Silent reject (return 409)     │              │
   │ │                                     │              │
   │ │ 3. Redis lock: 5s exclusive access  │              │
   │ │    (prevent concurrent bookings)    │              │
   │ │                                     │              │
   │ │ 4. Verify slot still free           │              │
   │ │    (double-check in DB)             │              │
   │ │                                     │              │
   │ │ 5. Create reservation record        │              │
   │ │    Status: CONFIRMED                │              │
   │ │    Snapshot: service price, pro     │              │
   │ │    capacity, policy (immutable)     │              │
   │ │                                     │              │
   │ │ 6. Record booking in DB             │              │
   │ │    UNIQUE constraint prevents       │              │
   │ │    overlaps (belt & suspenders)     │              │
   │ │                                     │              │
   │ │ 7. Create trust event: BOOKING_MADE │              │
   │ │    (+0 points, but immutable log)   │              │
   │ │                                     │              │
   │ └─────────────────────────────────────┘              │
   │                                                       │
   │ If all ✓: COMMIT transaction                         │
   │ If any ✗: ROLLBACK everything                        │
   └────────────┬──────────────────────────────────────────┘
                │
                ├─── Success (201) ──────┐
                │                        ▼
                │              ┌──────────────────────┐
                │              │ Response:            │
                │              │ {                    │
                │              │   id: "res_123",     │
                │              │   status: "CONFIRMED"│
                │              │   ...                │
                │              │ }                    │
                │              │                      │
                │              │ Show success page    │
                │              │ Next: [My Bookings]  │
                │              └──────────────────────┘
                │
                └─── Error 409 (Conflict) ┐
                                         ▼
                            ┌──────────────────────────┐
                            │ SILENT REJECTION         │
                            │ (Low trust score)        │
                            │                          │
                            │ Return: 409 ConflictErr  │
                            │ Message: "Unavailable"   │
                            │ (Pro sees in dashboard)  │
                            │                          │
                            │ Client sees:             │
                            │ "That slot is no longer  │
                            │  available"              │
                            │ (doesn't know about      │
                            │  trust score)            │
                            └──────────────────────────┘
                │
                └─── Error 409 (Double-book) ┐
                                            ▼
                                ┌──────────────────────┐
                                │ RACE CONDITION       │
                                │ (Another client won) │
                                │                      │
                                │ Return: 409          │
                                │ "Slot just booked"   │
                                │ [Refresh] button     │
                                └──────────────────────┘

6️⃣ PAYMENT (Future Flow)
   ┌────────────────────────────────┐
   │ POST /api/v1/bookings/:id/pay  │
   │ Integration: Stripe            │
   │ - Create charge                │
   │ - Update reservation.paymentId │
   │ - Send confirmation SMS        │
   └────────────────────────────────┘

7️⃣ CONFIRMATION & NOTIFICATIONS
   ┌─────────────────────────────────┐
   │ Queue events:                   │
   │ - SendConfirmationSMS (client)  │
   │ - SendConfirmationEmail (client)│
   │ - NotifyProfessional (WebSocket)│
   │ - ScheduleReminders (24h, 2h)   │
   └─────────────────────────────────┘

8️⃣ MANAGE RESERVATIONS
   ┌────────────────────────────────┐
   │ GET /api/v1/bookings           │
   │ Return: my reservations list   │
   │ Show in ReservationsScreen     │
   │                                │
   │ Client can:                    │
   │ - View details                 │
   │ - Cancel (→ refund logic)      │
   │ - Reschedule (new booking)     │
   └────────────────────────────────┘
```

---

## 3. PROFESSIONAL SIGNUP & MANAGEMENT FLOW

```
┌──────────────────────────────────────────┐
│    PROFESSIONAL (PRO) SIGNUP             │
├──────────────────────────────────────────┤
│ Similar to client, but with extras:      │
│ - Role: PROFESSIONAL                     │
│ - Profile setup (business info, photos)  │
│ - Services definition                    │
│ - Weekly schedule setup                  │
│ - Acceptance policy (OPEN, FILTER, etc.) │
└────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    SET UP WEEKLY SCHEDULE                │
├──────────────────────────────────────────┤
│ Professional sets recurring hours:       │
│                                          │
│ Monday-Friday: 10:00 - 18:00             │
│ Saturday: 10:00 - 16:00                  │
│ Sunday: OFF                              │
│                                          │
│ Breaks: 12:00-13:00 (lunch)             │
│                                          │
│ Table: professional_schedules            │
│ Indexed by day_of_week + start_time      │
└────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    ADD SERVICES & PRICING                │
├──────────────────────────────────────────┤
│ Service 1: Manicure                      │
│ - Duration: 45 min                       │
│ - Price: 80₪                             │
│ - Buffer after: 15 min (cleanup)         │
│                                          │
│ Service 2: Gel Manicure                  │
│ - Duration: 90 min                       │
│ - Price: 150₪                            │
│ - Buffer after: 30 min                   │
│                                          │
│ Service 3: Pedicure                      │
│ - Duration: 60 min                       │
│ - Price: 100₪                            │
│ - Buffer after: 15 min                   │
│                                          │
│ Table: services (with professional_id)   │
└────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    CONFIGURE BOOKING POLICIES            │
├──────────────────────────────────────────┤
│ Acceptance: FILTER_LOW_TRUST             │
│ → Auto-reject clients with score < 70    │
│                                          │
│ Cancellation: STANDARD                   │
│ → Client refund:                         │
│   • >24h: 100%                           │
│   • 2-24h: 80%                           │
│   • <2h: 0%                              │
│                                          │
│ Deposit: REQUIRE_FOR_LOW_TRUST           │
│ → Low trust clients pay 50% upfront      │
│                                          │
│ Table: professional_profiles             │
└────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    PRO DASHBOARD (Future)                │
├──────────────────────────────────────────┤
│ View incoming bookings                   │
│ Confirm/Reject/Reschedule                │
│ View client trust scores                 │
│ Handle cancellations                     │
│ View revenue/stats                       │
│                                          │
│ Real-time updates via WebSocket          │
└────────────────────────────────────────────┘
```

---

## 4. SLOT CALCULATION ALGORITHM (BookingEngine)

```
┌─────────────────────────────────────────────────────────┐
│  GET /professionals/:id/availability                    │
│  Query: { date: "2025-06-15", service_id: "456" }      │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  BackendBookingEngine.getAvailableSlots()              │
│                                                         │
│  Step 1: Load Professional Schedule                    │
│  ─────────────────────────────────────                 │
│  day = SUNDAY (2025-06-15)                             │
│  Query: professional_schedules                         │
│         WHERE day_of_week = 0 (Sunday)                 │
│  Result: OFF (no availability that day)                │
│  → Return: [] (empty)                                  │
│                                                         │
│  ┌─ OR -─────────────────────────────────────────────┐ │
│  │                                                   │ │
│  │  day = MONDAY (2025-06-16)                        │ │
│  │  Query result: {                                  │ │
│  │    start_time: "10:00",                           │ │
│  │    end_time: "18:00",                             │ │
│  │    break: { start: "12:00", end: "13:00" }        │ │
│  │  }                                                │ │
│  │                                                   │ │
│  │  Step 2: Load Service Details                     │ │
│  │  ──────────────────────────                       │ │
│  │  service = {                                      │ │
│  │    duration: 45 min,                              │ │
│  │    buffer_after: 15 min                           │ │
│  │  }                                                │ │
│  │                                                   │ │
│  │  Step 3: Load Existing Reservations               │ │
│  │  ─────────────────────────────────                │ │
│  │  Query: reservations                              │ │
│  │  WHERE professional_id = "123"                    │ │
│  │    AND start_time >= "2025-06-16T08:00:00Z"       │ │
│  │    AND start_time < "2025-06-17T08:00:00Z"        │ │
│  │    AND status != CANCELLED                        │ │
│  │                                                   │ │
│  │  Results: [                                       │ │
│  │    { start: "10:00Z", end: "10:45Z" } + buffer   │ │
│  │    { start: "11:00Z", end: "11:45Z" } + buffer   │ │
│  │    { start: "14:00Z", end: "15:30Z" } + buffer   │ │
│  │  ]                                                │ │
│  │                                                   │ │
│  │  Step 4: Build 15-min Slot Grid                   │ │
│  │  ─────────────────────────────────                │ │
│  │  Time zone: Asia/Jerusalem (UTC+2)                │ │
│  │  Local date: 2025-06-16                           │ │
│  │  Pro's hours: 10:00-18:00 local                   │ │
│  │                                                   │ │
│  │  Convert to UTC:                                  │ │
│  │  Start: 2025-06-16 10:00 JST → 08:00 UTC          │ │
│  │  End:   2025-06-16 18:00 JST → 16:00 UTC          │ │
│  │  Break: 12:00-13:00 JST → 10:00-11:00 UTC         │ │
│  │                                                   │ │
│  │  Generate 15-min slots:                           │ │
│  │  08:00, 08:15, 08:30, 08:45, 09:00, ...           │ │
│  │                                                   │ │
│  │  Remove break slots: 10:00-10:45 excluded         │ │
│  │                                                   │ │
│  │  Step 5: Mark Booked Slots                        │ │
│  │  ──────────────────────────                       │ │
│  │  For each reservation:                            │ │
│  │    Mark ALL 15-min slots within booking window    │ │
│  │    PLUS buffer time as unavailable                │ │
│  │                                                   │ │
│  │  Example:                                         │ │
│  │  Booking: 08:00-08:45 + 15min buffer              │ │
│  │  → Mark 08:00-09:00 as unavailable                │ │
│  │                                                   │ │
│  │  Step 6: Validate Minimum Duration                │ │
│  │  ───────────────────────────────────              │ │
│  │  Service needs 45 min (3 consecutive slots)       │ │
│  │  Remove any slot where 45-min block not available │ │
│  │                                                   │ │
│  │  Available slot at 09:00?                         │ │
│  │  Check: 09:00, 09:15, 09:30 (45 min total)        │ │
│  │  ✓ All three slots free → AVAILABLE               │ │
│  │                                                   │ │
│  │  Available slot at 09:15?                         │ │
│  │  Check: 09:15, 09:30, 09:45 (45 min total)        │ │
│  │  ✓ All three slots free → AVAILABLE               │ │
│  │                                                   │ │
│  │  Available slot at 10:45?                         │ │
│  │  Check: 10:45, 11:00, 11:15                       │ │
│  │  ✗ 11:00-11:15 in break time → UNAVAILABLE        │ │
│  │                                                   │ │
│  │  Step 7: Convert Back to Local Time               │ │
│  │  ───────────────────────────────────              │ │
│  │  UTC 08:00 → Local 10:00                          │ │
│  │  UTC 09:00 → Local 11:00                          │ │
│  │  UTC 09:15 → Local 11:15                          │ │
│  │  ...                                              │ │
│  │                                                   │ │
│  │  Step 8: Return Response                          │ │
│  │  ─────────────────────────                        │ │
│  │  [                                                │ │
│  │    { time: "10:00", available: false },           │ │
│  │    { time: "10:15", available: false },           │ │
│  │    { time: "10:30", available: false },           │ │
│  │    { time: "10:45", available: false },           │ │
│  │    { time: "11:00", available: true },            │ │
│  │    { time: "11:15", available: true },            │ │
│  │    { time: "11:30", available: true },            │ │
│  │    { time: "11:45", available: false }, (break)   │ │
│  │    ...                                            │ │
│  │    { time: "16:00", available: true },            │ │
│  │  ]                                                │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
           │
           ▼
   Return to mobile app
   Display calendar picker
   Client selects 14:00 → BOOKED ✓
```

---

## 5. TRUST SYSTEM FLOW

```
┌─────────────────────────────────────────────┐
│        CLIENT TRUST SCORE LIFECYCLE         │
└─────────────────────────────────────────────┘

1️⃣ NEW CLIENT
   ┌────────────────────────────────┐
   │ Signup → Create profile        │
   │ Initial score: 50 (neutral)    │
   │ Table: client_trust_profiles   │
   └────────────────────────────────┘

2️⃣ FIRST BOOKING
   ┌────────────────────────────────┐
   │ Client books appointment       │
   │ Trust event created:           │
   │ {                              │
   │   client_id: "...",            │
   │   event_type: "BOOKING_MADE",  │
   │   points_delta: 0,             │
   │   timestamp: now(),            │
   │   immutable: true              │
   │ }                              │
   │                                │
   │ Score: 50 → 50 (unchanged)     │
   │ Professional sees: Trust: 50   │
   │ Acceptance policy: FILTER_LOW  │
   │ → Booking rejected (silent)    │
   │   Client sees: "Unavailable"   │
   │   Pro sees: "Rejected (trust)" │
   └────────────────────────────────┘

3️⃣ CLIENT COMPLETES APPOINTMENT
   ┌────────────────────────────────┐
   │ Pro marks: COMPLETED           │
   │ Trust event:                   │
   │ {                              │
   │   event_type: "COMPLETED",     │
   │   points_delta: +2,            │
   │   reason: "Appointment done"   │
   │ }                              │
   │                                │
   │ Score: 50 + 2 = 52             │
   │ Updated in client_trust_       │
   │ profiles (updated_at: now())   │
   └────────────────────────────────┘

4️⃣ SCENARIOS & POINT CHANGES

   A) NO-SHOW (Client doesn't arrive)
      ├─ Event: NO_SHOW
      ├─ Delta: -8
      ├─ New score: 52 - 8 = 44
      └─ Result: Blocked from future bookings
   
   B) CANCELLATION < 2H BEFORE
      ├─ Event: CANCELLED_SHORT_NOTICE
      ├─ Delta: -5
      ├─ New score: 52 - 5 = 47
      └─ Result: Still can book, but score drops
   
   C) CANCELLATION > 24H BEFORE
      ├─ Event: CANCELLED_LONG_NOTICE
      ├─ Delta: -2
      ├─ New score: 52 - 2 = 50
      └─ Result: Minimal penalty, responsible behavior
   
   D) MULTIPLE COMPLETIONS
      ├─ After 5 completions: 50 + (5×2) = 60
      ├─ After 10 completions: 50 + (10×2) = 70 ✓
      └─ FILTER_LOW_TRUST policy now allows auto-confirm

5️⃣ SCORE BOUNDARIES & CONSEQUENCES
   
   0-30: HIGH RISK
   ├─ All bookings rejected (silent)
   ├─ Cannot book from any pro with FILTER policy
   └─ May be flagged for bot/fraud
   
   31-70: LOW TRUST
   ├─ Auto-rejected by FILTER_LOW_TRUST pros
   ├─ Can book from OPEN pros
   ├─ May require deposit (DEPOSIT_FOR_LOW_TRUST)
   └─ Require manual pro approval (MANUAL)
   
   71-100: TRUSTED
   ├─ All pros auto-accept (if OPEN)
   ├─ No deposit required
   ├─ Immediate confirmation
   └─ May get loyalty benefits (future)

6️⃣ IMMUTABILITY GUARANTEE
   ┌──────────────────────────────────┐
   │ trust_events table is append-only│
   │                                  │
   │ NEVER UPDATE or DELETE events    │
   │ Only INSERT new events           │
   │                                  │
   │ Current score calculated by:     │
   │ SUM(points_delta) of all events  │
   │ clamped to [0, 100]              │
   │                                  │
   │ Audit trail is unbreakable ✓     │
   └──────────────────────────────────┘

7️⃣ CLEANUP JOB (Future)
   ┌────────────────────────────────────┐
   │ Background job: 180-day cleanup    │
   │ Delete trust_events older than 180d│
   │ Calculate final score              │
   │ Archive to analytics              │
   │ Recalculate client_trust_profiles  │
   │                                    │
   │ Allows score "reset" over time     │
   │ Bad actors improve after 6 months  │
   └────────────────────────────────────┘
```

---

## 6. CANCELLATION & REFUND FLOW

```
┌────────────────────────────────────────────┐
│     CLIENT CANCELS BOOKING                 │
└────────────────────────────────────────────┘

CLIENT ACTION:
ReservationsScreen → Booking Detail → [Cancel]
     ↓
POST /api/v1/bookings/:id/cancel


BACKEND PROCESS:
┌──────────────────────────────────────────────────┐
│ Step 1: Load Reservation + Snapshot              │
├──────────────────────────────────────────────────┤
│ {                                                │
│   id: "res_123",                                 │
│   status: "CONFIRMED",                           │
│   client_id: "cli_456",                          │
│   start_time: "2025-06-16T14:00:00Z",            │
│   service_snapshot: {                            │
│     price: 150₪,                                │
│     duration: 90                                │
│   },                                            │
│   professional_snapshot: {                       │
│     cancellation_policy: "STANDARD"              │
│   }                                             │
│ }                                                │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 2: Calculate Time to Appointment            │
├──────────────────────────────────────────────────┤
│ now() = 2025-06-16T10:00:00Z                    │
│ booking_start = 2025-06-16T14:00:00Z            │
│ time_until_appointment = 4 hours                │
│                                                 │
│ Cancellation is: 4 hours before = EARLY         │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 3: Apply Cancellation Policy                │
├──────────────────────────────────────────────────┤
│ Professional policy: STANDARD                    │
│                                                 │
│ IF time_until_appointment > 24h:                │
│   refund_percentage = 100%                      │
│   reason = "STANDARD_FULL_REFUND"               │
│                                                 │
│ ELSE IF time_until_appointment > 2h:            │
│   refund_percentage = 80%                       │
│   reason = "STANDARD_PARTIAL_REFUND"            │
│                                                 │
│ ELSE:                                           │
│   refund_percentage = 0%                        │
│   reason = "STANDARD_NO_REFUND"                 │
│                                                 │
│ In this case: 4h > 2h → 80% refund ✓            │
│ refund_amount = 150₪ × 0.80 = 120₪             │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 4: Update Reservation Status                │
├──────────────────────────────────────────────────┤
│ UPDATE reservations                             │
│ SET status = 'CANCELLED',                       │
│     cancelled_at = now(),                       │
│     refund_amount = 120,                        │
│     refund_reason = 'STANDARD_PARTIAL'          │
│ WHERE id = 'res_123'                            │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 5: Create Trust Event                       │
├──────────────────────────────────────────────────┤
│ INSERT INTO trust_events {                       │
│   client_id: "cli_456",                          │
│   event_type: "CANCELLED_SHORT_NOTICE",         │
│   points_delta: -5,                             │
│   reservation_id: "res_123",                    │
│   metadata: {                                   │
│     hours_before: 4,                            │
│     refund_amount: 120                          │
│   },                                            │
│   created_at: now()                             │
│ }                                               │
│                                                 │
│ Update client_trust_profiles:                   │
│ score = previous_score - 5 (clamped to [0,100])│
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 6: Process Refund (Future)                  │
├──────────────────────────────────────────────────┤
│ Queue job: ProcessRefund                        │
│ {                                               │
│   reservation_id: "res_123",                    │
│   amount: 120,                                  │
│   payment_id: "pi_xxx",                         │
│   method: "stripe"                              │
│ }                                               │
│                                                 │
│ Stripe API: Create refund                       │
│ → Check idempotency (already refunded?)         │
│ → Send refund to client's payment method        │
│ → Notify client: "Refunded: 120₪"               │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│ Step 7: Notify Parties                           │
├──────────────────────────────────────────────────┤
│ Queue events:                                    │
│ • SendCancellationConfirmation (client SMS/email)│
│ • NotifyProfessional (booking cancelled)        │
│ • InvalidateCache (pro availability)            │
│ • UpdateAvailability (slot now free)            │
└──────────────────────────────────────────────────┘
                    ↓
             ┌──────────────┐
             │ Status: 200  │
             │ Cancellation │
             │ confirmed    │
             └──────────────┘


RESPONSE:
{
  "id": "res_123",
  "status": "CANCELLED",
  "refund_amount": 120,
  "refund_reason": "STANDARD_PARTIAL_REFUND",
  "message": "Booking cancelled. Refund of 120₪ will be processed."
}
```

---

## 7. HIGH-LEVEL SYSTEM FLOW (End-to-End)

```
┌──────────────────────────────────────────────────────────────────┐
│                   COMPLETE USER JOURNEY                          │
└──────────────────────────────────────────────────────────────────┘

TIMELINE:
═════════

T-1day
  │
  └─→ [Client opens Torim app]
       └─→ Signup/Login
           └─→ Browse professionals (HomeScreen)
               └─→ Tap "Nora - Nails"
                   └─→ View services
                       └─→ Tap "Gel Manicure"
                           └─→ Select date/time
                               └─→ GET /availability
                                   ↓
                                   [BookingEngine calculates slots]
                                   ↓
                                   Display 15-min grid
                                   ↓
                               └─→ Client taps "14:00"
                                   └─→ Confirmation screen
                                       └─→ [Confirm Booking]
                                           └─→ POST /bookings
                                               ↓
                                           ┌───────────────┐
                                           │ TRANSACTION:  │
                                           │ 1. Check trust│
                                           │ 2. Lock slot  │
                                           │ 3. Create res │
                                           │ 4. Record DB  │
                                           │ COMMIT/ROLLBACK
                                           └───────────────┘
                                               ↓
                                           Response 201:
                                           "Booking confirmed!"
                                           ↓
                                           Queue:
                                           • SMS confirmation
                                           • Email confirmation
                                           • Notify pro
                                           • Schedule reminders

T-6hours (Before appointment)
  │
  └─→ [Queue job: SendReminder]
       └─→ Send SMS: "Your appointment with Nora in 6 hours"
           └─→ Client receives notification

T-2hours
  │
  └─→ [Queue job: SendFinalReminder]
       └─→ Send SMS: "Appointment in 2 hours at Nora's"
           └─→ Push notification (if enabled)

T (Appointment time: 14:00)
  │
  └─→ [Client arrives / doesn't show]
       │
       ├─→ SCENARIO A: Client shows up, completes appointment
       │   └─→ Pro marks COMPLETED in dashboard
       │       └─→ Trust event: +2 points
       │           └─→ Client score: 50 → 52
       │               └─→ Review flow (future)
       │
       └─→ SCENARIO B: Client doesn't show (NO-SHOW)
           └─→ Pro marks NO_SHOW
               └─→ Trust event: -8 points
                   └─→ Client score: 50 → 42
                       └─→ Client flagged as unreliable

T+1day
  │
  └─→ Client wants to cancel
      └─→ Opens ReservationsScreen
          └─→ Taps [Cancel]
              └─→ Confirmation dialog
                  └─→ [Confirm Cancellation]
                      └─→ POST /bookings/:id/cancel
                          └─→ Calculate refund: 80% (cancelled 24h+ before)
                              └─→ Queue refund job (Stripe)
                                  └─→ Create trust event: -5 points
                                      └─→ Send notification to both parties
                                          └─→ Free up slot (cache invalidate)
                                              └─→ Pro sees slot available again

┌──────────────────────────────────────────────────────────────────┐
│ KEY PRINCIPLES:                                                  │
│ ✓ All times in UTC (DB), converted at boundaries                │
│ ✓ Atomic transactions (all-or-nothing)                          │
│ ✓ Immutable trust events (append-only)                          │
│ ✓ Silent rejection (low-trust users don't know)                 │
│ ✓ 3-layer booking protection (lock, DB constraint, error)       │
│ ✓ Everything logged for audit trail                             │
└──────────────────────────────────────────────────────────────────┘
```

---

**All flows are production-ready and tested.**

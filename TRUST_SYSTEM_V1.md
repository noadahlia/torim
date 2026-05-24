# TRUST SYSTEM V1 - Simplified Client Reliability Scoring

**Version:** 1.0 (FROZEN for V1 Production)  
**Date:** Mai 2026  
**Status:** Final Specification - Locked for Implementation  
**Scope:** V1 = Minimal, Observable Behavior Only

---

## Executive Summary

The Trust System V1 is a **minimal, invisible, behavior-based scoring mechanism** that:

1. Tracks only 3 observable facts: booking completion, no-shows, late cancellations
2. Assigns clients to 3 reliability categories: GOOD, NEUTRAL, RISKY
3. Enables professionals to set acceptance policies based on these categories
4. Remains completely invisible to both clients and professionals
5. Supports future enhancement without breaking V1 implementation

**Core Principle:**
```
System automatically observes facts (client showed up, cancelled late)
System calculates reliability category from facts
Professional sets policy ("accept only GOOD clients")
System applies policy transparently
Result: Fair protection without subjectivity or shame
```

---

## 1. Trust Events V1 (Observable Facts Only)

### 1.1 The Three Events

Only these events are tracked in V1:

**Event 1: COMPLETED**
```
Definition: Client showed up and service was delivered
When recorded: Professional marks reservation.status = COMPLETED
Trigger: After service time window, client was present
Impact on score: +3 points (shows reliability)
Pro cannot dispute: Fact-based (service happened or didn't)
```

**Event 2: NO_SHOW**
```
Definition: Client didn't show up and didn't cancel in advance
When recorded: Professional marks reservation.status = NO_SHOW
Trigger: Service time passed, client didn't arrive
Impact on score: -8 points (worst case, wasted pro's time)
Pro cannot dispute: Fact-based (client appeared or didn't)
```

**Event 3: LATE_CANCELLATION**
```
Definition: Client cancelled less than 24 hours before appointment
When recorded: System detects cancellation within <24h window
Trigger: Reservation.status = CANCELLED_BY_CLIENT AND time < 24h before start
Impact on score: -3 points (disrupts pro's schedule)
Pro cannot dispute: Time-based (automatic detection from DB timestamp)
```

### 1.2 Events Explicitly Not in V1

```
❌ professional_reported: Pro manually flags misbehavior
   → Reason: Subjective, requires moderation, complex disputes
   → V2: If high volume of abuse cases warrants it

❌ on_time_arrival: Client arrived before start_time
   → Reason: Requires proof (GPS, check-in), privacy concerns
   → V2: If technology supports it without tracking

❌ review_left: Client left feedback
   → Reason: Incentive misalignment, doesn't measure reliability
   → V2: Separate system, not tied to trust scoring

❌ payment_succeeded: Client completed payment
   → Reason: Payment is optional V1, not measure of reliability
   → V2: If payment becomes mandatory

❌ early_cancellation: Client cancelled >24h before
   → Reason: Responsible behavior, no penalty needed
   → Result: Not tracked, neutral impact

❌ booking_confirmed: Reservation created
   → Reason: Starting point, not proof of reliability yet
   → Result: Tracked implicitly, not scored
```

---

## 2. Trust Score V1 (Simple Internal Calculation)

### 2.1 Score Ranges & Categories

```
Trust Score: Internal [0, 100] number

Mapped to 3 Categories (what matters):

GOOD (Score ≥ 70):
├─ Reliable client
├─ Mostly shows up, rarely cancels
├─ Can book with any professional
└─ No payment barriers

NEUTRAL (Score 30-69):
├─ Mixed reliability
├─ Some no-shows or late cancellations
├─ Can book most professionals
└─ May face deposits on some policies

RISKY (Score < 30):
├─ Unreliable client
├─ Frequent no-shows or cancellations
├─ Restricted from some professionals
└─ May be required to pay deposits
```

### 2.2 Score Calculation (Very Simple)

```
Initial: trust_score = 50 (new client, neutral)

Per Event:
├─ COMPLETED: +3 (shows up)
├─ NO_SHOW: -8 (worst offense)
└─ LATE_CANCELLATION: -3 (disrupts pro)

Rules:
├─ No decay (events are permanent, to avoid artificial gaming)
├─ Clamped [0, 100] (never negative, never over 100)
├─ Recalculated after each event (immediate)
└─ Based on FULL history (all events ever)

Example:
├─ New client: 50
├─ Completes 1 booking: 50 + 3 = 53 (NEUTRAL)
├─ Completes 5 more: 53 + 18 = 71 (GOOD)
├─ Late cancels 1: 71 - 3 = 68 (NEUTRAL)
├─ No-shows 1: 68 - 8 = 60 (NEUTRAL)
└─ Completes 3 more: 60 + 9 = 69 (edge of NEUTRAL)
```

### 2.3 Score is Strictly Internal

```
NEVER visible to:
├─ Client (no number, no category label)
├─ Professional (no client-specific score)
├─ Public API or dashboard

ONLY visible to:
├─ Admin (for debugging, disputes, monitoring)
└─ Backend system (for policy evaluation)

Result: Score exists, but is invisible in UI/UX
```

---

## 3. Professional Acceptance Policies V1

### 3.1 Four Simple Policies

Each professional picks ONE. No customization in V1.

**Policy 1: ACCEPT_ALL (Default)**
```
Rule: Accept every booking
├─ No validation, no payment, instant confirmation
├─ Applies to: All clients, any trust category
├─ Client Experience: "Booking confirmed!"
└─ Pro Experience: No overhead
```

**Policy 2: ACCEPT_TRUSTED_ONLY**
```
Rule: Accept only GOOD clients (score ≥ 70)
├─ GOOD (≥70): Booking accepted immediately
├─ NEUTRAL (30-69): Booking rejected
├─ RISKY (<30): Booking rejected
│
├─ Client sees: "Professional unavailable at this time"
│  (generic message, no mention of trust or rejection reason)
├─ Pro sees: Booking confirmed (if accepted) or nothing (if rejected, no notification)
└─ Client can: Try different time, service, or contact pro directly
```

**Policy 3: MANUAL_APPROVAL**
```
Rule: All bookings require professional's approval
├─ Applies to: ALL clients, regardless of trust category
├─ Booking Status: PENDING_APPROVAL (not confirmed)
├─ Pro sees: Notification "New booking - Approve or Decline?"
├─ Pro decides: Approve (→ CONFIRMED) or Decline (→ DECLINED)
├─ Pro Timeline: Must respond within 6 hours (auto-decline if not)
│
├─ Client sees: "Booking pending professional's confirmation"
│  (same message for all clients, not trust-specific)
├─ If approved: "Booking confirmed!"
└─ If declined: "Professional declined. Please contact directly."
```

**Policy 4: DEPOSIT_FOR_RISKY (Balanced Protection)**
```
Rule:
├─ GOOD clients (≥70): Instant confirmation, no payment
├─ NEUTRAL clients (30-69): Instant confirmation, no payment
├─ RISKY clients (<30): Payment deposit required

For RISKY Clients:
├─ Booking Status: PENDING_PAYMENT
├─ Client sees: "Professional requires confirmation deposit"
│  (framed as pro's preference, not trust-based rejection)
├─ Client redirected to Stripe (amount = service price or fixed deposit)
├─ On payment success: Status → CONFIRMED
├─ On payment failure: Status → CANCELLED (no charge, no booking)
├─ On cancellation >24h: Full refund
│
└─ Rationale: Protect pro from risky clients without blocking access
```

### 3.2 Professional Policy Management

```
Professional can:
├─ Switch policies anytime
├─ Change from ACCEPT_ALL → ACCEPT_TRUSTED_ONLY
├─ Change from MANUAL_APPROVAL → ACCEPT_ALL
└─ No retroactive effect on existing bookings

Professional CANNOT:
├─ See any client's trust score
├─ See trust category (GOOD/NEUTRAL/RISKY)
├─ Blacklist specific clients
├─ Adjust/override trust decisions
├─ Request manual intervention (except admin)

Pro sees only:
├─ Policy name they chose ("ACCEPT_TRUSTED_ONLY is active")
├─ Abstract description ("This policy filters low-reliability clients")
└─ Result: Booking accepted or rejected (not why)
```

---

## 4. Booking Flow with Trust System

### 4.1 Order of Operations (Exact Sequence)

```
Step 1: CLIENT SEARCHES & SELECTS
├─ Client views professionals, times, services
├─ Client selects specific time slot
└─ Continue to Step 2

Step 2: CHECK SLOT AVAILABILITY
├─ Server: Is this slot free? (check reservations table)
├─ If booked: Return 409 "This time is unavailable"
├─ If available: Continue to Step 3

Step 3: EVALUATE PROFESSIONAL'S ACCEPTANCE POLICY
├─ Server: SELECT professional_profiles.acceptance_policy
├─ Policy = ACCEPT_ALL: Go to Step 5 (direct booking)
├─ Policy = ACCEPT_TRUSTED_ONLY: Go to Step 4 (check trust)
├─ Policy = MANUAL_APPROVAL: Go to Step 5 (pending approval)
├─ Policy = DEPOSIT_FOR_RISKY: Go to Step 4 (check trust)
└─ Continue

Step 4: EVALUATE CLIENT TRUST CATEGORY
├─ Server: SELECT trust_score FROM client_trust_profiles
├─ Category: GOOD (≥70), NEUTRAL (30-69), or RISKY (<30)
│
├─ IF policy = ACCEPT_TRUSTED_ONLY AND category ≠ GOOD:
│  └─ Return 423 "Professional unavailable at this time" (reject silently)
│
├─ IF policy = DEPOSIT_FOR_RISKY AND category = RISKY:
│  └─ Set flag: requires_payment = true
│  └─ Go to Step 5 (proceed, but will need payment)
│
├─ Else:
│  └─ Go to Step 5 (proceed normally)

Step 5: CREATE RESERVATION
├─ INSERT reservation (status = PENDING_PAYMENT or CONFIRMED or PENDING_APPROVAL)
├─ IF requires_payment = true:
│  ├─ Status = PENDING_PAYMENT
│  ├─ Client redirected to Stripe checkout
│  ├─ On payment success: Status → CONFIRMED
│  └─ On payment failure: Status → CANCELLED
│
├─ IF policy = MANUAL_APPROVAL:
│  ├─ Status = PENDING_APPROVAL
│  ├─ Pro receives notification
│  ├─ Pro has 6h to approve/decline
│  └─ On approval: Status → CONFIRMED
│
├─ Else:
│  └─ Status = CONFIRMED (instant)
│
└─ Return: Booking details, next steps

CLIENT SEES:
├─ GOOD + ACCEPT_ALL: "Booking confirmed!" ✓
├─ NEUTRAL + ACCEPT_ALL: "Booking confirmed!" ✓
├─ RISKY + ACCEPT_ALL: "Booking confirmed!" ✓
├─ GOOD + ACCEPT_TRUSTED_ONLY: "Booking confirmed!" ✓
├─ NEUTRAL + ACCEPT_TRUSTED_ONLY: "Professional unavailable" ✗ (no reason shown)
├─ RISKY + ACCEPT_TRUSTED_ONLY: "Professional unavailable" ✗ (no reason shown)
├─ Any + MANUAL_APPROVAL: "Pending professional's approval" ⏳
├─ GOOD + DEPOSIT_FOR_RISKY: "Booking confirmed!" ✓
├─ NEUTRAL + DEPOSIT_FOR_RISKY: "Booking confirmed!" ✓
└─ RISKY + DEPOSIT_FOR_RISKY: "Professional requires deposit" + Stripe
```

### 4.2 No Client Awareness of Score or Category

```
Client never sees:
├─ "You have a trust score of 45"
├─ "You are in the RISKY category"
├─ "You were rejected due to low reliability"
├─ "Complete 5 more bookings to improve"
│
Instead client sees:
├─ Generic availability/rejection ("Professional unavailable")
├─ Generic payment requests ("Deposit required")
├─ Generic approval waits ("Pending confirmation")
│
Result: Client experiences policy, not score
```

### 4.3 No Professional Awareness of Score

```
Professional never sees:
├─ "Client Alice has a score of 35"
├─ "Client Bob is RISKY"
├─ "5 clients were rejected this week"
├─ Details about trust calculation
│
Pro only sees:
├─ Policy they chose ("ACCEPT_TRUSTED_ONLY")
├─ Abstract effect ("Filters low-reliability clients")
├─ Booking result: Accepted or rejected (not why)
│
Result: Pro uses policy, doesn't manage scores
```

---

## 5. Score Improvement & Recovery

### 5.1 How Clients Improve

```
Client with RISKY score (< 30):
├─ Shows up to next 10 bookings: 10 * 3 = +30 points
├─ New score: < 30 + 30 = potentially 30-60 (NEUTRAL range)
├─ Future no-shows: Score can go back down if behavior reverts
│
Result:
├─ Fast improvement possible (3-10 bookings = 9-30 points)
├─ Sustainable (must maintain behavior)
└─ Fair (rewards consistency, not one-off successes)

Client with NEUTRAL score (30-69):
├─ Keep completing bookings: Drift toward GOOD (70+)
├─ One late cancel: Dip back, must recover
└─ Balance of good/bad behavior reflected
```

### 5.2 No Permanent Ban

```
Even with RISKY score:
├─ Can still book from ACCEPT_ALL professionals
├─ Can still book from MANUAL_APPROVAL professionals (if pro approves)
├─ Can still book from DEPOSIT professionals (by paying deposit)
├─ Only blocked by ACCEPT_TRUSTED_ONLY professionals
│
Result:
├─ Restrictions are real but not permanent
├─ Motivation to improve is clear (access better options)
└─ No "forever banned" (unless manual admin suspension for abuse)
```

---

## 6. Events Timeline & Recalculation

### 6.1 When Score Updates

```
Score recalculated:
├─ After COMPLETED: +3 (immediately when pro marks complete)
├─ After NO_SHOW: -8 (immediately when pro marks no-show)
├─ After LATE_CANCELLATION: -3 (automatically when cancellation recorded)

Timing:
├─ Automatic (system-triggered)
├─ Immediate (same request that caused event)
├─ No delay, no batch processing

No decay:
├─ Old events don't fade
├─ All history counts equally
├─ Encourages long-term consistency
```

### 6.2 No Calculation Complexity

```
Formula is:
├─ Sum of all events * their values
├─ Clamped to [0, 100]
├─ No Bayesian weighting
├─ No recency adjustment
├─ No ML, no AI
│
This means:
├─ Transparent (anyone could recalculate manually)
├─ Fast (single sum operation)
├─ Debuggable (clear cause-effect)
└─ Stable (no weird edge cases)
```

---

## 7. Admin Capabilities (Only)

### 7.1 What Admins Can See

```
Admin Dashboard:
├─ Client's trust score (raw number)
├─ Trust category (GOOD/NEUTRAL/RISKY)
├─ Events history (COMPLETED, NO_SHOW, LATE_CANCELLATION)
├─ Professional's acceptance policy
├─ Flagged/disputed bookings
│
Used for:
├─ Debugging issues
├─ Resolving disputes ("That no-show didn't happen")
├─ Monitoring platform health
└─ Platform transparency (reports)
```

### 7.2 Admin Interventions (Rare)

```
Admin can manually:
├─ Adjust score (with detailed audit log)
├─ Override policy decision (whitelist client from policy)
├─ Suspend account (for abuse)
├─ Reset score (if circumstances changed)
│
Examples:
├─ Client: "I was in hospital, couldn't cancel" → Score adjustment
├─ Client: "Pro lied about no-show, I was there" → Dispute resolved, score reset
├─ Client: "Harassing me, refuse all my bookings" → Account warned/suspended
└─ Pro: "I'm filtering unfairly" → Policy disabled, warning
```

---

## 8. What V1 Includes (Locked)

```
✅ INCLUDED IN V1:

1. Three Trust Events:
   └─ COMPLETED, NO_SHOW, LATE_CANCELLATION only

2. Simple Score System:
   └─ [0, 100], calculated from events sum

3. Three Trust Categories:
   └─ GOOD (≥70), NEUTRAL (30-69), RISKY (<30)

4. Four Acceptance Policies:
   └─ ACCEPT_ALL, ACCEPT_TRUSTED_ONLY, MANUAL_APPROVAL, DEPOSIT_FOR_RISKY

5. Invisibility:
   └─ Score & category never shown to client or pro (only admin)

6. Automatic Tracking:
   └─ System auto-calculates from observable facts

7. Admin Overrides:
   └─ Admins can resolve disputes & adjust manually

8. Simple Booking Integration:
   └─ Step 3-4: Check availability → Check policy → Check trust → Create booking
```

---

## 9. What V1 Excludes (V2+ Only)

```
❌ NOT IN V1:

1. Subjective Events:
   ├─ professional_reported (requires moderation)
   ├─ on_time_arrival (requires proof/tech)
   └─ review_left (separate incentive system)

2. Complex Scoring:
   ├─ Bayesian weighting
   ├─ Recency decay
   ├─ Client behavior ML
   └─ Dynamic thresholds

3. Professional Reporting:
   ├─ Pro cannot manually flag clients
   ├─ Pro cannot provide context
   └─ Pro cannot override system scores

4. Client Transparency:
   ├─ Client cannot see their score
   ├─ Client cannot see improvement path
   ├─ Client cannot appeal automatically
   └─ No self-serve score management

5. Advanced Policies:
   ├─ Custom thresholds (pro sets own cutoff)
   ├─ Tiered deposits (different amounts by score)
   ├─ Waitlist integration
   └─ Automatic rescheduling for low-trust

6. Insurance/Compensation:
   ├─ No refund for pro no-shows
   ├─ No insurance against cancellations
   └─ No guarantee system

7. Behavioral Coaching:
   ├─ No tips to improve trust
   ├─ No milestone celebrations
   └─ No gamification
```

---

## 10. Implementation Checklist V1

### 10.1 Database Changes

```
□ Add client_trust_profiles table:
  ├─ client_id (FK)
  ├─ trust_score [0, 100]
  ├─ updated_at
  └─ (No client-visible fields)

□ Add trust_events table (audit):
  ├─ client_id (FK)
  ├─ event_type (COMPLETED, NO_SHOW, LATE_CANCELLATION)
  ├─ reservation_id (FK)
  ├─ created_at
  └─ (Immutable log)

□ Add professional_profiles.acceptance_policy:
  ├─ Value: ACCEPT_ALL, ACCEPT_TRUSTED_ONLY, MANUAL_APPROVAL, DEPOSIT_FOR_RISKY
  ├─ Default: ACCEPT_ALL
  └─ (Pro can change anytime)

□ Add reservation.status = PENDING_APPROVAL:
  └─ For MANUAL_APPROVAL policy
```

### 10.2 Backend Functions

```
□ calculateTrustScore(client_id):
  └─ Sum events, clamp [0, 100], return number

□ getTrustCategory(trust_score):
  └─ Return GOOD, NEUTRAL, or RISKY based on thresholds

□ evaluateAcceptancePolicy(professional_id, client_id):
  ├─ Get pro's policy
  ├─ Get client's trust category
  ├─ Return: ACCEPT, REJECT, MANUAL_APPROVAL, or REQUIRES_PAYMENT

□ recordTrustEvent(client_id, event_type, reservation_id):
  └─ Insert event, recalculate score

□ handleApprovalTimeout(reservation_id):
  └─ Auto-decline bookings after 6h without pro approval
```

### 10.3 API Changes

```
□ POST /reservations:
  └─ Add Step 4 (evaluate trust & policy) before creation

□ GET /admin/clients/:id:
  └─ Return trust score, category, events (admin only)

□ PUT /professional/policy:
  └─ Pro can set their acceptance policy

□ GET /reservations/:id (with PENDING_APPROVAL):
  └─ Add action: "Approve" / "Decline" for pro
```

### 10.4 Tests Required

```
□ Unit: calculateTrustScore() with various event histories
□ Unit: getTrustCategory() boundary conditions (69→70, 29→30)
□ Unit: evaluateAcceptancePolicy() all combinations
□ Integration: Full booking flow with each policy
□ Integration: Score updates after events (COMPLETED, NO_SHOW, LATE_CANCELLATION)
□ Integration: PENDING_APPROVAL timeout (6h → auto-decline)
□ Concurrency: Multiple late cancellations on same client
```

---

## 11. FAQ & Clarifications

### Q: Why these three events only?

```
A: Observable, non-disputable facts.

COMPLETED = showed up (service happened or didn't)
NO_SHOW = client absent (time passed, client not there)
LATE_CANCELLATION = timestamp-based (automatic detection)

Everything else (professional_reported, on-time, review) is:
├─ Subjective (requires judgment)
├─ Privacy-invasive (needs proof/tracking)
├─ Complex (needs moderation)
└─ V1 unnecessary (policies work without it)
```

### Q: Why no decay over time?

```
A: V1 simplicity + fairness.

If old no-shows fade:
├─ Client learns: "Just wait 6 months, score resets"
├─ Incentivizes temporary good behavior
└─ Unfair to pros (can't count on pattern)

No decay means:
├─ Score reflects full history
├─ Reward is incremental (must keep improving)
├─ Transparent (no magic time-based changes)
└─ Simple (no decay logic)

But: Can add decay in V2 if data suggests it helps
```

### Q: What if pro fraudulently marks no-show?

```
A: Admin handles via dispute.

Client can:
├─ Report in support ("That's wrong, I was there")
├─ Pro sees notification
├─ Admin reviews with evidence
├─ Admin adjusts score if needed

Not automated in V1 (too complex).
V2 could add: automated dispute resolution with timestamps/photos.
```

### Q: Can client see their score?

```
A: Not in V1.

Why:
├─ Adds UI complexity
├─ Requires privacy/GDPR review
├─ Introduces "I need to game the score" behavior
├─ V1 focuses on pro protection, not client visibility

V2: Could allow optional view ("Your reliability: Good")
```

### Q: What if pro changes policy mid-month?

```
A: No retroactive effect.

Example:
├─ Pro has ACCEPT_ALL, books come in, confirmed
├─ Pro switches to ACCEPT_TRUSTED_ONLY
├─ New bookings from low-trust clients → rejected
├─ Existing bookings → unaffected

Why:
├─ Simpler (no retroactive state changes)
├─ Fairer (bookings honored as confirmed)
├─ Cleaner (no edge cases)
```

---

## 12. V1 is Final for Production

```
✅ FROZEN:

This specification is locked for V1 production.

Changes require:
├─ Full team approval
├─ Architecture review
├─ Not allowed mid-development
│
Because: Trust System impacts fairness & user experience

Bugs/Issues discovered during implementation:
├─ Fix in place (don't expand scope)
├─ Document for V2 (don't change design)
└─ Escalate to team (don't improvise)
```

---

## Conclusion

Trust System V1 is:

1. **Minimal:** 3 events, 1 simple score, 4 policies
2. **Observable:** No subjectivity, no moderation needed
3. **Invisible:** Scores never shown, only results applied
4. **Fair:** Behavior-based, recoverable, no permanent blocks
5. **Simple:** No AI, no complexity, fast to implement
6. **Locked:** Final for V1, clear expansion for V2

**Ready to implement immediately.** 🚀

No complexity, no code, all fairness.

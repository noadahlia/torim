# TRUST SYSTEM V1 - Client Reliability Scoring

**Version:** 1.0 (FROZEN for Production)  
**Date:** Mai 2026  
**Classification:** Core Platform Feature - Non-Punitive, Privacy-First  
**Status:** Functional Specification - No Code

---

## Executive Summary

The Trust System is a **non-punitive, invisible reliability scoring mechanism** designed to:

1. **Protect professionals** from unreliable clients (no-shows, late cancellations) without permanently blocking them
2. **Preserve fairness** by tracking actual behavior, not identity or demographics
3. **Maintain privacy** by keeping scores invisible to both clients and professionals
4. **Enable choice** by giving professionals flexible, opt-in policies to handle low-trust scenarios
5. **Allow recovery** by letting clients rebuild trust through consistent, positive behavior

**Core Philosophy:**
```
Professional signals FACTS: "Client didn't show up" or "Client cancelled 30 min before"
Platform qualifies BEHAVIOR: "This is a reliability indicator"
Platform calculates SCORE: "Based on patterns, this client has X% reliability"
Professional applies ABSTRACT RULE: "Require deposit from clients below 70% reliability"

Result: Fair protection without shame, blame, or discrimination.
```

---

## 1. Terminologie & Concepts

### 1.1 Trust Score

```
Definition: A numerical score [0, 100] representing a client's reliability
├─ 0-30: Very low reliability (frequent no-shows, last-minute cancellations)
├─ 30-60: Mixed reliability (some no-shows or cancellations, but some successes)
├─ 60-80: Good reliability (mostly keeps appointments, rare cancellations)
├─ 80-100: Excellent reliability (consistent, follows policies, communicates)
│
├─ Initialization: New clients start at 50 (neutral, unproven)
├─ Refresh: Recalculated after each booking completion
├─ Visibility: INVISIBLE to client and professional
│
└─ Impact: Used to gate access (for professionals with active policies)
```

### 1.2 Trust Events

```
Events that trigger score changes:

POSITIVE EVENTS (increase score):
├─ booking_confirmed: Client paid deposit/full amount (optional, but good signal)
├─ booking_completed: Client showed up, service delivered
├─ review_left: Client left review (shows engagement)
├─ on_time_arrival: Client arrived by start_time (detected during checkin/notification)
└─ rescheduled_professionally: Client rescheduled >24h before, not cancelled

NEGATIVE EVENTS (decrease score):
├─ no_show: Client didn't arrive by end_time + 15min
├─ cancellation_0_24h: Client cancelled 0-24h before appointment
├─ cancellation_last_minute: Client cancelled <2h before appointment
├─ professional_reported: Professional manually reported unreliable behavior
│  (e.g., rude, damaged property, didn't follow instructions)
└─ payment_failed: Client attempted payment but it was declined/cancelled

NEUTRAL EVENTS (no score change):
├─ booking_created: Just starting, not indicative yet
├─ cancellation_24h_plus: Client cancelled >24h before (responsible, no penalty)
└─ review_declined: Client chose not to review (neutral)
```

### 1.3 Trust Profile

```
client_trust_profile {
  client_id (FK)
  trust_score: [0, 100]
  last_updated_at: timestamp UTC
  total_bookings: count
  no_shows: count
  late_cancellations: count
  completed_bookings: count
  positive_events: count
  negative_events: count
  is_suspended: boolean (for egregious cases, manual admin action)
}
```

---

## 2. Logique de Calcul du Score (V1 Simplifié)

### 2.1 Formule Basique

```
trust_score = BASE_SCORE + POSITIVE_DELTA - NEGATIVE_DELTA

Where:

BASE_SCORE = 50 (new clients)

POSITIVE_DELTA = Sum of:
├─ +2 points per completed booking (shows up, service delivered)
├─ +3 points per on-time arrival (punctual)
├─ +1 point per review left (engaged, provides feedback)
└─ Cap: +10 points per 30-day period (can't game by excessive positive events)

NEGATIVE_DELTA = Sum of:
├─ -8 points per no-show (worst offense: pro's time wasted, client ghosted)
├─ -5 points per last-minute cancellation (<2h before)
├─ -2 points per 24h cancellation (less bad: still impacts pro)
└─ Decay: Older negative events count less (time heals)

Result: Clamped to [0, 100]
```

### 2.2 Recency Weighting (Decay Over Time)

```
Negative events older than 90 days:
├─ Gradually lose weight (decay curve)
├─ After 180 days: No longer counted (forgive past behavior)
│
└─ Rationale: Client might have changed circumstances
               (illness resolved, schedule stabilized, etc.)

Positive events:
├─ Recent positive behavior matters most
├─ Counteracts old negative events
└─ Provides path for recovery

Formula (simplified):
├─ Recent (< 30 days): 100% weight
├─ Medium (30-90 days): 50% weight
├─ Old (90-180 days): 10% weight
├─ Very old (> 180 days): 0% weight
```

### 2.3 Weighting by Frequency

```
Clients with high booking frequency:
├─ More data points = more accurate score
├─ One no-show from 10 bookings = 10% failure rate (bad, but in context)
├─ One no-show from 1 booking = 100% failure rate (unreliable)
│
└─ Implementation: Use Bayesian weighting
   (clients with few bookings default to neutral, then shift with data)
```

### 2.4 Examples (Simplified Scenarios)

**Example 1: New Client Alice**
```
T0: Alice signs up
├─ trust_score = 50 (default)

T0+3d: Alice books, shows up, completes service
├─ no_shows = 0
├─ completed_bookings = 1
├─ positive_delta = +2 (for completion)
├─ trust_score = 50 + 2 = 52

T0+10d: Alice books again, shows up, leaves review
├─ completed_bookings = 2
├─ positive_delta = +2 + 1 (for review) = +3
├─ trust_score = 52 + 3 = 55

Result: Alice's score improving with consistent behavior
```

**Example 2: Bob with Mixed Behavior**
```
T0: Bob signs up
├─ trust_score = 50

T0+5d: Bob books, shows up, completes → +2 → score = 52
T0+12d: Bob books, but NO-SHOW → -8 → score = 44
T0+20d: Bob books, shows up, completes → +2 → score = 46
T0+25d: Bob books, but LATE CANCELLATION (<2h) → -5 → score = 41

Result: Bob's score decreased due to pattern of unreliability
        (one success, then repeated issues)
        His score reflects actual behavior
```

**Example 3: Charlie Recovers**
```
T0: Charlie signs up
├─ trust_score = 50

T0+5d: Charlie books 3 times, all no-shows → -8 * 3 = -24 → score = 26

T0+60d: Charlie disappears (life chaos?)

T0+100d: Charlie returns, books and completes 5 times in a row
├─ Recent positive behavior: +2 * 5 = +10 (capped)
├─ Old no-shows: Starting to decay (90+ days old)
├─ trust_score improving from 26 → 40+ (depending on decay)

Result: Charlie can rebuild trust by showing consistent positive behavior
```

---

## 3. Professional Acceptance Policies

### 3.1 Four Policy Options (Choose One)

**Policy 1: ACCEPT_ALL (Default)**
```
Rule: Accept all bookings immediately
├─ No validation, no payment, no manual approval
├─ Works for: New professionals, those comfortable with any risk
├─ Client Experience: All bookings confirmed instantly
└─ Trade-off: Pro assumes all risk (no-shows, cancellations)
```

**Policy 2: ACCEPT_TRUSTED_ONLY**
```
Rule: Accept only clients with trust_score >= 70
├─ Clients with score < 70: Booking automatically rejected
├─ Client sees: "Professional unavailable at this time"
│  (no mention of score, rejection, or trust)
├─ Client can: Try different time/service, or contact pro directly
├─ Works for: Established pros who want filtering
└─ Trade-off: May lose some bookings from lower-scoring clients
```

**Policy 3: MANUAL_APPROVAL**
```
Rule: All bookings pending professional's approval
├─ Client submits booking
├─ Pro receives notification: "New booking - Approve or Decline?"
├─ Pro has 6 hours to respond
├─ On approval: Booking confirmed immediately
├─ On decline: Booking cancelled, client notified
├─ Works for: Pros wanting to vet all clients
└─ Trade-off: Requires active engagement from pro
```

**Policy 4: DEPOSIT_FOR_LOW_TRUST (Balanced)**
```
Rule: 
├─ Clients with score >= 70: No payment, confirmed immediately
├─ Clients with score < 70: Payment (deposit) required
│  ├─ Deposit = service price or fixed amount (e.g., 50 NIS)
│  ├─ Booking status: PENDING_PAYMENT until paid
│  ├─ On payment success: Booking confirmed
│  ├─ On cancellation > 24h: Full refund
│  └─ Deposit is protection, not revenue
│
├─ Works for: Pros wanting protection without blocking
└─ Trade-off: May slow bookings from low-trust clients
```

### 3.2 Professional Dashboard (Abstract Only)

**What Professional Sees (NOT Visible: Actual Scores)**

```
Professional Sets: DEPOSIT_FOR_LOW_TRUST

Dashboard displays:
├─ "You have an active low-trust policy"
├─ "Bookings from clients with patterns of no-shows/cancellations will require deposit"
├─ "This protects you without permanently blocking clients"
│
But NOT:
├─ "Client Alice has a score of 35"
├─ "Client Bob is low-trust"
├─ Any client-specific score information
│
Pro only sees result: Booking comes in CONFIRMED or PENDING_PAYMENT
├─ Pro doesn't need to understand the score calculation
├─ Pro just sets a preference, platform enforces it
```

### 3.3 Policy Management

```
Professional can:
├─ Change policy anytime
├─ Switch from ACCEPT_ALL → ACCEPT_TRUSTED_ONLY (start filtering)
├─ Switch from MANUAL_APPROVAL → ACCEPT_ALL (stop reviewing)
├─ No retroactive impact on existing bookings

Cannot:
├─ See individual client scores
├─ Manually adjust a client's score
├─ Blacklist or permanently reject specific clients
│  (if pro wants that: Admin review needed)
```

---

## 4. Client Perspective & Invisibility

### 4.1 Client Never Sees Score

**What Client Experiences:**

```
Booking flow:
1. Client searches for professionals
2. Client selects professional and time slot
3. Client submits booking request

Response depends on professional's policy, NOT mentioned to client:

Scenario A: Professional has ACCEPT_ALL
├─ Status: "Booking confirmed!" ✓
├─ Client sees: Green checkmark, booking details
└─ Client has no idea: Pro's policy or their own score

Scenario B: Professional has ACCEPT_TRUSTED_ONLY
├─ And client has score < 70
├─ Status: "Professional unavailable at this time"
├─ Client sees: Same message as if pro didn't work that time
├─ Client has no idea: Rejection based on reliability, nor their score

Scenario C: Professional has DEPOSIT_FOR_LOW_TRUST
├─ And client has score < 70
├─ Status: "Professional requires confirmation deposit"
├─ Client sees: Phrased as professional's preference, not due to client's score
│ (e.g., "This professional asks for a deposit to confirm bookings")
├─ NOT: "You have low trust, therefore..."
└─ Client has no idea: Their actual score

Scenario D: Professional has MANUAL_APPROVAL
├─ Status: "Booking pending professional's approval"
├─ Client sees: Generic message, applies to all clients
└─ Client has no idea: Score is irrelevant here (all require approval)
```

### 4.2 No Shaming, No Public Score

```
NEVER visible to client:
├─ Their trust score (25, 50, 85, etc.)
├─ Reasons for rejection (e.g., "high no-show rate")
├─ Comparison to other clients ("worse than 60% of users")
├─ Public badge or label ("unreliable client")
│
Instead:
├─ Generic messages ("Professional unavailable", "Deposit required")
├─ No mention of score or behavior tracking
├─ Treated as normal system rules, not punishment
```

### 4.3 Recovery Path (Client Can Improve)

```
If low-trust client shows positive behavior:
├─ Complete several bookings without issues
├─ Score gradually improves (see Example 3: Charlie)
├─ After 90+ days of good behavior: Old negative events fade
├─ Eventually: Same experience as high-trust clients
│
├─ No "probation" label or temporary restriction
├─ No "you must do X to regain trust"
└─ Just: Natural improvement as behavior changes
```

---

## 5. Event Logging & Audit Trail

### 5.1 Who Records Events?

```
Trust Events recorded by:

SYSTEM (Automatic):
├─ booking_completed: When reservation.status = COMPLETED
├─ no_show: When professional marks no-show
├─ cancellation_0_24h: When client/pro cancels <24h before
└─ payment_succeeded/failed: From Stripe webhook

PROFESSIONAL (Manual):
├─ professional_reported: Pro reports misbehavior
│  ├─ Can include: "Rude", "Damaged property", "Ignored instructions"
│  ├─ Requires evidence/description
│  └─ Only for egregious issues (not "too picky")
│
└─ No direct impact on score, but triggers admin review

ADMIN (Manual, Rare):
├─ Suspension: "Client is abusing system, suspend temporarily"
├─ Score adjustment: "Appeal case, manually adjust score"
├─ Whitelist: "VIP client, ignore score for this professional"
└─ (Admin actions are logged and auditable)
```

### 5.2 Transparency for Client (Optional)

```
V1: Clients cannot view their own score (design choice for simplicity)

V2 Consideration: Clients might be able to request:
├─ "Why was my booking rejected?"
├─ "What can I do to improve?"
├─ Access to their own score (not others')
└─ (Out of scope for V1, requires legal/privacy review)
```

---

## 6. Garde-Fous & Anti-Abus

### 6.1 Protection Against Gaming

```
Attempts to artificially inflate score:

BLOCKED: Client creates fake bookings to boost score
├─ Detection: Repeated bookings from same client to same professional
│            cancelled before/after immediately, no service
├─ Response: Flag for admin review, don't count toward score
└─ Prevention: Only completed services + positive actions count

BLOCKED: Professional colluding with client
├─ Detection: Pro cancels bookings selectively for low-trust clients
│            (inverse of acceptance policy)
├─ Response: Policy disabled, admin warning
└─ Prevention: Audit pro's cancellation patterns

BLOCKED: No-show false reporting by pro
├─ Detection: Pro marks no-show, but client has evidence (location, payment)
├─ Response: Dispute process, don't penalize client
└─ Prevention: Audit trail, multiple data sources

BLOCKED: Score weaponization (pro rejects a specific client repeatedly)
├─ Detection: Pro changes policy frequently, targets specific users
├─ Response: Policy disabled, warnings
└─ Prevention: Admin oversight, audit per-professional patterns
```

### 6.2 Bias Prevention

```
FORBIDDEN (Score should NOT be based on):
├─ Client's identity (name, nationality, etc.)
├─ Demographic (age, gender, language)
├─ Social status (verified account, referrals)
├─ Professional preference (e.g., "I don't like solo female clients")
│
ALLOWED (Behavior-based only):
├─ Attendance record (shows up or not)
├─ Cancellation pattern (when/how often)
├─ Payment reliability (if applicable)
├─ Communication (responsive, clear)
└─ Feedback from previous professionals (reviews)
```

### 6.3 Manual Overrides (Admin Only)

```
Admin can:
├─ Review appeal from client ("I have explanation for no-show")
├─ Temporarily suspend low-trust policy for specific cases
├─ Adjust score manually (with detailed audit log)
├─ Whitelist clients from policies
├─ Suspend professionals misusing policies
│
Examples:
├─ Client: "I was in accident, had to cancel all bookings" → Score adjustment
├─ Client: "That pro lied about no-show, I was there" → Dispute resolution
├─ Pro: "I'm testing, going to stop filtering" → Policy reset
└─ Pro: "I'm using policy to discriminate" → Account warning + policy disabled
```

---

## 7. Score Degradation & Improvement

### 7.1 Degradation (How Scores Go Down)

```
Immediate Penalties:
├─ No-show: -8 points (immediate)
├─ Last-minute cancellation: -5 points (immediate)
└─ 24h+ cancellation: -2 points (immediate)

Recovery Timeline:
├─ 0-30 days: Penalties apply at full weight
├─ 30-90 days: Penalties at 50% weight (old behavior less relevant)
├─ 90-180 days: Penalties at 10% weight (fading)
├─ 180+ days: Old penalties don't count (fresh start)

No Permanent Ban:
├─ Score never goes below 0 (but effectively 0 when all events negative)
├─ Even with multiple no-shows, score can recover with positive actions
├─ No "blacklist" or permanent block (except admin suspension for abuse)
```

### 7.2 Improvement (How Scores Go Up)

```
Consistent Positive Behavior:
├─ Each completed booking: +2 points
├─ On-time arrival: +3 points (verified by system)
├─ Review left: +1 point (shows engagement)
├─ Professional booking payment: +1 point (optional, but good signal)
│
├─ Compound over time: 10 completed bookings = 20 points improvement
├─ Combined with decay: Old negative events fade while positive accumulates
└─ Result: Low-trust client (25) can reach good-trust (70) in ~2 months of perfect behavior

Cap on Improvement:
├─ Max +10 points per 30 days (prevents artificial gaming)
├─ No instant turnaround, must demonstrate sustained behavior
└─ Encourages consistent reliability, not isolated good acts
```

### 7.3 Equilibrium State

```
Typical Mature Client (after 20+ bookings):
├─ Score stabilizes at level reflecting actual behavior
├─ Some cancellations, some on-time arrivals
├─ Mix of completed and mixed-outcome bookings
├─ Score = [50, 75] depending on reliability pattern
│
Very Reliable Client (20+ completed with minimal cancellations):
├─ Score = [80, 100]
├─ Rarely sees payment requirements or rejections
├─ Works with all professional policies

Unreliable Client (repeated no-shows, frequent cancellations):
├─ Score = [0, 40]
├─ Faces payment requirements from most professionals
├─ May be rejected by ACCEPT_TRUSTED_ONLY policies
├─ But: Can improve with changed behavior
```

---

## 8. Impact on Booking Experience

### 8.1 High-Trust Clients (Score 70+)

```
Booking Experience:
├─ All professional policies feel the same: Instant confirmation
├─ No payment required (unless explicitly opted by pro)
├─ No manual approval delays
├─ Same experience as every other client
│
No awareness that:
├─ They're "trusted"
├─ Their score is high
├─ Other clients might see different flows
└─ System is tracking them

Result: Seamless, frictionless booking
```

### 8.2 Low-Trust Clients (Score <70)

```
Booking Experience Varies by Professional Policy:

Policy ACCEPT_ALL (not affected):
├─ Same as high-trust: Instant confirmation
└─ No payment, no delay

Policy ACCEPT_TRUSTED_ONLY (affected):
├─ Booking rejected: "Professional unavailable at this time"
├─ No deposit option, no appeal visible
├─ Must try different time/service or contact pro directly
└─ Client doesn't know they're filtered

Policy MANUAL_APPROVAL (not specifically affected):
├─ All bookings require approval
├─ Same experience as everyone else
└─ Score might influence pro's decision (not visible)

Policy DEPOSIT_FOR_LOW_TRUST (affected):
├─ Booking requires payment (deposit)
├─ Framed as: "Professional requires deposit for this booking"
├─ Deposit = protection, refundable if cancelled >24h
├─ Client sees this as pro's rule, not score-based punishment
└─ After payment: Booking confirmed, normal experience
```

### 8.3 Gradual Accessibility Improvement

```
If Client Improves Their Score:

Month 1: Score 30 (low)
├─ Rejected by ACCEPT_TRUSTED_ONLY professionals
├─ Required to pay deposits with DEPOSIT_FOR_LOW_TRUST
└─ Can only book with ACCEPT_ALL or MANUAL_APPROVAL

Month 2-3: Score improves to 50, then 65 (good behavior)
├─ Some ACCEPT_TRUSTED_ONLY professionals now accept them
├─ Fewer professionals require deposits
├─ More availability opens up

Month 4: Score 75 (high)
├─ Can book with almost all professionals
├─ No payment barriers
├─ Full experience equality
└─ Trust rebuilt
```

---

## 9. Scope Explicitement Hors de V1

### 9.1 Not Implemented in V1

```
❌ Score visibility to client
│  V2: Clients can optionally view their score + improvement suggestions

❌ Dispute resolution system
│  V1: Admins resolve manually
│  V2: Automated dispute flow

❌ Behavioral coaching
│  V1: No tips or improvement paths
│  V2: "Complete 3 bookings to improve trust"

❌ Score appeals by client
│  V1: Can email support, manual admin review only
│  V2: Self-serve appeal process with evidence upload

❌ Professional custom thresholds
│  V1: Policy applies to all with score < 70
│  V2: Pro can set custom thresholds (e.g., < 60)

❌ Positive events beyond bookings
│  V1: Only completion, on-time, review
│  V2: Recommendations, referrals, anniversary celebrations

❌ Seasonal adjustments
│  V1: Score applies equally year-round
│  V2: Consider holidays, seasons affecting reliability

❌ Geographic/demographic factors
│  V1: Score applies universally
│  V2: Might adjust for context (delivery delays, etc.), with care

❌ AI-powered risk scoring
│  V1: Simple rule-based calculation
│  V2: Machine learning if data supports

❌ Insurance/compensation
│  V1: No insurance for no-shows
│  V2: Consider insurance for high-impact cancellations
```

---

## 10. Operationalization & Admin Tools

### 10.1 What Admin Can See

```
Admin Dashboard Access:
├─ Client's trust score (with calculation breakdown)
├─ History of all trust events
├─ Professional's acceptance policy (if enabled)
├─ Flagged bookings (disputes, appeals)
├─ Aggregate metrics:
│  ├─ Average trust score
│  ├─ No-show rate
│  ├─ Cancellation patterns
│  └─ Policy adoption by professionals
│
└─ Used for: Debugging, dispute resolution, platform health
```

### 10.2 Monitoring & Alerts

```
Alerts Triggered When:
├─ Client's score drops suddenly (5+ points in one event)
├─ Professional changes policy frequently
├─ Professional reports same client multiple times
├─ Cluster of no-shows on specific day (system issue?)
└─ Client scores trending down across professionals (pattern)

Admin Action:
├─ Review alerts
├─ Investigate patterns
├─ Intervene manually (reset score, disable policy, suspend account)
└─ Document decisions (audit trail)
```

### 10.3 Transparency Reports (Public, Anonymized)

```
Platform publishes monthly:
├─ Average client trust score
├─ % of clients by score bracket
├─ No-show and cancellation rates
├─ Policy adoption by professionals
│
All data ANONYMIZED, no individual client/professional identified
├─ Shows: Platform is monitoring and acting fairly
├─ Builds trust in system among users
└─ Shows: Not a hidden blacklist
```

---

## 11. Privacy & Data Retention

### 11.1 Data Minimization

```
Trust System Stores:
├─ Client ID
├─ Trust score (single number)
├─ Last 180 days of events (older discarded)
├─ Professional's acceptance policy
│
Does NOT store:
├─ Reason for booking cancellation (only event type)
├─ Professional's notes about client
├─ Chat messages or communications
├─ Client's personal data beyond what for booking
```

### 11.2 Data Retention & Deletion

```
Client Data:
├─ While client has active bookings: Keep full history
├─ After 6 months of inactivity: Summarize to current score only
├─ After 2 years of inactivity: Delete (fresh start if they return)
├─ On account deletion: Anonymize (keep aggregate stats, delete personal link)

Professional Data:
├─ While professional account active: Keep full policy history
├─ After pro closes account: Anonymize policy impact (don't identify pro)
└─ Audit trail: Keep indefinitely (compliance)
```

### 11.3 GDPR & Privacy Compliance

```
Client Right to Access:
├─ Can request: "What data do you have about me?"
├─ Platform provides: Booking history, trust events, current score (if requesting)
├─ Cannot hide: Trust score or events (transparency)

Client Right to Deletion:
├─ Can request: Delete my account and data
├─ Platform: Delete personal data, anonymize aggregates
├─ Limitation: Some data (audit) kept for legal compliance

Client Right to Correction:
├─ Can dispute: "That no-show didn't happen, I have proof"
├─ Process: Admin review with evidence
├─ Result: Score adjusted, event marked as disputed
```

---

## 12. Cultural Fit & Local Context

### 12.1 Why This Design for Israeli Market

```
Israeli Culture:
├─ Relationships and personal trust matter
├─ Direct communication preferred (vs. hidden algorithms)
├─ Small community (word of mouth is powerful)
├─ No-shows and last-minute cancellations are known issues
├─ Cash payment on-site is still dominant
│
Trust System Alignment:
├─ Non-punitive: Recognizes people have bad days
├─ Transparent: Admin oversight, not hidden AI blackbox
├─ Behavior-based: Personality/identity irrelevant
├─ Recovery paths: Allows redemption and second chances
├─ Optional for professionals: Respects autonomy
└─ Protects pros: But doesn't permanently block clients
```

### 12.2 Alternative Market Approaches (Not V1)

```
What we're NOT doing:

❌ Social credit system: No public score, no shaming
❌ Permanent blacklist: No "forever banned" except for abuse
❌ Fully automated: Trust but verify, human oversight
❌ Algorithmic opacity: Transparent rules, not AI black box
❌ Payment-heavy: Payment is option for protection, not requirement
└─ This reflects Israeli pragmatism and fairness culture
```

---

## 13. Testing & Validation

### 13.1 Unit Tests (Score Calculation)

```
Test Cases:

New Client:
├─ Starting score = 50 ✓
└─ No events = score 50

Completed Booking:
├─ New score = previous + 2 ✓
└─ 5 completed = +10 (capped)

No-Show Event:
├─ New score = previous - 8 ✓
└─ Multiple no-shows = cumulative -8 each

Decay:
├─ Event at day 0: Full weight ✓
├─ Event at day 45: 50% weight ✓
├─ Event at day 150: 0% weight ✓

Bounds:
├─ Score never below 0 ✓
├─ Score never above 100 ✓
```

### 13.2 Integration Tests (Policy Enforcement)

```
Test Cases:

ACCEPT_TRUSTED_ONLY Policy:
├─ Client score 75 → booking ACCEPTED ✓
├─ Client score 65 → booking REJECTED ✓
└─ Client sees generic "unavailable" message ✓

DEPOSIT_FOR_LOW_TRUST Policy:
├─ Client score 75 → no payment required, CONFIRMED ✓
├─ Client score 65 → payment required, PENDING_PAYMENT ✓
└─ Client sees "professional requires deposit" ✓

MANUAL_APPROVAL Policy:
├─ All clients → PENDING_APPROVAL ✓
├─ Pro approves → CONFIRMED ✓
├─ Pro declines → DECLINED ✓

Score Improvement:
├─ Client with score 30 → 5 completed bookings → score 40 ✓
├─ Decay → old negative events fade → score recovers ✓
```

### 13.3 A/B Testing Considerations

```
V1: Trust System is mandatory (not A/B tested)
├─ All clients experience it
├─ No control group
└─ Too important for fairness to experiment

Monitoring After Launch:
├─ Track no-show rate trends
├─ Track cancellation patterns
├─ Track professional policy adoption
├─ Gather feedback from both sides
└─ Plan improvements for V2 based on data
```

---

## 14. Communication & Change Log

### 14.1 Announcing Trust System to Users

**For Clients:**
```
"Beauty Booking uses a fair system to help professionals manage bookings.
If you consistently show up on time and honor your bookings,
you'll have a seamless experience with all professionals.
If you have a pattern of no-shows or cancellations,
some professionals may ask for a deposit to confirm.
This isn't punishment, it's protection for both of you.
Your reliability improves as you keep your bookings."
```

**For Professionals:**
```
"We offer optional policies to manage bookings based on reliability patterns.
You can accept all bookings, require deposits from less reliable clients,
require manual approval, or only accept highly reliable clients.
This gives you control without seeing scores or making manual decisions.
All policies are optional; you can change anytime."
```

### 14.2 Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | May 18, 2026 | Initial release, FROZEN for V1 |

---

## Conclusion

The Trust System is a **fair, non-punitive, privacy-respecting mechanism** that:

1. Protects professionals from unreliable clients without permanent harm
2. Maintains transparency through behavior-based scoring and human oversight
3. Provides recovery paths for clients to rebuild trust
4. Remains invisible to both sides, avoiding shaming or discrimination
5. Aligns with local Israeli culture of fairness and direct communication

**Status: ✅ V1 SPECIFICATION LOCKED FOR PRODUCTION**

All design decisions prioritize fairness, recovery, and respect.

No code, all trust. 🤝

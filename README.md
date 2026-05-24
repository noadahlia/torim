# Torim - Beauty Booking Platform

A modern beauty booking platform for independent professionals in Israel. Built with Fastify, React Native, and Supabase.

**Status:** Phase 2-3 Complete - MVP Ready (May 2026)

## What is Torim?

Torim enables beauty professionals and clients to:
- **Clients:** Discover professionals, view services, book appointments atomically, manage reservations
- **Professionals:** Set schedules, manage availability, control booking policies, track client reliability
- **Platform:** Trust-based system with silent rejection for risky bookings

## Project Status

### ✅ Phase 1: Setup (Complete)
- Monorepo with pnpm + Turbo
- TypeScript strict mode everywhere
- ESLint + Prettier configuration
- GitHub Actions CI pipeline
- Vercel deployment setup

### ✅ Phase 2: Implementation (Complete)
- **Backend**: Full REST API with services, routes, middleware
- **Mobile**: Complete app with auth screens, professional browsing, booking flow
- **Database**: PostgreSQL schema with 8 core tables + indexes
- **Core Services**:
  - BookingEngine: Atomic reservations, policy evaluation, refund calculation
  - TrustService: Client scoring (0-100), event-based deltas
  - TimeZoneService: UTC storage, local conversions, DST handling
  - AuthService: Signup/login with Supabase Auth

### ✅ Phase 3: Testing & DevOps (In Progress)
- Jest test infrastructure with ts-jest
- 30+ test cases for BookingEngine
- Tests for TrustService boundaries
- TimeZoneService executable tests (DST, overlaps)
- GitHub Actions CI (lint, type-check, test)

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native + Expo, TanStack Query |
| **Backend** | Fastify + Node.js 18+, TypeScript strict |
| **Database** | PostgreSQL (Supabase managed) |
| **Auth** | Supabase Auth + JWT |
| **Storage** | UTC-first with timezone conversions |
| **Build** | pnpm workspace + Turbo |
| **Testing** | Jest + ts-jest |
| **Deployment** | Vercel (backend), Expo (mobile) |

### Project Structure

```
packages/
├── backend/
│   ├── src/
│   │   ├── main.ts                  # Fastify server entry
│   │   ├── config/env.ts            # Zod environment validation
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT verification
│   │   │   └── errorHandler.ts      # Global error handling
│   │   ├── routes/
│   │   │   ├── auth.ts              # /auth endpoints
│   │   │   ├── users.ts             # /users endpoints
│   │   │   ├── professionals.ts     # /professionals endpoints
│   │   │   ├── bookings.ts          # /bookings endpoints
│   │   │   └── index.ts             # Route registration
│   │   ├── services/                # Business logic
│   │   │   ├── BookingEngine.ts     # ⭐ Core: atomic reservations
│   │   │   ├── TrustService.ts      # Client trust scoring
│   │   │   ├── ReservationService.ts
│   │   │   ├── AuthService.ts
│   │   │   ├── TimeZoneService.ts   # UTC conversions
│   │   │   └── ProfessionalService.ts
│   │   ├── utils/errors.ts          # Typed error hierarchy
│   │   ├── types.ts                 # Fastify augmentation
│   │   └── __tests__/               # Jest test suite
│   ├── supabase/migrations/001_initial.sql
│   └── jest.config.js
├── mobile/
│   ├── App.tsx                      # Navigation root
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── SignupScreen.tsx
│   │   ├── HomeScreen.tsx           # Browse professionals
│   │   ├── ProfessionalDetailScreen.tsx
│   │   ├── BookingScreen.tsx        # Select date/time
│   │   └── ReservationsScreen.tsx   # View/cancel bookings
│   └── lib/
│       ├── auth.ts                  # Auth context + Supabase
│       ├── api.ts                   # Axios with token management
│       └── context.ts               # App state
└── shared/
    └── src/types/domain.ts          # Shared TypeScript types
```

## Core Features Implemented

### BookingEngine ⭐ (Race-Condition Safe)
- **Availability Calculation**: 15-minute slots with timezone awareness
- **Three-Layer Protection**:
  1. Application-level overlap detection
  2. Database UNIQUE constraint
  3. Error 23505 handling for double-books
- **Four Acceptance Policies**:
  - `OPEN` → Instant confirmation
  - `FILTER_LOW_TRUST` → Silent rejection for score < 70
  - `REQUIRE_MANUAL_CONFIRMATION` → Professional approval required
  - `REQUIRE_DEPOSIT_FOR_LOW_TRUST` → Deposit for low-trust clients
- **Refund Calculation**:
  - Standard: 100% >24h, 80% (2-24h), 0% <2h
  - Flexible: 100% always
  - Strict: 0% always
  - Pro cancellation: Always 100%

### Trust System (Opaque Scoring)
- **Score Range**: 0-100 (new clients: 50)
- **Event Points**:
  - Booking completed: +2
  - No-show: -8
  - Cancellation 0-24h: -5
  - Cancellation 24h+: -2
- **Immutable Events**: Never modified, only appended
- **Silent Rejection**: Low-trust clients see "unavailable" not "rejected"

### API Endpoints
```
POST   /api/v1/auth/signup           # Create account with timezone
POST   /api/v1/auth/login            # Email/password auth
POST   /api/v1/auth/logout           # Client-side logout

GET    /api/v1/users/profile         # Get user profile (auth required)
PUT    /api/v1/users/profile         # Update profile (auth required)

GET    /api/v1/professionals         # List all professionals
GET    /api/v1/professionals/:id     # Professional + services
GET    /api/v1/professionals/:id/availability  # Available slots

POST   /api/v1/bookings              # Create reservation (auth required)
GET    /api/v1/bookings              # My reservations (auth required)
GET    /api/v1/bookings/:id          # Reservation detail
POST   /api/v1/bookings/:id/cancel   # Cancel reservation (auth required)
```

### Database Schema
- **users** - Auth integration + timezone
- **professional_profiles** - Policies (acceptance, cancellation)
- **professional_schedules** - Weekly recurring availability
- **services** - Price, duration, buffer times
- **reservations** - Bookings with immutable snapshots
- **payments** - Stripe integration hooks
- **client_trust_profiles** - Current score + timestamp
- **trust_events** - Immutable audit log
- **audit_logs** - Complete system history

## Development Setup

### Prerequisites
- Node.js 18+
- pnpm 8+
- Supabase project (free tier OK)

### Installation

```bash
# Clone and install
git clone https://github.com/noadahlia/torim.git
cd torim
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Running Locally

```bash
# Start all services (backend + mobile)
pnpm dev

# Or individual services:
cd packages/backend && pnpm dev    # Backend: http://localhost:3000
cd packages/mobile && pnpm start   # Mobile: Expo CLI
```

### Commands

```bash
pnpm build              # Build all packages
pnpm lint               # ESLint check
pnpm type-check         # TypeScript validation
pnpm test               # Jest test suite
pnpm test:watch        # Watch mode
pnpm format             # Auto-format with Prettier
```

## Testing

### Test Coverage
- **BookingEngine.test.ts**: 30+ test cases
  - Policy evaluation
  - Refund calculation
  - Double-booking prevention
  - Timezone edge cases (DST)
  
- **TrustService.test.ts**: Score boundary tests
  - Points delta validation
  - 0-100 clamping
  - Event immutability
  
- **TimeZoneService.test.ts**: Executable tests
  - Day-of-week calculation
  - Time overlap detection
  - DST transitions

### Run Tests
```bash
pnpm test                  # All tests
pnpm test --watch         # Watch mode
pnpm test --coverage      # Coverage report
```

## Deployment

### Backend (Vercel)
1. GitHub connected to Vercel
2. Environment variables set in Vercel dashboard
3. Main branch auto-deploys
4. CI checks run before deployment

```bash
# Manual deployment
git push origin main
```

### Mobile (Expo)
```bash
# Create Expo project and build
eas build --platform ios
eas build --platform android
eas submit --platform all
```

### Database Migrations
```bash
# Apply migrations in Supabase dashboard or CLI
supabase migration up
```

## Error Handling

Structured error types (HTTP status codes):
- `ValidationError` (400) - Input validation failed
- `AuthenticationError` (401) - Auth required/invalid
- `AuthorizationError` (403) - Permission denied
- `NotFoundError` (404) - Resource not found
- `ConflictError` (409) - Business logic error (double-booking, silent rejection)
- `PaymentError` (402) - Payment failed
- `ExternalServiceError` (503) - Third-party service down

## Key Design Principles

1. **UTC Storage**: All times in UTC, conversions at API boundaries
2. **Server-Side Slots**: Never pre-calculated or cached
3. **Atomic Transactions**: Bookings are all-or-nothing
4. **Immutable Trust**: Events never modified, only appended
5. **Silent Rejection**: Low-trust users see "unavailable"
6. **Snapshot Fields**: Historical bookings preserved even if service changes
7. **Typed Errors**: No generic 500s for expected failures

## Next Steps

- [ ] Database migration automation
- [ ] Supabase Realtime WebSocket
- [ ] Push notifications
- [ ] Stripe payment integration
- [ ] Admin dashboard
- [ ] Email notifications
- [ ] Calendar sync (Google, Outlook)
- [ ] 180-day trust event cleanup
- [ ] Rate limiting
- [ ] Bot detection

## Related Documentation

- [docs/BOOKING_ENGINE.md](./docs/BOOKING_ENGINE.md) - Deep dive on reservation logic
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System design decisions
- [docs/SETUP.md](./docs/SETUP.md) - Detailed setup guide
- [AGENTS_PLAN.md](./AGENTS_PLAN.md) - Agent orchestration plan

## License

Proprietary - Torim Beauty Booking Platform

---

**Last Updated:** May 24, 2026  
**Phase Status:** 2-3 Complete, MVP Ready  
**Main Branch:** Production-ready API + Mobile app

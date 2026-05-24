# Torim - Beauty Booking App

Digital booking platform for independent beauty professionals in Israel.

**Status:** V1 Development (May 2026)

## What is Torim?

Torim helps beauty professionals (nail artists, lash technicians, estheticians) and clients:
- **Clients:** Discover professionals, book appointments, receive confirmations/reminders
- **Professionals:** Manage schedules, availability, bookings, communicate with clients

## Project Structure

```
torim/
├── packages/
│   ├── backend/          # Node.js + Fastify API
│   ├── mobile/           # React Native + Expo app (iOS & Android)
│   └── shared/           # Shared types & utilities
├── docs/                 # Documentation
├── AGENTS_PLAN.md        # Agent orchestration plan
└── README.md             # This file
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend Mobile** | React Native + Expo |
| **Backend** | Node.js + Fastify |
| **Database** | PostgreSQL (Supabase) |
| **Auth** | Supabase Auth |
| **Real-time** | Supabase Realtime |
| **Deployment** | Vercel (backend), EAS (mobile) |
| **Monorepo** | pnpm + Turbo |

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+

### Backend

```bash
cd packages/backend
pnpm install
pnpm dev
```

Server at `http://localhost:3000`

### Mobile

```bash
cd packages/mobile
pnpm install
pnpm start
# Scan QR code with Expo Go or press 'a'/'i' for emulator
```

## Documentation

- [AGENTS_PLAN.md](./AGENTS_PLAN.md) - Agent orchestration plan
- [docs/SETUP.md](./docs/SETUP.md) - Environment setup
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Technical architecture
- [docs/BOOKING_ENGINE.md](./docs/BOOKING_ENGINE.md) - Core booking logic
- [backend/README.md](./packages/backend/README.md) - Backend API docs
- [mobile/README.md](./packages/mobile/README.md) - Mobile app docs

## Key Features (V1)

### Implemented
- User authentication (signup/login)
- Professional profiles + services
- Availability calculation (dynamic, server-side)
- Booking creation (atomic, race-condition safe)
- Email confirmations
- Audit logging
- Basic dashboard (client + pro views)

### Deferred to V2
- Stripe payments
- SMS notifications
- Rescheduling
- Group bookings
- Multi-language support

## Non-Negotiable Principles

1. **All booking logic server-side** - Clients cannot manipulate slots
2. **Slots calculated on-demand** - Never pre-stored
3. **UTC storage** - All timestamps stored in UTC
4. **Atomic operations** - Bookings are all-or-nothing
5. **Audit trail** - Every critical action logged
6. **Typed errors** - No generic 500s for business logic errors

## Development

### Install all dependencies

```bash
pnpm install
```

### Run all dev servers

```bash
pnpm dev
```

### Lint & Type Check

```bash
pnpm lint
pnpm type-check
```

### Run Tests

```bash
pnpm test
```

## Deployment

### Backend (Vercel)
```bash
git push origin main
# Vercel auto-deploys
```

### Mobile (EAS)
```bash
eas build --platform ios
eas build --platform android
```

## Contributing

1. Read the documentation
2. Follow TypeScript strict mode
3. Test locally before pushing
4. Keep commits focused
5. Update docs if changing specs

## Support

For issues/questions:
1. Check the relevant README
2. Check documentation in `docs/`
3. Check GitHub issues
4. Contact team

## License

Proprietary - Beauty Booking Project

## Team

- Product: You
- Engineering: You
- Design: TBD

---

**Last Updated:** May 2026  
**Version:** V1 Development

# Torim Backend API

Node.js + Express + PostgreSQL + Prisma

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, RESEND_API_KEY, etc.
```

### 3. Setup database
```bash
npm run prisma:generate
npm run db:push
```

### 4. Run in development
```bash
npm run dev
```

Server will start at `http://localhost:3000`

## Commands

- `npm run dev` - Start development server (with hot reload)
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm run db:push` - Sync Prisma schema with database
- `npm run db:migrate` - Create migration
- `npm run db:seed` - Seed database with test data
- `npm run lint` - Run ESLint
- `npm test` - Run tests

## Project Structure

```
src/
├── app.ts              # Express server setup
├── routes/             # API route handlers
├── services/           # Business logic (BookingEngine, etc)
├── lib/                # Utilities (JWT, logger, database)
└── middleware/         # Express middleware
```

## API Routes (V1)

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login with email/password

### Professionals
- `GET /api/professionals` - List all professionals
- `GET /api/professionals/:id` - Get professional details
- `POST /api/professionals` - Create professional profile

### Services
- `GET /api/services` - List services

### Availability (CRITICAL)
- `GET /api/availability?professional_id=xxx&date=2025-06-01` - Get available slots

### Reservations (CRITICAL)
- `POST /api/reservations` - Create booking
- `GET /api/reservations` - Get user's bookings
- `PATCH /api/reservations/:id/cancel` - Cancel booking

## Database

PostgreSQL via Supabase. Schema in `prisma/schema.prisma`

Key tables:
- `users` - All users (clients + professionals)
- `professional_schedules` - Weekly working hours
- `services` - Services offered
- `reservations` - Bookings
- `payments` - Payment records
- `audit_logs` - All changes

## Authentication

JWT tokens. Send in header:
```
Authorization: Bearer <token>
```

## Environment Variables

See `.env.example`

Key ones:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing
- `RESEND_API_KEY` - Email service
- `FIREBASE_*` - Push notifications

## Testing

Run against local database:
```bash
npm test
```

## Deployment

Push to Railway:
1. Connect GitHub repo to Railway
2. Railway auto-deploys on push
3. Add environment variables in Railway dashboard
4. Database migrations run automatically

## Notes

- All timestamps stored as UTC in database
- Timezone conversions happen at API boundaries
- All booking logic is server-side (clients don't calculate slots)
- Stripe integration is V2 (not in V1)

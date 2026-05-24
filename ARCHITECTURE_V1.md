# Architecture V1 - Beauty Booking App
## Version Réaliste & Implémentable en Petite Équipe

**Version:** 1.0  
**Date:** Mai 2026  
**Public:** Petite équipe (2-4 devs), pré-scaleup

---

## 1. Philosophie V1: Pragmatisme sans Compromis Technique

### Objectif
Un MVP/V1 **implémentable en 3-4 mois par 2-3 devs**, qui pose les bonnes fondations pour scaler ensuite sans refonte. **Pas de débts techniques**, mais aussi **pas d'over-engineering**.

### Principes
| Principe | Explication |
|----------|------------|
| **Monolithe backend simple** | Un seul serveur Node.js. Plus facile à debugger, à déployer, à maintenir pour une petite équipe. Prêt pour découpage micro-services plus tard si besoin. |
| **Découpage métier clair** | Services bien séparés (BookingService, PaymentService, etc.) même dans le monolithe. Extraction micro-service facile après. |
| **Infrastructure minimale** | Un VPS + PostgreSQL + Redis. Pas de Kubernetes, Terraform, ou orchestration complexe au départ. Scalable verticalement dans l'immédiat. |
| **Dépendances limitées** | Open-source, auto-hébergé quand possible. Stripe pour paiements (essentiel), SMS/Email open-source. Évitons SaaS pour chaque petit truc. |
| **Logique serveur inviolable** | Même en V1, TOUT métier critique reste serveur. Les clients ne décident RIEN. |
| **Données correctes jour 1** | PostgreSQL + migrations versioned. Pas de "on va corriger la DB plus tard". |
| **Testing dès le départ** | Pas de 100% coverage, mais les zones critiques (booking, paiement) testées. |

---

## 2. Architecture Globale V1 (Schéma Simplifié)

```
┌─────────────────────────────────────────────────────────┐
│               CLIENTS (Web + Mobile)                    │
│                                                         │
│  Frontend Web (Next.js) ├─→ Stripe Checkout (hosted)   │
│  Frontend Mobile (Expo) ├─→ Stripe SDKs                │
└─────────┬───────────────────────────────────────────────┘
          │
          │ HTTPS REST + polling simple (30-60s)
          │
┌─────────▼──────────────────────────────────────────────┐
│            BACKEND MONOLITHE (Node.js)                 │
│  (Port 3000 + port 3001 pour jobs internes)           │
│                                                        │
│  Express/Fastify server                               │
│  ├─ REST API endpoints (routes/)                      │
│  ├─ Middleware (auth, validation, error handling)     │
│  ├─ Service layer (logique métier par domaine)        │
│  │  ├── AuthService (JWT, sessions)                   │
│  │  ├── UserService (profiles)                        │
│  │  ├── ProfessionalService (horaires, services)      │
│  │  ├── BookingEngine ⭐ (slots, réservations)        │
│  │  ├── PaymentService (Stripe webhook, refunds)      │
│  │  ├── NotificationService (queue)                   │
│  │  └── TimeZoneService (conversions)                 │
│  │                                                    │
│  ├─ Repositories (data access, Prisma ORM)            │
│  │  └─ Direct DB queries via Prisma                   │
│  │                                                    │
│  ├─ Jobs asynchrones (même process ou worker pool)    │
│  │  ├── sendNotifications                             │
│  │  ├── generateReminders (cron 24h/2h before)        │
│  │  ├── cleanupExpiredTempData                        │
│  │  └── reportingAggregation (daily)                  │
│  │                                                    │
│  └─ Utils & helpers                                   │
│     ├── errorHandler                                  │
│     ├── logger                                        │
│     └── validators (Zod)                              │
│                                                       │
└────────┬──────────────────────────────────────┬───────┘
         │                                      │
    ┌────▼────┐                          ┌─────▼──────┐
    │PostgreSQL│ ◄────────────────────► │ Redis      │
    │ Primary  │  (reread sur writes)    │ (Cache +   │
    │          │                         │  Sessions) │
    │ OLTP,    │                         │            │
    │ ACID,    │                         │ TTL-based  │
    │ 20GB     │                         │            │
    └──────────┘                         └────────────┘
         │
         │ (Async jobs)
         │
    ┌────▼──────────────────────────────────────┐
    │  Message Queue (simple, in-memory ou file)│
    │  ou Bull (si Redis déjà là)              │
    │                                           │
    │  Queued jobs:                            │
    │  - Send SMS (Twilio/local)               │
    │  - Send email (SMTP local ou SendGrid)   │
    │  - Stripe webhook processing             │
    │  - Payment retries                       │
    │  - Reminder scheduling                   │
    └────────────────────────────────────────┘
         │
         │ HTTP callbacks
         │
    ┌────▼──────────────────────────────────────┐
    │  External APIs (Minimal, Strategic)       │
    │                                           │
    │  ✅ Stripe (Payments - ESSENTIEL)         │
    │  ✅ Twilio (SMS - OU self-hosted)         │
    │  ⚠️  Google Maps (Optionnel V1)          │
    │  🚫 WebSockets (V1 = polling)            │
    │  🚫 Firebase (self-host + cron)          │
    └────────────────────────────────────────┘
```

### Points Clés du Schéma V1

1. **Monolithe Backend Unique** 
   - Un seul serveur Node.js qui gère tout
   - REST API + jobs asynchrones dans le même process (avec worker threads ou separation simple)
   - Pas de micro-services, pas de gRPC, pas de message broker complexe

2. **PostgreSQL comme Source de Vérité**
   - OLTP, ACID, transactional consistency
   - Migrations versioned (Prisma)
   - Tout en UTC
   - Pas de MongoDB (pas besoin de schema-less ici)

3. **Redis pour Cache + Sessions**
   - Cache des slots calculés (TTL 5 min)
   - Sessions JWT + refresh tokens (optionnel)
   - Rate limiting
   - Pas d'état critique stocké là

4. **Jobs Asynchrones Simples**
   - Bull ou node-cron pour récurrence
   - Ou simple worker pool si load faible
   - Notifs, reminders, reporting
   - Queue file-based ou Redis (Redis preferé si déjà là)

5. **Pas de WebSockets V1**
   - Frontend poll toutes les 30-60s (acceptable pour booking)
   - Availabilité update au besoin (submit → refetch)
   - WebSockets ajoutés en V2 si traffic justifie

---

## 3. Structure de Projet V1 (Monorepo Léger)

```
beauty-booking/
│
├── packages/
│   │
│   ├── backend/                       # Monolithe Node.js
│   │   ├── src/
│   │   │   ├── index.ts               # Entry point
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── errorHandler.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── logging.ts
│   │   │   │
│   │   │   ├── routes/                # Express routes (par domaine)
│   │   │   │   ├── auth.ts
│   │   │   │   ├── bookings.ts        # ⭐ Critique
│   │   │   │   ├── services.ts
│   │   │   │   ├── professionals.ts
│   │   │   │   ├── clients.ts
│   │   │   │   ├── payments.ts
│   │   │   │   └── health.ts          # Healthchecks
│   │   │   │
│   │   │   ├── services/              # Logique métier (domaines)
│   │   │   │   ├── BookingEngine.ts   # ⭐ CRITIQUE
│   │   │   │   │   └─ Core: calculateSlots, reserveSlot, checkConflicts
│   │   │   │   ├── ReservationService.ts
│   │   │   │   ├── PaymentService.ts
│   │   │   │   ├── NotificationService.ts
│   │   │   │   ├── ProfessionalService.ts
│   │   │   │   ├── UserService.ts
│   │   │   │   ├── AuthService.ts
│   │   │   │   └── TimeZoneService.ts ⭐
│   │   │   │
│   │   │   ├── repositories/          # Data access layer
│   │   │   │   ├── UserRepository.ts
│   │   │   │   ├── ReservationRepository.ts
│   │   │   │   ├── ServiceRepository.ts
│   │   │   │   ├── ProfessionalRepository.ts
│   │   │   │   └── PaymentRepository.ts
│   │   │   │
│   │   │   ├── jobs/                  # Async jobs
│   │   │   │   ├── sendNotifications.ts
│   │   │   │   ├── generateReminders.ts
│   │   │   │   ├── stripeWebhooks.ts
│   │   │   │   └── cleanupStaleData.ts
│   │   │   │
│   │   │   ├── integrations/
│   │   │   │   ├── stripe.ts          # ✅ Essentiel
│   │   │   │   ├── twilio.ts          # SMS ou fallback
│   │   │   │   ├── smtp.ts            # Email (NodeMailer)
│   │   │   │   └── queue.ts           # Bull ou simple
│   │   │   │
│   │   │   ├── types/
│   │   │   │   ├── domain.ts
│   │   │   │   ├── api.ts
│   │   │   │   └── errors.ts
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── timezone.ts        # date-fns-tz
│   │   │   │   ├── validators.ts      # Zod
│   │   │   │   ├── logger.ts
│   │   │   │   ├── errors.ts
│   │   │   │   └── jwt.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   └── env.ts
│   │   │   │
│   │   │   └── tests/
│   │   │       ├── unit/
│   │   │       │   └── services/
│   │   │       │       ├── BookingEngine.test.ts
│   │   │       │       ├── PaymentService.test.ts
│   │   │       │       └── TimeZoneService.test.ts
│   │   │       │
│   │   │       └── integration/
│   │   │           ├── bookings.test.ts
│   │   │           ├── payments.test.ts
│   │   │           └── fixtures/
│   │   │
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # ⭐ Source de vérité DB
│   │   │   ├── migrations/
│   │   │   └── seed.ts                # Data de dev/test
│   │   │
│   │   ├── .env.example
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── web/                           # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── signup/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   │
│   │   │   ├── (client)/
│   │   │   │   ├── search/page.tsx
│   │   │   │   ├── professionals/[id]/page.tsx
│   │   │   │   ├── book/[serviceId]/page.tsx
│   │   │   │   ├── reservations/page.tsx
│   │   │   │   └── account/page.tsx
│   │   │   │
│   │   │   ├── (professional)/
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── schedule/page.tsx
│   │   │   │   ├── reservations/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   │
│   │   │   └── api/
│   │   │       └── auth/[...nextauth]/route.ts (optionnel)
│   │   │
│   │   ├── components/
│   │   │   ├── BookingFlow/
│   │   │   ├── ProfessionalCard/
│   │   │   ├── AvailabilityCalendar/
│   │   │   └── ...
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                 # Centralized API client
│   │   │   ├── auth.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useBooking.ts
│   │   │   │   ├── useAvailability.ts
│   │   │   │   └── useAuth.ts
│   │   │   └── utils.ts
│   │   │
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── mobile/                        # React Native + Expo
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (client)/
│   │   │   ├── (professional)/
│   │   │   └── ...
│   │   │
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api.ts                 # Même client API que web
│   │   │   └── ...
│   │   │
│   │   ├── app.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                        # Types & utils partagés
│       ├── types/
│       │   ├── api.ts
│       │   ├── domain.ts
│       │   └── errors.ts
│       │
│       ├── utils/
│       │   ├── timezone.ts
│       │   ├── validators.ts
│       │   └── ...
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── docker-compose.yml                 # Local dev: DB + Redis
├── Dockerfile.api                     # Backend container
├── .github/
│   └── workflows/
│       ├── test.yml                   # Unit + integration tests
│       ├── lint.yml                   # ESLint, TypeScript
│       └── deploy.yml                 # Deploy to VPS
│
├── docs/
│   ├── ARCHITECTURE_V1.md             # Ce fichier
│   ├── API.md                         # REST endpoints
│   ├── DATABASE.md                    # Schema Prisma + migrations
│   ├── BOOKING_ENGINE.md              # Logique réservation
│   ├── DEPLOYMENT.md                  # Comment déployer (simple)
│   └── RUNBOOK.md                     # Ops + troubleshooting
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc.json
└── README.md
```

### Justification Monorepo Simple

- **pnpm** (pas yarn/npm): Plus rapide, meilleure gestion dépendances
- **Pas de Turbo V1**: Ovetkill pour 3 packages. Ajouté si builds trop lents
- **Shared package**: Types + utils partagées (pas code métier)
- **Easy extraction**: Si un jour on scinde frontend/backend, structurés pour ça déjà

---

## 4. Composants Détaillés

### 4.1 Backend (Monolithe Node.js)

| Composant | Tech | Rôle | Critique? |
|-----------|------|------|-----------|
| **Framework HTTP** | Fastify (ou Express) | REST API | ✅ |
| **Runtime** | Node.js 20 LTS | Exécution | ✅ |
| **Langage** | TypeScript | Type safety | ✅ |
| **ORM** | Prisma | DB access, migrations | ✅ |
| **Validation** | Zod | Input validation | ✅ |
| **JWT** | jsonwebtoken | Auth tokens | ✅ |
| **Password** | bcrypt | Hash passwords | ✅ |
| **Timezone** | date-fns + date-fns-tz | TZ conversions | ✅ |
| **Logging** | pino | Structured logs | ⚠️ |
| **Task Queue** | Bull ou node-cron | Async jobs | ✅ |
| **Redis Client** | ioredis | Cache + queue | ⚠️ |
| **Stripe SDK** | @stripe/stripe-js | Payments | ✅ |
| **Twilio SDK** | twilio | SMS (ou skip) | ⚠️ |
| **Email** | nodemailer | SMTP local | ⚠️ |
| **Testing** | Jest + Supertest | Unit + integration | ✅ |

**Points clés:**
- Fastify sur Express pour V1: Plus rapide, validation built-in, meilleure DX
- Prisma pour migrations versioned et type-safe queries
- Zod partagé avec frontend pour validation identique
- Pas de gros frameworks (NestJS) → plus simple à maintenir
- Logs structurés en JSON (pino) → parsable, analytics-ready

### 4.2 Frontend Web (Next.js)

| Composant | Tech | Rôle | Critique? |
|-----------|------|------|-----------|
| **Framework** | Next.js 14 (App Router) | SPA + SSR | ✅ |
| **Langage** | TypeScript | Type safety | ✅ |
| **Styling** | TailwindCSS | CSS utility | ✅ |
| **State** | React Context + TanStack Query | Client state + caching | ✅ |
| **Forms** | React Hook Form | Form handling | ✅ |
| **Validation** | Zod (partagé) | Input validation | ✅ |
| **HTTP Client** | fetch (native) | API calls | ✅ |
| **Date/Time** | date-fns | Date UI | ✅ |
| **UI Components** | Headless UI + custom | Accessible | ⚠️ |
| **Testing** | Jest + React Testing Library | Component tests | ⚠️ |

**Points clés:**
- Next.js App Router: File-based routing, layouts, streaming
- TailwindCSS: Pas de CSS-in-JS, production-ready
- TanStack Query: Caching smart, background refresh, optimistic updates
- Polling simple (30-60s) pour disponibilités: Pas besoin WebSockets V1
- Pas de Redux/Zustand overkill: Context + Query suffisent

### 4.3 Frontend Mobile (React Native + Expo)

| Composant | Tech | Rôle | Critique? |
|-----------|------|------|-----------|
| **Framework** | React Native + Expo | Mobile app | ✅ |
| **Routing** | Expo Router | File-based navigation | ✅ |
| **Styling** | NativeWind (Tailwind pour RN) | Consistent avec web | ✅ |
| **State** | React Context + TanStack Query | Same as web | ✅ |
| **Storage** | AsyncStorage | Persistent local data | ✅ |
| **Push Notifications** | Expo Notifications | App notifications | ⚠️ |
| **HTTP Client** | fetch (native) | API calls | ✅ |
| **Date/Time** | date-fns | Date UI | ✅ |
| **Testing** | Jest + React Native Testing Library | Basic tests | ⚠️ |

**Points clés:**
- Expo: Managed service, build easy, hot reload
- Parity avec web: Même API client, même validation (Zod)
- AsyncStorage pour offline support: Queue local bookings, sync au reconnect
- Push via Expo built-in: Simple, no Firebase setup nécessaire V1
- No complex native modules: Reste dans le managed Expo realm

### 4.4 Base de Données (PostgreSQL)

| Aspect | Choix | Justification |
|--------|-------|----------------|
| **SGBD** | PostgreSQL 15 | Stable, ACID, JSON, full-text search. Overkill vs SQLite mais correct pour scale. |
| **Hébergement** | Self-hosted VPS ou managed (AWS RDS) | Self-hosted pour coûts V1, RDS si growth justifie |
| **Replication** | Pas V1, single instance | Ajouté après si up-time critique |
| **Backups** | pg_dump automatisé + S3 | Daily backups, point-in-time recovery |
| **Migrations** | Prisma Migrations | Versioned, reversible, automated |
| **Indexing** | Strategic (PK, FK, frequent queries) | Pas d'over-indexing, measurements au besoin |
| **Timezone** | Tout en UTC | Conversion à l'application, aucune ambiguité |

**Schéma simplifié (pas encore modélisé, mais thèmes):**
- Users (unique per person, with roles: CLIENT, PROFESSIONAL, ADMIN)
  - Une personne = un user
  - Roles multiples possibles (une pro peut être aussi cliente)
  - Rôle détermine permissions et features visibles
- ProfessionalProfiles (1-to-1 avec User, optionnel)
  - Portfolio, services, horaires, rating
  - Créé quand user switch to PRO role
- Services (durée, price, description, lié à ProfessionalProfile)
- Reservations (le cœur: qui (client user), quoi (service), quand, status, lié à professional user)
- Payments (stripe payment id, amount, status, liée à reservation)
- Reviews (post-service ratings, par client, pour professional)

### 4.5 Cache & Sessions (Redis)

| Cas d'Usage | TTL | Critique? | Fallback |
|-------------|-----|-----------|----------|
| Calculated slots (availabilité) | 5-10 min | ⚠️ | Recalculate on cache miss |
| Session tokens (optionnel) | 1 day | ⚠️ | JWT suffisent sans Redis sessions |
| Rate limiting | Real-time | ⚠️ | In-memory rate limiter (simple) |
| Job queue | Until processed | ✅ | File-based queue fallback |
| Temperature flags | Minutes | ⚠️ | Pas critique |

**Points clés:**
- Redis pas critique V1: Dégradation gracieuse si down
- Cache slots avec TTL court: Pas d'info stale
- Queue jobs: Bull-Redis ou fallback simple file
- Pas de sessions Redis: JWT JWT + optional local cache suffisent

### 4.6 Jobs Asynchrones (Système Simple)

```
Backend Process
├── HTTP Server (Fastify)
└── Worker Pool (Bull + Redis OR node-cron)
    ├── sendNotifications (immediate after booking)
    ├── generateReminders (cron: 24h before, 2h before)
    ├── stripeWebhookRetry (cron: every 5 min)
    ├── cleanupExpiredPendingPayments (cron: daily)
    └── reportingAggregation (cron: daily)
```

**Tech:**
- **Bull** (si Redis): Queue polished, retry, UI monitoring
- **node-cron** (si simple): Cron jobs, lightweight
- **Hybrid**: Bull pour queue, node-cron pour scheduled tasks

**Implémentation V1:** Bull + Redis (car Redis déjà pour cache)

### 4.7 Notificationns (Simple Stack)

| Canal | V1 | Tech | Cost | Self-Hosted? |
|-------|----|----|------|--------------|
| **Email** | Confirmation + receipt | NodeMailer + SMTP | Free (self) ou $0 | ✅ Self-hosted |
| **SMS** | Reminders (24h, 2h) | Twilio (ou alternative local IL) | Payant (~$0.05/msg) | ❌ Twilio |
| **Push Mobile** | Booking confirmation | Expo Notifications | Free | ✅ Expo-managed |
| **In-app** | Status updates | Via API polling | Free | ✅ Included |

**Points clés:**
- Email: NodeMailer + SMTP local (mailtrap.io pour dev, SendGrid optionnel en prod)
- SMS: Twilio essentiel (reminders vitales), explore alternatives locales IL
- Push: Expo Notifications (gratuit, simple)
- WebSocket: Pas V1, polling 30-60s suffisent pour UI updates

### 4.8 Paiements (Stripe)

| Aspect | Choix | Justification |
|--------|-------|----------------|
| **Processor** | Stripe | Leader, webhooks robustes, Israël supporté |
| **Type** | Payment Intents (modern API) | SCA-ready, 3D Secure, fraud detection |
| **Checkout** | Hosted Stripe Checkout | Simplest, PCI compliant, no custom form needed |
| **Refunds** | Via Stripe API | Automatisé après cancellation reservation |
| **Currency** | ILS (Israeli Shekel) | Monnaie locale |
| **Webhook Security** | Signature verification | Stripe event validation |
| **Idempotency** | Request key dedupe | Prevent double charges |

**Flux V1:**
1. Client sélectionne slot
2. Frontend envoie reservation request (PENDING_PAYMENT status)
3. Backend calcule amount, crée Stripe Payment Intent
4. Frontend redir vers Stripe Hosted Checkout
5. Après payment, Stripe webhook confirme
6. Backend update reservation à CONFIRMED

---

## 5. Choix Techniques Finaux & Justifications

### 5.1 Décisions Prises vs Architecture Initiale

| Decision | Initial | V1 | Justification |
|----------|---------|-----|-----------|
| **Architecture** | Micro-services (futur) | Monolithe backend | Petit team, plus facile déployer/debug. Easy extractor après. |
| **Infrastructure** | K8s + Terraform | VPS simple + Docker | Scaling pas besoin K8s avant 10k+ users. Docker suffisent. |
| **Real-time** | WebSocket (Socket.io) | HTTP Polling | WebSockets complexité, polling 30s acceptable pour V1. Add later. |
| **Frontend State** | Zustand | Context + TanStack Query | Less boilerplate, Query handles caching. Zustand si complexity grows. |
| **Database** | PostgreSQL + Replica | PostgreSQL single | Replica ajouté après pour scaling reads. V1 single instance OK. |
| **Job Queue** | RabbitMQ / dedicated | Bull (Redis) | RabbitMQ overkill. Bull simple, already in Redis. |
| **Email** | SendGrid SaaS | Self-hosted SMTP | Self-hosted cheaper, SendGrid added if volume >1000/day. |
| **Auth** | OAuth (Google) | JWT manual | JWT simpler pour V1. OAuth added if demand. |
| **Monitoring** | Datadog / full stack | Simple logging + status page | Datadog payant, logs + Sentry for errors suffisent. |
| **Testing** | 80% coverage + E2E | 60% coverage + critical paths | E2E tests slow, prioritize unit/integration for booking + payment. |
| **CDN** | CloudFlare globally | Direct VPS ou simple CDN | CDN added when scaling. Direct works V1. |
| **Database Replication** | Primary + Replica + read pool | Single instance + backups | Replica added when read scaling needed. |

### 5.2 Dépendances & Justifications

**MAINTENUES (Essentielles):**
```
@stripe/stripe-js              // Paiements ESSENTIEL
prisma                         // DB ORM ESSENTIEL
zod                            // Validation ESSENTIEL
fastify (or express)           // Framework ESSENTIEL
date-fns + date-fns-tz        // Timezone ESSENTIEL
jsonwebtoken                   // Auth ESSENTIEL
bcryptjs                       // Passwords ESSENTIEL
ioredis                        // Cache + Queue ESSENTIEL
bull                           // Jobs ESSENTIEL
```

**MINIMALES (Acceptables):**
```
pino                           // Logging simple
nodemailer                     // Email SMTP
react-hook-form               // Forms
react-query                   // Data fetching caching
tailwindcss                   // Styling
expo                          // Mobile framework
```

**REPOUSSÉES (V2+):**
```
❌ Socket.io                   // WebSocket temps réel → Polling V1
❌ Firebase                    // Auth/DB → JWT + PostgreSQL
❌ Sendgrid / Twilio SDK       // Payant → Self-hosted + later
❌ Kubernetes                  // Orchestration → VPS Docker
❌ Terraform                   // IaC → Scripts bash simples
❌ NestJS                      // Heavy framework → Fastify léger
❌ Redux/Zustand              // State → Context + Query
❌ Datadog / New Relic        // Observability → Pino logs + Sentry
❌ AWS CDN                    // Caching → Direct VPS
```

---

## 6. Points Non-Négociables à Figer DÈS MAINTENANT

### 6.1 Logique Métier TOUJOURS Serveur

**Règle Inviolable:**
- ✅ Validation input, TZ conversions, permission checks: Frontend OK
- ❌ Calcul slots disponibles: **JAMAIS frontend**
- ❌ Décision réservation possible: **JAMAIS frontend**
- ❌ Charge paiement: **JAMAIS frontend** (Stripe tokenization oui, charge non)
- ❌ Application de règles métier: **JAMAIS frontend**

**Code Pattern:**
```typescript
// ❌ JAMAIS
const availableSlots = calculateSlots(pro.schedule, reservations)

// ✅ TOUJOURS
const response = await api.post('/api/professionals/:id/availability', {
  date, serviceId
})
const { availableSlots } = response
```

**Justification:** Données correctes, sécurité, pas de hacks client. Critère #1 non-negotiable.

### 6.2 Fuseaux Horaires Corrects Jour 1

**Règle Inviolable:**
- Tout est en UTC en base de données
- Conversions toujours via `date-fns-tz` + `TimeZoneService`
- Jamais de `new Date()` ambigüe
- Tests spécifiques pour DST (Israël change 2 fois/an)

**Code Pattern:**
```typescript
// ❌ JAMAIS
const bookingTime = new Date('2025-06-15 14:00') // Ambigü

// ✅ TOUJOURS
const localTime = parseISO('2025-06-15T14:00:00')
const utcTime = zonedTimeToUtc(localTime, 'Asia/Jerusalem')
// Store: 2025-06-15T11:00:00Z
```

**Service Centralisé:**
```typescript
// src/services/TimeZoneService.ts
class TimeZoneService {
  convertToUTC(localDateTime, timezone) { ... }
  convertToLocal(utcDateTime, timezone) { ... }
  getTimezoneOffset(timezone, date) { ... }
}
```

**Justification:** Bugs timezone = nightmare en production, impossibles à débugger. Centraliser = une source de vérité.

### 6.3 Concurrence de Réservation Gérée

**Règle Inviolable:**
- Deux clients ne peuvent **pas** réserver le même slot
- Détecté au niveau: (1) Redis lock, (2) DB constraint, (3) application logic
- Idempotency keys pour retry sûr

**Pattern 3-Layers:**

```typescript
// Layer 1: Redis Distributed Lock (court terme, rapide)
const lockKey = `booking:${professionalId}:${slotId}`
const lock = await redlock.lock(lockKey, 5000) // 5 sec

try {
  // Layer 2: Application check (dernière vérification)
  const existing = await db.reservation.findUnique({
    where: { professional_id_slot_id: { professionalId, slotId } },
  })
  if (existing) throw new ConflictError('Slot already booked')
  
  // Layer 3: DB constraint (ultime filet de sécurité)
  // UNIQUE INDEX (professional_id, start_time, end_time)
  await db.reservation.create(...)
  
} finally {
  await lock.unlock()
}
```

**Justification:** Race conditions = perte de confiance, disputes clients. Multi-layer = robuste.

### 6.4 Migrations DB Versioned & Reversible

**Règle Inviolable:**
- Toute modification DB = migration Prisma explicit
- Migrations versioned, sequenced, reversible
- Jamais de "SQL manual puis oublie"
- Seed data pour dev/test

**Pattern:**
```bash
# Dev local
pnpm prisma migrate dev --name add_service_price

# Staging/Prod
pnpm prisma migrate deploy
```

**Justification:** Reproductibilité, audit trail, collaboration team facile.

### 6.5 Tests sur Zones Critiques

**Règle Inviolable:**
- Booking Engine: **100% test coverage** (unit + integration)
- Payment Flow: **100% test coverage**
- TimeZone conversions: **100% test coverage + DST edge cases**
- Auth: **Core flows tested**
- Autres: Nice-to-have

**Pattern:**
```typescript
// src/services/__tests__/BookingEngine.test.ts
describe('BookingEngine', () => {
  it('should prevent double-booking', async () => { ... })
  it('should handle concurrent requests', async () => { ... })
  it('should calculate slots correctly with multiple services', async () => { ... })
  it('should respect service buffer times', async () => { ... })
})
```

**Justification:** Booking est l'âme du produit, paiement critique. Pas de chances avec bugs.

### 6.6 Erreurs Métier Typées & Cohérentes

**Règle Inviolable:**
- Hiérarchie d'erreurs explicite
- Chaque erreur = code + message + HTTP status cohérents
- Jamais de "500 Internal Server Error" pour erreur métier
- Clients savent ce qui s'est passé

**Pattern:**
```typescript
// src/utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) { super(message) }
}

export class SlotAlreadyBookedError extends AppError {
  constructor() {
    super('This time slot is no longer available', 'SLOT_BOOKED', 409)
  }
}

export class PaymentFailedError extends AppError {
  constructor(reason: string) {
    super(`Payment failed: ${reason}`, 'PAYMENT_FAILED', 402)
  }
}
```

**Justification:** Erreurs claires = meilleure UX, debugging facile, monitoring effective.

### 6.7 Audit Logging pour Traçabilité

**Règle Inviolable:**
- Chaque action critique = log en base de données
- Quoi: action, ressource, avant/après
- Qui: userId + role
- Quand: timestamp
- Où: IP, user agent
- Non modifiable (append-only)

**Cas Critiques:**
- Réservation créée/annulée
- Paiement réussi/échoué
- Annulation refund
- Login/logout
- Modification schedule pro

**Pattern:**
```typescript
// src/repositories/AuditRepository.ts
await auditRepository.log({
  action: 'RESERVATION_CREATED',
  resourceType: 'Reservation',
  resourceId: reservationId,
  changes: { before: null, after: reservation },
  userId,
  timestamp: new Date(),
  ipAddress,
  result: 'SUCCESS'
})
```

**Justification:** Disputes clients, regulatory compliance, debugging complexe.

### 6.8 Roles Multiples par User (IMPORTANT)

**Règle Non-Négociable:**
- 1 User = 1 personne, avec rôles multiples possibles (CLIENT, PROFESSIONAL, ADMIN)
- Une pro peut réserver chez une autre pro
- Une cliente peut devenir pro plus tard
- Les rôles définissent permissions + features visibles, pas la structure DB

**Modèle Conceptuel:**
```
User (1 per person)
├── id
├── email (UNIQUE)
├── password
├── roles: [ROLE_CLIENT, ROLE_PROFESSIONAL, ROLE_ADMIN] ← Multiple possibles
├── timezone
└── verified: boolean

ProfessionalProfile (optional, created when user gets ROLE_PROFESSIONAL)
├── userId (FOREIGN KEY)
├── bio, portfolio, rating
├── services (1-to-many)
└── schedules (1-to-many)

Reservation
├── clientId → User with ROLE_CLIENT
├── professionalId → User with ROLE_PROFESSIONAL
├── ... (standard booking fields)
```

**Exemple Scénario:**
```
Marie
├── roles: [ROLE_CLIENT, ROLE_PROFESSIONAL]
├── Books chez Yaara (another pro)
├── Accepts bookings pour ses clients (nails services)
├── Can manage both sides of the app

Yaara
├── roles: [ROLE_PROFESSIONAL]
├── Never books, only provides services
├── Can later add ROLE_CLIENT if she wants
```

**Permissions par Rôle (à détailler en AUTH.md):**
| Action | ROLE_CLIENT | ROLE_PROFESSIONAL | ROLE_ADMIN |
|--------|-------------|-------------------|-----------|
| Search & browse professionals | ✅ | ✅ | ✅ |
| Make reservations | ✅ | ✅ (si elle a autre pro) | ✅ |
| Create ProfessionalProfile | ❌ | ✅ | ✅ |
| Manage own schedule | ❌ | ✅ | ✅ |
| View own bookings | ✅ | ✅ | ✅ |
| View own reservations | ✅ | ✅ | ✅ |
| Dispute settlement | ❌ | ❌ | ✅ |
| View all users | ❌ | ❌ | ✅ |

**Database Constraint Clé:**
```sql
-- A user can have multiple roles
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id),
  role TEXT CHECK (role IN ('ROLE_CLIENT', 'ROLE_PROFESSIONAL', 'ROLE_ADMIN')),
  PRIMARY KEY (user_id, role)
)

-- Or simpler: roles as enum array
ALTER TABLE users ADD COLUMN roles TEXT[] DEFAULT ARRAY['ROLE_CLIENT']
```

**API Endpoint Pattern:**
```typescript
// Check if user has specific role
async checkRole(userId, requiredRole) {
  const user = await userRepository.findById(userId)
  return user.roles.includes(requiredRole)
}

// Example: Can only make reservation if has ROLE_CLIENT
if (!await authService.hasRole(userId, 'ROLE_CLIENT')) {
  throw new PermissionError('Only clients can make reservations')
}
```

**Justification:** Flexibilité produit croissant, UX future-proof, pas de limitation arbitraire. La vie réelle = roles multiples.

---

## 7. Plan de Scalabilité V1 → V2+

### 7.1 Scaling Vertical (Jour 1 - Jour 100)

**Actuel:** 1 VPS + PostgreSQL + Redis (simple, accessible 1-2 devs)

```
Single VPS (2-4 CPU, 4-8GB RAM)
├── Node.js API + workers
├── PostgreSQL (single)
└── Redis (single)

Handles: ~100 concurrent users, ~1000 bookings/day
```

Coûts: ~$50-100/mois

### 7.2 Scaling Horizontal (Jour 100 - Jour 1000)

**Quand:** Traffic croît, need multiple servers

```
Load Balancer (nginx)
├── API Instance 1 (Fastify)
├── API Instance 2 (Fastify)
└── API Instance N (Fastify)

PostgreSQL Primary
├── Read Replica 1
└── Read Replica 2

Redis Cluster

Handles: ~1000+ concurrent users, ~10k+ bookings/day
```

**Steps:**
1. Extract jobs to separate worker fleet (Bull queue distributed)
2. Add read replicas for reporting queries
3. Add Redis Cluster if session volume grows
4. Add CDN for static assets

**Architecture reste la même:** 1 codebase backend, déployer sur N instances.

### 7.3 Scaling vers Micro-services (Post-V1, si jamais)

**Structure existing permet extraction clean:**

```
Monolithe V1
├── Route: /auth → Service: AuthService
├── Route: /bookings → Service: BookingEngine
├── Route: /payments → Service: PaymentService
└── Route: /notifications → Service: NotificationService

V2+ Migration Possible:
├── Micro-service: auth-service (déployer seul)
├── Micro-service: booking-service (déployer seul)
├── Micro-service: payment-service (déployer seul)
└── Shared: data models, events

Communication: gRPC ou events
```

**Mais:** Pour petit team + traffic actuel, jamais nécessaire. Keep simple.

---

## 8. Checklist de Déploiement V1

### Pré-Lancement

- [ ] Booking Engine: 100% test coverage, stress test concurrent bookings
- [ ] Timezone: All conversions tested, DST edge cases
- [ ] Payment: Stripe webhook handling tested, refunds working
- [ ] Auth: Login/logout/token refresh flows work
- [ ] Database: Migrations tested, backups automated
- [ ] Email/SMS: Notifications deliver, logs visible
- [ ] Error handling: No 500 errors for user mistakes
- [ ] Logging: Structured logs, searchable, audit trail present
- [ ] Rate limiting: API protected against abuse
- [ ] Security: No hardcoded secrets, HTTPS everywhere
- [ ] Docs: API.md, DATABASE.md, RUNBOOK.md written

### Post-Lancement

- [ ] Monitoring: Alerts configured (error rate, latency, DB health)
- [ ] Backups: Automated daily, restore tested
- [ ] On-call: Runbook written, team trained
- [ ] Metrics: Track daily bookings, payment success rate, errors
- [ ] User feedback: Channels for bugs, feature requests

---

## 9. Documents Détaillés à Écrire (Phase Suivante)

| Document | Contenu | Priority |
|----------|---------|----------|
| **API.md** | All REST endpoints, request/response schemas | 🔴 |
| **DATABASE.md** | Prisma schema, migrations, ER diagram | 🔴 |
| **BOOKING_ENGINE.md** | Slot calculation algorithm, edge cases, examples | 🔴 |
| **DEPLOYMENT.md** | How to deploy (VPS, Docker, CI/CD setup) | 🔴 |
| **RUNBOOK.md** | Incidents, debugging, common issues | 🟡 |
| **AUTH.md** | JWT flows, refresh tokens, permission checks | 🟡 |
| **TIMELINE.md** | Est. MVP timeline (phases, weekly milestones) | 🟡 |

---

## 10. Trust System & Acceptance Policies

### 10.1 Fondamental: Paiement Optionnel, Protection Ciblée

**Principe Clé V1:**
```
Payment is NOT mandatory by default.
Payment is a PROTECTION mechanism for low-trust scenarios only.

Default flow: Booking created, confirmed immediately, no payment required.

Only when professional has low-trust policy:
├─ AND client has low trust score
└─ THEN payment (deposit) required for booking to proceed
```

**Rationale:**
- Israeli beauty market: Cash payment on-site is default (local practice)
- Forcing pre-payment = friction for 95% of users who are reliable
- Payment used strategically: Protect pros from unreliable clients only
- Non-punitive: Applies to behavior, not identity

### 10.2 Professional Acceptance Policy (Configurable Rules)

Each professional can set ONE of these policies:

```
Policy 1: ACCEPT_ALL (default)
├─ Accept all bookings immediately
├─ No validation, no manual approval, no payment required
├─ Trust everyone equally
└─ Best for new pros or those comfortable with risk

Policy 2: ACCEPT_TRUSTED_ONLY
├─ Accept only clients with trust_score >= threshold (e.g., 70)
├─ Client with score < 70: Booking automatically REJECTED
├─ Client receives: "Professional unavailable at this time"
│  (no shaming, no mention of score or rejection)
├─ Client can try different time/service or contact pro manually
└─ Requires opt-in from pro, not default

Policy 3: MANUAL_APPROVAL
├─ All bookings created as PENDING_APPROVAL (not CONFIRMED)
├─ Pro receives notification: "New booking pending your approval"
├─ Pro can approve or decline within 6 hours
├─ If declined: Client notified "Professional unavailable", refund if paid
├─ If approved: Becomes CONFIRMED, pro sends greeting/details
└─ Works for all clients, regardless of score

Policy 4: DEPOSIT_FOR_LOW_TRUST
├─ Clients with score >= 70: Booking confirmed immediately, no payment
├─ Clients with score < 70: Payment (deposit) required to proceed
│  ├─ Booking status: PENDING_PAYMENT
│  ├─ Client redirected to Stripe (ILS amount = e.g., 50 NIS or service price)
│  ├─ On payment success: Booking confirmed
│  ├─ On payment failure: Booking cancelled, no charge
│  └─ On cancellation > 24h: Full refund
│
└─ Balanced: Protect pro from no-shows, don't block reliable clients
```

### 10.3 Client Never Sees Score or Rejection Reason

**What Client Experiences:**

```
Trust Score 85+:
├─ All policies feel the same: Booking accepted immediately
├─ Payment never requested
└─ Seamless experience

Trust Score 40 (low):
├─ Policy ACCEPT_ALL: Booking accepted, no change
├─ Policy ACCEPT_TRUSTED_ONLY: Sees "Professional unavailable"
│  (no mention of score, no "rejected", no "low trust")
│  (same message as if pro didn't work that time)
├─ Policy MANUAL_APPROVAL: Booking pending, pro reviews (might approve)
└─ Policy DEPOSIT_FOR_LOW_TRUST: Asked to pay deposit
   (phrased as: "Professional requires confirmation deposit for this booking")
   (no mention of score or trust)
```

**Key:** Client never learns their score or why they're treated differently.

### 10.4 Professional Never Sees Score (Abstract Rules Only)

**What Professional Sees:**

```
Pro sets: DEPOSIT_FOR_LOW_TRUST policy
├─ Dashboard shows: "Bookings from high-frequency cancellers will require deposit"
├─ But NOT: "Client X has score 35, therefore..."
├─ NOT visible: "Alice is low-trust client"
│
└─ Pro only sees: Booking comes in, either CONFIRMED or PENDING_PAYMENT
   (pro doesn't need to understand score calculation)
```

**Why:** Platform owns trust algorithm, not pro. Pro just sets high-level preference.

---

## 11. Résumé: Architecture V1 vs Initial

### Ce Qu'On Garde

✅ **Principes Inviolables:**
- Logique métier serveur
- Créneaux dynamiques
- Gestion fuseaux horaires correcte
- Transactions ACID pour booking
- Tests sur zones critiques
- Audit logging
- Erreurs typées
- **Rôles multiples par user** (pro peut être cliente aussi, cliente peut devenir pro)

✅ **Structure Scalable:**
- Services bien séparés (même dans monolithe)
- TypeScript partout
- Migrations versioned
- Monorepo pour code partagé

### Ce Qu'On Simplifie

⚡ **Pour Petite Équipe:**
- 1 monolithe backend au lieu de micro-services
- VPS simple au lieu de Kubernetes
- Polling au lieu de WebSockets
- PostgreSQL single instance au lieu de cluster
- Jobs simples (Bull) au lieu de message broker complexe
- Logs in-app au lieu de Datadog
- Email self-hosted au lieu de SaaS everywhere

### Résultat

**Une architecture que 2-3 devs peuvent implémenter en 3-4 mois, déployer avec confiance, et scaler sans refonte.**

---

## Conclusion

V1 = **Pragmatisme + Fondations Solides**

Nous sacrifions zéro sur la logique métier et la correctness, mais simplifions l'infrastructure et l'orchestration. Le code métier est prêt pour scaling; l'infra peut évoluer progressivement.

**Next step:** Valider cette architecture avec team, puis commencer par:
1. Initialiser monorepo
2. Écrire DATABASE.md + Prisma schema
3. Implémenter BookingEngine avec tests
4. Construire API REST endpoints
5. Frontend web bootstrap

Vous êtes opérationnel pour démarrer développement.

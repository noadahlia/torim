# Architecture Technique - Application de Réservation Beauté

**Version:** 1.0  
**Date:** Mai 2026  
**Statut:** Architecture de Référence (pré-implémentation)

---

## 1. Vue d'Ensemble & Principes Fondamentaux

### Objectif
Application multi-plateforme (web, iOS, Android) permettant aux clientes de découvrir et réserver auprès de professionnelles indépendantes dans les services beauté (ongles, cils, esthétique). Gestion entièrement dématérialisée des réservations avec synchronisation temps réel, paiements/acomptes, et rappels intelligents.

### Principes Non-Négociables (Pilliers)

| Principe | Justification |
|----------|---------------|
| **Logique métier côté serveur** | Garantit l'intégrité des données, prévient la fraude, centralise les règles métier. Aucune décision critique de réservation ne doit être prise par le client. |
| **Créneaux calculés dynamiquement** | Pas de pré-calcul/stockage massif. Les créneaux disponibles sont calculés en temps réel basé sur: horaires de la pro, durée des services, réservations existantes, buffer time. |
| **Gestion stricte des fuseaux horaires** | Tout est en UTC en base de données. Conversion locale au niveau API et UI uniquement. Israël (UTC+2 en été, UTC+2 en hiver — généralement UTC+2 stable). |
| **Séparation client/professionnel** | Deux flux distincts: découverte+réservation côté client; gestion côté professionnel. Une même personne ne peut pas être simultanément client et professionnel dans le système. |
| **Idempotence & Atomicité** | Les opérations critiques (réservation, paiement, annulation) doivent être idempotentes et atomiques. Gestion stricte des race conditions et double-bookings. |
| **Pas de POC jetable** | Architecture scalable, testable, maintenable. Code production-ready dès le départ. Patterns établis, conventions claires, documentation interne. |

---

## 2. Architecture Globale

### 2.1 Vue d'Ensemble des Couches

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTS (Consumers)                      │
├──────────────────┬──────────────────┬──────────────────────┤
│   Web (React)    │  iOS (React      │   Android (React     │
│   + Next.js      │   Native/Expo)   │   Native/Expo)       │
│   SPA/SSR        │                  │                      │
└──────────┬───────┴──────────┬───────┴────────────┬─────────┘
           │                  │                    │
           │ HTTPS/REST/WS    │                    │
           │                  │                    │
┌──────────┴──────────────────┴────────────────────┴─────────┐
│              API Gateway + Load Balancer                    │
│  (Reverse proxy, rate limiting, CORS, auth validation)     │
└──────────────────────┬────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼────────┐        ┌──────────▼──────────┐
│  REST API      │        │  WebSocket Server   │
│  (Express/     │        │  (Socket.io/        │
│   Fastify)     │        │   native Node.js)   │
│                │        │                     │
│ - Auth         │        │ Real-time updates   │
│ - Booking      │        │ (price changes,     │
│ - Services     │        │  slot availability) │
│ - Payments     │        │                     │
│ - Users        │        │                     │
│ - Admin        │        │                     │
└───────┬────────┘        └──────────┬──────────┘
        │                            │
        │ Shared Business Logic      │
        │                            │
┌───────▼────────────────────────────▼──────────┐
│         Business Logic Layer                  │
│  (Service classes, domain models, rules)      │
│                                               │
│ - BookingEngine (calcul slots, locking)       │
│ - ReservationService                         │
│ - PaymentService (intégration Stripe)        │
│ - NotificationService (SMS/email/push)       │
│ - TimeZoneService                            │
│ - UserService                                │
│ - AuthService                                │
└───────┬────────────────────────────┬──────────┘
        │                            │
┌───────▼────────────────────────────▼──────────┐
│         Data Access Layer (Repositories)      │
│  (ORM: Prisma ou TypeORM + Migrations)        │
│                                               │
│ - UserRepository                             │
│ - ReservationRepository                      │
│ - ServiceRepository                          │
│ - ProfessionalRepository                     │
│ - etc.                                       │
└───────┬────────────────────────────┬──────────┘
        │                            │
        │    ┌──────────────────────┴────────┐
        │    │                               │
┌───────▼────────────────────┐    ┌──────────▼──────────┐
│   PostgreSQL Primary        │    │  Redis Cache &      │
│   (OLTP, transactional)     │    │  Session Store      │
│                             │    │                     │
│ - Users & Professionals     │    │ - Session tokens    │
│ - Reservations             │    │ - Rate limiting     │
│ - Services                 │    │ - Temporary locks   │
│ - Payments/Acomptes        │    │ - Real-time data    │
│ - Audit logs              │    │ - Analytics cache   │
└─────────────────────────────┘    └──────────┬─────────┘
                                              │
                            ┌─────────────────┘
                            │
                    ┌───────▼────────┐
                    │ External APIs  │
                    │                │
                    │ - Stripe       │
                    │ - Twilio       │
                    │ - Firebase     │
                    │ - Google Maps  │
                    └────────────────┘
```

### 2.2 Responsabilités par Couche

#### **Frontend Web (React + Next.js)**
- **Responsabilités:**
  - UI/UX pour découverte (catalogue de pros, filtres, recherche)
  - Formulaire de réservation interactif avec validation côté client
  - Gestion du panier/session client
  - Affichage en temps réel des disponibilités (via WebSocket)
  - Gestion du flux d'authentification (login, signup, OAuth optionnel)
  - Tableaux de bord professionnelles (gestion réservations, horaires)
  - Pages statiques/SEO (landing, blog)

- **Contraintes:**
  - Ne JAMAIS calculer ou valider les créneaux disponibles
  - Ne JAMAIS prendre de décisions de réservation
  - Ne JAMAIS appliquer de logique métier côté client
  - Validation côté client = UX uniquement, pas de sécurité

- **Stack:** React 18+, TypeScript, Next.js 14+ (App Router), TailwindCSS, React Query

#### **Mobile (React Native + Expo)**
- **Responsabilités:**
  - Parity fonctionnelle avec le web pour les chemins critiques (réservation, gestion compte, historique)
  - Version optimisée pour mobile (performance, offline-first où possible)
  - Push notifications pour rappels, confirmations
  - Caméra (portfolio upload pour pros)
  - Localisation + géolocalisation

- **Contraintes:**
  - Même logique que le web: aucune décision serveur côté client
  - Gestion des permissions système (location, camera, notifications)
  - Handling offline gracieux (queue locale, sync au reconnect)

- **Stack:** React Native, Expo, TypeScript, Zustand pour state, TanStack Query pour data fetching

#### **Backend API (Node.js + Express/Fastify)**
- **Responsabilités:**
  - Orchestration de tous les flux métier (booking, paiements, notifications)
  - Validation stricte des requêtes entrantes
  - Gestion de l'authentification et autorisation (JWT)
  - Calcul dynamique des créneaux disponibles
  - Gestion des transactions et locks pour éviter race conditions
  - Intégration Stripe (webhooks, paiements)
  - Intégration services tiers (SMS, email, push)
  - Audit logging complet (qui a fait quoi, quand, d'où)
  - Gestion des erreurs globales et monitoring

- **Contraintes:**
  - Stateless (horizontalement scalable)
  - Pas de calculs lourds synchrones en request-response (utiliser queues)
  - Timeouts stricts sur appels externes

- **Stack:** Node.js 20+, TypeScript, Express ou Fastify, Prisma ORM, Zod pour validation

#### **Base de Données (PostgreSQL)**
- **Responsabilités:**
  - Source de vérité unique pour toutes les données
  - Contraintes d'intégrité à la base (PK, FK, UNIQUE, CHECK)
  - Transactions ACID pour opérations critiques
  - Audit trail via trigger ou soft-delete
  - Indexation appropriée pour performance
  - Gestion des fuseaux horaires (tout en UTC)

- **Contraintes:**
  - Pas de logique métier complexe dans les stored procedures (business-logic reste en code)
  - JSONB pour données semi-structurées (metadata de services, photos, etc.)

#### **Cache & Real-time (Redis + WebSocket)**
- **Responsabilités:**
  - Session storage (pas de sessions en mémoire du serveur)
  - Rate limiting
  - Temporary locks pour booking concurrency control
  - Cache de données chaudes (disponibilités calculées, métadonnées)
  - Pub/Sub pour WebSocket broadcasts

- **Contraintes:**
  - Données de cache = non-critique, peut être perdue
  - Redis n'est PAS la source de vérité

---

## 3. Structure de Projet (Monorepo)

### 3.1 Organisation Recommandée

```
beauty-booking/
│
├── packages/
│   │
│   ├── web/                           # Next.js frontend (web)
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── (auth)/
│   │   │   ├── (professional)/
│   │   │   ├── (client)/
│   │   │   └── api/                   # API routes (optionnel, surtout pour auth)
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api.ts                 # Centralized API client
│   │   │   ├── auth.ts
│   │   │   └── utils.ts
│   │   ├── public/
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   ├── mobile/                        # React Native + Expo
│   │   ├── app/                       # Expo Router
│   │   │   ├── (auth)/
│   │   │   ├── (professional)/
│   │   │   ├── (client)/
│   │   │   └── (tabs)/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── auth.ts
│   │   │   └── utils.ts
│   │   ├── app.json                   # Expo config
│   │   └── package.json
│   │
│   ├── backend/                       # API backend
│   │   ├── src/
│   │   │   ├── main.ts                # Entry point
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── validation.ts
│   │   │   │   ├── errorHandler.ts
│   │   │   │   └── logging.ts
│   │   │   │
│   │   │   ├── routes/                # Express routes (group par domaine)
│   │   │   │   ├── auth.ts
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── services.ts
│   │   │   │   ├── professionals.ts
│   │   │   │   ├── clients.ts
│   │   │   │   ├── payments.ts
│   │   │   │   └── admin.ts
│   │   │   │
│   │   │   ├── services/              # Business Logic (Domain layer)
│   │   │   │   ├── BookingEngine.ts
│   │   │   │   ├── ReservationService.ts
│   │   │   │   ├── PaymentService.ts
│   │   │   │   ├── NotificationService.ts
│   │   │   │   ├── TimeZoneService.ts
│   │   │   │   ├── AuthService.ts
│   │   │   │   ├── UserService.ts
│   │   │   │   └── ProfessionalService.ts
│   │   │   │
│   │   │   ├── repositories/          # Data Access Layer
│   │   │   │   ├── UserRepository.ts
│   │   │   │   ├── ReservationRepository.ts
│   │   │   │   ├── ServiceRepository.ts
│   │   │   │   ├── ProfessionalRepository.ts
│   │   │   │   └── base/
│   │   │   │       └── BaseRepository.ts
│   │   │   │
│   │   │   ├── models/                # Domain Models & Types
│   │   │   │   ├── Reservation.ts
│   │   │   │   ├── User.ts
│   │   │   │   ├── Professional.ts
│   │   │   │   ├── Service.ts
│   │   │   │   ├── TimeSlot.ts
│   │   │   │   └── Payment.ts
│   │   │   │
│   │   │   ├── schemas/               # Validation schemas (Zod)
│   │   │   │   ├── auth.ts
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── services.ts
│   │   │   │   └── payments.ts
│   │   │   │
│   │   │   ├── integrations/          # External services
│   │   │   │   ├── stripe/
│   │   │   │   ├── twilio/
│   │   │   │   ├── firebase/
│   │   │   │   └── googlemaps/
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── cache.ts
│   │   │   │   ├── logging.ts
│   │   │   │   ├── errors.ts
│   │   │   │   └── jwt.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   └── env.ts
│   │   │   │
│   │   │   ├── websocket/
│   │   │   │   ├── server.ts
│   │   │   │   ├── events.ts
│   │   │   │   └── handlers/
│   │   │   │       ├── bookingUpdates.ts
│   │   │   │       ├── availability.ts
│   │   │   │       └── notifications.ts
│   │   │   │
│   │   │   ├── queues/                # Job queues (Bull, BullMQ)
│   │   │   │   ├── sendNotifications.ts
│   │   │   │   ├── processPayments.ts
│   │   │   │   ├── generateReminders.ts
│   │   │   │   └── cleanupStaleData.ts
│   │   │   │
│   │   │   └── tests/
│   │   │       ├── unit/
│   │   │       ├── integration/
│   │   │       └── fixtures/
│   │   │
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # Schema DB
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   │
│   │   ├── env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                        # Code partagé (types, utils)
│       ├── src/
│       │   ├── types/
│       │   │   ├── api.ts             # Types d'API partagés
│       │   │   ├── domain.ts          # Types métier
│       │   │   ├── websocket.ts
│       │   │   └── index.ts
│       │   │
│       │   ├── utils/
│       │   │   ├── timezone.ts
│       │   │   ├── validation.ts
│       │   │   ├── dates.ts
│       │   │   └── math.ts
│       │   │
│       │   ├── constants/
│       │   │   ├── errors.ts
│       │   │   ├── roles.ts
│       │   │   └── timezones.ts
│       │   │
│       │   └── index.ts
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── infra/                             # Infrastructure as Code
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── docker-compose.yml
│   │
│   ├── kubernetes/
│   │   ├── api/
│   │   ├── web/
│   │   └── databases/
│   │
│   └── terraform/
│       ├── main.tf
│       ├── variables.tf
│       └── modules/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── test.yml
│       ├── deploy-staging.yml
│       └── deploy-prod.yml
│
├── docs/
│   ├── ARCHITECTURE.md              # Ce fichier
│   ├── API.md                       # Spécification API REST
│   ├── WEBSOCKET.md                 # Spec WebSocket events
│   ├── DATABASE.md                  # Schema DB & migrations
│   ├── BOOKING_ENGINE.md            # Détails du moteur de réservation
│   ├── DEPLOYMENT.md                # Guide de déploiement
│   └── RUNBOOK.md                   # Opérations & troubleshooting
│
├── pnpm-workspace.yaml              # Monorepo setup (pnpm)
├── turbo.json                       # Build orchestration (Turbo)
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc.json
└── README.md
```

### 3.2 Justification du Monorepo (pnpm + Turbo)

| Aspect | Bénéfice |
|--------|----------|
| **Code partagé** | Types, utils, constantes réutilisables entre web/mobile/backend sans dépublication |
| **Cohérence** | Même version de dépendances, même style, mêmes outils |
| **DX** | Un seul repo à cloner, une seule pipeline CI/CD |
| **Scaling** | Facile à ajouter des packages (admin dashboard, landing page, etc.) |
| **pnpm** | Plus rapide que npm/yarn, meilleure gestion des dépendances |
| **Turbo** | Cache intelligent des builds, parallélisation des tests/builds |

---

## 4. Domaines Métier & Ownership

### 4.1 Domaines Principaux

```
┌─────────────────────────────────────────────────┐
│          Domain-Driven Design (DDD)             │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  USER & AUTH DOMAIN                  │      │
│  │  - Registration, login               │      │
│  │  - JWT/Sessions                      │      │
│  │  - Roles & Permissions               │      │
│  │  Entities: User, Account             │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  PROFESSIONAL DOMAIN                 │      │
│  │  - Profile management                │      │
│  │  - Service definitions               │      │
│  │  - Schedule/availability             │      │
│  │  - Portfolio (photos, reviews)       │      │
│  │  Entities: Professional, Service     │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  BOOKING DOMAIN (CRITIQUE)           │      │
│  │  - TimeSlot calculation              │      │
│  │  - Reservation creation/validation   │      │
│  │  - Concurrency control (locking)     │      │
│  │  - Cancellations & rescheduling      │      │
│  │  - No-show handling                  │      │
│  │  Entities: Reservation, TimeSlot     │      │
│  │  Events: ReservationCreated,         │      │
│  │          ReservationCancelled, etc.  │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  PAYMENT DOMAIN                      │      │
│  │  - Deposit/full payment handling     │      │
│  │  - Stripe integration                │      │
│  │  - Refunds on cancellation           │      │
│  │  - Payment receipts & invoices       │      │
│  │  Entities: Payment, Invoice          │      │
│  │  Events: PaymentProcessed,           │      │
│  │          PaymentFailed, etc.         │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  NOTIFICATION DOMAIN                 │      │
│  │  - Reservation confirmations         │      │
│  │  - Reminders (24h, 2h before)        │      │
│  │  - Cancellation notifications        │      │
│  │  - Payment receipts                  │      │
│  │  Channels: Email, SMS, Push          │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  REVIEW & RATING DOMAIN              │      │
│  │  - Post-service reviews              │      │
│  │  - Rating aggregation                │      │
│  │  - Review moderation                 │      │
│  │  Entities: Review, Rating            │      │
│  └──────────────────────────────────────┘      │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.2 Événements Métier Critiques

Les domaines communiquent via **événements** (Event-Driven Architecture):

```
ReservationCreated
  → Déclenche: paiement, notification confirmation, blocage du slot

ReservationConfirmed (après paiement réussi)
  → Déclenche: notification pro, envoi SMS de confirmation

ReservationCancelled
  → Déclenche: refund, libération du slot, notification aux deux parties

ReminderDue
  → Déclenche: envoi SMS/notification 24h et 2h avant

ReviewSubmitted
  → Déclenche: notification pro, mise à jour du rating
```

Implémentation: **Domain Events** en code + **Message Queue** (Bull/BullMQ) pour asynchrone fiable.

---

## 5. Choix Techniques Clés & Justifications

### 5.1 Frontend Web

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **Framework** | React 18+ + Next.js 14+ | SSR pour SEO, API routes optionnelles, App Router moderne, ecosystem mature |
| **Routing** | Next.js App Router | File-based routing, layouts imbriquées, streaming support |
| **Styling** | TailwindCSS | Utility-first, production-ready, excellent DX |
| **State Management** | React Context + TanStack Query | Séparation claire: state local vs serveur, caching intelligent |
| **Form Handling** | React Hook Form | Performant, petite taille, intégration facile avec Zod |
| **Validation Client** | Zod (avec schémas partagés) | Type-safe, partage avec backend |
| **HTTP Client** | TanStack Query (React Query) | Caching, deduplication, refetch automatique |
| **Auth** | NextAuth.js ou JWT manuel | NextAuth pour simplifier, JWT manuel pour plus de contrôle |
| **Date/Time** | date-fns + custom TZ utils | Léger, complet, timezone-friendly |
| **Testing** | Jest + React Testing Library | Standard industrie, accessible |

### 5.2 Frontend Mobile

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **Framework** | React Native + Expo | Cross-platform (iOS + Android), write-once run-everywhere |
| **Routing** | Expo Router | File-based routing, parity avec Next.js |
| **State Management** | Zustand + TanStack Query | Lightweight, même approche qu'en web |
| **Form Handling** | React Hook Form | Parity avec web |
| **Push Notifications** | Expo Notifications + Firebase | Managed par Expo, fallback à Firebase |
| **Storage Local** | SQLite (expo-sqlite) + AsyncStorage | Offline support, sync au reconnect |
| **Maps** | Expo Maps ou Google Maps API | Localisation des pros |
| **Camera** | Expo Camera | Portfolio uploads |

### 5.3 Backend

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **Runtime** | Node.js 20+ | Ecosystem TypeScript/JavaScript dominant, async I/O natural |
| **Framework Web** | Fastify (ou Express) | Fastify = ultra-rapide, built-in validation, DX excellente; Express = plus mature si préféré |
| **Validation** | Zod | Type-safe, schémas sharables, excellent error messages |
| **ORM** | Prisma | Type-safe, migrations auto, excellent DX, lazy-loaded relations |
| **Queues Job** | Bull ou BullMQ (Redis) | Distributed tasks, retry logic, UI de monitoring |
| **WebSocket** | Socket.io (ou native Node.js) | Socket.io = auto-reconnect, namespaces, rooms; native = plus léger |
| **Logging** | Pino (ou Winston) | Structuré, performant, JSON-based |
| **Monitoring** | OpenTelemetry + Datadog/Sentry | Traces distribuées, error tracking |
| **JWT** | `jsonwebtoken` (librairie) | Standard, simple, sans dépendances lourdes |
| **Rate Limiting** | Redis + redis-rate-limit | Distributed rate limiting |
| **Testing** | Jest + Supertest | Unit tests + integration tests API |

### 5.4 Base de Données

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **SGBD** | PostgreSQL 15+ | Reliability, ACID, JSON support, excellent pour transactions critique |
| **Migrations** | Prisma Migrations | Versioned, reversible, intégrées à l'ORM |
| **Replication** | PostgreSQL primary + replica | HA, scaling reads (reporting) |
| **Backup** | pg_dump + S3 (ou WAL archiving) | Point-in-time recovery |
| **Timezone** | Tout en UTC en DB, conversion à l'application | Évite confusion, compatible avec tout fuseau |

### 5.5 Cache & Session

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **Cache** | Redis in-memory | Très rapide, TTL native, simple |
| **Sessions** | Redis (pas en mémoire serveur) | Scalable, partage entre instances |
| **Pub/Sub** | Redis Pub/Sub | Broadcasting WebSocket events |
| **Locks Distribués** | Redlock (Redis) ou Bull | Prévenir race conditions booking |

### 5.6 Paiements

| Choix | Technologie | Justification |
|-------|-------------|---------------|
| **Processor** | Stripe | Leader du marché, fiable, bonnes APIs, webhooks robustes |
| **Webhooks** | Stripe events + verification | Confirmation asynchrone des paiements |
| **Refunds** | Stripe API + domain events | Automatisé lors annulation réservation |
| **Currency** | ILS (Israeli Shekel) | Monnaie locale Israël |

### 5.7 Notifications

| Service | Technologie | Justification |
|---------|------------|---------------|
| **SMS** | Twilio (ou service local IL) | Rappels 24h/2h avant réservation |
| **Email** | SendGrid (ou autre transactional) | Confirmations, reçus, marketing optionnel |
| **Push** | Firebase Cloud Messaging + Expo | Mobile push notifications |
| **Queue** | Bull/BullMQ | Asynchrone, retry, distribution |

---

## 6. Patterns & Conventions Établies

### 6.1 Layered Architecture Strict

```
HTTP Request
    ↓
Routes (Express/Fastify) ← Décideur de route
    ↓
Middleware (Auth, Validation)
    ↓
Controllers/Handlers ← Orchestration légère
    ↓
Services (Business Logic) ← CŒUR MÉTIER
    ↓
Repositories (Data Access) ← Queries DB
    ↓
Database (PostgreSQL)
```

**Règles:**
- Controllers: pas de logique métier
- Services: tout le business logic
- Repositories: queries DB, rien de plus
- Models: entités avec typage strict
- Schemas: validation au niveau routes

### 6.2 Error Handling Structuré

```typescript
// Hiérarchie d'erreurs métier
AppError (base)
  ├── ValidationError (input invalide)
  ├── AuthenticationError (pas loggé / token expiré)
  ├── AuthorizationError (pas permission)
  ├── NotFoundError (ressource inexistante)
  ├── ConflictError (business logic violation)
  │   └── SlotAlreadyBookedError
  │   └── DuplicateReservationError
  ├── PaymentError (Stripe failure)
  └── ExternalServiceError (3rd party down)
```

Tous les errors convertis en HTTP responses cohérentes.

### 6.3 Transaction Boundaries

Opérations critiques = **transactions DB** explicites:
- Création réservation + paiement
- Annulation + refund
- Mise à jour horaires (pro)

```typescript
// Pseudo-code
async createReservation(req) {
  return db.transaction(async (tx) => {
    const slot = await bookingEngine.findAvailableSlot(...)
    const reservation = await tx.reservation.create(...)
    const payment = await stripeService.charge(...) // Peut échouer
    if (payment.status === 'failed') throw new PaymentError()
    await tx.reservation.update({ paymentId: payment.id })
    return reservation
  })
}
```

Idée: Si une étape échoue, tout rollback automatiquement.

### 6.4 Timezone Handling Pattern

```typescript
// JAMAIS faire ça:
const slot = new Date('2025-06-01 14:00') // ❌ Ambigu

// FAIRE ça:
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

const tzIsrael = 'Asia/Jerusalem'

// Client envoie: "je veux 14h00 localité Israël"
const localTime = new Date('2025-06-01T14:00:00')
const utcTime = zonedTimeToUtc(localTime, tzIsrael)
// Store en DB: 2025-06-01T11:00:00Z (UTC)

// Response client: "voici 11h00 UTC, soit 14h00 Israël"
const displayTime = utcToZonedTime(utcTime, tzIsrael)
```

Service centralisé: `TimeZoneService` pour conversions.

### 6.5 Concurrency Control (Booking)

**Problème:** Deux clients réservent le même slot au même moment.

**Solution à 3 niveaux:**

1. **Redis Distributed Lock (Redlock)**
   ```typescript
   const lockKey = `booking:slot:${slotId}:${professionalId}`
   const lock = await redlock.lock(lockKey, 5000) // 5s lock
   try {
     // Réservation atomique
     if (slot est encore dispo) {
       create reservation
     } else {
       throw SlotAlreadyBookedError
     }
   } finally {
     await lock.unlock()
   }
   ```

2. **Database Constraints**
   - Unique index sur (professional_id, start_time, end_time) pour prévenir overlaps
   - CHECK constraints sur durées

3. **Idempotency Keys**
   - Client envoie idempotency-key unique
   - Server: si key déjà traitée, retourner même response
   - Prévient double-booking sur retry réseau

### 6.6 Notification Saga Pattern

Quand une réservation est créée, plusieurs notifs doivent être envoyées. Utiliser **Sagas** (orchestration asynchrone):

```
ReservationCreated event
  ├─→ SendConfirmationEmail (client)
  ├─→ SendConfirmationSMS (client)
  ├─→ NotifyProfessional (websocket + push)
  ├─→ UpdateAvailability (cache invalidation)
  └─→ ScheduleReminders (24h + 2h)

Si une étape échoue → retry, logging, alert
```

Implémenté via **Bull Queue + Domain Events**.

### 6.7 Audit Logging

Chaque action critique = log en base de données:
```
AuditLog {
  id, timestamp, userId, resourceType, resourceId,
  action (CREATE, UPDATE, DELETE, CANCEL),
  changes (avant/après), ipAddress, userAgent, result
}
```

Permet traçabilité complète, débogage, conformité.

---

## 7. Zones à Risque & Garde-Fous

### 7.1 Booking Engine (CRITIQUE)

**Risques:**
- Race conditions → double-booking
- Calcul slots incorrect → slot indisponible proposé
- Pas de stockage slots → caching en mémoire peut diverger de DB

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| Double-booking | Redlock + DB unique constraint + idempotency keys |
| Slots incorrects | Calcul toujours fresh à la demande; jamais de pré-calcul stale |
| Overlaps | CHECK constraints DB (start < end, no overlap avec autres réservations) |
| Concurrence | Transaction ACID, locks explicites |
| Timezone bugs | TZ service centralisé, tout en UTC DB, tests spécifiques à TZ |

**Tests Critiques:**
- Booking concurrent sur même slot (stress test)
- Midnight TZ transitions (DST Israël)
- Calcul correct avec buffers entre services
- Calcul correct quand pro a plusieurs services

### 7.2 Payment Processing

**Risques:**
- Paiement réussi en Stripe mais confirmation non reçue (webhook fail)
- Client réservé mais charge double
- Refund failure sur annulation

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| Webhook missed | Idempotency, Stripe event retry, polling fallback |
| Double charge | Idempotency keys, reservation state check avant charge |
| Refund fail | Queue + retry, alert à l'équipe, compensation logic |
| Race condition paiement | Transaction order: (1) create reservation, (2) charge, (3) update status |

**Implementation:**
```typescript
// Jamais:
const payment = await stripe.charge(amount)
const reservation = await db.reservation.create({ paymentId: payment.id })

// Correct:
const reservation = await db.reservation.create({ status: 'PENDING_PAYMENT' })
try {
  const payment = await stripe.charge(amount, { idempotencyKey: reservation.id })
  await db.reservation.update(reservation.id, { status: 'CONFIRMED', paymentId: payment.id })
} catch (err) {
  await db.reservation.update(reservation.id, { status: 'PAYMENT_FAILED' })
  throw err
}
```

### 7.3 No-Show & Cancellation

**Risques:**
- Pro annule → client pas notifié
- Client annule → pro pas au courant, pro attend
- No-show → charge bloquée, dispute possible
- Annulation juste avant → refund partial vs full

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| No notification | Domain events + queue notifications garantissent envoi |
| No-show pas géré | Flag NO_SHOW dans réservation, blocage future booking si trop |
| Refund policy | Clair dans ToS, implémenté en code: full refund si >24h avant, partial si <24h |
| Late cancellation dispute | Immutable audit log, timestamp, preuve de notification |

**Politique Cancellation Example:**
```
> 24h avant → Refund 100%
24h à 2h avant → Refund 80%
< 2h avant → Refund 0%

Pro peut annuler tout moment → Refund 100% to client
```

### 7.4 Authentication & Authorization

**Risques:**
- Token JWT expiré pas refresh → logout surprise
- Client lit data d'autre client
- Pro modifie horaires de pro voisine
- Admin panel accessible à user normal

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| Token expiry UX | Refresh tokens, silent refresh avant expiry |
| Data leakage | Scope queries par userId, resourceOwnership check systématique |
| Privilege escalation | Role-based ACL (USER, PROFESSIONAL, ADMIN), middleware strict |
| Unauthed access | JWT validation, rate limiting auth endpoints |

**Pattern Autorisation:**
```typescript
async getReservation(reservationId, userId) {
  const reservation = await db.reservation.findById(reservationId)
  
  // Ownership check: user est client OU pro de cette résa
  const isClient = reservation.clientId === userId
  const isPro = reservation.professional.userId === userId
  
  if (!isClient && !isPro) {
    throw new AuthorizationError()
  }
  
  return reservation
}
```

### 7.5 Data Consistency Across Services

**Risques:**
- Pro modifie service → réservations existantes se cassent
- Pro désactive horaire → réservation existante en conflit
- Cache Redis stale → affiche slots indispos

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| Service mutation | Services non-deletable, marqués INACTIVE, historical data preserver |
| Horaire mutation | Soft-delete, version scheduling, clear communication to pro |
| Cache divergence | Short TTL (5-10 min), invalidation immediate on write, fallback DB read |
| Data audit | Complete audit log, ability to trace what changed when |

### 7.6 External Service Failures

**Risques:**
- Stripe down → bookings bloquées
- Twilio down → SMS pas envoyé
- Email service down → pas de confirmation

**Garde-fous:**
| Risque | Mitigations |
|--------|-------------|
| Payment down | Graceful degradation, reservation PENDING status, manual retry queue |
| SMS down | Queue + retry, fallback email, user notified |
| Email down | Queue + retry, no user-blocking, background retry |
| Extended outage | Fallback manual confirmation (SMS from pro?) |

**Circuit Breaker Pattern:**
```typescript
const stripeService = new CircuitBreaker(
  async (amount) => stripe.charge(amount),
  { failureThreshold: 5, timeout: 30000 }
)

try {
  await stripeService.execute(amount)
} catch (err) {
  if (err instanceof CircuitBreakerOpenError) {
    // Stripe probably down, fallback
    reservation.status = 'PAYMENT_MANUAL_VERIFICATION'
  }
}
```

---

## 8. Scalability & Performance

### 8.1 Horizontal Scaling

**Stateless API:**
- Pas de session en mémoire (use Redis)
- Pas de cache local (use Redis)
- Déployer N instances de l'API
- Load balancer distribue requests

**Database Scaling:**
- Primary (writes) + Replica (reads)
- Reporting queries → read replica only
- Connection pooling (PgBouncer)
- Caching expensive queries (product catalog, ratings)

**Job Queue Scaling:**
- Bull workers distribuées
- Multiple workers par job type (notifications, reminders)
- Dead letter queue pour failed jobs

### 8.2 Performance Targets

| Métrique | Target | Détail |
|----------|--------|--------|
| API latency (p99) | <300ms | Booking, payment, etc. |
| Slot calculation | <100ms | Pour 100+ services |
| WebSocket latency | <1s | Availability updates |
| Page load (web) | <3s | Core Web Vitals |
| Mobile startup | <5s | App open to usable |

### 8.3 Caching Strategy

```
GET /professionals/:id/availability
  ↓
Check Redis cache (TTL 5 min)
  ├─ Hit → return immediately
  ├─ Miss → calculate (DB + BookingEngine)
       → store in Redis
       → return
       
(On reservation creation)
  → Invalidate cache for that pro
  → Broadcast WebSocket update
```

---

## 9. Monitoring & Observability

### 9.1 Metrics to Track

**Business Metrics:**
- Total reservations per day
- Cancellation rate
- No-show rate
- Payment success rate
- Pro onboarding completion

**Technical Metrics:**
- API latency (p50, p95, p99)
- Error rate by endpoint
- Database query latency
- Queue job duration
- Cache hit rate

**Infrastructure:**
- CPU, memory, disk usage
- Network I/O
- Database connections
- Redis memory usage

### 9.2 Alerting Rules

```
- Payment success rate < 98% → alert
- API latency p95 > 1s → alert
- Queue job failure rate > 5% → alert
- Database replica lag > 10s → alert
- Unhandled errors > 10/min → alert
```

### 9.3 Logging & Tracing

- **Structured logging** (JSON, Pino)
- **Distributed traces** (OpenTelemetry) → correlation IDs
- **Error tracking** (Sentry) → error aggregation
- **Log retention** → 30 days hot, 1 year archived

---

## 10. Deployment & DevOps

### 10.1 Environments

```
Development (local + docker)
  ↓ (PR)
Staging (mirror production)
  ↓ (approved PR + merge)
Production (traffic réel)
```

### 10.2 CI/CD Pipeline

```yaml
On push to branch:
  1. Lint (ESLint, Prettier)
  2. Type check (TypeScript)
  3. Unit tests (Jest)
  4. Integration tests (PostgreSQL, Redis)
  5. Security scan (Dependabot, SAST)
  6. Build (Docker, bundles)
  → staging deployment (automatic)
  
On merge to main:
  → Production deployment (manual approval)
  → Database migrations (pre-deployment)
  → Smoke tests (post-deployment)
```

### 10.3 Deployment Strategy

- **Blue-Green** pour API (zero-downtime)
- **Rolling** pour frontend (CDN caching)
- **Automated rollback** si health checks échouent
- **Database migrations** backward-compatible

---

## 11. Security Considerations

### 11.1 Authentication & Encryption

- JWT tokens (short-lived, 15 min)
- Refresh tokens (long-lived, 7 days, rotation)
- HTTPS everywhere
- HSTS headers
- Password hashing (bcrypt)

### 11.2 API Security

- Rate limiting (global + per-user)
- CORS configured strictly
- CSRF protection (if needed)
- Input validation (Zod)
- SQL injection prevention (Prisma parameterized)

### 11.3 Data Protection

- PII encrypted in transit (TLS)
- Passwords hashed (never logged)
- Audit logs immutable
- Payment PCI compliance (Stripe handles)
- GDPR: data deletion, export capabilities

### 11.4 Secrets Management

- Environment variables (not in git)
- Secret rotation (CI/CD)
- Secrets in environment → never logged

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```
        ▲
       │ End-to-End Tests (5-10%)
       │ (Playwright, critical user flows)
       │
       │ Integration Tests (25-30%)
       │ (API + DB, with real PostgreSQL)
       │
       │ Unit Tests (60-70%)
       │ (Services, models, helpers)
       │
       └─ Fast feedback, high coverage
```

### 12.2 Critical Test Cases

**Booking Engine:**
- Correct slot calculation with multiple services
- No overlap detection
- Timezone conversions (DST edge cases)
- Concurrent booking stress test

**Payment:**
- Successful charge → reservation confirmed
- Failed charge → reservation stays PENDING
- Webhook handling (missing, delayed, duplicate)
- Refund on cancellation

**Notifications:**
- Event triggers correct notification
- Retry logic on failure
- No duplicates sent

**Auth:**
- Login/signup/logout flows
- Token expiry + refresh
- Permission checks (user can't read other user data)

---

## 13. Checklist Pré-Déploiement Production

**Infrastructure:**
- [ ] PostgreSQL primary + replica configurés
- [ ] Redis haute disponibilité
- [ ] Load balancer + SSL certificates
- [ ] Backups automatisés + point-in-time recovery
- [ ] Monitoring + alerting en place
- [ ] Logs centralisés

**Code:**
- [ ] Security scan complet (Dependabot, SAST)
- [ ] Tests coverage > 80% (critical paths)
- [ ] Database migrations tested
- [ ] Feature flags pour gradual rollout

**Operations:**
- [ ] Runbook écrit (incident response)
- [ ] On-call rotation définie
- [ ] Rollback procedure testé
- [ ] Load testing (capacity planning)

**Compliance:**
- [ ] GDPR data handling OK
- [ ] Payment PCI OK
- [ ] Terms of Service finalisés
- [ ] Privacy policy published

---

## 14. Évolutions Futures (Post-MVP)

Sans impacter le MVP, l'architecture supporte:

- **Analytics Dashboard** (Segment, Amplitude)
- **Admin Panel** (user management, dispute resolution)
- **Marketing Automation** (email campaigns, SMS)
- **Loyalty Program** (points, discounts)
- **A/B Testing** (feature flags, segment targeting)
- **Internationalization** (autre pays, autres devises)
- **Video Consultations** (Zoom/Twilio integration)
- **Messaging** (chat between client-pro)
- **Subscription Model** (recurring bookings)
- **Provider Marketplace** (agency model)

Architecture reste modulaire et extensible.

---

## 15. Document References & Ownership

| Document | Owner | Détail |
|----------|-------|--------|
| API.md | Backend | REST endpoints, request/response schemas |
| WEBSOCKET.md | Backend | Real-time events, client subscriptions |
| DATABASE.md | Backend | Schema, migrations, queries |
| BOOKING_ENGINE.md | Backend Lead | Algorithm détaillé, edge cases |
| DEPLOYMENT.md | DevOps/Platform | CI/CD, infra, runbooks |
| MOBILE.md | Frontend Lead | Navigation, offline support, native APIs |
| WEB.md | Frontend Lead | Page structure, SEO, UX patterns |

**Tous les documents = source of truth, auto-updatable.**

---

## Conclusion

Cette architecture fournit la fondation pour un produit **long-terme, scalable, et maintenable**. Les principes (logique serveur, calcul dynamique, fuseaux horaires, séparation client/pro) sont immuables et guidant chaque décision de code.

Les prochaines étapes:
1. Valider cette architecture avec l'équipe
2. Détailler les documents spécialisés (API.md, BOOKING_ENGINE.md, etc.)
3. Initialiser le monorepo + structure de projet
4. Commencer backend (domain models + database schema)

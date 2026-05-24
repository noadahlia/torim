# Testing Guide

Complete testing setup with Supabase local environment.

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+
- pnpm 8+
- PostgreSQL client tools (`psql`) - included with Docker Desktop on Windows

## Quick Start

### 1. Start Supabase Local Environment

**On Windows (PowerShell):**
```powershell
.\start-supabase.ps1
```

**On macOS/Linux (Bash):**
```bash
chmod +x start-supabase.sh
./start-supabase.sh
```

This will:
- Start PostgreSQL, GoTrue (Auth), PostgREST, and Realtime containers
- Run database migrations automatically
- Display connection details

### 2. Run Tests

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Watch mode (re-run on file changes)
pnpm test:watch

# Run only integration tests
pnpm test:integration

# Generate coverage report
pnpm test:coverage
```

## Available Test Commands

```bash
pnpm test                    # Run all unit + integration tests
pnpm test:watch            # Watch mode
pnpm test:coverage         # Coverage report
pnpm test:integration      # Integration tests only (requires Supabase)
pnpm test -- --testNamePattern="BookingEngine" # Run specific tests
```

## Test Structure

```
src/__tests__/
├── setup.ts                    # Jest configuration
├── helpers.ts                  # Test fixtures and utilities
├── BookingEngine.test.ts       # Unit tests (with mocks)
├── BookingEngine.integration.test.ts  # Integration tests (real DB)
├── TrustService.test.ts        # Unit tests
├── TimeZoneService.test.ts     # Executable tests (pure functions)
└── TrustService.integration.test.ts   # Integration tests
```

## Test Suites

### TimeZoneService Tests
- **Type**: Unit tests (executable, no mocks needed)
- **Status**: ✅ Ready to run anytime
- **Coverage**:
  - Day-of-week calculation
  - Time overlap detection
  - Timezone conversion accuracy
  - DST transition handling

```bash
pnpm test TimeZoneService.test.ts
```

### BookingEngine Tests
- **Unit Tests** (with mocks)
  - Tests booking creation logic
  - Policy evaluation
  - Refund calculation
  - Edge cases

- **Integration Tests** (requires Supabase)
  - Real database operations
  - Atomic reservation creation
  - Double-booking prevention
  - Trust integration
  - Policy enforcement

```bash
# Unit tests (no DB needed)
pnpm test BookingEngine.test.ts

# Integration tests (requires Supabase running)
pnpm test:integration
```

### TrustService Tests
- **Unit Tests** (with mocks)
  - Score calculations
  - Event point deltas
  - Boundary conditions

- **Integration Tests** (requires Supabase)
  - Real database operations
  - Trust score updates
  - Event recording
  - Score clamping

## Database Connections

### Local Supabase (Docker)
```
Host: localhost
Port: 5432
Database: postgres
User: postgres
Password: postgres
URL: postgresql://postgres:postgres@localhost:5432/postgres
```

### Using psql directly
```bash
psql postgresql://postgres:postgres@localhost:5432/postgres

# Or with environment variable
PGPASSWORD=postgres psql -h localhost -U postgres
```

## Environment Variables

### For Local Testing
The `.env.test` file is automatically loaded by Jest setup:

```env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvcmltLWxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg3NjI4MDAsImV4cCI6MTk5OTk5OTk5OX0.test
```

## Stopping Supabase

```bash
docker-compose down
```

To also remove data:
```bash
docker-compose down -v
```

## Troubleshooting

### Docker containers won't start
```bash
# Check Docker status
docker ps

# View container logs
docker-compose logs db
docker-compose logs auth
docker-compose logs rest

# Restart all containers
docker-compose restart
```

### Database migration fails
```bash
# Check if psql is available
psql --version

# On Windows, you may need PostgreSQL client tools
# They come with Docker Desktop, try:
# C:\Program Files\Git\usr\bin\psql
```

### Tests timeout
- Increase Jest timeout in `jest.config.js`
- Check Docker container resource allocation
- Ensure database is fully initialized (wait 10 seconds)

### Port already in use
```bash
# Find process using port 5432
lsof -i :5432  # macOS/Linux
netstat -ano | findstr :5432  # Windows

# Or use different port in docker-compose.yml
# Change "5432:5432" to "5433:5432"
```

## CI/CD Testing

GitHub Actions runs tests with production-like setup:
1. Lint checks
2. TypeScript type checking
3. Unit tests (no external dependencies)

Integration tests run locally only (requires Docker).

## Writing New Tests

### Unit Test Template
```typescript
import { TrustService } from '../services/TrustService';

jest.mock('@supabase/supabase-js');

describe('TrustService', () => {
  let trustService: TrustService;

  beforeEach(() => {
    jest.clearAllMocks();
    trustService = new TrustService();
  });

  it('should calculate score correctly', () => {
    // Test implementation
  });
});
```

### Integration Test Template
```typescript
import { BookingEngine } from '../services/BookingEngine';
import { createTestProfessional, createTestClient, cleanupTestData, waitForDatabase } from './helpers';

describe('BookingEngine Integration', () => {
  beforeAll(async () => {
    await waitForDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should create reservation atomically', async () => {
    const testPro = await createTestProfessional();
    const testClient = await createTestClient(75);
    // Test implementation
  });
});
```

## Test Coverage Goals

- **BookingEngine**: 90%+ (critical path)
- **TrustService**: 85%+ (important for fairness)
- **TimeZoneService**: 100% (pure utility)
- **Overall**: 80%+ coverage

Check coverage:
```bash
pnpm test:coverage
```

## Performance Notes

- Each integration test takes ~500ms-1s
- Cleanup between tests ensures test isolation
- Full test suite completes in <2 minutes
- CI tests (unit only) complete in <30 seconds

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)

# Start Supabase local environment on Windows

Write-Host "Starting Supabase local environment..." -ForegroundColor Yellow

# Start Docker containers
docker-compose up -d

# Wait for database to be ready
Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Run migrations
Write-Host "Running database migrations..." -ForegroundColor Yellow
$env:PGPASSWORD = "postgres"
psql -h localhost -U postgres -d postgres -f "packages/backend/supabase/migrations/001_initial.sql" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database migrated successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Migration failed" -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:SUPABASE_URL = "http://localhost:54321"
$env:SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvcmltLWxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg3NjI4MDAsImV4cCI6MTk5OTk5OTk5OX0.test"

Write-Host "✓ Supabase is running!" -ForegroundColor Green
Write-Host ""
Write-Host "Connection details:"
Write-Host "  Database: postgresql://postgres:postgres@localhost:5432/postgres" -ForegroundColor Green
Write-Host "  Supabase URL: http://localhost:54321" -ForegroundColor Green
Write-Host "  REST API: http://localhost:3001" -ForegroundColor Green
Write-Host "  Realtime: ws://localhost:4000" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run tests:"
Write-Host "  pnpm test                    # Run all tests"
Write-Host "  pnpm test:watch             # Watch mode"
Write-Host "  pnpm test:integration       # Integration tests only"
Write-Host ""
Write-Host "To stop Supabase, run: docker-compose down" -ForegroundColor Yellow

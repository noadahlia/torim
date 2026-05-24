#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Supabase local environment...${NC}"

# Start Docker containers
docker-compose up -d

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database to be ready...${NC}"
sleep 5

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -f packages/backend/supabase/migrations/001_initial.sql 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database migrated successfully${NC}"
else
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
fi

# Set environment variables
export SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvcmltLWxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg3NjI4MDAsImV4cCI6MTk5OTk5OTk5OX0.test

echo -e "${GREEN}✓ Supabase is running!${NC}"
echo ""
echo "Connection details:"
echo -e "  Database: ${GREEN}postgresql://postgres:postgres@localhost:5432/postgres${NC}"
echo -e "  Supabase URL: ${GREEN}http://localhost:54321${NC}"
echo -e "  REST API: ${GREEN}http://localhost:3001${NC}"
echo -e "  Realtime: ${GREEN}ws://localhost:4000${NC}"
echo ""
echo "Environment variables:"
echo "  export SUPABASE_URL=http://localhost:54321"
echo "  export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvcmltLWxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg3NjI4MDAsImV4cCI6MTk5OTk5OTk5OX0.test"
echo ""
echo -e "${YELLOW}To stop Supabase, run: docker-compose down${NC}"

# Torim Setup Guide

Complete setup instructions for local development.

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org))
- npm or pnpm
- Git
- Text editor (VS Code recommended)
- GitHub account (for repo)

## Step 1: Create Required Accounts

### 1a. Supabase (PostgreSQL Database)
1. Go to [https://supabase.com](https://supabase.com)
2. Sign in with GitHub
3. Create new project
4. Name: `torim`
5. Password: generate strong password
6. Region: Europe (Ireland) for latency
7. Wait for provisioning (~2 min)
8. Go to Settings → Database → Copy `DATABASE_URL`
   - Format: `postgresql://user:password@host:5432/torim`
9. Keep this safe

### 1b. Railway (Backend Hosting)
1. Go to [https://railway.app](https://railway.app)
2. Sign in with GitHub
3. Create new project
4. Leave empty (we'll connect repo later)
5. Copy `PROJECT_ID` from dashboard
6. Keep for later

### 1c. Resend (Email Service)
1. Go to [https://resend.com](https://resend.com)
2. Sign in with GitHub
3. Create new API key
4. Copy `RESEND_API_KEY` (starts with `re_`)
5. Keep safe

### 1d. Firebase (Push Notifications)
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Create new project
   - Name: `torim`
   - Disable Google Analytics (optional)
3. Once created, go to Project Settings (gear icon)
4. Go to Service Accounts tab
5. Generate new private key (download JSON)
6. Save file as `torim/firebase-key.json` (git-ignored)
7. Copy values from JSON:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`

## Step 2: Clone Repository

```bash
git clone https://github.com/yourusername/torim.git
cd torim
```

## Step 3: Backend Setup

```bash
cd backend

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your keys
# Replace:
# - DATABASE_URL with Supabase connection string
# - RESEND_API_KEY with your Resend key
# - FIREBASE_* values from firebase-key.json

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Create database tables
npm run db:push

# Start development server
npm run dev
```

Server running at `http://localhost:3000`

### Test Backend
```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}
```

## Step 4: Mobile Setup

```bash
cd ../mobile

# Install dependencies
npm install

# Create .env.local (optional for dev)
# EXPO_PUBLIC_API_URL=http://localhost:3000

# Start development
npm start

# Choose:
# Press 'i' → iOS simulator (requires Mac)
# Press 'a' → Android emulator
# Or scan QR code with Expo Go app on real phone
```

## Step 5: Verify Everything Works

### Backend
1. Open Postman or Thunder Client
2. Test `/api/health` endpoint
3. Should return `{"status":"ok","timestamp":"..."}`

### Mobile
1. Open Expo Go app on phone (or simulator)
2. Scan QR code from terminal
3. App should load
4. You should see "Torim" and login/signup buttons

## Environment Variables

### Backend (.env.local)

```bash
# Required
DATABASE_URL="postgresql://user:password@host:5432/torim"
RESEND_API_KEY="re_xxxxxxx"
FIREBASE_PROJECT_ID="torim"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@torim.iam.gserviceaccount.com"

# Optional (defaults provided)
API_PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-prod
TZ=Asia/Jerusalem
```

### Mobile (.env.local - optional)

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_PROJECT_ID=torim
```

## Troubleshooting

### Database Connection Error
```
Error: Client network socket disconnected
```
**Solution:**
- Verify DATABASE_URL is correct
- Check Supabase dashboard → Databases → Connection pooling
- Ensure your IP is whitelisted (Supabase does this automatically)

### API Port Already in Use
```
Error: listen EADDRINUSE :::3000
```
**Solution:**
```bash
# Change port in .env.local
API_PORT=3001

# Or kill process on 3000
lsof -ti:3000 | xargs kill -9
```

### Expo App Won't Connect to Backend
```
Error: Network request failed
```
**Solution:**
- Backend must be running (`npm run dev`)
- Use correct API URL:
  - Local: `http://localhost:3000`
  - From phone: `http://YOUR_COMPUTER_IP:3000` (find with `ipconfig`)

### Firebase Key Format Error
```
Error: Invalid private key
```
**Solution:**
- Copy ENTIRE private key from JSON (including BEGIN/END lines)
- In `.env.local`, newlines should be literal `\n` characters
- Wrap in quotes: `"-----BEGIN...\n...\n-----END..."`

## Next Steps

1. **Phase 1:** Implement backend routes (auth, professionals, services)
2. **Phase 2:** Build mobile screens (login, search, booking)
3. **Phase 3:** Connect mobile to backend
4. **Phase 4:** Implement BookingEngine
5. And so on...

See `../README.md` for full plan.

## Useful Commands

```bash
# Backend
npm run dev           # Start dev server
npm run db:push      # Sync schema with database
npm run db:migrate   # Create migration
npm run db:seed      # Populate test data
npm run lint         # Check code quality

# Mobile
npm start            # Start dev server
npm run android      # Open Android emulator
npm run ios          # Open iOS simulator
npm run build        # Build for testing
```

## Getting Help

1. Check backend/README.md or mobile/README.md
2. Look at error messages carefully
3. Check internet connection
4. Restart services (backend, Expo)
5. Clear caches:
   ```bash
   # Backend
   rm -rf node_modules/.prisma
   npm run prisma:generate
   
   # Mobile
   npm start -- --clear
   ```

---

**Last Updated:** Oct 2025
**Status:** V1 Setup Complete

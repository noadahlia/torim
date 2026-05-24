# Torim Mobile App

React Native + Expo (iOS & Android)

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
Create `.env.local`:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_PROJECT_ID=torim
```

### 3. Run in development
```bash
npm start

# Then choose:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Press 'w' for web
# - Or scan QR code with Expo Go app on real phone
```

## Commands

- `npm start` - Start development server
- `npm run android` - Start Android emulator
- `npm run ios` - Start iOS simulator
- `npm run web` - Start web version (testing)
- `npm run build:android` - Build .apk for testing
- `npm run build:ios` - Build .ipa for TestFlight
- `npm run submit` - Submit to app stores
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript check

## Project Structure

```
app/
├── (auth)/           # Auth screens (login, signup)
├── (client)/         # Client screens (search, booking)
├── (pro)/            # Professional screens (dashboard)
└── _layout.tsx       # Root layout

lib/
├── api.ts            # API client (axios)
├── auth.ts           # Auth logic
├── push.ts           # Push notifications
└── storage.ts        # Secure storage (AsyncStorage)
```

## Development Workflow

### Testing on Real Phone
1. `npm start`
2. Scan QR code with Expo Go app (iPhone/Android)
3. App loads on phone with hot reload

### Testing on Simulator
1. `npm run ios` (requires Mac) OR `npm run android`
2. App starts in simulator with hot reload

### Building for Testing
```bash
npm run build:android
# Download .apk, install on Android phone

npm run build:ios
# Use TestFlight for iOS testing
```

## API Integration

All API calls via `lib/api.ts`:

```typescript
import { authApi, professionalApi, reservationApi } from '@/lib/api';

// Login
const { token } = await authApi.login(email, password);

// Get professionals
const pros = await professionalApi.list();

// Create reservation
const reservation = await reservationApi.create(proId, serviceId, startTime, endTime);
```

## Authentication

JWT tokens stored in secure storage:
```typescript
import * as SecureStore from 'expo-secure-store';

const token = await SecureStore.getItemAsync('authToken');
```

Token automatically added to all requests via axios interceptor.

## Push Notifications

Via Firebase Cloud Messaging:

```typescript
import { pushApi } from '@/lib/push';

const permission = await pushApi.requestPermission();
const token = await pushApi.getToken();
```

## Styling

TailwindCSS via NativeWind. In components:

```tsx
import { View, Text } from 'react-native';

<View className="flex-1 bg-white p-6">
  <Text className="text-2xl font-bold">Hello</Text>
</View>
```

## Deployment

### App Store (iOS)
1. Run `npm run build:ios`
2. Run `npm run submit`
3. Approve in App Store Connect

### Play Store (Android)
1. Run `npm run build:android`
2. Run `npm run submit`
3. Approve in Google Play Console

## Notes

- All API calls use UTC timestamps
- Timezone conversion happens at UI boundaries
- Secure storage for sensitive data (tokens, etc)
- Firebase for push notifications
- Expo Go for rapid development feedback

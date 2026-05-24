import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './lib/auth';
import { setAuthToken } from './lib/api';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import HomeScreen from './screens/HomeScreen';
import ProfessionalDetailScreen from './screens/ProfessionalDetailScreen';
import BookingScreen from './screens/BookingScreen';
import ReservationsScreen from './screens/ReservationsScreen';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Browse Professionals' }}
      />
      <Stack.Screen
        name="ProfessionalDetail"
        component={ProfessionalDetailScreen}
        options={{ title: 'Professional' }}
      />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book Service' }} />
      <Stack.Screen
        name="Reservations"
        component={ReservationsScreen}
        options={{ title: 'My Reservations' }}
      />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading, token } = useAuth();

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

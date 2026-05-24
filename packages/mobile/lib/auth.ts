import { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface AuthContextType {
  user: any;
  session: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, timezone: string) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('authToken');
        if (storedToken) {
          setToken(storedToken);
          const {
            data: { user },
          } = await supabase.auth.getUser(storedToken);
          if (user) {
            setUser(user);
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session?.access_token) {
        await SecureStore.setItemAsync('authToken', data.session.access_token);
        setToken(data.session.access_token);
        setUser(data.user);
        setSession(data.session);
      }
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, password: string, fullName: string, timezone: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUpWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session?.access_token) {
        await SecureStore.setItemAsync('authToken', data.session.access_token);
        setToken(data.session.access_token);
        setUser(data.user);
        setSession(data.session);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      await SecureStore.deleteItemAsync('authToken');
      setToken(null);
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, signup, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

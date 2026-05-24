import { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth from secure storage
    // Placeholder - to be implemented
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Placeholder - to be implemented
    console.log('Login:', email);
  };

  const signup = async (email: string, password: string, name: string) => {
    // Placeholder - to be implemented
    console.log('Signup:', email, name);
  };

  const logout = async () => {
    // Placeholder - to be implemented
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
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

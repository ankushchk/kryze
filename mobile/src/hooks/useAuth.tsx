import { useEffect, useState, createContext, useContext } from 'react';
import { apiRequest, getAuthToken, setAuthToken, removeAuthToken } from '@/lib/api';

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuthContextType = {
  session: { token: string } | null;
  user: AppUser | null;
  initialized: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  initialized: false,
  signInWithPassword: async () => ({ error: new Error('AuthContext not initialized') }),
  signUp: async () => ({ error: new Error('AuthContext not initialized') }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const token = await getAuthToken();
        if (token) {
          // Fetch current user from backend to verify token is valid
          const response = await apiRequest('/api/auth/me');
          if (response?.user) {
            setSession({ token });
            setUser(response.user);
          } else {
            // Token is invalid/expired
            await removeAuthToken();
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
        // Clean up token if we get a verification error
        await removeAuthToken();
      } finally {
        setInitialized(true);
      }
    }

    loadSession();
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    try {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      if (response?.token && response?.user) {
        await setAuthToken(response.token);
        setSession({ token: response.token });
        setUser(response.user);
        return { error: null };
      }
      return { error: new Error('Invalid response from server') };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    try {
      const response = await apiRequest('/api/auth/signup', {
        method: 'POST',
        body: { name, email, password },
      });

      if (response?.token && response?.user) {
        await setAuthToken(response.token);
        setSession({ token: response.token });
        setUser(response.user);
        return { error: null };
      }
      return { error: new Error('Invalid response from server') };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    await removeAuthToken();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, initialized, signInWithPassword, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);


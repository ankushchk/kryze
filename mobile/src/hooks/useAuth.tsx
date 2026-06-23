import { useEffect, useState, createContext, useContext } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
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
  isGoogleConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (idToken: string) => Promise<{ error: Error | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  initialized: false,
  isGoogleConfigured: false,
  signInWithPassword: async () => ({ error: new Error('AuthContext not initialized') }),
  signInWithGoogle: async () => ({ error: new Error('AuthContext not initialized') }),
  signUp: async () => ({ error: new Error('AuthContext not initialized') }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  
  const isGoogleConfigured = !!(
    (webClientId && webClientId.trim() !== '' && webClientId !== 'undefined') ||
    (iosClientId && iosClientId.trim() !== '' && iosClientId !== 'undefined')
  );

  useEffect(() => {
    // Configure Google Sign-in client conditionally to prevent crashes when keys are missing
    if (isGoogleConfigured) {
      GoogleSignin.configure({
        webClientId: webClientId && webClientId !== 'undefined' ? webClientId : undefined,
        iosClientId: iosClientId && iosClientId !== 'undefined' ? iosClientId : undefined,
      });
    } else {
      console.warn('Google Sign-in client IDs are missing in environment variables. Google login will be unavailable.');
    }

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

  const signInWithGoogle = async (idToken: string) => {
    try {
      const response = await apiRequest('/api/auth/google', {
        method: 'POST',
        body: { idToken },
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
    <AuthContext.Provider value={{ session, user, initialized, isGoogleConfigured, signInWithPassword, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);


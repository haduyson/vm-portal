import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, isPartialResponse } from '../services/auth-service';
import apiClient from '../services/api-client';

interface UserInfo {
  username: string;
  is_admin: boolean;
  telegram_chat_id?: string | null;
  email?: string | null;
  notification_preference?: string;
  tailscale_email?: string | null;
  has_2fa?: boolean;
}

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ requires2FA?: boolean; partialToken?: string }>;
  complete2FA: (partialToken: string, totpCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());
  const [loading, setLoading] = useState(() => authService.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      apiClient
        .get('/auth/me')
        .then((res) => {
          setUser({
            username: res.data.username,
            is_admin: res.data.is_admin,
            telegram_chat_id: res.data.telegram_chat_id,
            email: res.data.email,
            notification_preference: res.data.notification_preference,
            tailscale_email: res.data.tailscale_email,
            has_2fa: res.data.has_2fa,
          });
        })
        .catch(() => {
          authService.logout();
          setUser(null);
          setIsAuthenticated(false);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []);

  const login = async (username: string, password: string) => {
    const result = await authService.login(username, password);

    if (isPartialResponse(result)) {
      return { requires2FA: true, partialToken: result.partial_token };
    }

    // Full login - fetch user info
    const res = await apiClient.get('/auth/me');
    setUser({
      username: res.data.username,
      is_admin: res.data.is_admin,
      telegram_chat_id: res.data.telegram_chat_id,
      has_2fa: res.data.has_2fa,
    });
    setIsAuthenticated(true);
    return {};
  };

  const complete2FA = async (partialToken: string, totpCode: string) => {
    await authService.login2FA(partialToken, totpCode);
    const res = await apiClient.get('/auth/me');
    setUser({
      username: res.data.username,
      is_admin: res.data.is_admin,
      telegram_chat_id: res.data.telegram_chat_id,
      has_2fa: res.data.has_2fa,
    });
    setIsAuthenticated(true);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, complete2FA, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

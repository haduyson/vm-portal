import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '../services/auth-service';
import apiClient from '../services/api-client';

interface UserInfo {
  username: string;
  is_admin: boolean;
  telegram_chat_id?: string | null;
}

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const authenticated = authService.isAuthenticated();
    if (authenticated) {
      setIsAuthenticated(true);
      // Fetch current user info from /auth/me
      apiClient
        .get('/auth/me')
        .then((res) => {
          setUser({
            username: res.data.username,
            is_admin: res.data.is_admin,
            telegram_chat_id: res.data.telegram_chat_id
          });
        })
        .catch(() => {
          // Token invalid or expired
          authService.logout();
          setUser(null);
          setIsAuthenticated(false);
        });
    }
  }, []);

  const login = async (username: string, password: string) => {
    await authService.login(username, password);
    // Fetch full user info after login
    const res = await apiClient.get('/auth/me');
    setUser({
      username: res.data.username,
      is_admin: res.data.is_admin,
      telegram_chat_id: res.data.telegram_chat_id
    });
    setIsAuthenticated(true);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
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

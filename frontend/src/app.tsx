import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

type PaletteMode = 'light' | 'dark';
import { AuthProvider } from './hooks/use-auth-context';
import ProtectedRoute from './components/protected-route-wrapper';
import AdminRoute from './components/admin-route-wrapper';
import AppLayout from './components/app-layout-with-sidebar';
import LoginPage from './pages/login-page';
import DashboardPage from './pages/dashboard-page';
import VMCreatePage from './pages/vm-create-page';
import VMListPage from './pages/vm-list-page';
import VMDetailPage from './pages/vm-detail-page';
import AdminUserManagementPage from './pages/admin-user-management-page';
import AdminVmOverviewPage from './pages/admin-vm-overview-page';
import AdminAuditLogPage from './pages/admin-audit-log-page';
import UserProfileSettingsPage from './pages/user-profile-settings-page';
import AdminSettingsPage from './pages/admin-settings-page';
import TwoFactorSetupPage from './pages/two-factor-setup-page';

interface ThemeContextType {
  mode: PaletteMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleTheme: () => {},
});

export const useThemeContext = () => useContext(ThemeContext);

function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    return (saved as PaletteMode) || 'light';
  });

  const toggleTheme = () => {
    setMode((prevMode: PaletteMode) => {
      const newMode: PaletteMode = prevMode === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme-mode', newMode);
      return newMode;
    });
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: '#1976D2',
          },
          secondary: {
            main: '#424242',
          },
          success: {
            main: '#2E7D32',
          },
          warning: {
            main: '#ED6C02',
          },
          error: {
            main: '#D32F2F',
          },
          ...(mode === 'light'
            ? {
                background: {
                  default: '#F5F5F5',
                  paper: '#FFFFFF',
                },
              }
            : {
                background: {
                  default: '#121212',
                  paper: '#1E1E1E',
                },
              }),
        },
        typography: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          h6: {
            fontWeight: 600,
          },
          h4: {
            fontWeight: 600,
          },
        },
        shape: {
          borderRadius: 8,
        },
      }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeContextProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/vms/create" element={<VMCreatePage />} />
                <Route path="/vms/:id" element={<VMDetailPage />} />
                <Route path="/vms" element={<VMListPage />} />
                <Route path="/profile" element={<UserProfileSettingsPage />} />
                <Route path="/2fa/setup" element={<TwoFactorSetupPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin/users" element={<AdminUserManagementPage />} />
                  <Route path="/admin/vms" element={<AdminVmOverviewPage />} />
                  <Route path="/admin/audit-logs" element={<AdminAuditLogPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeContextProvider>
    </BrowserRouter>
  );
}

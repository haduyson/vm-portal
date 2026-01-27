import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './hooks/use-auth-context';
import ProtectedRoute from './components/protected-route-wrapper';
import AdminRoute from './components/admin-route-wrapper';
import AppLayout from './components/app-layout-with-sidebar';
import LoginPage from './pages/login-page';
import DashboardPage from './pages/dashboard-page';
import VMCreatePage from './pages/vm-create-page';
import VMListPage from './pages/vm-list-page';
import AdminUserManagementPage from './pages/admin-user-management-page';
import AdminVmOverviewPage from './pages/admin-vm-overview-page';

const theme = createTheme({
  palette: {
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
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
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
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/vms/create" element={<VMCreatePage />} />
                <Route path="/vms" element={<VMListPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin/users" element={<AdminUserManagementPage />} />
                  <Route path="/admin/vms" element={<AdminVmOverviewPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

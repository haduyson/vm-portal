import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth-context';

export default function AdminRoute() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

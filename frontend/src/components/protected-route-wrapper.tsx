import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth-context';

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

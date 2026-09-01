import { useAuth } from '../context/AuthContext';

export function usePermissions(requiredPermission?: string): boolean {
  const { user } = useAuth();
  if (!user || !user.permissions) return false;
  if (!requiredPermission) return true;

  return (
    user.permissions.includes('nexus:admin') ||
    user.permissions.includes(requiredPermission)
  );
}

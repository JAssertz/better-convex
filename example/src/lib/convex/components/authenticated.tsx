'use client';

import { useAuthStatus, useIsAuth } from '@/lib/convex/hooks';

export function Authenticated({ children }: { children: React.ReactNode }) {
  const isAuth = useIsAuth();

  if (isAuth) {
    return <>{children}</>;
  }

  return null;
}

export function Unauthenticated({
  children,
  verified,
}: {
  children: React.ReactNode;
  verified?: boolean;
}) {
  const { hasSession, isAuthenticated, isLoading } = useAuthStatus();

  if (!verified && hasSession) {
    return null;
  }
  if (verified && (isLoading || isAuthenticated)) {
    return null;
  }

  return <>{children}</>;
}

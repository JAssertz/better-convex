import type { Route } from 'next';
import { redirect } from 'next/navigation';
import type * as React from 'react';
import { isUnauth } from '@/lib/convex/server';

export const authGuard = async () => {
  // Check Convex auth
  if (await isUnauth()) {
    redirect('/login');
  }
};

export const authRedirect = async ({
  pathname,
  searchParams,
}: {
  pathname?: string;
  searchParams?: Record<string, string>;
}) => {
  // Check Convex auth
  if (await isUnauth()) {
    let callbackUrl = '/login';

    if (pathname) {
      if (searchParams) {
        const params = new URLSearchParams(searchParams);
        callbackUrl += `?callbackUrl=${encodeURIComponent(pathname + params.toString())}`;
      } else {
        callbackUrl += `?callbackUrl=${pathname}`;
      }
    }

    redirect(callbackUrl as Route);
  }
};

export async function AuthRedirect({
  children,
  pathname,
  searchParams,
}: {
  children: React.ReactNode;
  pathname?: string;
  searchParams?: Record<string, string>;
}) {
  await authRedirect({ pathname, searchParams });

  return <>{children}</>;
}

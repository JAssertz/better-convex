"use client";

import type { ReactNode } from "react";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { createAtomStore } from "jotai-x";

import { authClient } from "@/lib/convex/auth-client";
import { AuthErrorBoundary } from "@/lib/convex/components/auth-error-boundary";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const { AuthProvider, useAuthValue } = createAtomStore(
  {
    isAuthenticated: false,
  },
  {
    name: "auth",
  }
);

export function ConvexProvider({
  children,
  isAuthenticated,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
}) {
  return (
    <ConvexBetterAuthProvider authClient={authClient} client={convex}>
      <ConvexProviderInner isAuthenticated={isAuthenticated}>
        {children}
      </ConvexProviderInner>
    </ConvexBetterAuthProvider>
  );
}

function ConvexProviderInner({
  children,
  isAuthenticated,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
}) {
  const auth = useConvexAuth();

  return (
    <AuthProvider
      isAuthenticated={auth.isLoading ? isAuthenticated : auth.isAuthenticated}
    >
      <AuthErrorBoundary isAuthenticated={isAuthenticated}>
        {children}
      </AuthErrorBoundary>
    </AuthProvider>
  );
}

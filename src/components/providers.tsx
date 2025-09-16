import { QueryClientProvider } from '@/lib/react-query/query-client-provider';
import { ConvexProvider } from '@/lib/convex/components/convex-provider';
import { getSessionToken } from '@/lib/convex/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export async function Providers({ children }) {
  const token = await getSessionToken();

  return (
    <ConvexProvider token={token}>
      <QueryClientProvider>
        <NuqsAdapter>{children}</NuqsAdapter>
      </QueryClientProvider>
    </ConvexProvider>
  );
}

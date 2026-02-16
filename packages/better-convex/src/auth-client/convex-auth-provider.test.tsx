import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useFetchAccessToken } from '../react/auth-store';
import { ConvexAuthProvider } from './convex-auth-provider';

const makeJwt = (expSecondsFromNow: number) => {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = btoa(JSON.stringify({ exp }));
  return `x.${payload}.z`;
};

describe('ConvexAuthProvider', () => {
  let originalHref = window.location.href;

  beforeEach(() => {
    originalHref = window.location.href;
  });

  afterEach(() => {
    try {
      window.history.replaceState({}, '', originalHref);
    } catch {
      // Happy DOM may reject some URL transitions; don't let cleanup fail the suite.
    }
  });

  test('provides fetchAccessToken that returns cached SSR token while session is pending', async () => {
    const initialToken = makeJwt(3600);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = mock(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => ({ data: null, isPending: true }),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result.current).toBe('function');

    let fetched: string | null = null;
    await act(async () => {
      fetched = await result.current!({ forceRefreshToken: false });
    });

    // Assignment happens inside `act` callback; widen back to the declared union.
    expect(fetched as string | null).toBe(initialToken);
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('verifies OTT and refreshes session, then removes ott from the URL', async () => {
    const ott = 'OTT123';

    window.history.replaceState({}, '', `/?ott=${ott}`);
    let currentOtt = new URL(window.location.href).searchParams.get('ott');
    if (currentOtt !== ott) {
      try {
        window.location.href = `http://localhost/?ott=${ott}`;
      } catch {
        // Ignore - we'll assert based on actual href below.
      }
      currentOtt = new URL(window.location.href).searchParams.get('ott');
    }
    expect(currentOtt).toBe(ott);

    const verify = mock(async () => ({
      data: { session: { token: 'SESSION_TOKEN' } },
    }));
    const getSession = mock(async (_opts: any) => null);
    const updateSession = mock(() => {});

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => ({ data: null, isPending: false }),
      convex: { token: async () => ({ data: {} }) },
      getSession,
      updateSession,
      crossDomain: { oneTimeToken: { verify } },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {children}
      </ConvexAuthProvider>
    );

    renderHook(() => null, { wrapper });

    // Flush the async IIFE started in useEffect().
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(verify.mock.calls.length).toBeGreaterThan(0);
    expect(verify).toHaveBeenCalledWith({ token: ott });
    expect(getSession.mock.calls.length).toBeGreaterThan(0);
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { headers: { Authorization: 'Bearer SESSION_TOKEN' } },
    });
    expect(updateSession.mock.calls.length).toBeGreaterThan(0);

    const url = new URL(window.location.href);
    expect(url.searchParams.get('ott')).toBeNull();
  });
});

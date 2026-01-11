import { useConvexAction, useConvexMutation } from '@convex-dev/react-query';
import {
  type DefaultError,
  type QueryClient,
  type UseMutationOptions,
  useMutation,
} from '@tanstack/react-query';
import {
  type OptionalRestArgsOrSkip,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  useConvexAuth,
  usePaginatedQuery,
  useQueries,
  useQuery,
} from 'convex/react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import { makeUseQueryWithStatus } from 'convex-helpers/react';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { DeepPartial } from 'ts-essentials';

import { useAuthValue } from '@/lib/convex/components/convex-provider';

export const useAuthStatus = () => {
  // During SSR/prerendering, return loading state
  if (typeof window === 'undefined') {
    return {
      hasSession: false,
      isAuthenticated: false,
      isLoading: true,
    };
  }

  // Token is ready to be used only after convex client auth is loaded
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isAuthenticated, isLoading } = useConvexAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const token = useAuthValue('token');

  return {
    hasSession: !!token,
    isAuthenticated,
    isLoading,
  };
};

export const useIsAuth = (verified?: boolean) => {
  const { hasSession, isAuthenticated } = useAuthStatus();

  if (verified) {
    return isAuthenticated;
  }

  return hasSession;
};

export function useStableQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): { data: FunctionReturnType<Query> | undefined; isLoading: boolean } {
  const result = useQuery(query, ...args);
  const stored = useRef<FunctionReturnType<Query> | undefined>(result);

  if (result !== undefined) {
    stored.current = result;
  }

  return { data: stored.current, isLoading: result === undefined };
}

export const useAuthGuard = () => {
  const isAuth = useIsAuth();

  return (callback?: () => Promise<void> | void) => {
    if (!isAuth) {
      // push modal to login

      return true;
    }

    return callback ? void callback() : false;
  };
};

const useQueryWithStatus = makeUseQueryWithStatus(useQueries);

// Query for public users with optional placeholder data
export const usePublicQuery = <Query extends FunctionReference<'query'>>(
  query: Query,
  args: OptionalRestArgsOrSkip<Query>[0],
  options?: {
    debug?: boolean;
    placeholderData?: DeepPartial<FunctionReturnType<Query>>;
  }
):
  | {
      data: FunctionReturnType<Query>;
      error: undefined;
      isError: false;
      isLoading: false;
      isPending: false;
      isSuccess: true;
      status: 'success';
    }
  | {
      data: undefined;
      error: Error;
      isError: true;
      isLoading: false;
      isPending: false;
      isSuccess: false;
      status: 'error';
    }
  | {
      data: undefined;
      error: undefined;
      isError: false;
      isLoading: true;
      isPending: true;
      isSuccess: false;
      status: 'pending';
    } => {
  const { isLoading: isAuthLoading } = useAuthStatus();

  const mounted = useMounted();
  const adjustedArgs = isAuthLoading ? 'skip' : args;

  const result = useQueryWithStatus(query, adjustedArgs as any);

  const isPending =
    (options?.placeholderData && !mounted) ||
    isAuthLoading ||
    (adjustedArgs !== 'skip' && (result.isPending as any));

  // Apply placeholder data logic if option is provided
  if (options?.placeholderData && isPending) {
    return {
      data: options.placeholderData as FunctionReturnType<Query>,
      error: undefined,
      isError: false,
      isLoading: true,
      isPending: true,
      isSuccess: false,
      status: 'pending',
    };
  }

  return {
    ...result,
    isLoading: isPending,
    isPending,
  };
};

// Query skipped for unauthenticated users
export const useAuthQuery: typeof usePublicQuery = (query, args, options) => {
  const { isAuthenticated, isLoading } = useAuthStatus();

  const result = usePublicQuery(
    query,
    isAuthenticated ? (args as any) : 'skip',
    options
  );

  return {
    ...result,
    isLoading: isLoading || result.isLoading,
    isPending: isLoading || result.isPending,
  } as typeof result;
};

// Paginated query for public users
export const usePublicPaginatedQuery = <Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | 'skip',
  options: {
    initialNumItems: number;
    debug?: boolean;
    placeholderData?: DeepPartial<PaginatedQueryItem<Query>>[];
  }
): {
  /** An array of the currently loaded results */
  data: PaginatedQueryItem<Query>[];
  /** Whether the query has a next page */
  hasNextPage: boolean;
  /** Whether the query is fetching */
  isFetching: boolean;
  /** Whether the query is fetching the next page */
  isFetchingNextPage: boolean;
  /** Whether the query is loading the first page */
  isLoading: boolean;
  /** Fetch the next page */
  fetchNextPage: () => void;
} => {
  // Some public queries have auth logic, so we need to skip when auth is loading
  const { isLoading: isAuthLoading } = useAuthStatus();
  const mounted = useMounted();
  const queryArgs = isAuthLoading ? 'skip' : args;

  // If not authenticated, always skip
  const {
    isLoading: _isLoading,
    loadMore,
    results,
    status,
  } = usePaginatedQuery(query, queryArgs, options);

  const fetchNextPage = () => {
    loadMore(options.initialNumItems);
  };

  const isLoading = isAuthLoading || (args !== 'skip' && _isLoading);
  const showPlaceholder =
    options?.placeholderData &&
    (!mounted || (isLoading && status === 'LoadingFirstPage'));

  // Filter duplicates by id. This is a workaround to avoid duplicates when deleting items from streams
  const uniqueResults = useMemo(() => {
    // Use placeholder data if provided and loading
    if (showPlaceholder) {
      return options.placeholderData as PaginatedQueryItem<Query>[];
    }

    return results.filter((item, index, self) => {
      // If item has _id property, use it for deduplication
      if (item._id) {
        return (
          index === self.findIndex((t) => '_id' in t && t._id === item._id)
        );
      }
      // If item has id property, use it for deduplication
      if (item.id) {
        return index === self.findIndex((t) => 'id' in t && t.id === item.id);
      }

      // Otherwise, keep all items
      return true;
    });
  }, [results, showPlaceholder, options?.placeholderData]);

  return {
    data: uniqueResults,
    fetchNextPage,
    hasNextPage: showPlaceholder ? false : status !== 'Exhausted',
    isFetching: isLoading,
    isFetchingNextPage: status === 'LoadingMore',
    isLoading: showPlaceholder || (isLoading && status === 'LoadingFirstPage'),
  };
};

// Paginated query skipped for unauthenticated users
export const useAuthPaginatedQuery: typeof usePublicPaginatedQuery = (
  query,
  args,
  options
) => {
  const { isAuthenticated, isLoading } = useAuthStatus();

  const result = usePublicPaginatedQuery(
    query,
    isAuthenticated ? (args as any) : 'skip',
    options
  );

  return {
    ...result,
    isLoading: isLoading || result.isLoading,
  } as typeof result;
};

// Mutation for public users (auth optional) using TanStack Query
export const usePublicMutation = <
  Mutation extends FunctionReference<'mutation', any, any>,
>(
  mutation: Mutation,
  options?: UseMutationOptions<
    FunctionReturnType<Mutation>,
    DefaultError,
    FunctionArgs<Mutation>
  >,
  queryClient?: QueryClient
) => {
  const convexMutation = useConvexMutation(mutation);

  return useMutation<
    FunctionReturnType<Mutation>,
    DefaultError,
    FunctionArgs<Mutation>
  >(
    {
      mutationFn: convexMutation as any,
      ...options,
    },
    queryClient
  );
};

// Mutation that requires authentication using TanStack Query
export const useAuthMutation: typeof usePublicMutation = (
  mutation,
  options,
  queryClient
) => {
  const authGuard = useAuthGuard();
  const convexMutation = useConvexMutation(mutation);

  return useMutation(
    {
      mutationFn: async (...args) => {
        if (authGuard()) {
          return;
        }

        return convexMutation(...(args as any));
      },
      ...options,
    },
    queryClient
  );
};

// Action for public users (auth optional) using TanStack Query
export const usePublicAction = <
  Action extends FunctionReference<'action', any, any>,
>(
  action: Action,
  options?: UseMutationOptions<
    FunctionReturnType<Action>,
    DefaultError,
    FunctionArgs<Action>
  >,
  queryClient?: QueryClient
) => {
  const convexAction = useConvexAction(action);

  return useMutation<
    FunctionReturnType<Action>,
    DefaultError,
    FunctionArgs<Action>
  >(
    {
      mutationFn: convexAction as any,
      ...options,
    },
    queryClient
  );
};

// Action that requires authentication using TanStack Query
export const useAuthAction: typeof usePublicAction = (
  action,
  options,
  queryClient
) => {
  const authGuard = useAuthGuard();
  const convexAction = useConvexAction(action);

  return useMutation(
    {
      mutationFn: async (...args) => {
        if (authGuard()) {
          return;
        }

        return convexAction(...(args as any));
      },
      ...options,
    },
    queryClient
  );
};

const subscribe = () => () => {};

const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

// Upload file hook for R2
export const useUploadFile = <
  TGenerateUrlMutation extends FunctionReference<
    'mutation',
    'public',
    any,
    { key: string; url: string }
  >,
>(
  generateUrlMutation: TGenerateUrlMutation,
  options?: UseMutationOptions<
    FunctionReturnType<TGenerateUrlMutation>,
    DefaultError,
    { file: File } & FunctionArgs<TGenerateUrlMutation>
  >
) => {
  const generateUrl = useAuthMutation(generateUrlMutation);

  return useMutation<
    FunctionReturnType<TGenerateUrlMutation>,
    DefaultError,
    { file: File } & FunctionArgs<TGenerateUrlMutation>
  >({
    mutationFn: async ({ file, ...args }) => {
      // Generate the upload URL
      const result = await generateUrl.mutateAsync(
        args as FunctionArgs<TGenerateUrlMutation>
      );
      const { url } = result;

      // Upload the file
      const response = await fetch(url, {
        body: file,
        headers: { 'Content-Type': file.type },
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return result;
    },
    onError: (error) => {
      toast.error(
        `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
    ...options,
  });
};

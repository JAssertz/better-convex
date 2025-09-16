import type { NextjsOptions } from 'convex/nextjs';
import type {
  ArgsAndOptions,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';

import { getToken } from '@convex-dev/better-auth/nextjs';
import { api } from '@convex/_generated/api';
import { createAuth } from '@convex/auth';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

export const getSessionToken = async (): Promise<string | undefined> => {
  const token = await getToken(createAuth);

  return token;
};

export const isAuth = async () => {
  const token = await getSessionToken();

  try {
    return await fetchQuery(api.user.getIsAuthenticated, {}, { token });
  } catch {
    return false;
  }
};

export const isUnauth = async () => {
  return !(await isAuth());
};

// Session helper functions using Convex

export const fetchSessionUser = async () => {
  const token = await getSessionToken();

  return await fetchQuery(api.user.getSessionUser, {}, { token });
};

export async function fetchAuthQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: ArgsAndOptions<Query, NextjsOptions>
): Promise<FunctionReturnType<Query> | null> {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }
  // Handle both cases: with and without args
  if (args.length === 0) {
    return fetchQuery(query, {}, { token });
  } else if (args.length === 1) {
    return fetchQuery(query, args[0], { token });
  } else {
    // args[1] contains options, merge token into it
    return fetchQuery(query, args[0], { token, ...args[1] });
  }
}

export async function fetchAuthQueryOrThrow<
  Query extends FunctionReference<'query'>,
>(
  query: Query,
  ...args: ArgsAndOptions<Query, NextjsOptions>
): Promise<FunctionReturnType<Query>> {
  const token = await getSessionToken();

  if (!token) {
    throw new Error('Not authenticated');
  }
  // Handle both cases: with and without args
  if (args.length === 0) {
    return fetchQuery(query, {}, { token });
  } else if (args.length === 1) {
    return fetchQuery(query, args[0], { token });
  } else {
    // args[1] contains options, merge token into it
    return fetchQuery(query, args[0], { token, ...args[1] });
  }
}

export async function fetchAuthMutation<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  ...args: ArgsAndOptions<Mutation, NextjsOptions>
): Promise<FunctionReturnType<Mutation> | null> {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }
  // Handle both cases: with and without args
  if (args.length === 0) {
    return fetchMutation(mutation, {}, { token });
  } else if (args.length === 1) {
    return fetchMutation(mutation, args[0], { token });
  } else {
    // args[1] contains options, merge token into it
    return fetchMutation(mutation, args[0], { token, ...args[1] });
  }
}

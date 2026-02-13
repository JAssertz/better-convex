import type { betterAuth } from 'better-auth';

export type GetAuth = (ctx: any) => ReturnType<typeof betterAuth>;

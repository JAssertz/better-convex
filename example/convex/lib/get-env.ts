import { z } from 'zod';

// Define the environment schema
const envSchema = z.object({
  // Public environment variables
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3000'),

  // Auth
  BETTER_AUTH_SECRET: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  RESEND_API_KEY: z.string().optional(),

  // Polar (new payment provider)
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_PRODUCT_CREDITS: z.string().optional(),
  POLAR_PRODUCT_PREMIUM: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),

  // Superadmin emails
  ADMIN: z
    .string()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.string())),
});

export const getEnv = () => {
  // Parse and validate environment variables
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
};

// Type-safe environment variable access
export type EnvConvex = z.infer<typeof envSchema>;

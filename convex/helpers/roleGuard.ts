import { ConvexError } from 'convex/values';

// Helper function to check role authorization
export function roleGuard(
  role: 'admin',
  user: { isAdmin?: boolean; role?: string | null } | null
) {
  if (!user) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  }
  if (role === 'admin' && !user.isAdmin) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
}

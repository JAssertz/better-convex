import { api } from '@convex/_generated/api';

import { useAuthValue } from '@/lib/convex/components/convex-provider';
import { usePublicQuery } from '@/lib/convex/hooks/convex-hooks';

export const useCurrentUser = () => {
  const token = useAuthValue('token');

  const { data, ...rest } = usePublicQuery(
    api.user.getCurrentUser,
    token ? {} : 'skip',
    {
      placeholderData: {
        id: '0' as any,
        activeOrganization: {
          id: '',
          logo: '',
          name: '',
          role: '',
          slug: '',
        },
        image: undefined,
        isAdmin: false,
        name: '',
        session: {
          token: token ?? undefined,
        },
      },
    }
  );

  return {
    ...rest,
    ...data,
  };
};

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  FolderOpen,
  Tags,
  LogOut,
  LogIn,
  CheckSquare,
  RotateCcw,
  TestTube2,
  Building2,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  useCurrentUser,
  useAuthMutation,
  usePublicQuery,
  useAuthAction,
} from '@/lib/convex/hooks';
import { signOut } from '@/lib/convex/auth-client';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';

export function BreadcrumbNav() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const resetAppData = useAuthMutation(api.reset.resetAppData);
  const generateSamplesAction = useAuthAction(api.seed.generateSamples);

  // Check if there's any data (projects)
  const { data: projectsData } = usePublicQuery(
    api.projects.list,
    { paginationOpts: { numItems: 1, cursor: null } },
    {
      placeholderData: { page: [], isDone: true, continueCursor: '' },
    }
  );
  const hasData = projectsData && projectsData.page.length > 0;

  // Parse the pathname into segments
  const segments = pathname.split('/').filter(Boolean);

  // Generate breadcrumb items
  const breadcrumbItems: React.ReactNode[] = [];

  // Always add home
  if (pathname === '/') {
    // On home page, show as current page
    breadcrumbItems.push(
      <BreadcrumbItem key="home">
        <BreadcrumbPage className="flex items-center gap-1">
          <Home className="h-4 w-4" />
          <span>Home</span>
        </BreadcrumbPage>
      </BreadcrumbItem>
    );
  } else {
    // On other pages, show as link
    breadcrumbItems.push(
      <BreadcrumbItem key="home">
        <BreadcrumbLink asChild>
          <Link href="/" className="flex items-center gap-1">
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
    );
  }

  // Add separator after home if there are segments
  if (segments.length > 0) {
    breadcrumbItems.push(<BreadcrumbSeparator key="home-separator" />);
  }

  // Add each segment
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const href = '/' + segments.slice(0, index + 1).join('/');

    // Format segment name
    let displayName = segment;

    // Handle special cases
    if (segment === 'projects') displayName = 'Projects';
    else if (segment === 'tags') displayName = 'Tags';
    else if (segment === 'login') displayName = 'Login';
    else if (segment === 'register') displayName = 'Register';
    // For dynamic segments (like project IDs), you might want to fetch the actual name
    // For now, we'll just show "Detail" for ID-like segments
    else if (segment.match(/^[a-zA-Z0-9]+$/)) displayName = 'Detail';

    if (isLast) {
      breadcrumbItems.push(
        <BreadcrumbItem key={segment}>
          <BreadcrumbPage>{displayName}</BreadcrumbPage>
        </BreadcrumbItem>
      );
    } else {
      breadcrumbItems.push(
        <BreadcrumbItem key={segment}>
          <BreadcrumbLink asChild>
            <Link href={href}>{displayName}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
      );
      breadcrumbItems.push(
        <BreadcrumbSeparator key={`${segment}-separator`} />
      );
    }
  });

  return (
    <div className="border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Breadcrumbs */}
          <Breadcrumb>
            <BreadcrumbList>{breadcrumbItems}</BreadcrumbList>
          </Breadcrumb>

          {/* Center - Quick Links */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckSquare className="h-4 w-4" />
              Todos
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link
              href="/projects"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              Projects
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link
              href="/tags"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Tags className="h-4 w-4" />
              Tags
            </Link>
            {user?.activeOrganization?.slug && (
              <>
                <div className="h-4 w-px bg-border" />
                <Link
                  href={`/org/${user.activeOrganization.slug}`}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Building2 className="h-4 w-4" />
                  Organization
                </Link>
              </>
            )}
          </div>

          {/* Right side - Auth */}
          <div className="flex items-center gap-2">
            {user && user.id ? (
              <>
                {hasData ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          'Are you sure you want to reset all app data? This will delete all projects, todos, tags, and comments. User accounts will be preserved.'
                        )
                      ) {
                        toast.promise(resetAppData.mutateAsync({}), {
                          loading: 'Resetting app data...',
                          success: (result) =>
                            `Reset complete! Deleted ${result.totalDeleted} items from ${Object.keys(result.deletedCounts).length} tables`,
                          error: (e) =>
                            e.data?.message ?? 'Failed to reset data',
                        });
                      }
                    }}
                    disabled={resetAppData.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset Data
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.promise(
                        generateSamplesAction.mutateAsync({ count: 100 }),
                        {
                          loading: 'Generating sample projects with todos...',
                          success: (result) =>
                            `Created ${result.created} projects with ${result.todosCreated} todos!`,
                          error: (e) =>
                            e.data?.message ?? 'Failed to generate samples',
                        }
                      );
                    }}
                    disabled={generateSamplesAction.isPending}
                  >
                    <TestTube2 className="h-4 w-4" />
                    Add Samples
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

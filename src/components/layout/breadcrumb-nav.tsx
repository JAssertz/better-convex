'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, FolderOpen, Tags, LogOut, LogIn, CheckSquare } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/convex/hooks';
import { signOut } from '@/lib/convex/auth-client';

export function BreadcrumbNav() {
  const pathname = usePathname();
  const user = useCurrentUser();
  
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
      breadcrumbItems.push(<BreadcrumbSeparator key={`${segment}-separator`} />);
    }
  });
  
  return (
    <div className="border-b">
      <div className="container mx-auto py-3 px-4">
        <div className="flex items-center justify-between">
          {/* Left side - Breadcrumbs */}
          <Breadcrumb>
            <BreadcrumbList>{breadcrumbItems}</BreadcrumbList>
          </Breadcrumb>
          
          {/* Center - Quick Links */}
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckSquare className="h-4 w-4" />
              Todos
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link 
              href="/projects" 
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              Projects
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link 
              href="/tags" 
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Tags className="h-4 w-4" />
              Tags
            </Link>
          </div>
          
          {/* Right side - Auth */}
          <div>
            {user && user.id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut()}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : (
              <Link href="/login">
                <Button
                  variant="outline"
                  size="sm"
                >
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
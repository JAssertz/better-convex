'use client';

import { api } from '@convex/_generated/api';
import {
  Building2,
  Calendar,
  Crown,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OrganizationMembers } from '@/components/organization/organization-members';
import { OrganizationOverview } from '@/components/organization/organization-overview';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WithSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthQuery } from '@/lib/convex/hooks';

export default function OrganizationPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [activeTab, setActiveTab] = useState('overview');

  const { data: organization, isLoading } = useAuthQuery(
    api.organization.getOrganization,
    { slug },
    {
      placeholderData: {
        id: '1' as any,
        createdAt: new Date('2025-11-04').getTime(),
        isActive: false,
        isPersonal: false,
        logo: null,
        membersCount: 3,
        name: 'Loading Organization',
        role: 'member',
        slug,
      },
    }
  );

  const { data: members, isLoading: membersLoading } = useAuthQuery(
    api.organization.listMembers,
    { slug },
    {
      placeholderData: {
        currentUserRole: 'member',
        isPersonal: false,
        members: [
          {
            id: '1' as any,
            createdAt: new Date('2025-11-04').getTime(),
            organizationId: '1' as any,
            role: 'owner',
            user: {
              id: '1' as any,
              email: 'owner@example.com',
              image: null,
              name: 'Organization Owner',
            },
            userId: '1' as any,
          },
          {
            id: '2' as any,
            createdAt: new Date('2025-11-04').getTime(),
            organizationId: '1' as any,
            role: 'member',
            user: {
              id: '2' as any,
              email: 'member@example.com',
              image: null,
              name: 'Team Member',
            },
            userId: '2' as any,
          },
        ],
      },
    }
  );

  if (!(organization || isLoading)) {
    return (
      <div className="mx-auto max-w-5xl @3xl:px-8 px-6 @3xl:py-12 py-8">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            Organization not found or you don't have access
          </p>
        </div>
      </div>
    );
  }

  const isOwner = organization?.role === 'owner';

  return (
    <div className="mx-auto max-w-5xl @3xl:px-8 px-6 @3xl:py-12 py-8">
      <WithSkeleton className="w-full" isLoading={isLoading}>
        <header className="mb-10">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 rounded-lg">
              <AvatarImage src={organization?.logo || ''} />
              <AvatarFallback className="rounded-lg">
                <Building2 className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-2xl tracking-tight">
                  {organization?.name}
                </h1>
                {organization?.isPersonal && (
                  <Badge className="text-xs" variant="secondary">
                    Personal
                  </Badge>
                )}
                {organization?.isActive && (
                  <Badge className="text-xs" variant="secondary">
                    Active
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {organization?.membersCount} members
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Created{' '}
                  {organization?.createdAt
                    ? new Date(organization.createdAt).toLocaleDateString()
                    : 'Unknown'}
                </span>
                {organization?.role && (
                  <span className="inline-flex items-center gap-1.5">
                    <Crown className="h-3.5 w-3.5" />
                    <span className="capitalize">{organization.role}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {isOwner && (
                <Button size="sm" variant="ghost">
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {!(organization?.isPersonal || isOwner) && (
                <Button size="sm" variant="ghost">
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        <Tabs
          className="space-y-6"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger
              className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-secondary"
              value="overview"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-secondary"
              value="members"
            >
              Members
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4" value="overview">
            <OrganizationOverview organization={organization} />
          </TabsContent>

          <TabsContent className="space-y-4" value="members">
            <OrganizationMembers
              isLoading={membersLoading}
              members={members}
              organization={organization}
            />
          </TabsContent>
        </Tabs>
      </WithSkeleton>
    </div>
  );
}

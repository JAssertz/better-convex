'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthQuery } from '@/lib/convex/hooks';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Settings,
  Users,
  Building2,
  Calendar,
  Crown,
  LogOut
} from 'lucide-react';
import { WithSkeleton } from '@/components/ui/skeleton';
import { OrganizationOverview } from '@/components/organization/organization-overview';
import { OrganizationMembers } from '@/components/organization/organization-members';

export default function OrganizationPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [activeTab, setActiveTab] = useState('overview');

  const { data: organization, isLoading } = useAuthQuery(
    api.organization.getOrganization,
    { slug },
    {
      placeholderData: {
        id: '1',
        createdAt: Date.now(),
        isActive: false,
        isPersonal: false,
        logo: null,
        membersCount: 3,
        name: 'Loading Organization',
        role: 'member',
        slug: slug,
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
            id: '1',
            createdAt: Date.now(),
            organizationId: '1',
            role: 'owner',
            user: {
              id: '1',
              email: 'owner@example.com',
              image: null,
              name: 'Organization Owner',
            },
            userId: '1',
          },
          {
            id: '2',
            createdAt: Date.now(),
            organizationId: '1',
            role: 'member',
            user: {
              id: '2',
              email: 'member@example.com',
              image: null,
              name: 'Team Member',
            },
            userId: '2',
          },
        ],
      },
    }
  );

  if (!organization && !isLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Organization not found or you don't have access
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = organization?.role === 'owner';

  return (
    <div className="container mx-auto px-4 py-6">
      <WithSkeleton isLoading={isLoading} className="w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={organization?.logo || ''} />
                <AvatarFallback className="text-lg">
                  <Building2 className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold">{organization?.name}</h1>
                  {organization?.isPersonal && (
                    <Badge variant="secondary">Personal</Badge>
                  )}
                  {organization?.isActive && (
                    <Badge variant="default">Active</Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{organization?.membersCount} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Created{' '}
                      {organization?.createdAt
                        ? new Date(organization.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </span>
                  </div>
                  {organization?.role && (
                    <div className="flex items-center gap-1">
                      <Crown className="h-4 w-4" />
                      <span className="capitalize">{organization.role}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isOwner && (
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              )}
              {!organization?.isPersonal && !isOwner && (
                <Button variant="outline" size="sm">
                  <LogOut className="h-4 w-4" />
                  Leave
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OrganizationOverview organization={organization} />
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <OrganizationMembers
              organization={organization}
              members={members}
              isLoading={membersLoading}
            />
          </TabsContent>
        </Tabs>
      </WithSkeleton>
    </div>
  );
}
'use client';

import { api } from '@convex/api';
import type { Id } from '@convex/dataModel';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMutation as useConvexMutation } from 'convex/react';
import { Building2, Check, ChevronsUpDown, Plus, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { WithSkeleton } from '@/components/ui/skeleton';
import { useCRPC } from '@/lib/convex/crpc';
import { useCurrentUser } from '@/lib/convex/hooks';
import { cn } from '@/lib/utils';

export function OrganizationSwitcher() {
  const [open, setOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [selectedOrgSlug, setSelectedOrgSlug] = useState<string | null>(null);
  const router = useRouter();
  const user = useCurrentUser();

  const crpc = useCRPC();

  const setActiveOrgFn = useConvexMutation(api.organization.setActiveOrganization);
  const createOrgFn = useConvexMutation(api.organization.createOrganization);

  const { data: orgsData, isLoading } = useQuery(
    crpc.organization.listOrganizations.queryOptions(
      {},
      {
        skipUnauth: true,
        placeholderData: {
          canCreateOrganization: true,
          organizations: [
            {
              id: '1' as Id<'organization'>,
              createdAt: new Date('2025-11-04').getTime(),
              isPersonal: true,
              logo: null,
              name: 'Personal',
              slug: 'personal',
            },
            {
              id: '2' as Id<'organization'>,
              createdAt: new Date('2025-11-04').getTime(),
              isPersonal: false,
              logo: null,
              name: 'Team Organization',
              slug: 'team-org',
            },
          ],
        },
      }
    )
  );

  const setActiveOrganization = useMutation({
    mutationFn: (args: any) => setActiveOrgFn(args),
    onSuccess: () => {
      toast.success('Switched organization successfully');
      setOpen(false);
      // Navigate to the organization page after switching
      if (selectedOrgSlug) {
        router.push(`/org/${selectedOrgSlug}`);
        setSelectedOrgSlug(null);
      } else {
        router.refresh();
      }
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to switch organization');
    },
  });

  const createOrganization = useMutation({
    mutationFn: (args: any) => createOrgFn(args),
    onSuccess: (result: any) => {
      toast.success('Organization created successfully');
      setShowCreateDialog(false);
      setOrgName('');
      // Navigate to the new organization
      router.push(`/org/${result.slug}`);
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to create organization');
    },
  });

  if (!user) {
    return null;
  }

  const currentOrg = user.activeOrganization;
  if (!currentOrg) {
    return null;
  }

  const handleSelectOrganization = (
    organizationId: Id<'organization'>,
    slug: string
  ) => {
    if (organizationId === currentOrg.id) {
      setOpen(false);
      return;
    }
    setSelectedOrgSlug(slug);
    setActiveOrganization.mutate({ organizationId });
  };

  const handleCreateOrganization = () => {
    if (!orgName.trim()) {
      toast.error('Organization name is required');
      return;
    }
    createOrganization.mutate({ name: orgName.trim() });
  };

  const allOrganizations = [
    // Current organization first
    {
      id: currentOrg.id,
      name: currentOrg.name,
      slug: currentOrg.slug,
      isPersonal: currentOrg.id === user.personalOrganizationId,
      logo: currentOrg.logo,
    },
    // Other organizations
    ...(orgsData?.organizations ?? []),
  ];

  // Remove duplicates by ID
  const uniqueOrganizations = allOrganizations.filter(
    (org, index, self) => index === self.findIndex((o) => o.id === org.id)
  );

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="w-[240px] justify-between"
            role="combobox"
            size="sm"
            variant="outline"
          >
            <div className="flex items-center gap-2 truncate">
              {currentOrg.id === user.personalOrganizationId ? (
                <User className="h-4 w-4 shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{currentOrg.name}</span>
              {currentOrg.id === user.personalOrganizationId && (
                <Badge className="ml-1" variant="secondary">
                  Personal
                </Badge>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Search organizations..." />
            <CommandList>
              <WithSkeleton isLoading={isLoading}>
                <CommandEmpty>No organization found.</CommandEmpty>
                <CommandGroup heading="Organizations">
                  {uniqueOrganizations.map((org) => (
                    <CommandItem
                      key={org.id}
                      onSelect={() =>
                        handleSelectOrganization(org.id, org.slug)
                      }
                      value={org.slug}
                    >
                      <div className="flex w-full flex-1 items-center gap-2">
                        {org.isPersonal ? (
                          <User className="h-4 w-4 shrink-0" />
                        ) : (
                          <Building2 className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">{org.name}</span>
                        {org.isPersonal && org.id !== currentOrg.id && (
                          <Badge
                            className="ml-auto shrink-0"
                            variant="secondary"
                          >
                            Personal
                          </Badge>
                        )}
                      </div>
                      <Check
                        className={cn(
                          'ml-2 h-4 w-4 shrink-0',
                          currentOrg.id === org.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                {orgsData?.canCreateOrganization && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setOpen(false);
                          setShowCreateDialog(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Organization
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </WithSkeleton>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create Organization Dialog */}
      <Dialog onOpenChange={setShowCreateDialog} open={showCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to collaborate with your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateOrganization();
                  }
                }}
                placeholder="My Team"
                value={orgName}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowCreateDialog(false);
                setOrgName('');
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={createOrganization.isPending || !orgName.trim()}
              onClick={handleCreateOrganization}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

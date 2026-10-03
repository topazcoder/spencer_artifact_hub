import type { Artifact, ArtifactAccess } from '@artifact-hub/shared';
import { BuildingIcon, LinkIcon, UsersIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { copyWithToast } from '@/lib/clipboard.ts';
import { accessSummary } from './access-summary.ts';
import { AddPeopleForm } from './add-people-form.tsx';
import { CompanyAccess } from './company-access.tsx';
import { PeopleList } from './people-list.tsx';
import { useAccess } from './use-sharing.ts';

/**
 * Who can see `artifact`: a summary, then one tab per kind of access, each saying who it
 * reaches. Owner only; opened from `children`.
 */
export function ShareDialog({ artifact, children }: { artifact: Artifact; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: access, error, refetch } = useAccess(artifact.id, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {/* Header and footer stay put; the rest scrolls. */}
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share “{artifact.title}”</DialogTitle>
          <DialogDescription>
            {access ? accessSummary(access) : 'Changes are saved as you make them.'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <InlineError error={error} onRetry={() => void refetch()} />
        ) : access ? (
          <AccessTabs artifact={artifact} access={access} />
        ) : (
          <div className="h-40">
            <InlineLoading />
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => void copyWithToast(`${window.location.origin}/artifacts/${artifact.id}`)}
          >
            <LinkIcon aria-hidden="true" />
            Copy link
          </Button>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessTabs({ artifact, access }: { artifact: Artifact; access: ArtifactAccess }) {
  return (
    <Tabs defaultValue="people" className="min-h-0 gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="people">
          <UsersIcon aria-hidden="true" />
          People
          {access.people.length > 0 ? (
            <Badge variant="secondary" aria-label={`${access.people.length} shared`}>
              {access.people.length}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="company">
          <BuildingIcon aria-hidden="true" />
          Company
          {access.company.enabled ? <Badge variant="secondary">On</Badge> : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="people" className="-m-1 grid min-h-0 gap-4 overflow-y-auto p-1">
        <TabDescription>
          Share with specific colleagues. They sign in to see it, and it shows up in their{' '}
          <em>Shared with me</em>.
        </TabDescription>
        <AddPeopleForm artifactId={artifact.id} />
        <PeopleList artifactId={artifact.id} people={access.people} />
      </TabsContent>
      <TabsContent value="company" className="-m-1 grid min-h-0 gap-4 overflow-y-auto p-1">
        <TabDescription>
          Anyone who signs in to Artifact Hub can find it in the <em>Company</em> gallery, view it
          and comment on it.
        </TabDescription>
        <CompanyAccess artifactId={artifact.id} company={access.company} />
      </TabsContent>
    </Tabs>
  );
}

function TabDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

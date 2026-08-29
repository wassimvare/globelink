import { useState } from "react";
import { Ban, MoreHorizontal, ShieldAlert, UserX } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { reportProfile, saveRelationshipControl } from "@/features/social/profile-moderation";

type ProfileActionsProps = {
  currentUserId?: string | null;
  targetUserId: string;
  username: string;
};

type ProfileAction = "restrict" | "block" | "report";

export function ProfileActions({
  currentUserId,
  targetUserId,
  username,
}: ProfileActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ProfileAction | null>(null);

  const isOwnProfile = !!currentUserId && currentUserId === targetUserId;

  if (!currentUserId || isOwnProfile) return null;

  const handleRestrict = async () => {
    if (loading) return;
    setLoading("restrict");

    try {
      await saveRelationshipControl({
        ownerId: currentUserId,
        targetId: targetUserId,
        mode: "restricted",
      });
      toast.success(`@${username} a été restreint`);
      setOpen(false);
    } catch {
      toast.error("Impossible de restreindre ce compte.");
    } finally {
      setLoading(null);
    }
  };

  const handleBlock = async () => {
    if (loading) return;
    setLoading("block");

    try {
      await saveRelationshipControl({
        ownerId: currentUserId,
        targetId: targetUserId,
        mode: "blocked",
      });
      toast.success(`@${username} a été bloqué`);
      setOpen(false);
    } catch {
      toast.error("Impossible de bloquer ce compte.");
    } finally {
      setLoading(null);
    }
  };

  const handleReport = async () => {
    if (loading) return;
    setLoading("report");

    try {
      await reportProfile({ reporterId: currentUserId, targetId: targetUserId });
      toast.success("Compte signalé");
      setOpen(false);
    } catch {
      toast.error("Impossible de signaler ce compte.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Options du profil"
          className="grid h-10 w-10 place-items-center rounded-full bg-background/90 text-foreground shadow-soft backdrop-blur transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-w-lg rounded-t-[28px] border-border/70 bg-card/98 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DrawerHeader className="px-5 pb-2 pt-5 text-left">
          <DrawerTitle>Options du profil</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-2 px-4 pb-3">
          <button
            type="button"
            onClick={() => void handleRestrict()}
            disabled={loading !== null}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Restreindre</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Limiter discrètement les interactions de ce compte.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleBlock()}
            disabled={loading !== null}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10">
              <Ban className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Bloquer</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Empêcher ce compte d'interagir avec toi.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleReport()}
            disabled={loading !== null}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
              <UserX className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Signaler</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Envoyer ce profil à la modération GlobeLink.
              </span>
            </span>
          </button>

          <DrawerClose asChild>
            <button
              type="button"
              disabled={loading !== null}
              className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Annuler
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

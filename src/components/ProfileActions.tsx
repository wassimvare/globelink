import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ProfileRelationshipMenu } from "@/components/profile-actions/ProfileRelationshipMenu";
import { ProfileReportFlow } from "@/components/profile-actions/ProfileReportFlow";
import { reportProfile, saveRelationshipControl } from "@/features/social/profile-moderation";

type ProfileActionsProps = {
  currentUserId?: string | null;
  targetUserId: string;
  username: string;
};

type ProfileAction = "restrict" | "block" | "report";

function syncRelationshipVisibilityCaches(queryClient: QueryClient, targetUserId: string) {
  queryClient.setQueriesData({ queryKey: ["search"] }, (cached: unknown) => {
    if (!cached || typeof cached !== "object") return cached;
    const searchResults = cached as { user?: Array<{ id?: string }> };
    if (!Array.isArray(searchResults.user)) return cached;

    const visibleUsers = searchResults.user.filter((result) => result.id !== targetUserId);
    if (visibleUsers.length === searchResults.user.length) return cached;
    return { ...searchResults, user: visibleUsers };
  });

  void queryClient.invalidateQueries({ queryKey: ["search"] });
  void queryClient.invalidateQueries({ queryKey: ["relationship-controls"] });
}

export function ProfileActions({
  currentUserId,
  targetUserId,
  username,
}: ProfileActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ProfileAction | null>(null);
  const [reportMode, setReportMode] = useState(false);

  const isOwnProfile = !!currentUserId && currentUserId === targetUserId;
  if (!currentUserId || isOwnProfile) return null;

  const closeDrawer = () => {
    setOpen(false);
    setReportMode(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading) return;
    setOpen(nextOpen);
    if (!nextOpen) setReportMode(false);
  };

  const saveControl = async (mode: "restricted" | "blocked") => {
    if (loading) return;
    const action = mode === "restricted" ? "restrict" : "block";
    setLoading(action);

    try {
      await saveRelationshipControl({
        ownerId: currentUserId,
        targetId: targetUserId,
        mode,
      });
      syncRelationshipVisibilityCaches(queryClient, targetUserId);
      toast.success(
        mode === "restricted"
          ? `@${username} a été restreint`
          : `@${username} a été bloqué`,
      );
      closeDrawer();
    } catch {
      toast.error(
        mode === "restricted"
          ? "Impossible de restreindre ce compte."
          : "Impossible de bloquer ce compte.",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleReport = async (reason: string) => {
    if (loading) return;
    setLoading("report");

    try {
      await reportProfile({
        reporterId: currentUserId,
        targetId: targetUserId,
        reason,
      });
      toast.success("Signalement envoyé");
      closeDrawer();
    } catch {
      toast.error("Impossible d'envoyer ce signalement.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Options du profil"
          className="grid h-10 w-10 place-items-center rounded-full bg-background/90 text-foreground shadow-soft backdrop-blur transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-h-[88dvh] max-w-lg rounded-t-[28px] border-border/70 bg-card/98 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {reportMode ? (
          <ProfileReportFlow
            username={username}
            submitting={loading === "report"}
            onBack={() => setReportMode(false)}
            onCancel={closeDrawer}
            onSubmit={handleReport}
          />
        ) : (
          <ProfileRelationshipMenu
            loading={loading !== null}
            onRestrict={() => void saveControl("restricted")}
            onBlock={() => void saveControl("blocked")}
            onReport={() => setReportMode(true)}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

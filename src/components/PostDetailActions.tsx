import { useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

type PostDetailActionsProps = {
  postId: string;
  ownerId: string;
  currentUserId?: string | null;
  caption?: string | null;
  onUpdated?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
};

type Mode = "actions" | "edit" | "delete";

export function PostDetailActions({
  postId,
  ownerId,
  currentUserId,
  caption,
  onUpdated,
  onDeleted,
}: PostDetailActionsProps) {
  const isOwner = !!currentUserId && currentUserId === ownerId;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("actions");
  const [draft, setDraft] = useState(caption ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDraft(caption ?? "");
  }, [caption]);

  if (!isOwner) return null;

  const resetAndClose = () => {
    setOpen(false);
    setMode("actions");
    setDraft(caption ?? "");
  };

  const saveCaption = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nextCaption = draft.trim();
      const { error } = await supabase
        .from("posts")
        .update({ caption: nextCaption || null })
        .eq("id", postId)
        .eq("user_id", ownerId);
      if (error) throw error;

      await onUpdated?.();
      toast.success("Publication modifiée");
      setOpen(false);
      setMode("actions");
    } catch (error) {
      console.error("post update failed", error);
      toast.error("Impossible de modifier la publication.");
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", ownerId);
      if (error) throw error;

      toast.success("Publication supprimée");
      setOpen(false);
      await onDeleted?.();
    } catch (error) {
      console.error("post deletion failed", error);
      toast.error("Impossible de supprimer la publication.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setMode("actions");
          setDraft(caption ?? "");
        }
      }}
    >
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Options de la publication"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95"
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-w-lg rounded-t-[28px] border-border/70 bg-card/98 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-elevated">
        {mode === "actions" && (
          <>
            <DrawerHeader className="px-5 pb-2 pt-5 text-left">
              <DrawerTitle>Options de la publication</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-2 px-4 pb-2">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-secondary active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                  <Pencil className="h-4 w-4" />
                </span>
                Modifier la publication
              </button>

              <button
                type="button"
                onClick={() => setMode("delete")}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-destructive transition hover:bg-destructive/10 active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </span>
                Supprimer la publication
              </button>

              <DrawerClose asChild>
                <button
                  type="button"
                  className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary"
                >
                  Annuler
                </button>
              </DrawerClose>
            </div>
          </>
        )}

        {mode === "edit" && (
          <>
            <DrawerHeader className="px-5 pb-2 pt-5 text-left">
              <DrawerTitle>Modifier la publication</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 px-5 pb-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                maxLength={2200}
                autoFocus
                placeholder="Écris une légende…"
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("actions");
                    setDraft(caption ?? "");
                  }}
                  disabled={saving}
                  className="flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={saveCaption}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </>
        )}

        {mode === "delete" && (
          <>
            <DrawerHeader className="px-5 pb-2 pt-5 text-left">
              <DrawerTitle>Supprimer cette publication ?</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 px-5 pb-2">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Cette action est définitive. La publication et ses interactions ne seront plus visibles.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("actions")}
                  disabled={deleting}
                  className="flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={deletePost}
                  disabled={deleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground transition active:scale-[0.99] disabled:opacity-50"
                >
                  {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Supprimer
                </button>
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

import { Ban, ShieldAlert, UserX } from "lucide-react";
import { DrawerClose, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type ProfileRelationshipMenuProps = {
  loading: boolean;
  onRestrict: () => void;
  onBlock: () => void;
  onReport: () => void;
};

export function ProfileRelationshipMenu({
  loading,
  onRestrict,
  onBlock,
  onReport,
}: ProfileRelationshipMenuProps) {
  return (
    <>
      <DrawerHeader className="px-5 pb-2 pt-5 text-left">
        <DrawerTitle>Options du profil</DrawerTitle>
      </DrawerHeader>

      <div className="space-y-2 px-4 pb-3">
        <button
          type="button"
          onClick={onRestrict}
          disabled={loading}
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
          onClick={onBlock}
          disabled={loading}
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
          onClick={onReport}
          disabled={loading}
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
            disabled={loading}
            className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
        </DrawerClose>
      </div>
    </>
  );
}

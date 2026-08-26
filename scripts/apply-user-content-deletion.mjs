import fs from "node:fs";

function patchFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[GlobeLink] ${path} deletion controls already applied.`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[GlobeLink] ${path} deletion controls applied.`);
}

function replaceRequired(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Content deletion patch failed: ${label}`);
  return source.replace(needle, replacement);
}

patchFile("src/routes/_authenticated.trips.index.tsx", (input) => {
  let source = input;

  if (!source.includes("  Trash2,")) {
    source = replaceRequired(source, "  Wallet,\n} from \"lucide-react\";", "  Wallet,\n  Trash2,\n} from \"lucide-react\";", "trip trash icon");
  }

  const deleteTripBlock = `  const deleteTrip = useMutation({\n    mutationFn: async (tripId: string) => {\n      if (!user) throw new Error(\"Connecte-toi pour supprimer ce voyage.\");\n      const { error } = await supabase\n        .from(\"trips\")\n        .delete()\n        .eq(\"id\", tripId)\n        .eq(\"user_id\", user.id);\n      if (error) throw error;\n    },\n    onSuccess: async () => {\n      await qc.invalidateQueries({ queryKey: [\"trips\"] });\n      toast.success(\"Voyage supprimé\");\n    },\n    onError: (error: any) => toast.error(error?.message ?? \"Impossible de supprimer ce voyage.\"),\n  });\n\n  const confirmDeleteTrip = (tripId: string, title: string) => {\n    if (deleteTrip.isPending) return;\n    const confirmed = window.confirm(\n      \`Supprimer « \${title} » ? Le carnet, les journées, dépenses et souvenirs de ce voyage seront supprimés.\`,\n    );\n    if (confirmed) deleteTrip.mutate(tripId);\n  };\n\n`;
  if (!source.includes("const deleteTrip = useMutation")) {
    source = replaceRequired(
      source,
      "  return (\n    <div className=\"app-page min-h-screen\">",
      `${deleteTripBlock}  return (\n    <div className=\"app-page min-h-screen\">`,
      "trip delete mutation",
    );
  }

  const focusAiButton = `                  <Button asChild variant=\"outline\" className=\"h-11 rounded-xl\">\n                    <Link to=\"/intelligence\">\n                      <Sparkles className=\"mr-2 h-4 w-4\" /> Demander à l’IA\n                    </Link>\n                  </Button>`;
  const focusAiWithDelete = `${focusAiButton}\n                  <Button\n                    type=\"button\"\n                    variant=\"ghost\"\n                    className=\"h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive sm:col-span-2 lg:col-span-1 xl:col-span-2\"\n                    disabled={deleteTrip.isPending}\n                    onClick={() => confirmDeleteTrip(focusTrip.id, focusTrip.title)}\n                  >\n                    <Trash2 className=\"mr-2 h-4 w-4\" /> Supprimer le voyage\n                  </Button>`;
  source = replaceRequired(source, focusAiButton, focusAiWithDelete, "focus trip delete button");

  const statusBadge = `                      <span className=\"absolute right-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur\">\n                        {trip.finalized_at ? \"Terminé\" : statusLabel(trip.status)}\n                      </span>`;
  const statusWithDelete = `                      <div className=\"absolute right-3 top-3 flex items-center gap-2\">\n                        <span className=\"rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur\">\n                          {trip.finalized_at ? \"Terminé\" : statusLabel(trip.status)}\n                        </span>\n                        <span\n                          role=\"button\"\n                          tabIndex={0}\n                          aria-label={\`Supprimer le voyage \${trip.title}\`}\n                          title=\"Supprimer le voyage\"\n                          onClick={(event) => {\n                            event.preventDefault();\n                            event.stopPropagation();\n                            confirmDeleteTrip(trip.id, trip.title);\n                          }}\n                          onKeyDown={(event) => {\n                            if (event.key !== \"Enter\" && event.key !== \" \") return;\n                            event.preventDefault();\n                            event.stopPropagation();\n                            confirmDeleteTrip(trip.id, trip.title);\n                          }}\n                          className=\"grid h-8 w-8 place-items-center rounded-full bg-background/90 text-destructive shadow-soft backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground\"\n                        >\n                          <Trash2 className=\"h-4 w-4\" />\n                        </span>\n                      </div>`;
  source = replaceRequired(source, statusBadge, statusWithDelete, "trip card delete control");

  return source;
});

patchFile("src/components/PostCard.tsx", (input) => {
  let source = input;

  if (!source.includes("  Trash2,")) {
    source = replaceRequired(source, "  Undo2,\n} from \"lucide-react\";", "  Undo2,\n  Trash2,\n} from \"lucide-react\";", "post trash icon");
  }

  if (!source.includes("const [deleted, setDeleted]")) {
    source = replaceRequired(
      source,
      "  const [hidden, setHidden] = useState(false);",
      "  const [hidden, setHidden] = useState(false);\n  const [deleted, setDeleted] = useState(false);",
      "post deleted state",
    );
  }

  const deletePostBlock = `  const deletePost = useMutation({\n    mutationFn: async () => {\n      if (!user || !isSelf) throw new Error(\"Cette publication ne t’appartient pas.\");\n      const { error } = await supabase\n        .from(\"posts\")\n        .delete()\n        .eq(\"id\", post.id)\n        .eq(\"user_id\", user.id);\n      if (error) throw error;\n    },\n    onSuccess: async () => {\n      setDeleted(true);\n      await Promise.all([\n        qc.invalidateQueries({ queryKey: [\"feed\"] }),\n        qc.invalidateQueries({ queryKey: [\"post\", post.id] }),\n        qc.invalidateQueries({ queryKey: [\"profile\"] }),\n      ]);\n      toast.success(\"Publication supprimée\");\n    },\n    onError: (error: any) => toast.error(error?.message ?? \"Suppression impossible.\"),\n  });\n\n`;
  if (!source.includes("const deletePost = useMutation")) {
    source = replaceRequired(source, "  if (authorMuted) return null;", `${deletePostBlock}  if (deleted) return null;\n  if (authorMuted) return null;`, "post delete mutation");
  }

  const shareMenu = `              <DropdownMenuItem onClick={share} className=\"rounded-xl\">\n                <Share2 className=\"mr-2 h-4 w-4\" /> Partager le lien\n              </DropdownMenuItem>`;
  const shareWithDelete = `              {isSelf && (\n                <DropdownMenuItem\n                  disabled={deletePost.isPending}\n                  onClick={() => {\n                    if (window.confirm(\"Supprimer définitivement cette publication ?\")) deletePost.mutate();\n                  }}\n                  className=\"rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive\"\n                >\n                  <Trash2 className=\"mr-2 h-4 w-4\" /> Supprimer la publication\n                </DropdownMenuItem>\n              )}\n              ${shareMenu}`;
  source = replaceRequired(source, shareMenu, shareWithDelete, "post delete menu item");

  return source;
});

patchFile("src/routes/post.$id.tsx", (input) => {
  let source = input;

  if (!source.includes("  Trash2,")) {
    source = replaceRequired(source, "  Play,\n} from \"lucide-react\";", "  Play,\n  Trash2,\n} from \"lucide-react\";", "post detail trash icon");
  }

  const detailDeleteBlock = `  const deletePost = useMutation({\n    mutationFn: async () => {\n      if (!user || post?.user_id !== user.id) throw new Error(\"Cette publication ne t’appartient pas.\");\n      const { error } = await supabase\n        .from(\"posts\")\n        .delete()\n        .eq(\"id\", id)\n        .eq(\"user_id\", user.id);\n      if (error) throw error;\n    },\n    onSuccess: async () => {\n      await Promise.all([\n        qc.invalidateQueries({ queryKey: [\"feed\"] }),\n        qc.invalidateQueries({ queryKey: [\"profile\"] }),\n      ]);\n      toast.success(\"Publication supprimée\");\n      navigate({ to: \"/\" });\n    },\n    onError: (error: any) => toast.error(error?.message ?? \"Suppression impossible.\"),\n  });\n\n`;
  if (!source.includes("post?.user_id !== user.id")) {
    source = replaceRequired(source, "  if (error) return <div className=\"p-8\">Erreur</div>;", `${detailDeleteBlock}  if (error) return <div className=\"p-8\">Erreur</div>;`, "post detail delete mutation");
  }

  const profileLinkEnd = `            </Link>\n            {post.caption && <p className=\"mt-4 text-sm\">{post.caption}</p>}`;
  const profileLinkWithDelete = `            </Link>\n            {post.user_id === user?.id && (\n              <Button\n                type=\"button\"\n                variant=\"ghost\"\n                size=\"sm\"\n                disabled={deletePost.isPending}\n                onClick={() => {\n                  if (window.confirm(\"Supprimer définitivement cette publication ?\")) deletePost.mutate();\n                }}\n                className=\"mt-3 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive\"\n              >\n                <Trash2 className=\"mr-2 h-4 w-4\" /> Supprimer la publication\n              </Button>\n            )}\n            {post.caption && <p className=\"mt-4 text-sm\">{post.caption}</p>}`;
  source = replaceRequired(source, profileLinkEnd, profileLinkWithDelete, "post detail delete button");

  return source;
});

patchFile("src/components/StoriesViewer.tsx", (input) => {
  let source = input;

  source = replaceRequired(
    source,
    'import { AlertTriangle, Volume2, VolumeX, X } from "lucide-react";',
    'import { AlertTriangle, Trash2, Volume2, VolumeX, X } from "lucide-react";',
    "story trash icon",
  );
  if (!source.includes('from "@tanstack/react-query"')) {
    source = replaceRequired(source, 'import { StoryLikeBar } from "@/components/StoryLikeBar";', 'import { StoryLikeBar } from "@/components/StoryLikeBar";\nimport { useQueryClient } from "@tanstack/react-query";\nimport { useAuth } from "@/lib/auth-context";\nimport { supabase } from "@/integrations/supabase/client";\nimport { toast } from "sonner";', "story delete imports");
  }

  if (!source.includes("const [deletingStory, setDeletingStory]")) {
    source = replaceRequired(
      source,
      "  const videoRef = useRef<HTMLVideoElement | null>(null);\n\n  const current = stories[index];",
      "  const videoRef = useRef<HTMLVideoElement | null>(null);\n  const { user } = useAuth();\n  const qc = useQueryClient();\n  const [deletingStory, setDeletingStory] = useState(false);\n\n  const current = stories[index];\n  const ownStory = !!user && current?.userId === user.id;",
      "story owner state",
    );
  }

  const deleteStoryHandler = `  const deleteCurrentStory = async () => {\n    if (!user || !current || current.userId !== user.id || deletingStory) return;\n    if (!window.confirm(\"Supprimer définitivement cette story ?\")) return;\n    setDeletingStory(true);\n    try {\n      const { error } = await supabase\n        .from(\"stories\")\n        .delete()\n        .eq(\"id\", current.id)\n        .eq(\"user_id\", user.id);\n      if (error) throw error;\n      await qc.invalidateQueries({ queryKey: [\"stories\"] });\n      toast.success(\"Story supprimée\");\n      onClose();\n    } catch (error: any) {\n      toast.error(error?.message ?? \"Impossible de supprimer cette story.\");\n    } finally {\n      setDeletingStory(false);\n    }\n  };\n\n`;
  if (!source.includes("const deleteCurrentStory")) {
    source = replaceRequired(source, "  return (\n    <div", `${deleteStoryHandler}  return (\n    <div`, "story delete handler");
  }

  const closeButton = `        <button\n          type=\"button\"\n          onClick={(event) => {\n            event.stopPropagation();\n            onClose();\n          }}\n          aria-label=\"Fermer\"\n          className={\`\${isVideo ? \"\" : \"ml-auto\"} grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur\`}\n        >\n          <X className=\"h-5 w-5\" />\n        </button>`;
  const deleteAndClose = `        {ownStory && (\n          <button\n            type=\"button\"\n            disabled={deletingStory}\n            onClick={(event) => {\n              event.stopPropagation();\n              void deleteCurrentStory();\n            }}\n            aria-label=\"Supprimer la story\"\n            title=\"Supprimer la story\"\n            className={\`\${isVideo ? \"\" : \"ml-auto\"} grid h-9 w-9 place-items-center rounded-full bg-red-500/25 text-white backdrop-blur transition hover:bg-red-500/45 disabled:opacity-50\`}\n          >\n            <Trash2 className=\"h-5 w-5\" />\n          </button>\n        )}\n        <button\n          type=\"button\"\n          onClick={(event) => {\n            event.stopPropagation();\n            onClose();\n          }}\n          aria-label=\"Fermer\"\n          className={\`\${isVideo || ownStory ? \"\" : \"ml-auto\"} grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur\`}\n        >\n          <X className=\"h-5 w-5\" />\n        </button>`;
  source = replaceRequired(source, closeButton, deleteAndClose, "story delete button");

  return source;
});

patchFile("src/routes/_authenticated.messages.$id.tsx", (input) => {
  let source = input;

  if (!source.includes("  Trash2,")) {
    source = replaceRequired(source, "  Video,\n} from \"lucide-react\";", "  Video,\n  Trash2,\n} from \"lucide-react\";", "message trash icon");
  }

  const deleteMessageHandler = `  const deleteMessage = async (message: Msg) => {\n    if (!user || message.sender_id !== user.id) return;\n    if (!window.confirm(\"Supprimer ce message pour la conversation ?\")) return;\n    const { error } = await supabase\n      .from(\"messages\")\n      .delete()\n      .eq(\"id\", message.id)\n      .eq(\"sender_id\", user.id);\n    if (error) {\n      toast.error(error.message || \"Impossible de supprimer ce message.\");\n      return;\n    }\n    await Promise.all([\n      qc.invalidateQueries({ queryKey: [\"messages\", id] }),\n      qc.invalidateQueries({ queryKey: [\"conversations\", user.id] }),\n    ]);\n    toast.success(\"Message supprimé\");\n  };\n\n`;
  if (!source.includes("const deleteMessage = async")) {
    source = replaceRequired(source, "  const otherName = other?.profile?.display_name", `${deleteMessageHandler}  const otherName = other?.profile?.display_name`, "message delete handler");
  }

  const messageTime = `                    <span>\n                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: fr })}\n                    </span>`;
  const messageTimeWithDelete = `${messageTime}\n                    <button\n                      type=\"button\"\n                      onClick={() => void deleteMessage(m)}\n                      aria-label=\"Supprimer ce message\"\n                      title=\"Supprimer ce message\"\n                      className=\"ml-1 grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive\"\n                    >\n                      <Trash2 className=\"h-3 w-3\" />\n                    </button>`;
  source = replaceRequired(source, messageTime, messageTimeWithDelete, "message delete button");

  return source;
});

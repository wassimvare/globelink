import fs from "node:fs";

const path = "src/routes/_authenticated.messages.index.tsx";
const before = fs.readFileSync(path, "utf8");
let source = before;

const marker = "CONVERSATION_DELETION_V1";
if (source.includes(marker)) {
  console.log("[GlobeLink] Conversation deletion already applied.");
  process.exit(0);
}

function replaceRequired(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`[conversation-delete] Block not found: ${label}`);
  source = source.replace(needle, replacement);
}

replaceRequired(
  'import { Check, Circle, Inbox, MessageSquare, Search, UserRoundPlus, X } from "lucide-react";',
  'import { Check, Circle, Inbox, MessageSquare, Search, Trash2, UserRoundPlus, X } from "lucide-react";',
  "trash icon import",
);

replaceRequired(
  '  const [requestBusy, setRequestBusy] = useState<string | null>(null);',
  `  const [requestBusy, setRequestBusy] = useState<string | null>(null);\n  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);\n  // ${marker}`,
  "deleting state",
);

replaceRequired(
  '  return (\n    <div className="app-page">',
  `  async function deleteConversation(conversationId: string, name: string) {\n    if (!user || deletingConversationId) return;\n    const confirmed = window.confirm(\n      \`Supprimer la conversation avec \${name} ? Elle disparaîtra de ta messagerie, mais restera visible chez l’autre personne.\`,\n    );\n    if (!confirmed) return;\n\n    setDeletingConversationId(conversationId);\n    try {\n      const { error } = await supabase\n        .from("conversation_participants")\n        .delete()\n        .eq("conversation_id", conversationId)\n        .eq("user_id", user.id);\n      if (error) throw error;\n\n      await Promise.all([\n        qc.invalidateQueries({ queryKey: ["conversations", user.id] }),\n        qc.invalidateQueries({ queryKey: ["incoming-message-requests", user.id] }),\n      ]);\n      toast.success(\"Conversation supprimée de ta messagerie\");\n    } catch (error) {\n      toast.error((error as Error).message || \"Impossible de supprimer cette conversation.\");\n    } finally {\n      setDeletingConversationId(null);\n    }\n  }\n\n  return (\n    <div className="app-page">`,
  "delete conversation handler",
);

replaceRequired(
  '                <li key={r.conversation_id}>\n                  <Link\n                    to="/messages/$id"\n                    params={{ id: r.conversation_id }}\n                    className="flex items-center gap-3 p-4 transition hover:bg-secondary/50"',
  '                <li key={r.conversation_id} className="relative">\n                  <Link\n                    to="/messages/$id"\n                    params={{ id: r.conversation_id }}\n                    className="flex items-center gap-3 py-4 pl-4 pr-14 transition hover:bg-secondary/50"',
  "conversation row spacing",
);

replaceRequired(
  '                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}\n                  </Link>\n                </li>',
  `                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}\n                  </Link>\n                  <button\n                    type="button"\n                    disabled={deletingConversationId === r.conversation_id}\n                    onClick={() => void deleteConversation(r.conversation_id, name)}\n                    aria-label={\`Supprimer la conversation avec \${name}\`}\n                    title="Supprimer la conversation"\n                    className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"\n                  >\n                    <Trash2 className="h-4 w-4" />\n                  </button>\n                </li>`,
  "conversation delete button",
);

fs.writeFileSync(path, source);
console.log("[GlobeLink] Conversation deletion control applied.");

// Production deployment trigger for the inbox conversation deletion release.

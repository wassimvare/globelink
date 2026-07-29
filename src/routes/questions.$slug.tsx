import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CornerDownRight, Loader2, MapPin, MessageCircle, Send, Sparkles, ThumbsUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { COMMUNITY_QUESTIONS } from "@/lib/mock-home";

type QuestionRow = {
  id: string;
  slug: string;
  country: string;
  title: string;
  body: string | null;
  author_username: string;
  votes: number;
  created_at: string;
};

type AnswerRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export const Route = createFileRoute("/questions/$slug")({
  head: ({ params }) => {
    const fallback = COMMUNITY_QUESTIONS.find((question) => question.slug === params.slug);
    const title = fallback ? `${fallback.q} — GlobeLink` : "Question communauté — GlobeLink";
    const description = fallback
      ? `Réponses de voyageurs sur ${fallback.country} : ${fallback.q}`
      : "Consulte les réponses de la communauté GlobeLink et partage ton conseil de voyage.";
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 155) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 155) },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: QuestionPage,
});

function QuestionPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: question, isLoading, error } = useQuery({
    queryKey: ["community-question", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_questions")
        .select("id, slug, country, title, body, author_username, votes, created_at")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as QuestionRow;
    },
  });

  const { data: answers = [], isLoading: answersLoading } = useQuery({
    queryKey: ["community-answers", question?.id],
    enabled: !!question,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_answers")
        .select("id, author_id, content, created_at, profiles:author_id(username, display_name, avatar_url)")
        .eq("question_id", question!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AnswerRow[];
    },
  });

  const [draft, setDraft] = useState("");
  const submitAnswer = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi pour répondre");
      const content = draft.trim();
      if (!content || !question) return;
      const { error } = await supabase.from("community_answers").insert({
        question_id: question.id,
        author_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["community-answers", question?.id] });
      toast.success("Réponse publiée ✨");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" /> Chargement de la question…
        </main>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl">Question introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Cette discussion n'est plus disponible.</p>
          <Button asChild className="mt-6 rounded-full gradient-hero text-primary-foreground"><Link to="/">Retour au fil</Link></Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour au fil
        </Link>

        <article className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1"><MapPin className="h-3.5 w-3.5" /> {question.country}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1"><ThumbsUp className="h-3.5 w-3.5" /> {question.votes} votes</span>
          </div>
          <h1 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">{question.title}</h1>
          {question.body && <p className="mt-4 text-base leading-relaxed text-foreground/85">{question.body}</p>}
          <p className="mt-4 text-sm text-muted-foreground">
            Posée par <span className="font-medium text-foreground">@{question.author_username}</span> · {formatDistanceToNow(new Date(question.created_at), { addSuffix: true, locale: fr })}
          </p>
        </article>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 font-display text-2xl"><MessageCircle className="h-5 w-5 text-accent" /> Réponses</h2>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">{answers.length} visible{answers.length > 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-3">
            {answersLoading && <p className="text-sm text-muted-foreground">Chargement des réponses…</p>}
            {!answersLoading && answers.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucune réponse pour l'instant. Lance la discussion.
              </div>
            )}
            {answers.map((answer) => {
              const username = answer.profiles?.username ?? "voyageur";
              return (
                <div key={answer.id} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">
                      {answer.profiles?.avatar_url ? <img src={answer.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <Link to="/profile/$username" params={{ username }} className="font-semibold hover:text-accent">@{username}</Link>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(answer.created_at), { addSuffix: true, locale: fr })}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{answer.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-xl"><CornerDownRight className="h-5 w-5 text-accent" /> Ajouter une réponse</h2>
          {user ? (
            <form onSubmit={(event) => { event.preventDefault(); submitAnswer.mutate(); }} className="mt-4 space-y-3">
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Partage ton expérience, ton budget, ton itinéraire ou un conseil concret…" className="min-h-32 rounded-2xl bg-secondary/40" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Ta réponse sera visible par toute la communauté.</p>
                <Button type="submit" disabled={submitAnswer.isPending || draft.trim().length === 0} className="rounded-full gradient-hero text-primary-foreground">
                  {submitAnswer.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Répondre
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-accent" />
              <p className="text-sm text-muted-foreground">Connecte-toi pour répondre en un clic.</p>
              <Button asChild className="mt-4 rounded-full gradient-hero text-primary-foreground"><Link to="/auth">Se connecter</Link></Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
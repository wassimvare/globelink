import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

export type DocumentSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export function InfoDocumentPage({
  eyebrow,
  title,
  intro,
  sections,
  updated = "25 août 2026",
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: DocumentSection[];
  updated?: string;
}) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <Link
          to="/settings/help"
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Aide et support
        </Link>

        <article className="overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-soft">
          <header className="border-b border-border/60 p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{intro}</p>
            <p className="mt-4 text-xs text-muted-foreground">Dernière mise à jour : {updated}</p>
          </header>

          <div className="space-y-8 p-5 sm:p-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-xl font-semibold sm:text-2xl">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul className="space-y-2 pl-1">
                      {section.bullets.map((item) => (
                        <li key={item} className="flex gap-2">
                          <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}

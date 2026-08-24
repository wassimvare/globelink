CREATE TABLE public.community_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  country text NOT NULL,
  title text NOT NULL,
  body text,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_username text NOT NULL DEFAULT 'voyageur',
  votes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_questions TO authenticated;
GRANT ALL ON public.community_questions TO service_role;
ALTER TABLE public.community_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Community questions are readable by everyone"
  ON public.community_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY "Authenticated users can ask questions as themselves"
  ON public.community_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Question authors can edit their questions"
  ON public.community_questions
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Question authors can delete their questions"
  ON public.community_questions
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

CREATE TABLE public.community_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.community_questions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_answers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_answers TO authenticated;
GRANT ALL ON public.community_answers TO service_role;
ALTER TABLE public.community_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Community answers are readable by everyone"
  ON public.community_answers
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY "Authenticated users can answer as themselves"
  ON public.community_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Answer authors can edit their answers"
  ON public.community_answers
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Answer authors can delete their answers"
  ON public.community_answers
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

CREATE TRIGGER set_community_questions_updated_at
  BEFORE UPDATE ON public.community_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_community_answers_updated_at
  BEFORE UPDATE ON public.community_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.community_questions (id, slug, country, title, body, author_username, votes, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'japon-printemps-ou-automne', 'Japon', 'Vaut-il mieux visiter le Japon au printemps ou en automne ?', 'Je prépare un premier voyage au Japon et j’hésite entre les cerisiers en fleurs et les couleurs d’automne. Quels compromis faut-il connaître ?', 'marie.v', 128, now() - interval '5 days'),
  ('22222222-2222-4222-8222-222222222222', 'grece-iles-sans-se-ruiner', 'Grèce', 'Comment se déplacer entre les îles en Grèce sans se ruiner ?', 'Je cherche des astuces concrètes pour organiser un itinéraire Cyclades avec ferries, timing et budget raisonnable.', 'hugo_backpack', 89, now() - interval '4 days'),
  ('33333333-3333-4333-8333-333333333333', 'colombie-voyager-seule-2026', 'Colombie', 'Est-ce sûr de voyager seule en Colombie en 2026 ?', 'J’aimerais faire Medellín, Salento et la côte caraïbe. Quels quartiers, transports ou réflexes de sécurité recommandez-vous ?', 'camille.solo', 204, now() - interval '3 days'),
  ('44444444-4444-4444-8444-444444444444', 'safari-tanzanie-meilleure-periode', 'Tanzanie', 'Meilleure période pour un safari en Tanzanie ?', 'Je veux maximiser les chances de voir la migration et éviter les foules autant que possible. Serengeti ou Ngorongoro en priorité ?', 'paul.explore', 76, now() - interval '2 days')
ON CONFLICT (slug) DO UPDATE SET
  country = EXCLUDED.country,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  author_username = EXCLUDED.author_username,
  votes = EXCLUDED.votes;

INSERT INTO public.community_answers (question_id, author_id, content, created_at)
SELECT q.id, p.id, seed.content, now() - seed.age
FROM (VALUES
  ('japon-printemps-ou-automne', 'Le printemps est magique mais très demandé. Si tu veux un voyage plus fluide, novembre offre des temples magnifiques, moins de pluie et des prix souvent plus doux.', interval '4 days'),
  ('japon-printemps-ou-automne', 'Pour un premier voyage, je choisirais l’automne : Kyoto est sublime, les journées restent agréables et tu évites une partie de la foule sakura.', interval '3 days'),
  ('grece-iles-sans-se-ruiner', 'Regarde les ferries lents plutôt que les speedboats, groupe les îles par archipel et évite de changer d’île tous les deux jours.', interval '3 days'),
  ('grece-iles-sans-se-ruiner', 'Paros ou Naxos font de très bonnes bases. Tu peux rayonner sans multiplier les nuits et les trajets chers.', interval '2 days'),
  ('colombie-voyager-seule-2026', 'Oui avec des précautions : arrive de jour, utilise des apps de transport en ville, garde ton téléphone discret et demande conseil aux hébergements locaux.', interval '2 days'),
  ('safari-tanzanie-meilleure-periode', 'Juin à octobre est très fiable pour les animaux. Pour la migration, vise le nord du Serengeti entre juillet et septembre selon les traversées.', interval '1 day')
) AS seed(slug, content, age)
JOIN public.community_questions q ON q.slug = seed.slug
JOIN public.profiles p ON p.id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1)
ON CONFLICT DO NOTHING;
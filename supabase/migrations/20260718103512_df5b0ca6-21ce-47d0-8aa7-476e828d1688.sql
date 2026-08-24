
-- Travel intents: user's future travel plan, used for matching
CREATE TABLE public.travel_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination_country TEXT NOT NULL,
  destination_city TEXT,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  budget_eur INTEGER,
  travelers INTEGER NOT NULL DEFAULT 1,
  languages TEXT[] NOT NULL DEFAULT '{}',
  interests TEXT[] NOT NULL DEFAULT '{}',
  travel_style TEXT,
  bio TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_intents TO authenticated;
GRANT ALL ON public.travel_intents TO service_role;
ALTER TABLE public.travel_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own intents: full access" ON public.travel_intents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public intents: read" ON public.travel_intents
  FOR SELECT TO authenticated USING (visibility = 'public');
CREATE INDEX travel_intents_dest_dates_idx ON public.travel_intents (destination_country, starts_on, ends_on);
CREATE TRIGGER travel_intents_updated_at BEFORE UPDATE ON public.travel_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Groups formed from matches
CREATE TABLE public.match_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination_country TEXT,
  starts_on DATE,
  ends_on DATE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_groups TO authenticated;
GRANT ALL ON public.match_groups TO service_role;
ALTER TABLE public.match_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.match_group_members (
  group_id UUID NOT NULL REFERENCES public.match_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_group_members TO authenticated;
GRANT ALL ON public.match_group_members TO service_role;
ALTER TABLE public.match_group_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_match_group_member(_group uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.match_group_members WHERE group_id = _group AND user_id = _user)
$$;

CREATE POLICY "Members can read group" ON public.match_groups
  FOR SELECT TO authenticated USING (public.is_match_group_member(id, auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "Any authenticated can create group" ON public.match_groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update group" ON public.match_groups
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can delete group" ON public.match_groups
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Members can read member list" ON public.match_group_members
  FOR SELECT TO authenticated USING (public.is_match_group_member(group_id, auth.uid()));
CREATE POLICY "Users can join or be added" ON public.match_group_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.match_groups g WHERE g.id = group_id AND g.owner_id = auth.uid())
  );
CREATE POLICY "Users can leave" ON public.match_group_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

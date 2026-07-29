
CREATE TABLE public.trip_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  city TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  image_url TEXT,
  visited_on DATE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_entries TO authenticated;
GRANT ALL ON public.trip_entries TO service_role;
ALTER TABLE public.trip_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage trip entries" ON public.trip_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX trip_entries_trip_idx ON public.trip_entries(trip_id, position);

CREATE TABLE public.trip_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  category TEXT,
  spent_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_expenses TO authenticated;
GRANT ALL ON public.trip_expenses TO service_role;
ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage trip expenses" ON public.trip_expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX trip_expenses_trip_idx ON public.trip_expenses(trip_id);

CREATE TRIGGER trip_entries_updated_at BEFORE UPDATE ON public.trip_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

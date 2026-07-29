-- Enum for product types
DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('guide_pdf','itineraire','preset','ebook','accompagnement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.product_type NOT NULL,
  title text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  cover_url text,
  external_url text,
  tags text[] NOT NULL DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT true,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  favorites_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products: public read published"
  ON public.products FOR SELECT
  USING (is_published = true OR auth.uid() = seller_id);

CREATE POLICY "Products: seller insert own"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Products: seller update own"
  ON public.products FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Products: seller delete own"
  ON public.products FOR DELETE TO authenticated
  USING (auth.uid() = seller_id);

CREATE INDEX products_seller_idx ON public.products(seller_id);
CREATE INDEX products_type_idx ON public.products(type);
CREATE INDEX products_created_idx ON public.products(created_at DESC);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- REVIEWS
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT SELECT ON public.product_reviews TO anon;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews: public read"
  ON public.product_reviews FOR SELECT USING (true);

CREATE POLICY "Reviews: owner insert"
  ON public.product_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Reviews: owner update"
  ON public.product_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Reviews: owner delete"
  ON public.product_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX product_reviews_product_idx ON public.product_reviews(product_id);

CREATE TRIGGER product_reviews_set_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Aggregate rating trigger
CREATE OR REPLACE FUNCTION public.refresh_product_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products
  SET rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.product_reviews WHERE product_id = pid), 0),
      rating_count = (SELECT COUNT(*) FROM public.product_reviews WHERE product_id = pid)
  WHERE id = pid;
  RETURN NULL;
END; $$;

CREATE TRIGGER product_reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_rating();

-- Notify seller on new review
CREATE OR REPLACE FUNCTION public.notify_on_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seller uuid; ptitle text;
BEGIN
  SELECT seller_id, title INTO seller, ptitle FROM public.products WHERE id = NEW.product_id;
  IF seller IS NOT NULL AND seller <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, metadata)
    VALUES (seller, NEW.user_id, 'review',
            jsonb_build_object('product_id', NEW.product_id, 'rating', NEW.rating, 'title', ptitle));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER product_reviews_notify
  AFTER INSERT ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_review();

-- FAVORITES
CREATE TABLE public.product_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.product_favorites TO authenticated;
GRANT ALL ON public.product_favorites TO service_role;

ALTER TABLE public.product_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Favorites: read own or aggregate"
  ON public.product_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Favorites: insert own"
  ON public.product_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Favorites: delete own"
  ON public.product_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX product_favorites_user_idx ON public.product_favorites(user_id);
CREATE INDEX product_favorites_product_idx ON public.product_favorites(product_id);

CREATE OR REPLACE FUNCTION public.refresh_product_favorites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products
  SET favorites_count = (SELECT COUNT(*) FROM public.product_favorites WHERE product_id = pid)
  WHERE id = pid;
  RETURN NULL;
END; $$;

CREATE TRIGGER product_favorites_refresh
  AFTER INSERT OR DELETE ON public.product_favorites
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_favorites();
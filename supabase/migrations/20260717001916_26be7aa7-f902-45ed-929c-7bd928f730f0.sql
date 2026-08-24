ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_meta jsonb;

-- allow empty content when attachment present
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
-- Create updates table for storing daily business updates
CREATE TABLE public.updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  time TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read updates (Team members need to read for AI context)
CREATE POLICY "Anyone can read updates"
  ON public.updates
  FOR SELECT
  USING (true);

-- Only admins can insert/update/delete updates
-- For now, we'll allow authenticated users to insert (will add proper role checks later)
CREATE POLICY "Authenticated users can insert updates"
  ON public.updates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update updates"
  ON public.updates
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete updates"
  ON public.updates
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index for faster date queries
CREATE INDEX idx_updates_date ON public.updates(date DESC);
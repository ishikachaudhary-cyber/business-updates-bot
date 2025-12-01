-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can read updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can insert updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can update updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can delete updates" ON public.updates;

-- Create policies that allow public access
CREATE POLICY "Anyone can read updates"
ON public.updates
FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert updates"
ON public.updates
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can update updates"
ON public.updates
FOR UPDATE
TO public
USING (true);

CREATE POLICY "Anyone can delete updates"
ON public.updates
FOR DELETE
TO public
USING (true);
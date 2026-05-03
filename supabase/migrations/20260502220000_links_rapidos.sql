CREATE TABLE IF NOT EXISTS public.links_rapidos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  produtos_texto text NOT NULL,
  nome_lead text DEFAULT '',
  criado_em timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.links_rapidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert links_rapidos"
ON public.links_rapidos FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can select links_rapidos"
ON public.links_rapidos FOR SELECT USING (true);

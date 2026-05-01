CREATE TABLE public.orcamentos_salvos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  cliente text NOT NULL,
  consultor text NOT NULL,
  payload jsonb NOT NULL,
  criado_em timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.orcamentos_salvos ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Public can insert orcamentos" 
ON public.orcamentos_salvos FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can select orcamentos" 
ON public.orcamentos_salvos FOR SELECT 
USING (true);

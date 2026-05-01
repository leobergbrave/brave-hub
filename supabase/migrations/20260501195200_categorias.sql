CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subcategorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL
);

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorias read access" ON public.categorias FOR SELECT USING (true);
CREATE POLICY "Categorias all access" ON public.categorias FOR ALL USING (true);

CREATE POLICY "Subcategorias read access" ON public.subcategorias FOR SELECT USING (true);
CREATE POLICY "Subcategorias all access" ON public.subcategorias FOR ALL USING (true);

-- Insert defaults
INSERT INTO public.categorias (nome) VALUES ('GYM'), ('CROSS');
INSERT INTO public.subcategorias (nome) VALUES ('CARDIO'), ('RIGS'), ('PISOS'), ('ACESSÓRIOS'), ('BARRAS'), ('ANILHAS'), ('KETTLEBELLS');

ALTER TABLE public.produtos RENAME COLUMN linha TO categoria;
ALTER TABLE public.produtos ADD COLUMN subcategoria TEXT;

ALTER TABLE public.regras_desconto RENAME COLUMN linha TO categoria;

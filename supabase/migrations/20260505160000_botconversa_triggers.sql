ALTER TABLE public.links_rapidos
ADD COLUMN IF NOT EXISTS telefone_lead text,
ADD COLUMN IF NOT EXISTS aberto boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS alerta_abandono_enviado boolean DEFAULT false;

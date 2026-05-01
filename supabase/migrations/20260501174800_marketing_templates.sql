CREATE TABLE public.marketing_templates (
  id text PRIMARY KEY,
  nome text NOT NULL,
  dias_delay integer NOT NULL,
  mensagem text NOT NULL,
  media_url text,
  ativo boolean DEFAULT true,
  atualizado_em timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Public can select marketing_templates" 
ON public.marketing_templates FOR SELECT 
USING (true);

CREATE POLICY "Public can update marketing_templates" 
ON public.marketing_templates FOR UPDATE 
USING (true);

CREATE POLICY "Public can insert marketing_templates" 
ON public.marketing_templates FOR INSERT 
WITH CHECK (true);

-- Inserir dados iniciais
INSERT INTO public.marketing_templates (id, nome, dias_delay, mensagem, ativo) VALUES
('dia_3', 'Dia 3: Micro-Contato (Valor)', 3, 'Fala {cliente}, conseguiu apresentar o projeto pro seu sócio? Separei um vídeo de um Box recém inaugurado com esses exatos equipamentos pra você dar uma olhada.', true),
('dia_7', 'Dia 7: O Elefante na Sala (Objeções)', 7, 'Fala, {cliente}. Normalmente quando pausamos a conversa nessa etapa, o projeto bateu na trave por um de dois motivos: ou você recebeu uma proposta de outra marca, ou o investimento ficou pesado para o caixa deste mês. Algum desses é o seu caso? Me diz a verdade pra eu tentar te ajudar com a diretoria.', true),
('dia_15', 'Dia 15: Escassez Logística (Frete)', 15, '{cliente}, tudo bem? Estou montando a carga de uma carreta que vai descer para o seu estado na semana que vem. Como o frete fracionado é o que mais pesa, se conseguirmos encaixar seus equipamentos nessa mesma carreta, eu consigo abater boa parte daquele frete do seu orçamento. Consegue definir isso até sexta?', true),
('dia_30', 'Dia 30: Downsell Faseado', 30, '{cliente}, entendo que o projeto completo talvez não seja o momento agora. Vários boxes parceiros adotaram a estratégia de faseamento. Vamos aprovar apenas as barras olímpicas, anilhas e rigs agora (o essencial pra abrir), e deixamos os ergonômetros pra daqui a 3 meses? O que acha de eu te mandar um link só com a Fase 1?', true)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.regras_frete;

INSERT INTO public.regras_frete (estado, zona, multiplicador, valor_minimo) VALUES
-- SUL / SUDESTE
('SP', 'CAPITAL', 1.2, 100),
('SP', 'INTERIOR 1', 1.4, 100),
('SP', 'INTERIOR 2', 1.6, 100),

('PR', 'CAPITAL', 1.2, 120),
('PR', 'INTERIOR 1', 1.4, 120),
('PR', 'INTERIOR 2', 1.8, 120),

('SC', 'CAPITAL', 1.3, 140),
('SC', 'INTERIOR 1', 1.6, 140),
('SC', 'INTERIOR 2', 1.8, 140),

('RS', 'CAPITAL', 1.5, 150),
('RS', 'INTERIOR 1', 2.0, 150),
('RS', 'INTERIOR 2', 2.2, 150),

('RJ', 'CAPITAL', 1.5, 150),
('RJ', 'INTERIOR 1', 2.0, 150),
('RJ', 'INTERIOR 2', 2.3, 150),

('MG', 'CAPITAL', 1.4, 150),
('MG', 'INTERIOR 1', 1.6, 150),
('MG', 'INTERIOR 2', 1.8, 150),

-- CENTRO OESTE
('GO/DF', 'CAPITAL', 1.4, 180),
('GO/DF', 'INTERIOR 1', 1.7, 180),
('GO/DF', 'INTERIOR 2', 2.0, 180),

('MS', 'CAPITAL', 1.5, 180),
('MS', 'INTERIOR 1', 2.0, 180),
('MS', 'INTERIOR 2', 2.5, 180),

('MT', 'CAPITAL', 1.6, 180),
('MT', 'INTERIOR 1', 2.0, 180),
('MT', 'INTERIOR 2', 2.5, 180),

-- NORTE / NORDESTE (Parte 1)
('BA', 'CAPITAL', 3.0, 280),
('BA', 'INTERIOR 1', 3.0, 280),
('BA', 'INTERIOR 2', 4.0, 280),

('PI', 'CAPITAL', 3.5, 380),
('PI', 'INTERIOR 1', 4.0, 380),
('PI', 'INTERIOR 2', 4.8, 380),

('PA', 'CAPITAL', 3.5, 380),
('PA', 'INTERIOR 1', 4.0, 380),
('PA', 'INTERIOR 2', 4.8, 380),

('MA', 'CAPITAL', 3.5, 400),
('MA', 'INTERIOR 1', 4.0, 400),
('MA', 'INTERIOR 2', 4.8, 400),

('TO', 'CAPITAL', 3.5, 400),
('TO', 'INTERIOR 1', 4.0, 400),
('TO', 'INTERIOR 2', 4.8, 400),

-- NORDESTE (Parte 2)
('PE', 'CAPITAL', 3.0, 380),
('PE', 'INTERIOR 1', 3.0, 380),
('PE', 'INTERIOR 2', 4.0, 380),

('PB (João Pessoa)', 'CAPITAL', 3.0, 380),
('PB (João Pessoa)', 'INTERIOR 1', 3.0, 380),
('PB (João Pessoa)', 'INTERIOR 2', 4.0, 380),

('SE', 'CAPITAL', 3.0, 380),
('SE', 'INTERIOR 1', 3.0, 380),
('SE', 'INTERIOR 2', 4.0, 380),

('AL', 'CAPITAL', 3.5, 380),
('AL', 'INTERIOR 1', 4.0, 380),
('AL', 'INTERIOR 2', 4.8, 380),

('PB (Restante do Estado)', 'CAPITAL', 3.5, 380),
('PB (Restante do Estado)', 'INTERIOR 1', 4.0, 380),
('PB (Restante do Estado)', 'INTERIOR 2', 4.8, 380),

('CE', 'CAPITAL', 3.5, 400),
('CE', 'INTERIOR 1', 4.0, 400),
('CE', 'INTERIOR 2', 4.8, 400),

('RN', 'CAPITAL', 3.5, 400),
('RN', 'INTERIOR 1', 4.0, 400),
('RN', 'INTERIOR 2', 4.8, 400),

-- AMAZONAS E AFINS
('RO', 'CAPITAL', 3.5, 400),
('RO', 'INTERIOR 1', 4.0, 400),
('RO', 'INTERIOR 2', 4.8, 400),

('AM', 'CAPITAL', 3.5, 400),
('AM', 'INTERIOR 1', 4.0, 400),
('AM', 'INTERIOR 2', 4.8, 400),

('AC', 'CAPITAL', 3.5, 400),
('AC', 'INTERIOR 1', 4.0, 400),
('AC', 'INTERIOR 2', 4.8, 400),

('RR', 'CAPITAL', 3.5, 400),
('RR', 'INTERIOR 1', 4.0, 400),
('RR', 'INTERIOR 2', 4.8, 400),

('AP', 'CAPITAL', 3.5, 400),
('AP', 'INTERIOR 1', 4.0, 400),
('AP', 'INTERIOR 2', 4.8, 400);

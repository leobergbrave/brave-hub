-- Nova tabela de frete por regiões (vigente a partir de 13/10/2026).
-- Atualiza valores in-place e ADICIONA Espírito Santo (ES), que não existia.
-- Mantém as chaves legadas GO/DF e PB (João Pessoa)/(Restante do Estado),
-- das quais depende o auto-preenchimento por CEP em src/App.jsx.
-- Regra de cálculo inalterada: frete = max(peso_kg * multiplicador, valor_minimo).

INSERT INTO public.regras_frete (estado, zona, multiplicador, valor_minimo) VALUES
-- NORDESTE
('AL', 'CAPITAL', 3.75, 420), ('AL', 'INTERIOR 1', 4.2, 420), ('AL', 'INTERIOR 2', 4.5, 420),
('BA', 'CAPITAL', 3.15, 315), ('BA', 'INTERIOR 1', 3.3, 315), ('BA', 'INTERIOR 2', 4.1, 315),
('CE', 'CAPITAL', 4.0, 400), ('CE', 'INTERIOR 1', 4.15, 400), ('CE', 'INTERIOR 2', 4.5, 400),
('MA', 'CAPITAL', 4.15, 415), ('MA', 'INTERIOR 1', 4.25, 415), ('MA', 'INTERIOR 2', 4.75, 415),
('PE', 'CAPITAL', 3.15, 345), ('PE', 'INTERIOR 1', 3.45, 345), ('PE', 'INTERIOR 2', 3.9, 345),
('PI', 'CAPITAL', 3.75, 410), ('PI', 'INTERIOR 1', 4.1, 410), ('PI', 'INTERIOR 2', 4.65, 410),
('RN', 'CAPITAL', 3.85, 400), ('RN', 'INTERIOR 1', 4.35, 400), ('RN', 'INTERIOR 2', 4.8, 400),
('SE', 'CAPITAL', 3.15, 345), ('SE', 'INTERIOR 1', 3.45, 345), ('SE', 'INTERIOR 2', 3.9, 345),
('PB (João Pessoa)', 'CAPITAL', 3.25, 400), ('PB (João Pessoa)', 'INTERIOR 1', 3.8, 400), ('PB (João Pessoa)', 'INTERIOR 2', 4.45, 400),
('PB (Restante do Estado)', 'CAPITAL', 3.25, 400), ('PB (Restante do Estado)', 'INTERIOR 1', 3.8, 400), ('PB (Restante do Estado)', 'INTERIOR 2', 4.45, 400),
-- NORTE
('AC', 'CAPITAL', 4.85, 530), ('AC', 'INTERIOR 1', 5.3, 530), ('AC', 'INTERIOR 2', 5.9, 530),
('AP', 'CAPITAL', 5.1, 560), ('AP', 'INTERIOR 1', 5.6, 560), ('AP', 'INTERIOR 2', 6.3, 560),
('AM', 'CAPITAL', 5.0, 550), ('AM', 'INTERIOR 1', 5.5, 550), ('AM', 'INTERIOR 2', 6.2, 550),
('PA', 'CAPITAL', 4.1, 450), ('PA', 'INTERIOR 1', 4.5, 450), ('PA', 'INTERIOR 2', 5.1, 450),
('RO', 'CAPITAL', 3.95, 430), ('RO', 'INTERIOR 1', 4.3, 430), ('RO', 'INTERIOR 2', 4.9, 430),
('RR', 'CAPITAL', 5.3, 580), ('RR', 'INTERIOR 1', 5.8, 580), ('RR', 'INTERIOR 2', 6.5, 580),
('TO', 'CAPITAL', 3.7, 420), ('TO', 'INTERIOR 1', 3.9, 420), ('TO', 'INTERIOR 2', 4.2, 420),
-- CENTRO OESTE
('GO/DF', 'CAPITAL', 2.15, 250), ('GO/DF', 'INTERIOR 1', 2.35, 250), ('GO/DF', 'INTERIOR 2', 2.7, 250),
('MT', 'CAPITAL', 2.8, 350), ('MT', 'INTERIOR 1', 3.1, 350), ('MT', 'INTERIOR 2', 3.6, 350),
('MS', 'CAPITAL', 2.25, 300), ('MS', 'INTERIOR 1', 2.45, 300), ('MS', 'INTERIOR 2', 2.85, 300),
-- SUDESTE
('ES', 'CAPITAL', 1.85, 250), ('ES', 'INTERIOR 1', 2.0, 250), ('ES', 'INTERIOR 2', 2.4, 250),
('MG', 'CAPITAL', 1.6, 250), ('MG', 'INTERIOR 1', 1.8, 250), ('MG', 'INTERIOR 2', 2.15, 250),
('RJ', 'CAPITAL', 1.75, 250), ('RJ', 'INTERIOR 1', 1.9, 250), ('RJ', 'INTERIOR 2', 2.2, 250),
('SP', 'CAPITAL', 1.3, 230), ('SP', 'INTERIOR 1', 1.2, 230), ('SP', 'INTERIOR 2', 1.45, 230),
-- SUL
('PR', 'CAPITAL', 1.35, 250), ('PR', 'INTERIOR 1', 1.55, 250), ('PR', 'INTERIOR 2', 2.1, 250),
('RS', 'CAPITAL', 2.1, 250), ('RS', 'INTERIOR 1', 2.3, 250), ('RS', 'INTERIOR 2', 2.65, 250),
('SC', 'CAPITAL', 1.85, 250), ('SC', 'INTERIOR 1', 2.0, 250), ('SC', 'INTERIOR 2', 2.35, 250)
ON CONFLICT (estado, zona) DO UPDATE
  SET multiplicador = EXCLUDED.multiplicador,
      valor_minimo  = EXCLUDED.valor_minimo;

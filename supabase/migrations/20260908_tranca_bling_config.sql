-- Tranca a tabela de credenciais do Bling.
--
-- Problema encontrado em 08/09/2026: `bling_config` era legível com a chave
-- ANON — e a chave anon é pública por natureza (aparece 4x no bundle JS de
-- brave-hub-two.vercel.app). Qualquer visitante do site podia ler
-- client_secret, access_token, refresh_token e até os cookies de sessão do
-- Bling, ou seja, acesso completo ao ERP: pedidos, clientes, financeiro.
--
-- Por que é seguro trancar: nenhuma tela do frontend lê essa tabela. Quem usa
-- são as funções de servidor (api/*), que se conectam com a SERVICE ROLE — e a
-- service role ignora RLS. Verificado com grep em src/ antes de aplicar.
--
-- IMPORTANTE: trancar não desfaz a exposição. Os segredos ficaram públicos e
-- precisam ser ROTACIONADOS no Bling (novo client_secret e reconexão OAuth).

alter table public.bling_config enable row level security;

-- RLS ligado sem nenhuma policy = ninguém passa, exceto a service role.
revoke all on public.bling_config from anon, authenticated;

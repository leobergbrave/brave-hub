import { supabase } from './supabase';

/* Helpers de navegação para o Bling (web).
   A diretoria exige que o cliente receba o PDF oficial gerado pelo Bling —
   este link abre a proposta direto na tela do Bling para Imprimir → PDF. */
export function urlPropostaBling(propostaId) {
  return `https://www.bling.com.br/orcamentos.php#edit/${propostaId}`;
}

/* Grava no orçamento os ids/números das duas propostas (à vista + a prazo)
   devolvidos pela edge fn sync-bling-proposal. É esse vínculo que liga o PDF
   oficial capturado na impressão do Bling de volta ao orçamento — sem ele os
   botões de PDF não aparecem. Chamar após TODA invocação da edge fn. */
export async function salvarVinculoPropostas(slug, data) {
  const av = data?.dataAvista?.data;
  const pz = data?.dataPrazo?.data;
  if (!av?.id && !pz?.id) return;
  const { error } = await supabase.from('orcamentos_salvos').update({
    ...(av?.id ? { bling_avista_id: av.id, bling_avista_numero: av.numero ?? null } : {}),
    ...(pz?.id ? { bling_prazo_id: pz.id, bling_prazo_numero: pz.numero ?? null } : {}),
    /* Data em que as PROPOSTAS nasceram — é o que o robô usa para decidir o que
       capturar. Um orçamento antigo regerado hoje tem propostas novas, e usar
       criado_em deixava esse caso invisível para ele (visto em produção). */
    propostas_em: new Date().toISOString(),
  }).eq('slug', slug);
  if (error) console.error('Falha ao gravar vínculo Bling no orçamento:', error);
}

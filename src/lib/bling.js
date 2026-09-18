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
  /* Devolve o resultado em vez de sair calado. O silêncio aqui foi o que
     escondeu a falha do Bruno Couto em 18/09: as propostas existiam no Bling,
     o vínculo não era gravado e a tela mostrava sucesso assim mesmo. */
  if (!av?.id && !pz?.id) {
    console.error('Bling respondeu sem IDs de proposta — vínculo não gravado:', data);
    return { ok: false, motivo: 'o Bling respondeu sem o número da proposta' };
  }
  const { error } = await supabase.from('orcamentos_salvos').update({
    /* Editar o orçamento cria propostas NOVAS no Bling. Os PDFs guardados são
       da proposta anterior, com os valores antigos — precisam ser descartados,
       senão o robô veria "já tem PDF", não recapturaria, e o cliente receberia
       o documento errado. Zerar aqui obriga a recaptura. */
    ...(av?.id ? { bling_avista_id: av.id, bling_avista_numero: av.numero ?? null, bling_avista_pdf: null } : {}),
    ...(pz?.id ? { bling_prazo_id: pz.id, bling_prazo_numero: pz.numero ?? null, bling_prazo_pdf: null } : {}),
    /* Data em que as PROPOSTAS nasceram — é o que o robô usa para decidir o que
       capturar. Um orçamento antigo regerado hoje tem propostas novas, e usar
       criado_em deixava esse caso invisível para ele (visto em produção). */
    propostas_em: new Date().toISOString(),
  }).eq('slug', slug);
  if (error) {
    console.error('Falha ao gravar vínculo Bling no orçamento:', error);
    return { ok: false, motivo: `erro ao gravar no banco: ${error.message}` };
  }
  return { ok: true, avista: av?.numero ?? null, prazo: pz?.numero ?? null };
}

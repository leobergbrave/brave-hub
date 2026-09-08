// api/_pacote-escolha.js — registra em qual pacote o cliente clicou e avisa o Léo.
//
// Por que existe: hoje o HUB não tem NENHUM sinal de compra entre "mandei o
// orçamento" e "fechou". A análise de 08/09/2026 mostrou 713 orçamentos abertos
// somando R$ 27,6 milhões, sem nada que diga quais estão vivos. O clique num
// pacote é o primeiro sinal real — e vale pouco se chegar amanhã: responder em
// 5 minutos em vez de 30 muda a chance de qualificar em 21x (MIT/InsideSales).
//
// O Bling NÃO é tocado aqui. Decisão do Léo em 08/09/2026: o alerta chega, ele
// decide. Mexer no ERP sozinho é o tipo de automação que ninguém consegue
// desfazer depois.
//
// POST /api/bling?acao=pacote_escolhido  { slug, nivel }
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const NOME_NIVEL = { 1: 'Essencial', 2: 'Recomendado', 3: 'Completo' };
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function avisarLeo(texto) {
  const url = process.env.BOTCONVERSA_WEBHOOK
    || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/BKf6LUAsGAKO/';
  const telefone = process.env.ALERTA_TELEFONE || '5548996459791';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, mensagem: texto }),
    });
    return true;
  } catch (e) {
    // O alerta é um extra: se o webhook cair, a escolha já foi gravada e não
    // pode ser perdida por causa disso.
    console.error('[pacote-escolha] webhook falhou:', e.message);
    return false;
  }
}

export async function registrarEscolhaPacote(req, res) {
  try {
    const slug = String(req.body?.slug || '').trim();
    const nivel = Number(req.body?.nivel);
    if (!slug || ![1, 2, 3].includes(nivel)) {
      return res.status(400).json({ ok: false, error: 'Informe slug e nivel (1, 2 ou 3).' });
    }

    const { data: orc } = await supabaseAdmin
      .from('orcamentos_salvos').select('id, cliente, payload').eq('slug', slug).maybeSingle();
    if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado.' });

    const anterior = Number(orc.payload?.nivelEscolhido) || null;
    const payload = {
      ...orc.payload,
      nivelEscolhido: nivel,
      /* Histórico, e não só o último valor: cliente que sobe de Essencial para
         Completo e cliente que desce de Completo para Essencial são conversas
         completamente diferentes, e guardar só o estado final apaga essa
         diferença justo quando ela importa. */
      escolhasPacote: [
        ...(Array.isArray(orc.payload?.escolhasPacote) ? orc.payload.escolhasPacote : []),
        { nivel, em: new Date().toISOString() },
      ].slice(-20),
    };

    const { error } = await supabaseAdmin
      .from('orcamentos_salvos').update({ payload }).eq('id', orc.id);
    if (error) throw new Error(error.message);

    /* Só avisa quando a escolha MUDA. Sem isso um cliente comparando os três
       cartões dispararia um alerta por clique, e alerta que vira ruído deixa de
       ser lido — que é o oposto do objetivo. */
    let avisado = false;
    if (anterior !== nivel) {
      const itens = (payload.itens || []).filter((i) => (Number(i?.nivel) || 1) <= nivel);
      const total = itens.reduce(
        (s, i) => s + (Number(i.preco_avista ?? i.preco) || 0) * (Number(i.quantidade) || 1), 0
      );
      avisado = await avisarLeo(
        `🎯 ${orc.cliente} escolheu o pacote ${NOME_NIVEL[nivel]}`
        + ` — ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}, ~${brl(total)}.`
        + (anterior ? ` (antes: ${NOME_NIVEL[anterior]})` : '')
        + `\nhttps://brave-hub-two.vercel.app/proposta/${slug}`
      );
    }

    return res.status(200).json({ ok: true, nivel, avisado });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

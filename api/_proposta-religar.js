// api/_proposta-religar.js — religa um orçamento às propostas que já existem no Bling.
//
// Por que existe (18/09/2026): o orçamento do Bruno Couto criou as DUAS
// propostas no Bling (9219 à vista e 9220 a prazo), mas os IDs nunca voltaram
// para o HUB — a resposta da edge function se perdeu depois da criação. Sem os
// IDs o robô não captura os PDFs, e sem PDF o painel não acha o contato e o
// WhatsApp não tem o que enviar. Os dois sintomas nascem da mesma lacuna.
//
// Regerar o orçamento resolveria no HUB e criaria documento DUPLICADO no Bling,
// que não pode ser apagado. Por isso: religar, nunca recriar.
//
// Somente leitura no Bling. A única escrita é no orçamento local.
//
// GET /api/bling?acao=religar_proposta&slug=...&avista=9219&prazo=9220
//     → mostra o que faria (conferência)
// ...&aplicar=1
//     → grava
import { createClient } from '@supabase/supabase-js';

const BLING_API = 'https://api.bling.com.br/v3';
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getValidToken() {
  const { data: cfg } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (!cfg) return null;
  const teste = await fetch(`${BLING_API}/contatos?limite=1`, {
    headers: { Authorization: `Bearer ${cfg.access_token}`, Accept: '1.0' },
  });
  if (teste.status !== 401) return cfg.access_token;
  const cred = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token }),
  });
  if (!r.ok) return null;
  const t = await r.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: t.access_token, refresh_token: t.refresh_token, updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return t.access_token;
}

/* O Bling nao filtra propostas-comerciais por numero (testado em _bling-modelos):
   e preciso paginar a lista, que vem em ordem decrescente, ate achar os alvos ou
   passar do menor numero pedido. */
async function acharPorNumero(numeros, token) {
  const alvos = numeros.filter(Boolean);
  const menorAlvo = Math.min(...alvos);
  const achadas = new Map();
  for (let pagina = 1; pagina <= 40; pagina++) {
    const r = await fetch(`${BLING_API}/propostas-comerciais?limite=100&pagina=${pagina}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
    });
    if (!r.ok) break;
    const lista = (await r.json())?.data || [];
    if (!lista.length) break;
    let menorDaPagina = Infinity;
    for (const p of lista) {
      const n = Number(p.numero);
      if (n < menorDaPagina) menorDaPagina = n;
      if (alvos.includes(n) && !achadas.has(n)) achadas.set(n, p);
    }
    if (achadas.size >= alvos.length) break;
    if (menorDaPagina < menorAlvo) break;   // ja passamos do alvo: nao existe
    await sleep(360);
  }
  return achadas;
}

export async function religarProposta(req, res) {
  try {
    const slug = String(req.query?.slug || '').trim();
    const nAvista = Number(req.query?.avista) || null;
    const nPrazo = Number(req.query?.prazo) || null;
    const aplicar = String(req.query?.aplicar || '') === '1';
    if (!slug || (!nAvista && !nPrazo)) {
      return res.status(400).json({ ok: false, error: 'Informe slug e ao menos um número (avista/prazo).' });
    }

    const { data: orc } = await supabaseAdmin.from('orcamentos_salvos')
      .select('id, slug, cliente, criado_em, payload, bling_avista_id, bling_prazo_id')
      .eq('slug', slug).maybeSingle();
    if (!orc) return res.status(404).json({ ok: false, error: `Orçamento "${slug}" não encontrado.` });

    /* Nunca sobrescrever um vinculo existente: se ja ha IDs, religar apontaria o
       orcamento para outro documento do Bling e o cliente receberia o PDF
       errado. Quem ja tem vinculo nao e caso de religacao. */
    if (orc.bling_avista_id || orc.bling_prazo_id) {
      return res.status(409).json({
        ok: false,
        error: 'Este orçamento já está vinculado a propostas do Bling.',
        atual: { avista: orc.bling_avista_id, prazo: orc.bling_prazo_id },
      });
    }

    const token = await getValidToken();
    if (!token) return res.status(500).json({ ok: false, error: 'Sem token do Bling.' });

    const achadas = await acharPorNumero([nAvista, nPrazo], token);
    const faltando = [nAvista, nPrazo].filter((n) => n && !achadas.has(n));
    if (faltando.length) {
      return res.status(404).json({ ok: false, error: `Não achei no Bling: ${faltando.join(', ')}.` });
    }

    const resumo = (n) => {
      const p = achadas.get(n);
      if (!p) return null;
      return {
        numero: p.numero, id: p.id, data: p.data,
        total: p.total ?? p.totalProposta ?? null,
        contato: p.contato?.nome ?? null,
        situacao: p.situacao?.valor ?? p.situacao ?? null,
      };
    };
    const avista = resumo(nAvista);
    const prazo = resumo(nPrazo);

    /* Conferencia antes de gravar: a proposta a vista TEM que custar menos que a
       a prazo (o desconto e a unica diferenca entre as duas). Numero trocado e o
       erro mais facil de cometer aqui, e mandaria ao cliente o PDF caro como se
       fosse o a vista. */
    const alertas = [];
    if (avista && prazo && Number(avista.total) > Number(prazo.total)) {
      alertas.push('A proposta indicada como À VISTA custa MAIS que a a prazo — os números podem estar trocados.');
    }
    for (const p of [avista, prazo]) {
      if (p?.contato && orc.cliente && !p.contato.toLowerCase().includes(orc.cliente.toLowerCase().split(/\s+/)[0])) {
        alertas.push(`A proposta ${p.numero} é do contato "${p.contato}", e o orçamento é de "${orc.cliente}".`);
      }
    }

    if (!aplicar) {
      return res.status(200).json({
        ok: true, aplicado: false,
        orcamento: { slug: orc.slug, cliente: orc.cliente, criado_em: orc.criado_em },
        avista, prazo, alertas,
        comoAplicar: 'repita a chamada com &aplicar=1',
      });
    }
    if (alertas.length) {
      return res.status(409).json({ ok: false, error: 'Conferência falhou — corrija os números.', alertas, avista, prazo });
    }

    const mudanca = {
      ...(avista ? { bling_avista_id: avista.id, bling_avista_numero: avista.numero } : {}),
      ...(prazo ? { bling_prazo_id: prazo.id, bling_prazo_numero: prazo.numero } : {}),
      /* E `propostas_em` que o robo usa para decidir o que capturar. Sem isto o
         vinculo existe e os PDFs nunca vem. */
      propostas_em: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from('orcamentos_salvos').update(mudanca).eq('id', orc.id);
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, aplicado: true, slug: orc.slug, mudanca });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

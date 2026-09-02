// api/_followup-auto.js — follow-up de leads no piloto automatico.
// Pega carona no tique do agendador externo (via disparo-sender, a cada
// minuto) e envia NO MAXIMO um follow-up por tique, respeitando:
//   · limite diario (MAX_POR_DIA)
//   · intervalo aleatorio entre envios (GAP_MIN–GAP_MAX, mais humano)
//   · janela de horario comercial em dias uteis
// A fila e IDENTICA a da tela Follow Up LEADS (mesmos filtros de vendido,
// adiado, duplicado e ja-enviado), entao o que o piloto manda e exatamente o
// que o Leo mandaria clicando. Antes de cada envio roda o sync de vendas
// (throttle proprio de 10 min) para nunca cobrar quem ja comprou.
// Desligar: desativar os templates na tela Follow Up LEADS.
import { createClient } from '@supabase/supabase-js';
import { enviarMensagemCore } from './_proposta-pdf.js';
import { executarSyncVendas } from './_bling-vendas.js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const MAX_POR_DIA = 12;
const GAP_MIN_MIN = 30;
const GAP_MAX_MIN = 50;
const HORA_INICIO = 9;   // BRT
const HORA_FIM = 18;     // BRT (exclusivo)
const DIAS_UTEIS = [1, 2, 3, 4, 5]; // seg-sex

const BUCKET = 'propostas-pdf';
const ESTADO = 'estado/followup-auto.json';

const brt = () => new Date(Date.now() - 3 * 3600 * 1000);
const hojeBRT = () => brt().toISOString().slice(0, 10);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*\(copia\)\s*$/, '').replace(/\s+/g, ' ').trim();

function dentroDaJanela() {
  const d = brt();
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const h = d.getUTCHours();
  return DIAS_UTEIS.includes(dow) && h >= HORA_INICIO && h < HORA_FIM;
}

async function lerEstado() {
  try {
    const dl = await supabaseAdmin.storage.from(BUCKET).download(ESTADO);
    if (!dl.error) return JSON.parse(await dl.data.text());
  } catch (_) { /* primeira execucao */ }
  return {};
}

const salvarEstado = (st) => supabaseAdmin.storage.from(BUCKET)
  .upload(ESTADO, Buffer.from(JSON.stringify(st)), { upsert: true, contentType: 'application/json' });

/* Mesma elegibilidade da tela Follow Up LEADS (MarketingTab.load). Qualquer
   mudanca de regra deve valer nos dois lugares. */
async function montarFila() {
  const { data: tData } = await supabaseAdmin.from('marketing_templates').select('*');
  const ativos = (tData || []).filter((t) => t.ativo).sort((a, b) => b.dias_delay - a.dias_delay);
  if (!ativos.length) return [];

  const { data: orcs } = await supabaseAdmin.from('orcamentos_salvos')
    .select('id, slug, cliente, criado_em, payload, bling_pedido_id')
    .order('criado_em', { ascending: false })
    .limit(600);

  const compraramTel = new Set();
  const compraramNome = new Set();
  for (const o of (orcs || [])) {
    if (o.payload?.status === 'Aprovado' || o.bling_pedido_id) {
      const tel8 = String(o.payload?.telefoneCliente || '').replace(/\D/g, '').slice(-8);
      if (tel8.length === 8) compraramTel.add(tel8);
      const nome = norm(o.cliente);
      if (nome) compraramNome.add(nome);
    }
  }

  const agora = new Date();
  const fila = [];
  const vistos = new Set();
  for (const o of (orcs || [])) {
    if ((o.payload?.status || 'Pendente') !== 'Pendente') continue;
    if (!o.payload?.telefoneCliente) continue;
    const telNorm = o.payload.telefoneCliente.replace(/\D/g, '');
    if (compraramTel.has(telNorm.slice(-8)) || compraramNome.has(norm(o.cliente))) continue;
    if (o.payload?.follow_up_adiado_ate && new Date(o.payload.follow_up_adiado_ate) > agora) continue;
    if (vistos.has(telNorm)) continue;

    const dias = Math.floor(Math.abs(agora - new Date(o.criado_em)) / (24 * 3600 * 1000));
    const enviados = o.payload?.marketing_sent || [];
    for (const t of ativos) {
      if (dias >= t.dias_delay && !enviados.includes(t.id)) {
        fila.push({ orcamento: o, template: t });
        vistos.add(telNorm);
        break;
      }
    }
  }
  return fila;
}

export async function processarFollowups(req, res) {
  const secret = process.env.DISPARO_CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ ok: false, error: 'Não autorizado' });
  }
  try {
    if (!dentroDaJanela()) return res.status(200).json({ ok: true, pulado: 'fora da janela' });

    const st = await lerEstado();
    const hoje = hojeBRT();
    if (st.dia !== hoje) { st.dia = hoje; st.enviadosHoje = 0; }
    if ((st.enviadosHoje || 0) >= MAX_POR_DIA) {
      return res.status(200).json({ ok: true, pulado: 'limite diário', enviadosHoje: st.enviadosHoje });
    }
    if (st.proximoEm && Date.now() < st.proximoEm) {
      return res.status(200).json({ ok: true, pulado: 'aguardando intervalo', proximoEm: new Date(st.proximoEm).toISOString() });
    }

    // Nunca cobrar quem ja comprou: sync primeiro (tem trava propria de 10 min).
    await executarSyncVendas().catch(() => {});

    const fila = await montarFila();
    if (!fila.length) return res.status(200).json({ ok: true, pulado: 'fila vazia' });

    const { orcamento: o, template: t } = fila[0];
    const mensagem = String(t.mensagem || '').replace(/{cliente}/g, o.cliente);
    const r = await enviarMensagemCore({
      cliente: o.cliente,
      telefone: o.payload.telefoneCliente,
      mensagem,
      media_url: t.media_url || '',
    });

    if (r.ok) {
      const enviados = o.payload?.marketing_sent || [];
      const payload = { ...o.payload, marketing_sent: [...enviados, t.id],
        followup_auto: [...(o.payload?.followup_auto || []), { template: t.nome, em: new Date().toISOString() }] };
      await supabaseAdmin.from('orcamentos_salvos').update({ payload }).eq('id', o.id);
      st.enviadosHoje = (st.enviadosHoje || 0) + 1;
    }
    // Falhou? Tambem espera o intervalo: martelar o mesmo lead em loop e pior.
    const gapMs = (GAP_MIN_MIN + Math.random() * (GAP_MAX_MIN - GAP_MIN_MIN)) * 60 * 1000;
    st.proximoEm = Date.now() + Math.round(gapMs);
    st.ultimo = { cliente: o.cliente, template: t.nome, ok: r.ok, erro: r.error || null, em: new Date().toISOString() };
    await salvarEstado(st);

    console.log('[followup-auto]', st.ultimo, `hoje: ${st.enviadosHoje}/${MAX_POR_DIA}`);
    return res.status(200).json({ ok: true, enviado: r.ok, cliente: o.cliente, template: t.nome,
      erro: r.error || undefined, enviadosHoje: st.enviadosHoje, proximoEm: new Date(st.proximoEm).toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

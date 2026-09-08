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

/* Janela em que a data de inauguracao passa a mandar na ordem da fila. Alem de
   90 dias o cliente ainda nao esta decidindo; dentro dela, cada dia conta —
   negocio fechado em ate 50 dias ganha ~47% das vezes contra ~20% depois disso
   (Ebsta x Pavilion 2025, 655 mil oportunidades). */
const JANELA_PRAZO_DIAS = 90;

/* Dias ate a data marcada, ou null quando ela nao existe, ja passou ou esta
   longe demais para pressionar. Data no passado NAO penaliza: pode ser resposta
   velha, e rebaixar quem talvez tenha adiado a obra seria pior que ignorar. */
function diasAtePrazo(prazoData, agora) {
  if (!prazoData) return null;
  const alvo = Date.parse(`${prazoData}T00:00:00Z`);
  if (Number.isNaN(alvo)) return null;
  const dias = Math.round((alvo - agora) / 86400000);
  return dias >= 0 && dias <= JANELA_PRAZO_DIAS ? dias : null;
}

/* Datas de inauguracao por telefone. Casamos pelos 8 ultimos digitos, mesma
   regra que o resto do arquivo ja usa para reconhecer quem comprou — DDI e o
   nono digito entram e saem conforme a origem do cadastro. */
async function prazosPorTelefone() {
  const { data } = await supabaseAdmin.from('qualificacoes')
    .select('telefone, prazo_data')
    .not('prazo_data', 'is', null)
    .order('atualizado_em', { ascending: false });
  const mapa = new Map();
  for (const q of (data || [])) {
    const t8 = String(q.telefone || '').replace(/\D/g, '').slice(-8);
    // Vem ordenado do mais recente para o mais antigo: o primeiro que aparece
    // para um telefone e a resposta que vale.
    if (t8.length === 8 && !mapa.has(t8)) mapa.set(t8, q.prazo_data);
  }
  return mapa;
}

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

  const prazos = await prazosPorTelefone();
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
        const prazoData = prazos.get(telNorm.slice(-8)) || null;
        fila.push({
          orcamento: o, template: t, prazoData,
          diasAteData: diasAtePrazo(prazoData, agora.getTime()),
        });
        vistos.add(telNorm);
        break;
      }
    }
  }

  /* Quem tem data marcada chegando vai na frente, do mais proximo ao mais
     distante; o resto mantem a ordem de sempre (orcamento mais novo primeiro).
     A ORDEM e a unica coisa que muda: o atraso do template, o teto diario e o
     intervalo entre envios continuam valendo iguais para todo mundo. Furar
     essas travas por urgencia e exatamente o caminho do banimento no WhatsApp
     — o motivo pelo qual este motor existe com limite em primeiro lugar. */
  fila.sort((a, b) => {
    if (a.diasAteData === null && b.diasAteData === null) return 0;
    if (a.diasAteData === null) return 1;
    if (b.diasAteData === null) return -1;
    return a.diasAteData - b.diasAteData;
  });
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

    const { orcamento: o, template: t, diasAteData, prazoData } = fila[0];
    /* Sem isso o Leo ve "mandei para a Joyce" e nao sabe por que ela passou na
       frente — automacao que nao explica a propria escolha nao se corrige. */
    const motivo = diasAteData === null
      ? 'ordem normal'
      : `data marcada em ${diasAteData} dia${diasAteData === 1 ? '' : 's'} (${prazoData})`;
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
    st.ultimo = { cliente: o.cliente, template: t.nome, ok: r.ok, erro: r.error || null, motivo, em: new Date().toISOString() };
    await salvarEstado(st);

    console.log('[followup-auto]', st.ultimo, `hoje: ${st.enviadosHoje}/${MAX_POR_DIA}`);
    return res.status(200).json({ ok: true, enviado: r.ok, cliente: o.cliente, template: t.nome, motivo,
      erro: r.error || undefined, enviadosHoje: st.enviadosHoje, proximoEm: new Date(st.proximoEm).toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

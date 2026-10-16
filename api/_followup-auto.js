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

const MAX_POR_DIA = 15;
const GAP_MIN_MIN = 30;   // intervalo aleatório entre mensagens (não o tique do robô)
const GAP_MAX_MIN = 50;
/* Trava anti-duplicata: nunca dois follow-ups ao MESMO telefone em menos de
   COOLDOWN_DIAS. Junto com o dedup por telefone (não por orçamento), garante que
   o cliente recebe cada passo no máximo uma vez e nunca dois em sequência curta —
   mesmo que ele tenha vários orçamentos. */
const COOLDOWN_DIAS = 7;
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

/* Telefones (8 ultimos digitos) que ja responderam. Gravado pelo webhook
   api/disparo-resposta.js quando o cliente manda qualquer mensagem. Quem esta
   aqui tem a sequencia PAUSADA: cliente que respondeu vira atendimento manual do
   Leo, nao alvo de automacao. Mapa tel8 -> ISO da ultima resposta. */
const RESPOSTAS = 'estado/respostas-followup.json';
async function lerRespostas() {
  try {
    const dl = await supabaseAdmin.storage.from(BUCKET).download(RESPOSTAS);
    if (!dl.error) return JSON.parse(await dl.data.text());
  } catch (_) { /* ninguem respondeu ainda: arquivo nao existe */ }
  return {};
}

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
   mudanca de regra deve valer nos dois lugares.
   opts.somenteFSS: por padrao (false) a fila é do WhatsApp e EXCLUI leads FSS
   (o robo nunca cobra FSS por WhatsApp). Com true, inverte: traz SÓ os leads
   FSS — é a fila que alimenta o follow-up manual pelo próprio FSS. */
async function montarFila(opts = {}) {
  const { somenteFSS = false } = opts;
  const { data: tData } = await supabaseAdmin.from('marketing_templates').select('*');
  const ativos = (tData || []).filter((t) => t.ativo).sort((a, b) => b.dias_delay - a.dias_delay);
  if (!ativos.length) return [];

  const { data: orcs } = await supabaseAdmin.from('orcamentos_salvos')
    .select('id, slug, cliente, criado_em, payload, bling_pedido_id, origem_lead')
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

  /* Histórico por TELEFONE, somando TODAS as linhas do cliente. O "já enviei" era
     gravado por orçamento, então quem tinha 2+ orçamentos recebia a mesma
     sequência uma vez por orçamento (duplicata). Aqui juntamos: o que já foi
     enviado ao número (passos) e QUANDO foi o último envio (para o cooldown). */
  const enviadosPorTel = new Map();    // tel8 -> Set(ids de template já enviados)
  const ultimoEnvioPorTel = new Map(); // tel8 -> ms do follow-up mais recente
  for (const o of (orcs || [])) {
    const tel8 = String(o.payload?.telefoneCliente || '').replace(/\D/g, '').slice(-8);
    if (tel8.length !== 8) continue;
    if (!enviadosPorTel.has(tel8)) enviadosPorTel.set(tel8, new Set());
    const set = enviadosPorTel.get(tel8);
    for (const id of (o.payload?.marketing_sent || [])) set.add(id);
    for (const e of (o.payload?.followup_auto || [])) {
      const ms = Date.parse(e?.em || '');
      if (!Number.isNaN(ms)) ultimoEnvioPorTel.set(tel8, Math.max(ultimoEnvioPorTel.get(tel8) || 0, ms));
    }
  }
  const COOLDOWN_MS = COOLDOWN_DIAS * 24 * 3600 * 1000;

  const respostas = await lerRespostas(); // tel8 -> ISO; quem respondeu fica pausado

  const prazos = await prazosPorTelefone();
  const agora = new Date();
  const fila = [];
  const vistos = new Set();
  for (const o of (orcs || [])) {
    if ((o.payload?.status || 'Pendente') !== 'Pendente') continue;
    // Lead da central (FSS) NÃO recebe follow-up por WhatsApp: a proposta foi
    // só pelo chat do FSS, e cobrar no WhatsApp expõe o cliente (ele nunca falou
    // com a BRAVE por lá). O follow-up do FSS é feito à mão, pelo próprio FSS.
    // No modo somenteFSS a regra inverte: a fila é EXATAMENTE a dos leads FSS.
    const ehFSS = String(o.origem_lead || '').toUpperCase() === 'FSS';
    if (somenteFSS ? !ehFSS : ehFSS) continue;
    if (!o.payload?.telefoneCliente) continue;
    const telNorm = o.payload.telefoneCliente.replace(/\D/g, '');
    const tel8 = telNorm.slice(-8);
    if (compraramTel.has(tel8) || compraramNome.has(norm(o.cliente))) continue;
    if (respostas[tel8]) continue; // ja respondeu → sequencia pausada, Leo assume no manual
    if (o.payload?.follow_up_adiado_ate && new Date(o.payload.follow_up_adiado_ate) > agora) continue;
    if (vistos.has(telNorm)) continue;

    // Cooldown: nunca mandar dois follow-ups seguidos ao mesmo número.
    const ultimo = ultimoEnvioPorTel.get(tel8) || 0;
    if (ultimo && (agora.getTime() - ultimo) < COOLDOWN_MS) continue;

    const dias = Math.floor(Math.abs(agora - new Date(o.criado_em)) / (24 * 3600 * 1000));
    const enviados = enviadosPorTel.get(tel8) || new Set(); // por TELEFONE, não por orçamento
    for (const t of ativos) {
      if (dias >= t.dias_delay && !enviados.has(t.id)) {
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

/* Monta o bloco de instrução para a IA do FSS: ela envia a mensagem no lugar do
   Léo, mas precisa dos dados do cliente + o texto exato. Um lugar só para o
   formato — fácil de ajustar se a IA do FSS esperar outro jeito. */
function mensagemParaIaFss({ cliente, telefone, slug, mensagem }) {
  return [
    'Envie uma mensagem de follow-up para este cliente:',
    `• Cliente: ${cliente}`,
    `• WhatsApp: ${telefone}`,
    slug ? `• Proposta: ${slug}` : '',
    '',
    'Mensagem a enviar (envie exatamente este texto):',
    mensagem,
  ].filter((l) => l !== '').join('\n');
}

/* Fila de follow-up dos leads FSS (os que o WhatsApp não cobra). Mesma
   elegibilidade/cooldown/dedup do robô — só muda o canal (manual, pelo FSS).
   Devolve a mensagem já pronta e o bloco para a IA do FSS.
   GET /api/bling?acao=followup_fss */
export async function followupFssPendentes(req, res) {
  try {
    const fila = await montarFila({ somenteFSS: true });
    const itens = fila.map(({ orcamento: o, template: t, prazoData, diasAteData }) => {
      const cliente = o.cliente || '';
      const telefone = o.payload?.telefoneCliente || '';
      const mensagem = String(t.mensagem || '').replace(/{cliente}/g, cliente);
      const dias = Math.floor(Math.abs(Date.now() - new Date(o.criado_em)) / 86400000);
      return {
        id: o.id, slug: o.slug, cliente, telefone,
        passo: t.nome, templateId: t.id,
        dias, prazoData: prazoData || null, diasAteData,
        mensagem, media_url: t.media_url || '',
        mensagemIA: mensagemParaIaFss({ cliente, telefone, slug: o.slug, mensagem }),
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, total: itens.length, itens });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

/* Marca um passo do follow-up FSS como enviado (depois que o Léo mandou pelo
   FSS). Grava igual ao robô: marketing_sent tira o passo da fila, e um registro
   em followup_auto com a data faz o cooldown de 7 dias valer também no FSS.
   POST /api/bling?acao=followup_fss_marcar  body {id, templateId, passo?} */
export async function followupFssMarcar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const id = req.body?.id;
  const templateId = req.body?.templateId;
  if (!id || !templateId) return res.status(400).json({ ok: false, error: 'id e templateId obrigatórios.' });
  // templateId tem que ser um template real: impede gravar lixo em marketing_sent
  // e define o nome do registro (não confiamos num "passo" livre do cliente).
  const { data: tpl } = await supabaseAdmin.from('marketing_templates')
    .select('id, nome').eq('id', templateId).maybeSingle();
  if (!tpl) return res.status(400).json({ ok: false, error: 'templateId inexistente.' });
  const { data: o, error: eSel } = await supabaseAdmin.from('orcamentos_salvos')
    .select('id, payload').eq('id', id).single();
  if (eSel || !o) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado.' });
  const enviados = o.payload?.marketing_sent || [];
  if (!enviados.includes(templateId)) enviados.push(templateId);
  const payload = {
    ...o.payload,
    marketing_sent: enviados,
    followup_auto: [...(o.payload?.followup_auto || []),
      { template: tpl.nome, em: new Date().toISOString(), canal: 'FSS' }],
  };
  const { error } = await supabaseAdmin.from('orcamentos_salvos').update({ payload }).eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true });
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

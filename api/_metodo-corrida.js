/* api/_metodo-corrida.js — apresentação do método corridahibrida.com.br aos clientes
 * que o Léo atendeu, no piloto automático.
 *
 * Mesmo molde do follow-up (_followup-auto.js): pega carona no tique do agendador
 * (via disparo-sender) e envia NO MÁXIMO uma mensagem por tique, respeitando
 *   · janela de horário comercial em dias úteis
 *   · teto diário (MAX_POR_DIA)
 *   · intervalo aleatório entre envios (GAP_MIN–GAP_MAX)
 * O texto mora aqui (não na BotConversa) e vai pela API, então dá para ter variantes.
 * Quem respondeu (estado/respostas-followup.json, gravado pelo webhook de resposta) e
 * quem pediu para sair (contatos.optout) nunca recebe. Regras em _metodo-corrida-regras.js.
 *
 * LIGADO: nasce FALSE e só vira true num commit, depois da ordem explícita do Léo.
 * Parar de emergência sem deploy: variável METODO_CHRH_DESLIGADO=1 na Vercel. */
import { createClient } from '@supabase/supabase-js';
import { enviarMensagemCore, bcFetch, telefoneWhatsappBR } from './_proposta-pdf.js';
import { montarBase, selecionar, mensagem, primeiroNome } from './_metodo-corrida-regras.js';

export const LIGADO = false;

const MAX_POR_DIA = 8;
const GAP_MIN_MIN = 25;
const GAP_MAX_MIN = 55;
const HORA_INICIO = 9;    // BRT
const HORA_FIM = 18;      // BRT (exclusivo)
const DIAS_UTEIS = [1, 2, 3, 4, 5];
const MAX_FALHAS_SEGUIDAS = 3;   // para o dia inteiro: martelar um erro de janela da Meta é o caminho do bloqueio
const MAX_TENTATIVAS = 2;        // por telefone

const BUCKET = 'propostas-pdf';
const ESTADO = 'estado/metodo-corrida.json';
const RESPOSTAS = 'estado/respostas-followup.json';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const brt = () => new Date(Date.now() - 3 * 3600 * 1000);
const hojeBRT = () => brt().toISOString().slice(0, 10);

function dentroDaJanela() {
  const d = brt();
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const h = d.getUTCHours();
  return DIAS_UTEIS.includes(dow) && h >= HORA_INICIO && h < HORA_FIM;
}

async function lerJson(caminho, padrao) {
  try {
    const dl = await supabaseAdmin.storage.from(BUCKET).download(caminho);
    if (!dl.error) return JSON.parse(await dl.data.text());
  } catch (_) { /* arquivo ainda não existe */ }
  return padrao;
}
const salvarEstado = (st) => supabaseAdmin.storage.from(BUCKET)
  .upload(ESTADO, Buffer.from(JSON.stringify(st)), { upsert: true, contentType: 'application/json' });

/* O PostgREST devolve no máximo 1000 linhas por pedido, mesmo com .limit(3000):
   os orçamentos já são 987 e passariam do corte em silêncio. Aqui se pagina por
   faixa, com ordem fixa, até acabar. */
async function lerTudo(consulta, passo = 1000) {
  const out = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await consulta().range(de, de + passo - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < passo) return out;
  }
}

async function carregarContexto() {
  const [orc, cli, cont, respostas, estado] = await Promise.all([
    lerTudo(() => supabaseAdmin.from('orcamentos_salvos')
      .select('cliente, criado_em, aprovado_em, origem_lead, payload').order('criado_em', { ascending: false }).order('id')),
    lerTudo(() => supabaseAdmin.from('clientes')
      .select('nome, telefone, tipo_pessoa, tipo_negocio').order('id')),
    lerTudo(() => supabaseAdmin.from('contatos')
      .select('telefone_norm').eq('optout', true).order('id')),
    lerJson(RESPOSTAS, {}),
    lerJson(ESTADO, {}),
  ]);
  const optouts = new Set(cont.map((c) => String(c.telefone_norm || '').replace(/\D/g, '').slice(-8)).filter(Boolean));
  const base = montarBase({ orcamentos: orc, clientes: cli });
  return { base, optouts, respostas, estado };
}

/* O número do Léo na BotConversa NÃO é a API oficial (WhatsApp Web): não há janela de
 * 24h nem template, e o risco real é BLOQUEIO por mandar para quem não conhece o número.
 * Por isso só se fala com quem já é contato dele lá — conferido SEM criar contato novo.
 * true = é contato; false = nunca falou com o número; null = não deu para conferir
 * (rede/API): nesse caso nada é marcado e a conferência se repete depois. */
async function jaEhContato(telefone) {
  const apiKey = process.env.BOTCONVERSA_API_KEY;
  if (!apiKey) return null;
  const tel = telefoneWhatsappBR(telefone);
  if (!tel || tel.length < 12) return false;
  try {
    const r = await bcFetch(`/subscriber/get_by_phone/+${tel}/`, 'GET', null, apiKey);
    if (r.status === 404) return false;
    if (!r.ok) return null;
    return !!r.json?.id;
  } catch (_) {
    return null;
  }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const CANDIDATOS_POR_TIQUE = 6;   // quantos "não é contato" se pulam de uma vez, sem esperar o intervalo

/* O automático NUNCA começa sozinho: depois do deploy o motor responde "desligado"
   até um commit trocar LIGADO. O status continua funcionando desligado. */
const desligado = () => !LIGADO || process.env.METODO_CHRH_DESLIGADO === '1';

export async function processarMetodo(req, res) {
  const secret = process.env.DISPARO_CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ ok: false, error: 'Não autorizado' });
  }
  try {
    if (desligado()) return res.status(200).json({ ok: true, pulado: 'desligado' });
    if (!dentroDaJanela()) return res.status(200).json({ ok: true, pulado: 'fora da janela' });

    const { base, optouts, respostas, estado } = await carregarContexto();
    const st = estado || {};
    st.contatos = st.contatos || {};
    const hoje = hojeBRT();
    if (st.dia !== hoje) { st.dia = hoje; st.enviadosHoje = 0; st.falhasSeguidas = 0; }

    if ((st.falhasSeguidas || 0) >= MAX_FALHAS_SEGUIDAS) {
      return res.status(200).json({ ok: true, pulado: 'pausado hoje: falhas seguidas', erro: st.ultimo?.erro });
    }
    if ((st.enviadosHoje || 0) >= MAX_POR_DIA) {
      return res.status(200).json({ ok: true, pulado: 'limite diário', enviadosHoje: st.enviadosHoje });
    }
    if (st.proximoEm && Date.now() < st.proximoEm) {
      return res.status(200).json({ ok: true, pulado: 'aguardando intervalo', proximoEm: new Date(st.proximoEm).toISOString() });
    }

    const { fila } = selecionar({ base, optouts, respostas, estado: st, agora: new Date() });
    if (!fila.length) return res.status(200).json({ ok: true, pulado: 'fila vazia' });

    // Primeiro candidato que JÁ É contato do número. Quem não é fica anotado e nunca
    // mais é conferido; não gasta o intervalo nem o teto do dia.
    let alvo = null;
    let puladosSemConversa = 0;
    for (const cand of fila.slice(0, CANDIDATOS_POR_TIQUE)) {
      const existe = await jaEhContato(cand.telefone);
      if (existe === null) {
        if (puladosSemConversa) await salvarEstado(st);
        return res.status(200).json({ ok: true, pulado: 'não consegui conferir o contato na BotConversa', puladosSemConversa });
      }
      if (existe) { alvo = cand; break; }
      (st.contatos[cand.tel8] = st.contatos[cand.tel8] || {}).semConversa = new Date().toISOString();
      st.totalSemConversa = (st.totalSemConversa || 0) + 1;
      puladosSemConversa += 1;
    }
    if (!alvo) {
      await salvarEstado(st);
      return res.status(200).json({ ok: true, pulado: 'ninguém da fila é contato do número', puladosSemConversa });
    }

    // Trava ANTES de enviar: dois tiques sobrepostos não podem mandar duas vezes.
    const gapMs = (GAP_MIN_MIN + Math.random() * (GAP_MAX_MIN - GAP_MIN_MIN)) * 60 * 1000;
    st.proximoEm = Date.now() + Math.round(gapMs);
    const h = st.contatos[alvo.tel8] || {};
    h.tent = (h.tent || 0) + 1;
    st.contatos[alvo.tel8] = h;
    await salvarEstado(st);

    const nome = primeiroNome(alvo.nome);
    const texto = mensagem({ etapa: alvo.etapa, variante: alvo.variante, nome });
    const r = await enviarMensagemCore({ cliente: alvo.nome, telefone: alvo.telefone, mensagem: texto });

    const agoraIso = new Date().toISOString();
    if (r.ok) {
      if (alvo.etapa === 1) { h.e1 = agoraIso; h.v = alvo.variante; } else { h.e2 = agoraIso; }
      h.tent = 0;
      st.enviadosHoje = (st.enviadosHoje || 0) + 1;
      st.falhasSeguidas = 0;
      st.totalEnviados = (st.totalEnviados || 0) + 1;
    } else {
      h.erro = String(r.error || '').slice(0, 160);
      st.falhasSeguidas = (st.falhasSeguidas || 0) + 1;
      st.totalFalhas = (st.totalFalhas || 0) + 1;
      if (h.tent >= MAX_TENTATIVAS) h.desistiu = agoraIso;
    }
    st.ultimo = { etapa: alvo.etapa, variante: alvo.variante, ok: r.ok, erro: r.ok ? null : h.erro, em: agoraIso };
    await salvarEstado(st);

    console.log('[metodo-corrida]', { etapa: alvo.etapa, ok: r.ok, hoje: `${st.enviadosHoje}/${MAX_POR_DIA}` });
    return res.status(200).json({
      ok: true, enviado: r.ok, etapa: alvo.etapa, variante: alvo.variante, erro: r.error || undefined,
      enviadosHoje: st.enviadosHoje, proximoEm: new Date(st.proximoEm).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

/* Status SEM nada pessoal: só contagens. Serve para conferir a base antes de ligar
   e para acompanhar depois. A lista nominal exige o token interno. */
export async function statusMetodo(req, res) {
  try {
    const { base, optouts, respostas, estado } = await carregarContexto();
    const st = estado || {};
    const sel = selecionar({ base, optouts, respostas, estado: st, agora: new Date() });
    const resumo = {
      ok: true,
      ligado: !desligado(),
      base_total: base.length,
      negocio: base.filter((c) => c.negocio && !c.usoProprio).length,
      pf_com_item_de_prova: base.filter((c) => !c.negocio && c.itemDeProva && !c.usoProprio).length,
      prontos_etapa_1: sel.etapa1.length,
      prontos_etapa_2: sel.etapa2.length,
      fora: sel.fora,
      limites: { por_dia: MAX_POR_DIA, janela: `${HORA_INICIO}h-${HORA_FIM}h dias úteis`, intervalo_min: `${GAP_MIN_MIN}-${GAP_MAX_MIN}` },
      enviados_total: st.totalEnviados || 0,
      enviados_hoje: st.dia === hojeBRT() ? (st.enviadosHoje || 0) : 0,
      falhas_total: st.totalFalhas || 0,
      pulados_sem_conversa: st.totalSemConversa || 0,
      ultimo: st.ultimo || null,
    };
    /* ?conferir=1: conta, SÓ LENDO a BotConversa, quantos dos prontos já são contato do
       número. Não envia nada e não grava nada além do carimbo de cooldown (10 min). */
    if (String(req.query?.conferir || '') === '1') {
      const agoraMs = Date.now();
      if (st.conferirEm && agoraMs - st.conferirEm < 10 * 60 * 1000) {
        resumo.conferencia = { pulada: 'aguarde 10 minutos entre conferências', ultima: st.conferencia || null };
      } else {
        const alvos = sel.etapa1.slice(0, 120);
        const c = { conferidos: 0, sao_contato: 0, nao_sao_contato: 0, indeterminado: 0 };
        for (const a of alvos) {
          const e = await jaEhContato(a.telefone);
          c.conferidos += 1;
          if (e === true) c.sao_contato += 1; else if (e === false) c.nao_sao_contato += 1; else c.indeterminado += 1;
          await dormir(350);
        }
        resumo.conferencia = c;
        /* A conferência demora ~40 s. Gravar o `st` lido no começo apagaria um envio
           feito nesse intervalo (e o histórico de quem já recebeu → mensagem em
           duplicata). Relê o estado FRESCO e grava só os campos da conferência. */
        const fresco = await lerJson(ESTADO, {});
        fresco.conferirEm = agoraMs;
        fresco.conferencia = { ...c, em: new Date(agoraMs).toISOString() };
        await salvarEstado(fresco);
      }
    }
    if (req.headers['x-hub-token'] && req.headers['x-hub-token'] === process.env.HUB_PDF_TOKEN) {
      resumo.fila = sel.fila.slice(0, 120).map((c) => ({
        etapa: c.etapa, variante: c.variante, nome: primeiroNome(c.nome) || '(empresa)',
        final: String(c.telefone || '').replace(/\D/g, '').slice(-4),
      }));
    }
    return res.status(200).json(resumo);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

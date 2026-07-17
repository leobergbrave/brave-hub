// Recebe leads do Full Sales System (GoHighLevel white-label).
//
// O FSS do plano atual nao tem Workflows nem API, entao quem chama esta funcao
// e um userscript rodando na sessao logada do navegador (scripts/fss-watcher.user.js).
//
// Regra central: TODO lead dispara, com ou sem tag de equipamento, assim que e visto.
// Esta funcao nao decide qual mensagem o cliente recebe — ela manda as tags CRUAS no
// payload e o fluxo do BotConversa ramifica a partir delas. Assim a copy e a
// segmentacao (academia / crossfit / hyrox / box_hibrido / tamanho de turma) mudam
// no BotConversa, sem deploy aqui.
//
// Isso e seguro porque o BotConversa usa um canal de WhatsApp separado do numero em
// que a IA do FSS atende — os dois nao se atropelam na mesma conversa.
//
// Idempotencia: um telefone dispara uma vez so. Lead que ja saiu de 'novo' e ignorado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fss-secret',
};

// Tag do FSS -> alias interno usado pela tabela leads / cadastrar-lead.
// Atencao: a esteira curva e 'estcv' aqui e 'esteira' no ergoCatalog.js.
// Os dois vocabularios convivem no projeto; ver CATALOG_ALIAS abaixo.
const TAG_MAP: Record<string, string[]> = {
  'ski':           ['skierg'],
  'ski erg':       ['skierg'],
  'skierg':        ['skierg'],
  'bike erg':      ['bikeerg'],
  'bikeerg':       ['bikeerg'],
  'remo':          ['remo'],
  'esteira curva': ['estcv'],
  'esteira':       ['estcv'],
  'escada':        ['escada'],
  'storm bike':    ['storm'],
  'storm':         ['storm'],
  // Quem vai montar um box do zero quer o pacote inteiro.
  'box completo':  ['estcv', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'],
};

// alias -> nome legivel, pro payload do BotConversa (mesmo texto do cadastrar-lead)
const EQUIPAMENTOS: Record<string, string> = {
  bikeerg: 'Bike Erg',
  remo:    'Remo Indoor',
  skierg:  'Ski Erg',
  storm:   'Storm Bike',
  estcv:   'Esteira Curva',
  escada:  'Escada',
};

// Tags de temperatura -> coluna momento_compra ('quente' | 'morno' | 'frio').
// A IA do FSS marca quente/superquente durante a qualificacao.
const TAGS_QUENTES = ['quente', 'superquente'];

// alias da tabela leads -> alias do ergoCatalog.js (usado no slug do combo)
const CATALOG_ALIAS: Record<string, string> = { estcv: 'esteira' };

// ordem canonica do ERGO_ORDER (ergoCatalog.js) — mantem o slug estavel
const ERGO_ORDER = ['esteira', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'];

function normalizarTelefone(bruto: string): string {
  const digitos = String(bruto || '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return '55' + digitos;
  return digitos;
}

function tagsParaAliases(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags || []) {
    for (const alias of TAG_MAP[String(tag).toLowerCase().trim()] || []) {
      out.add(alias);
    }
  }
  return [...out];
}

function comboSlug(aliases: string[]): string {
  const doCatalogo = new Set(aliases.map(a => CATALOG_ALIAS[a] || a));
  return ERGO_ORDER.filter(a => doCatalogo.has(a)).join('-');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const segredo = Deno.env.get('FSS_WEBHOOK_SECRET');
    if (segredo && req.headers.get('x-fss-secret') !== segredo) {
      return json({ error: 'nao autorizado' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { nome, telefone, tags = [], email, fssContactId } = body;

    // dry-run: calcula tudo e devolve o que faria, sem gravar nem disparar.
    const dryRun = body.dryRun === true || Deno.env.get('FSS_DRY_RUN') === 'true';

    if (!nome || !telefone) return json({ error: 'nome e telefone sao obrigatorios' }, 400);

    const tel = normalizarTelefone(telefone);
    if (tel.length < 12) return json({ error: `telefone invalido: ${telefone}`, telefone: tel }, 400);

    // Todo lead dispara, tendo tag de equipamento ou nao. A ramificacao de mensagem
    // acontece dentro do BotConversa, com base nas tags cruas que vao no payload.
    const tagsLimpas = (tags || []).map((t: string) => String(t).toLowerCase().trim()).filter(Boolean);
    const produtos = tagsParaAliases(tagsLimpas);
    const momento = tagsLimpas.some((t: string) => TAGS_QUENTES.includes(t)) ? 'quente' : 'morno';

    // A tabela ainda tem telefone duplicado de antes deste fluxo existir (33 grupos
    // em 17/07/2026, alguns com 4 linhas), entao maybeSingle() estouraria com
    // "multiple rows returned". Pega o mais recente — mesmo criterio que o trigger
    // sync_lead_orcamento_gerado ja usa pra desempatar.
    const { data: achados, error: erroBusca } = await supabase
      .from('leads')
      .select('id, status, produtos_interesse')
      .eq('telefone', tel)
      .order('criado_em', { ascending: false })
      .limit(1);

    if (erroBusca) throw new Error('erro ao buscar lead: ' + erroBusca.message);
    const existente = achados?.[0] || null;

    // Ja disparou uma vez: nao dispara de novo, aconteca o que acontecer com as tags.
    if (existente && existente.status !== 'novo') {
      return json({ acao: 'ignorado', motivo: 'lead ja processado', lead_id: existente.id, status: existente.status });
    }

    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://brave-hub-two.vercel.app';

    // Lead sem tag de equipamento vai pra LP geral. comboSlug([]) devolveria string
    // vazia e o link sairia como /lp/ergo/ — pagina inexistente no WhatsApp do cliente.
    const link = produtos.length
      ? `${baseUrl}/lp/ergo/${comboSlug(produtos)}`
      : `${baseUrl}/lp/ergometros`;

    const plano = {
      acao: existente ? 'disparar_existente' : 'criar_e_disparar',
      telefone: tel,
      tags: tagsLimpas,
      produtos,
      momento,
      link,
      status_final: 'fluxo_disparado',
    };

    if (dryRun) return json({ dryRun: true, ...plano });

    let leadId: string;

    if (existente) {
      const { data, error } = await supabase
        .from('leads')
        .update({ produtos_interesse: produtos, momento_compra: momento, status: 'fluxo_disparado' })
        .eq('id', existente.id)
        .eq('status', 'novo') // trava de corrida: so avanca se ainda estiver cru
        .select()
        .maybeSingle();

      if (error) throw new Error('erro ao atualizar lead: ' + error.message);
      if (!data) return json({ acao: 'ignorado', motivo: 'disparado em paralelo', lead_id: existente.id });
      leadId = data.id;
    } else {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          nome,
          telefone: tel,
          email: email || null,
          momento_compra: momento,
          produtos_interesse: produtos,
          status: 'fluxo_disparado',
          consultor: 'Léo Berg',
          observacoes: `Origem: Full Sales System${fssContactId ? ` | Contato: ${fssContactId}` : ''} | Tags: ${tagsLimpas.join(', ') || 'nenhuma'}`,
        })
        .select()
        .maybeSingle();

      if (error) {
        // Se um dia existir indice unico em leads.telefone, corrida vira conflito.
        if (error.code === '23505') {
          return json({ acao: 'ignorado', motivo: 'telefone ja cadastrado (corrida)', telefone: tel });
        }
        throw new Error('erro ao criar lead: ' + error.message);
      }
      leadId = data!.id;
    }

    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_NOVO_LEAD') || Deno.env.get('BOTCONVERSA_WEBHOOK');
    if (!webhookUrl) {
      return json({ acao: 'cadastrado_sem_disparo', lead_id: leadId, motivo: 'BOTCONVERSA_WEBHOOK_NOVO_LEAD nao configurado' });
    }

    // O payload leva as tags CRUAS de proposito: quem decide qual mensagem enviar e
    // o fluxo do BotConversa, nao esta funcao. Assim o Leo muda a copy e a
    // ramificacao por segmento (academia / crossfit / hyrox / box_hibrido / tamanho
    // de turma) sem precisar de deploy aqui.
    // Campos em string e array porque o BotConversa mapeia campo plano com mais
    // facilidade do que array.
    const payload = {
      nome,
      telefone: tel,
      tags: tagsLimpas.join(', '),
      tags_lista: tagsLimpas,
      produtos: produtos.map((a) => EQUIPAMENTOS[a] || a).join(', '),
      produtos_aliases: produtos,
      tem_produto: produtos.length > 0,
      momento,
      link,
      consultor: 'Léo Berg',
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      // Volta pra 'novo' pra o proximo ciclo tentar de novo. Melhor repetir a
      // tentativa do que o lead sumir sem ninguem saber.
      await supabase.from('leads').update({ status: 'novo' }).eq('id', leadId);
      console.error('[webhook-fss] BotConversa falhou, lead volta pra novo:', err);
      return json({ acao: 'disparo_falhou', lead_id: leadId, erro: String(err) }, 502);
    }

    return json({ acao: plano.acao, lead_id: leadId, tags: tagsLimpas, produtos, momento, link });

  } catch (error: any) {
    console.error('[webhook-fss]', error);
    return json({ error: error.message }, 500);
  }
});

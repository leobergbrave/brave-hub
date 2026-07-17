// Recebe leads do Full Sales System (GoHighLevel white-label).
//
// O FSS do plano atual nao tem Workflows nem API, entao quem chama esta funcao
// e um userscript rodando na sessao logada do navegador (scripts/fss-watcher.user.js).
//
// Regra central: o lead do FSS chega CRU. A IA de atendimento conversa e so
// depois aplica a tag de produto. Por isso:
//   - sem tag de produto  -> cadastra com status 'novo', NAO dispara.
//   - com tag de produto  -> preenche produtos_interesse, dispara BotConversa,
//                            status 'fluxo_disparado'.
// Um lead 'novo' que ganha tag depois e promovido no ciclo seguinte, sem duplicar.

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

    const produtos = tagsParaAliases(tags);
    const pronto = produtos.length > 0;

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

    const plano = {
      acao: existente ? (pronto ? 'promover' : 'ignorado') : (pronto ? 'criar_e_disparar' : 'criar_novo'),
      telefone: tel,
      produtos,
      status_final: pronto ? 'fluxo_disparado' : 'novo',
    };

    if (dryRun) return json({ dryRun: true, ...plano });

    // Lead ja existe como 'novo' e continua sem tag de produto: nada a fazer.
    if (existente && !pronto) {
      return json({ acao: 'ignorado', motivo: 'ainda sem tag de produto', lead_id: existente.id });
    }

    let leadId: string;

    if (existente) {
      // Promocao: o lead cru ganhou tag de produto, agora vai.
      const { data, error } = await supabase
        .from('leads')
        .update({ produtos_interesse: produtos, status: 'fluxo_disparado' })
        .eq('id', existente.id)
        .eq('status', 'novo') // trava de corrida: so promove se ainda estiver cru
        .select()
        .maybeSingle();

      if (error) throw new Error('erro ao promover lead: ' + error.message);
      if (!data) return json({ acao: 'ignorado', motivo: 'promovido em paralelo', lead_id: existente.id });
      leadId = data.id;
    } else {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          nome,
          telefone: tel,
          email: email || null,
          momento_compra: 'morno',
          produtos_interesse: produtos,
          status: pronto ? 'fluxo_disparado' : 'novo',
          consultor: 'Léo Berg',
          observacoes: `Origem: Full Sales System${fssContactId ? ` | Contato: ${fssContactId}` : ''} | Tags: ${(tags || []).join(', ') || 'nenhuma'}`,
        })
        .select()
        .maybeSingle();

      // O indice unico em leads.telefone transforma corrida em conflito, nao em duplicata.
      if (error) {
        if (error.code === '23505') {
          return json({ acao: 'ignorado', motivo: 'telefone ja cadastrado (corrida)', telefone: tel });
        }
        throw new Error('erro ao criar lead: ' + error.message);
      }
      leadId = data!.id;
    }

    if (!pronto) return json({ acao: 'criado_novo', lead_id: leadId, motivo: 'sem tag de produto, sem disparo' });

    // Dispara BotConversa. Se falhar, volta o status pra 'novo' e o proximo
    // ciclo tenta de novo — melhor repetir a tentativa do que perder o lead.
    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_NOVO_LEAD') || Deno.env.get('BOTCONVERSA_WEBHOOK');
    if (!webhookUrl) {
      return json({ acao: 'cadastrado_sem_disparo', lead_id: leadId, motivo: 'BOTCONVERSA_WEBHOOK_NOVO_LEAD nao configurado' });
    }

    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://brave-hub-two.vercel.app';
    const link = `${baseUrl}/lp/ergo/${comboSlug(produtos)}`;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone: tel, produtos_interesse: (tags || []).join(', '), link, consultor: 'Léo Berg' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      await supabase.from('leads').update({ status: 'novo' }).eq('id', leadId);
      console.error('[webhook-fss] BotConversa falhou, lead volta pra novo:', err);
      return json({ acao: 'disparo_falhou', lead_id: leadId, erro: String(err) }, 502);
    }

    return json({ acao: plano.acao, lead_id: leadId, produtos, link });

  } catch (error: any) {
    console.error('[webhook-fss]', error);
    return json({ error: error.message }, 500);
  }
});

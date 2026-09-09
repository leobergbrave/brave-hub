// api/_qualificacao.js — as perguntas qualificadoras e as respostas do cliente.
//
// Por que existe: a análise de 08/09/2026 comparou o Léo aos vendedores que
// também orçam antes de fechar (conversão justa, corrigindo o fator de
// duplicação de 2,36x do HUB). O resultado: 19,5% contra 30,6% da Laís, com o
// vazamento concentrado onde mora o dinheiro — 9,8% acima de R$ 20 mil e 8,4%
// em orçamentos de 10+ itens. Negócio bem qualificado fecha 6,3x mais.
// O HUB tirou o atrito de orçar; sumiu junto a qualificação que o atrito
// forçava. Estas perguntas devolvem a etapa sem devolver o trabalho manual.
//
// As perguntas ficam AQUI, no servidor, e não no userscript: reescrever o texto
// não pode obrigar o Léo a reinstalar o Tampermonkey — mesma decisão do RAPIDAS
// em _fss-produtos.js.
//
// GET  /api/bling?acao=qualificacao&telefone=55...   → perguntas + respostas
// POST /api/bling?acao=qualificacao_salvar           → grava uma resposta
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/* MEDDIC-lite, adaptativo. Cada pergunta é escrita como o Léo escreveria no
   WhatsApp, e o painel entrega UMA por vez no campo de mensagem para ele
   revisar e enviar. Despejar todas seria o oposto do objetivo: o Gartner mede
   que comprador sobrecarregado fica 153% mais propenso a escolher a opção menor
   ou nenhuma. Uma pergunta por vez constrói conversa; um bloco vira formulário.

   A PRIMEIRA pergunta classifica o negócio e as outras se ajustam a ela. Antes
   a abertura era "quantos alunos e qual o tamanho da área", que já pressupõe
   projeto de espaço inteiro: quem quer só um remo estranha, e éramos nós mesmos
   empurrando a conversa para um orçamento grande. Isso contraria os dados —
   orçamento de 1 item fecha 26,4%, o de 10+ itens fecha 8,4%. Inflar o escopo
   derruba a conversão. */
export const PERGUNTAS = [
  {
    chave: 'escopo', n: 1, titulo: '① O que busca',
    pergunta: 'Me conta o que você tem em mente: é um equipamento específico ou você está montando/ampliando um espaço?',
    porque: 'Classifica o negócio e define as próximas perguntas. Compra pontual não precisa do questionário inteiro.',
    // Resposta por clique: o Léo marca enquanto o cliente fala, sem digitar.
    opcoes: ['Equipamento pontual', 'Montar ou ampliar espaço'],
    trilhas: ['pontual', 'projeto'],
  },
  {
    chave: 'metrica', n: 2, titulo: '② Tamanho e meta',
    pergunta: 'Pra eu dimensionar certo: quantos alunos você atende hoje, e qual o tamanho da área que vai receber os equipamentos?',
    porque: 'Dimensiona o pacote. Sem isso a quantidade é chute e o orçamento sai grande ou pequeno demais.',
    trilhas: ['projeto'],
  },
  {
    chave: 'decisor', n: 3, titulo: '③ Quem decide',
    pergunta: 'Além de você, mais alguém participa dessa decisão? Pergunto porque gosto de já deixar tudo alinhado com todo mundo de uma vez.',
    porque: 'Negócio com 3+ contatos fecha 2,4x mais; trazer quem assina cedo aumenta 55%. Sem isso você negocia com quem não decide.',
    trilhas: ['projeto'],
  },
  {
    chave: 'criterio', n: 4, titulo: '④ Critério de escolha',
    pergunta: 'O que pesa mais na sua escolha de fornecedor: preço, prazo de entrega, garantia ou durabilidade do equipamento?',
    porque: 'Diz qual argumento usar. Se o critério é durabilidade, desconto não fecha — patrocínio dos campeonatos fecha.',
    trilhas: ['pontual', 'projeto'],
  },
  {
    chave: 'dor', n: 5, titulo: '⑤ Custo de não fazer',
    pergunta: 'E hoje, o que esse equipamento está te custando não ter? Perde aluno, trava alguma aula, sobrecarrega o que já tem?',
    porque: 'É a pergunta que mais fecha. 40-60% dos negócios morrem em "sem decisão" — sem dor explícita, adiar é sempre o mais confortável.',
    trilhas: ['projeto'],
  },
  {
    chave: 'prazo', n: 6, titulo: '⑥ Data',
    pergunta: 'Tem alguma data na frente? Inauguração, reforma, início de turma — pra eu já checar o prazo de entrega pra você.',
    porque: 'Negócio fechado em até 50 dias ganha ~47% das vezes; além disso, ~20%. E a data vira o gatilho certo do follow-up.',
    trilhas: ['pontual', 'projeto'],
  },
];

/* Quantas respostas bastam em cada trilha. Compra pontual já converte 26,4%
   sozinha: exigir o questionário inteiro dela seria atrito puro. */
const MINIMO_POR_TRILHA = { pontual: 2, projeto: 4 };
const MINIMO_PADRAO = 1;   // sem classificação, a única cobrança é classificar

/* Só dígitos com DDI, igual ao resto do HUB (telefoneWhatsappBR). Guardar
   formatado faria a busca por telefone falhar em silêncio — e falha silenciosa
   aqui significa perder a qualificação que o Léo acabou de digitar. */
export function normalizarTelefone(raw) {
  let tel = String(raw || '').replace(/\D/g, '');
  if (tel.startsWith('55') && tel.length >= 12) tel = tel.slice(2);
  if (tel.length === 10 && /^[6-9]/.test(tel.slice(2))) tel = tel.slice(0, 2) + '9' + tel.slice(2);
  return (tel.length === 10 || tel.length === 11) ? `55${tel}` : null;
}

const preenchida = (v) => String(v || '').trim().length >= 2;

/* ── A data da pergunta ⑤, em texto livre, virando data de verdade ──────────
   Por que aqui e não no motor de follow-up: a fila roda a cada minuto, e
   reinterpretar "inauguro em outubro" a cada tique seria caro e, pior,
   instável. Interpretamos UMA vez, na gravação, e a automação lê uma data.

   Por que regex e não a Gemini (que o HUB já usa em _cadastro-colar.js): ali a
   IA propõe um cadastro que o Léo revisa antes de salvar. Aqui o resultado
   reordena, sozinha, a fila de quem recebe mensagem — e resposta não
   determinística numa automação que fala com cliente é risco sem contrapartida.
   O que não for entendido vira null, e o lead simplesmente segue na ordem
   normal: perder a prioridade é bem menos grave que inventar uma data. */
const MESES = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const semAcento = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const iso = (ano, mes, dia) => new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);

export function interpretarPrazo(texto, referencia = new Date()) {
  const t = semAcento(texto).trim();
  if (t.length < 3) return null;
  // "sem data", "ainda nao sei", "nao tenho previsao" — ausência é resposta.
  if (/sem (data|previsao|prazo)|nao (tenho|sei|ha)|ainda nao|indefinid|nenhum/.test(t)) return null;

  const hojeUTC = new Date(Date.UTC(
    referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate()
  ));
  const anoAtual = hojeUTC.getUTCFullYear();
  const mesAtual = hojeUTC.getUTCMonth() + 1;

  // 1) Data cheia: 15/11, 15-11-2026, 15.11.26
  const m1 = t.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/);
  if (m1) {
    const dia = Number(m1[1]);
    const mes = Number(m1[2]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = m1[3] ? Number(m1[3]) : anoAtual;
      if (ano < 100) ano += 2000;
      // Sem ano informado, uma data já passada quase sempre quer dizer o ano
      // que vem — ninguém marca inauguração para trás.
      if (!m1[3] && iso(ano, mes, dia) < iso(anoAtual, mesAtual, hojeUTC.getUTCDate())) ano += 1;
      return iso(ano, mes, dia);
    }
  }

  // 2) "em 3 meses", "daqui 45 dias", "umas 2 semanas"
  const m2 = t.match(/(\d{1,3})\s*(dia|semana|mes|mês|meses)/);
  if (m2) {
    const q = Number(m2[1]);
    const passo = /dia/.test(m2[2]) ? 1 : /semana/.test(m2[2]) ? 7 : 30;
    const d = new Date(hojeUTC.getTime() + q * passo * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // 3) Nome de mês, com ou sem dia: "dia 15 de novembro", "em outubro"
  for (const [nome, mes] of Object.entries(MESES)) {
    if (!new RegExp(`\\b${nome}`).test(t)) continue;
    const comDia = t.match(new RegExp(`(\\d{1,2})\\s*(?:de\\s*)?${nome}`));
    /* Sem dia, ancoramos no PRIMEIRO do mês, não no meio: o alvo é fechar
       antes da data, então errar para cedo é o lado seguro do erro. */
    const dia = comDia && Number(comDia[1]) >= 1 && Number(comDia[1]) <= 31 ? Number(comDia[1]) : 1;
    const ano = mes >= mesAtual ? anoAtual : anoAtual + 1;
    return iso(ano, mes, dia);
  }

  // 4) "ano que vem" — sem mês, o começo do ano é o palpite honesto.
  if (/ano que vem|proximo ano|ano seguinte/.test(t)) return iso(anoAtual + 1, 1, 1);

  return null;
}

/* Trilha do negócio, lida da resposta 1. Null = ainda não classificado, e aí o
   painel mostra só a pergunta que classifica. Na dúvida cai em 'projeto': errar
   para mais perguntas é recuperável, orçar às cegas um projeto grande não. */
export function trilhaDe(respostas = {}) {
  const e = semAcento(respostas.escopo);
  if (!preenchida(e)) return null;
  if (/pontual|especific|so um|apenas um|unico|uma unidade|troca|repor/.test(e)) return 'pontual';
  return 'projeto';
}

/* As perguntas que valem para esta conversa. */
export function perguntasDaTrilha(respostas = {}) {
  const trilha = trilhaDe(respostas);
  if (!trilha) return PERGUNTAS.filter((p) => p.chave === 'escopo');
  return PERGUNTAS.filter((p) => (p.trilhas || []).includes(trilha));
}

/* Resumo pronto para a tela: quantas faltam e o que as respostas já dizem. Os
   sinais não são enfeite — cada um aponta uma ação com efeito medido. */
export function resumir(respostas = {}) {
  const trilha = trilhaDe(respostas);
  const relevantes = perguntasDaTrilha(respostas);
  const respondidas = relevantes.filter((p) => preenchida(respostas[p.chave]));
  const faltando = relevantes.filter((p) => !preenchida(respostas[p.chave]));
  const sinais = [];

  if (trilha === 'pontual') {
    sinais.push({
      tipo: 'escopo',
      texto: 'Compra pontual — não infle o orçamento. 1 item fecha 26,4%; 10+ itens, 8,4%.',
    });
  }

  const MESES = /janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i;
  if (preenchida(respostas.prazo) && (/\d|inaugur|reform|turma|obra/i.test(respostas.prazo) || MESES.test(respostas.prazo))) {
    sinais.push({ tipo: 'quente', texto: 'Tem data marcada — priorize e use o prazo de entrega como fechamento.' });
  }
  if (preenchida(respostas.decisor) && /s[óo]ci|sociedade|esposa|marido|parceir|diretor|grupo|junto|conselho|fam[íi]lia/i.test(respostas.decisor)) {
    sinais.push({ tipo: 'multithread', texto: 'Decisão compartilhada — peça para incluir o outro decisor na conversa (2,4x mais fechamento).' });
  }
  if (preenchida(respostas.criterio) && /pre[çc]o|barat|desconto|custo|valor/i.test(respostas.criterio)) {
    sinais.push({ tipo: 'preco', texto: 'Critério é preço — abra pelo Essencial e ofereça o Finame nos ergômetros.' });
  }
  if (preenchida(respostas.criterio) && /durab|qualidade|resist|garantia|aguent|robust/i.test(respostas.criterio)) {
    sinais.push({ tipo: 'marca', texto: 'Critério é durabilidade — mande a apresentação da BRAVE (patrocínio dos campeonatos), não desconto.' });
  }
  // A dor só é cobrada na trilha em que ela pesa — numa compra pontual o motivo
  // costuma já estar na própria resposta 1.
  if (trilha === 'projeto' && !preenchida(respostas.dor)) {
    sinais.push({ tipo: 'risco', texto: 'Sem dor explícita: é aqui que o negócio vira "vou pensar". Volte na pergunta ⑤.' });
  }

  const minimo = MINIMO_POR_TRILHA[trilha] || MINIMO_PADRAO;
  return {
    trilha,
    respondidas: respondidas.length,
    total: relevantes.length,
    minimo,
    suficiente: respondidas.length >= minimo,
    faltando: faltando.map((p) => ({ chave: p.chave, titulo: p.titulo })),
    sinais,
  };
}

/* Uma linha por qualificação, encontrada pelo telefone (a conversa aberta no
   painel) ou pelo cliente (o Gerador). Sem os dois, não há o que buscar. */
async function achar({ telefone, clienteId }) {
  let q = supabaseAdmin.from('qualificacoes').select('*')
    .order('atualizado_em', { ascending: false }).limit(1);
  if (telefone) q = q.eq('telefone', telefone);
  else if (clienteId) q = q.eq('cliente_id', clienteId);
  else return null;
  const { data, error } = await q;
  /* Erro de leitura NAO pode virar "ainda nao tem qualificacao". Se virasse, o
     save seguinte acharia `anterior` vazio, faria INSERT em vez de UPDATE e
     criaria uma segunda linha com apenas a resposta recem-digitada — que, por
     ser a mais recente, passaria a ser a que o painel mostra. As respostas
     anteriores sumiriam da tela sem ninguem apagar nada. */
  if (error) throw new Error(`leitura da qualificação falhou: ${error.message}`);
  return data?.[0] || null;
}

export async function lerQualificacao(req, res) {
  try {
    const telefone = normalizarTelefone(req.query?.telefone);
    const clienteId = req.query?.cliente_id || null;
    const linha = await achar({ telefone, clienteId });
    const respostas = linha?.respostas || {};
    return res.status(200).json({
      ok: true,
      // Só as perguntas que valem para esta conversa: enquanto o negócio não
      // estiver classificado, vai apenas a que classifica.
      perguntas: perguntasDaTrilha(respostas),
      respostas,
      nome: linha?.nome || null,
      atualizadoEm: linha?.atualizado_em || null,
      resumo: resumir(respostas),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

export async function salvarQualificacao(req, res) {
  try {
    const body = req.body || {};
    const telefone = normalizarTelefone(body.telefone);
    const clienteId = body.cliente_id || null;
    if (!telefone && !clienteId) {
      return res.status(400).json({ ok: false, error: 'Informe telefone ou cliente_id.' });
    }

    const chavesValidas = new Set(PERGUNTAS.map((p) => p.chave));
    const entrada = body.respostas && typeof body.respostas === 'object' ? body.respostas : {};
    const limpas = {};
    for (const [k, v] of Object.entries(entrada)) {
      // Chave desconhecida é descartada em silêncio de propósito: o painel pode
      // ser mais novo que o servidor, e um campo extra não deve derrubar o save
      // da resposta que o Léo acabou de digitar na frente do cliente.
      if (chavesValidas.has(k)) limpas[k] = String(v || '').trim().slice(0, 2000);
    }

    const anterior = await achar({ telefone, clienteId });
    // Merge, nunca substituição: o painel manda uma resposta por vez, conforme
    // o cliente fala. Um envio completo apagaria as anteriores.
    const respostas = { ...(anterior?.respostas || {}), ...limpas };

    const linha = {
      telefone: telefone || anterior?.telefone || null,
      cliente_id: clienteId || anterior?.cliente_id || null,
      nome: body.nome || anterior?.nome || null,
      respostas,
      consultor: body.consultor || anterior?.consultor || 'Léo Berg',
      atualizado_em: new Date().toISOString(),
      /* A data sai do texto AQUI, na gravação — o motor de follow-up roda a
         cada minuto e não pode reinterpretar texto livre a cada passagem.
         Reinterpretamos sempre que a resposta 5 muda: o cliente que disse
         "ainda não sei" em maio e "inauguro em outubro" hoje precisa que a
         prioridade acompanhe. */
      prazo_data: interpretarPrazo(respostas.prazo) || null,
    };

    const r = anterior
      ? await supabaseAdmin.from('qualificacoes').update(linha).eq('id', anterior.id)
      : await supabaseAdmin.from('qualificacoes').insert(linha);
    if (r.error) throw new Error(r.error.message);

    return res.status(200).json({ ok: true, respostas, resumo: resumir(respostas) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

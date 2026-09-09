// api/_fss-produtos.js — mensagens prontas de produtos para o painel do FSS.
// Monta texto WhatsApp + video de cada produto a partir do catalogo do banco
// (loadCatalog: 6 ergometros + curados de combo_produtos). Os textos ficam aqui,
// e nao no userscript, para que preco/caracteristicas editados no admin valham
// na hora, sem reinstalar o script no Tampermonkey.

import { createClient } from '@supabase/supabase-js';
import { loadCatalog } from './_ergo-fetch.js';
import { bcFetch, telefoneWhatsappBR } from './_proposta-pdf.js';

/* Mensagens de inicio de conversa — mesma fonte para o userscript do PC e a
   central mobile (/enviar). */
export const RAPIDAS = [
  {
    id: 'abertura', titulo: '👋 Abertura',
    texto: 'Oi, tudo bem? Aqui é o Léo Berg 👊 Você já conhece a BRAVE?',
  },
  {
    /* Apresentacao institucional: usada com lead frio, que ainda nao sabe quem
       e a BRAVE. Os numeros vem do perfil oficial (@bravefitnessbr) e das
       credenciais do site — nada aqui pode ser estimativa. */
    id: 'apresentacao', titulo: '🦁 Apresentar a BRAVE',
    texto: [
      '🦁 *BRAVE — Equipamentos Fitness*',
      'O parceiro do empresário fitness desde 2020.',
      '',
      '🏆 *Patrocinadora oficial dos maiores campeonatos do país:*',
      '• Copa SUR de CrossFit — 3 edições seguidas',
      '• TCB — The CrossFit Games Brasil',
      '• Powered by Coffee',
      '• UAIROX — Hybrid RUN',
      '• HTC — Fitness RUN',
      '',
      'Equipamento que aguenta a pressão do pódio aguenta a rotina do seu box — é o mesmo padrão que entregamos pra você.',
      '',
      '🇧🇷 +3.000 negócios fitness equipados no Brasil',
      '📸 https://instagram.com/bravefitnessbr — 56 mil pessoas acompanham nossas entregas',
    ].join('\n'),
  },
  {
    id: 'cadastro', titulo: '📋 Pedir cadastro',
    texto: 'Para realizar seu orçamento personalizado, por favor preencha esse cadastro\nhttps://brave-hub-two.vercel.app/cadastro\nMe avise quando finalizar',
  },
];

const fmtBR = (v) => {
  const n = Number(v) || 0;
  const centavos = Math.round(n * 100) % 100 !== 0;
  return 'R$ ' + n.toLocaleString('pt-BR', {
    minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: 2,
  });
};

const linhaPreco = (avista, prazo) => (Number(avista) > 0
  ? `💰 *${fmtBR(avista)} à vista* ou 10x de ${fmtBR((Number(prazo) || 0) / 10)} sem juros`
  : '💰 Preço sob consulta — me chama que monto sua condição');

/* Remo e SkiErg sao estacoes oficiais das provas de corrida hibrida —
   argumento de venda mais forte que o subtitle generico do catalogo (que segue
   valendo nas LPs). Cada um com angulo diferente para nao soar repetido na
   mesma conversa. ATENCAO: "HYROX" e marca registrada de terceiro e nao pode
   aparecer em conteudo nosso — citamos as provas que a BRAVE patrocina
   (UAIROX e HTC) ou o termo generico "corrida hibrida". */
const CORRIDA_HIBRIDA = {
  remo: {
    subtitle: 'O ergômetro oficial das provas de corrida híbrida e do Cross Training — pronto para transformar suas aulas de endurance.',
    bullet: 'Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN) — treine seus alunos no equipamento da competição',
  },
  skierg: {
    subtitle: 'O simulador de esqui das provas de corrida híbrida — o mais resistente e inovador do mercado.',
    bullet: 'Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN) — a modalidade que mais cresce no mundo',
  },
};

function mensagemErgo(p) {
  const hy = CORRIDA_HIBRIDA[p.alias];
  let specs = (p.specs || []).filter(Boolean);
  if (hy) {
    // O bullet da prova substitui o de Cross Training (que ja fica implicito no subtitle)
    specs = [hy.bullet, ...specs.filter((s) => !/cross training/i.test(s))];
  }
  return [
    `${p.emoji} *${p.nome}*`,
    hy ? hy.subtitle : p.subtitle,
    '',
    ...specs.map((s) => `✅ ${s}`),
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

// Familias com variacoes (metragens): uma mensagem so, apresentando o produto
// e listando as opcoes com preco ao final. Sleds sao itens separados: cada um
// tem video proprio, e video + texto devem casar (pedido do Leo em 2026-09-02).
function mensagemSledImportado(p) {
  return [
    '🛷 *Sled Importado — Medidas Oficiais de Competição 50kg*',
    'Push e Pull: as estações de força da prova, dentro do seu box.',
    '',
    '✅ Medidas oficiais — padrão UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Serve para empurrar e puxar — 2 estações em 1',
    '✅ Tubo central em inox e grip nos tubos',
    '✅ Tubos removíveis para transporte fácil',
    '✅ Compatível com anilhas para carga extra',
    '✅ Adaptável ao Turf',
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

function mensagemSledNacional(p) {
  return [
    '🛷 *Sled Nacional — Medidas Oficiais de Competição 25kg*',
    'O sled da prova em versão nacional — mesma pegada, preço mais acessível.',
    '',
    '✅ Medidas oficiais — padrão UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Serve para empurrar e puxar — 2 estações em 1',
    '✅ Pintura eletrostática de alta resistência',
    '✅ Tubos removíveis para transporte fácil',
    '✅ Compatível com anilhas para carga extra',
    '✅ Fabricação em 20 dias',
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

function mensagemTurf(cheio, lanes, base) {
  const l = [
    '🏟️ *TURF Oficial — O Piso das Provas de Corrida Híbrida*',
    'O mesmo piso que o atleta encontra na prova: seu box pronto para treinos de sled, lunges e carries.',
    '',
    '✅ O mesmo piso das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    "✅ Ideal para sled push/pull, lunges e farmer's carry",
    '✅ Transforma qualquer corredor em estação de treino',
  ];
  if (cheio) l.push('', `📏 *16,5m x 2m* — ${linhaPreco(cheio.preco_avista, cheio.preco)}`);
  if (lanes) l.push(`📏 *12,5m x 2m (lanes centrais)* — ${linhaPreco(lanes.preco_avista, lanes.preco)}`);
  if (base)  l.push(`➕ Opcional: *Base do atleta 1,8m x 2m* — ${fmtBR(base.preco_avista)} à vista`);
  return l.join('\n');
}

/* Sandbag: a estacao de lunges da prova (100m). O catalogo nao traz specs
   para esses itens, entao os argumentos vivem aqui — mesma linha editorial
   dos demais. Tres pesos numa mensagem so, como turf e grama. */
function mensagemSandbag(s10, s20, s30) {
  const l = [
    '🎒 *Sandbag Hybrid Pro Series*',
    'A estação de lunges da prova: 100 metros com a carga nas costas.',
    '',
    '✅ Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Alças reforçadas para lunges, carries e cleans',
    '✅ Material resistente à abrasão e ao uso diário',
    '✅ Enchimento uniforme — carga estável durante o movimento',
    '✅ Pronta entrega',
  ];
  const linha = (p, peso) => { if (p) l.push(`⚖️ *${peso}* — ${linhaPreco(p.preco_avista, p.preco)}`); };
  if (s10 || s20 || s30) l.push('');
  linha(s10, '10kg'); linha(s20, '20kg'); linha(s30, '30kg');
  return l.join('\n');
}

/* Corda do sled: duas linhas (Preta importada e Cinza Oficial) x dois
   comprimentos. As de 10 metros nao ficam em estoque — avisar do prazo aqui
   evita a pergunta depois e a frustracao de prometer entrega rapida. */
function mensagemCorda(preta10, preta15, cinza10, cinza15) {
  const l = [
    '🪢 *Sled Tech Rope 38mm*',
    'A corda que puxa o sled sem serrar na mão nem desfiar no atrito.',
    '',
    '✅ 38mm — diâmetro que dá pegada firme no pull',
    '✅ Ponteira de aço: engate rápido e resistente',
    '✅ Comprimento de prova para puxada completa',
  ];
  const opcao = (p, rotulo, encomenda) => {
    if (!p) return;
    l.push('', `${rotulo}${encomenda ? ' _(sob encomenda 60 dias)_' : ''}`, linhaPreco(p.preco_avista, p.preco));
  };
  opcao(preta10, '⚫ *Preta — 10 metros*', true);
  opcao(preta15, '⚫ *Preta — 15 metros*', false);
  opcao(cinza10, '🩶 *Cinza (Oficial) — 10 metros*', true);
  opcao(cinza15, '🩶 *Cinza (Oficial) — 15 metros*', false);
  return l.join('\n');
}

function mensagemGrama(g10, g16) {
  const l = [
    '🌱 *Grama Sintética Premium Preta — 2 Raias*',
    'Visual profissional e área funcional para o seu box em um só piso.',
    '',
    '✅ Preta com raias demarcadas — estética premium',
    '✅ 2 raias prontas para sled, lunges e sprints',
    '✅ Alta durabilidade para treino diário',
    '✅ Instalação simples, adapta a qualquer área',
  ];
  if (g10) l.push('', `📏 *2m x 10m* — ${linhaPreco(g10.preco_avista, g10.preco)}`);
  if (g16) l.push(`📏 *2m x 16m* — ${linhaPreco(g16.preco_avista, g16.preco)}`);
  return l.join('\n');
}

/* ── Med Balls ──────────────────────────────────────────────────────────
   Sao 39 linhas no catalogo, em familias sobrepostas — por isso a lista de
   SKUs e explicita: um filtro por nome traria as Kids, as pretas de entrada e
   ate racks junto. Ficam em `produtos` (nao em combo_produtos): sao 21 itens,
   e duplica-los na lista curada poluiria o montador de combos e criaria duas
   verdades de preco. */
/* So os pesos em LB: a linha tem KG e LB ao mesmo tempo, e misturar as duas
   unidades na mesma mensagem deixa o cliente sem base de comparacao (pedido do
   Leo em 08/09). As de KG (M2P, M4P, M6P, M9P, M12P) seguem no catalogo e no
   orcamento — so nao entram nesta mensagem. */
const MEDBALL_PRO = ['M8P', 'M10P', 'M14P', 'M16P', 'M20P', 'M30P'];

/* M25B (25LB Black) fora: custava R$ 269 a vista, abaixo da 20LB e ate da 8LB
   — na lista o preco furado salta aos olhos. Volta quando o valor no catalogo
   for corrigido. */
const MEDBALL_COR = ['M4L', 'M8C', 'M10C', 'M12C', 'M14C', 'M16C', 'M18B', 'M20C', 'M30C'];

async function buscarPorSku(skus) {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from('produtos')
      .select('codigo_sku, nome, preco, url_imagem')
      .in('codigo_sku', skus);
    return data || [];
  } catch (_) {
    return [];   // sem catalogo a familia simplesmente nao aparece no menu
  }
}

/* Ordena por peso REAL: a linha mistura KG e LB, e ordenar pelo numero cru
   colocaria a de 30LB (13,6kg) antes da de 12KG. */
function pesoEmKg(nome) {
  const m = String(nome).match(/(\d+(?:[.,]\d+)?)\s*(KG|LB)/i);
  if (!m) return 999;
  const n = Number(m[1].replace(',', '.'));
  return m[2].toUpperCase() === 'LB' ? n * 0.4536 : n;
}

/* Rotulo do peso como esta no catalogo (02KG, 20LB) — e o que o cliente vera
   na proposta, entao inventar conversao aqui criaria divergencia. */
const rotuloPeso = (nome) => {
  const m = String(nome).match(/(\d+)\s*(KG|LB)/i);
  return m ? `${Number(m[1])}${m[2].toUpperCase()}` : nome;
};

const corDaBola = (nome) => {
  const m = String(nome).match(/-\s*([A-Za-zÀ-ú]+)\s*$/);
  return m ? m[1] : '';
};

/* Cada peso leva os DOIS valores, como no resto do painel. Mostrar so o a
   vista e anunciar "10x" no rodape fazia o cliente dividir o numero errado: a
   parcela sai do preco A PRAZO (R$ 419 = 10x de R$ 41,90), nao do a vista
   (R$ 377). Preco do catalogo e o a prazo; a vista tem 10% de desconto. */
function linhasDePeso(bolas, comCor) {
  return bolas
    .slice()
    .sort((a, b) => pesoEmKg(a.nome) - pesoEmKg(b.nome))
    .map((b) => {
      // Reais inteiros: e como os precos a vista aparecem no catalogo
      // (R$ 449, R$ 629) — centavos quebrados denunciam conta automatica.
      const avista = Math.round(Number(b.preco) * 0.9);
      const cor = comCor ? corDaBola(b.nome) : '';
      return `⚖️ *${rotuloPeso(b.nome)}*${cor ? ` ${cor}` : ''} — ${linhaPreco(avista, b.preco)}`;
    });
}

function mensagemMedBallPro(bolas) {
  return [
    '🏐 *Medicine Ball Pro Series*',
    'A bola de wall ball da linha de competição: costura reforçada e peso que não desanda no meio do WOD.',
    '',
    '✅ Costura reforçada — aguenta arremesso repetido na parede',
    '✅ Enchimento firme, sem deformar com o uso',
    '✅ Superfície com pegada mesmo com a mão suada',
    '✅ Garantia de 1 ano',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(bolas, false),
  ].join('\n');
}

function mensagemMedBallColorida(bolas) {
  return [
    '🎨 *Med Ball Colorida — Peso por Cor*',
    'Cada peso tem sua cor: o aluno pega a bola certa de longe, sem parar o treino para conferir.',
    '',
    '✅ Cor por peso — organiza a aula e agiliza a troca',
    '✅ Costura reforçada para arremesso na parede',
    '✅ Enchimento firme, sem deformar com o uso',
    '✅ Garantia de 1 ano',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(bolas, true),
  ].join('\n');
}

const ERGO_ALIASES = ['esteira', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'];

/* Primeira foto utilizavel entre os produtos de uma familia. So serve link que
   o WhatsApp/BotConversa consegue baixar — o Google Drive bloqueia. */
const primeiraFoto = (...produtos) => produtos
  .flatMap((p) => p?.fotos || [])
  .find((u) => u && !/drive\.google\.com/.test(u)) || '';

async function montarItens() {
  const catalogo = await loadCatalog();
  const por = Object.fromEntries(catalogo.map((p) => [p.alias, p]));
  const itens = [];

  for (const alias of ERGO_ALIASES) {
      const p = por[alias];
      if (!p) continue;
      itens.push({ id: alias, titulo: `${p.emoji} ${p.nome}`, texto: mensagemErgo(p), video: p.video || '' });
  }

  if (por.sledimp) {
      itens.push({
        id: 'sledimp', titulo: '🛷 Sled Importado 50kg',
        texto: mensagemSledImportado(por.sledimp),
        video: por.sledimp.video || '',
      });
  }
  if (por.slednac) {
      itens.push({
        id: 'slednac', titulo: '🛷 Sled Nacional 25kg',
        texto: mensagemSledNacional(por.slednac),
        video: por.slednac.video || '',
      });
  }
  if (por.turf || por.turflanes) {
      itens.push({
        id: 'turf', titulo: '🏟️ Turf Oficial de Competição',
        texto: mensagemTurf(por.turf, por.turflanes, por.turfbase),
        video: por.turflanes?.video || por.turf?.video || '',
      });
  }
  if (por.gramp10 || por.gramp16) {
      itens.push({
        id: 'grama', titulo: '🌱 Grama Premium',
        texto: mensagemGrama(por.gramp10, por.gramp16),
        video: por.gramp10?.video || por.gramp16?.video || '',
      });
  }
  if (por.c10imp || por.c15imp || por.c10cinza || por.c15cinza) {
      itens.push({
        id: 'corda', titulo: '🪢 Corda para Sled (Tech Rope)',
        texto: mensagemCorda(por.c10imp, por.c15imp, por.c10cinza, por.c15cinza),
        video: por.c15imp?.video || por.c10imp?.video || '',
        /* A mensagem vende as duas cores — mandar so uma foto deixaria o
           cliente escolhendo no escuro. Cinza (Oficial) primeiro por ser a
           premium; a preta logo depois. */
        fotos: [primeiraFoto(por.c15cinza, por.c10cinza), primeiraFoto(por.c15imp, por.c10imp)].filter(Boolean),
      });
  }
  /* Med balls vem do catalogo geral, nao do combo — busca em paralelo para
     nao somar duas idas ao banco no tempo de resposta do painel. */
  const [medPro, medCor] = await Promise.all([buscarPorSku(MEDBALL_PRO), buscarPorSku(MEDBALL_COR)]);
  if (medPro.length) {
      itens.push({
        id: 'medballpro', titulo: '🏐 Medicine Ball Pro Series',
        texto: mensagemMedBallPro(medPro),
        video: '',
        fotos: medPro.map((b) => b.url_imagem).filter(Boolean).slice(0, 2),
      });
  }
  if (medCor.length) {
      itens.push({
        id: 'medballcor', titulo: '🎨 Med Ball Colorida',
        texto: mensagemMedBallColorida(medCor),
        video: '',
        fotos: medCor.map((b) => b.url_imagem).filter(Boolean).slice(0, 2),
      });
  }
  if (por.hy10p || por.hy20p || por.hy30p) {
      itens.push({
        id: 'sandbag', titulo: '🎒 Sandbag Hybrid Pro Series',
        texto: mensagemSandbag(por.hy10p, por.hy20p, por.hy30p),
        video: por.hy20p?.video || por.hy10p?.video || por.hy30p?.video || '',
        foto: primeiraFoto(por.hy20p, por.hy10p, por.hy30p),
      });
  }

  /* Anexo do envio: o video quando existe, senao a(s) foto(s) do produto.
     Produto sem video (as sandbags, por ora) ia so com texto — e a imagem faz
     o cliente ver o que esta comprando. `video` continua separado porque o
     painel instalado baixa esse campo assumindo .mp4; `midia` idem, para as
     versoes do painel anteriores a esta. */
  for (const item of itens) {
    item.midias = item.video ? [item.video] : (item.fotos || [item.foto]).filter(Boolean);
    item.midia = item.midias[0] || '';
  }

  return itens;
}

export async function produtosFss(req, res) {
  try {
    const itens = await montarItens();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ ok: true, itens, rapidas: RAPIDAS });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

/* enviarProdutoCliente — POST /api/bling?acao=enviar_produto_cliente
   body: { telefone, id }  (id de um item de montarItens)

   Manda o video e o texto do produto direto no WhatsApp do cliente via
   BotConversa — o caminho "zero toque" da central mobile. So funciona para
   conversas do numero BotConversa (FSS tem numero proprio) e dentro da janela
   de 24h da Meta; fora dela o erro do BotConversa e repassado. */
export async function enviarProdutoCliente(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const apiKey = process.env.BOTCONVERSA_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'BOTCONVERSA_API_KEY não configurada na Vercel.' });

    const { telefone, id } = req.body || {};
    const tel = telefoneWhatsappBR(telefone);
    if (!tel || tel.length < 12) return res.status(400).json({ ok: false, error: 'Telefone inválido.' });

    const item = (await montarItens()).find((i) => i.id === id);
    if (!item) return res.status(404).json({ ok: false, error: `Produto "${id}" não encontrado.` });

    /* Envio manual: o consultor conferiu o numero na tela, entao criamos o
       contato se nao existir — mesmo criterio do envio manual de proposta. */
    let subscriberId = null;
    const busca = await bcFetch(`/subscriber/get_by_phone/+${tel}/`, 'GET', null, apiKey);
    if (busca.ok) subscriberId = busca.json?.id ?? null;
    if (!subscriberId) {
      const criado = await bcFetch('/subscriber/', 'POST', {
        phone: `+${tel}`, first_name: 'Cliente', last_name: 'BRAVE',
      }, apiKey);
      subscriberId = criado.json?.id ?? null;
      if (!subscriberId) {
        return res.status(502).json({ ok: false, error: `Falha ao criar contato no BotConversa: ${criado.texto.slice(0, 200)}` });
      }
  }

    const enviar = (body) => bcFetch(`/subscriber/${subscriberId}/send_message/`, 'POST', body, apiKey);

    /* Midia primeiro, texto por ultimo — o texto (com precos) fica visivel na
       conversa. Midia e o video; nao havendo, a foto do produto. */
    for (const midia of item.midias || []) {
      const rv = await enviar({ type: 'file', value: midia });
      if (!rv.ok) {
        return res.status(502).json({ ok: false, error: `BotConversa recusou a mídia (HTTP ${rv.status}): ${rv.texto.slice(0, 250)}` });
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    const rt = await enviar({ type: 'text', value: item.texto });
    if (!rt.ok) {
      return res.status(502).json({ ok: false, error: `A mídia foi, mas o texto falhou (HTTP ${rt.status}): ${rt.texto.slice(0, 250)}` });
    }

    console.log('[fss-produtos] envio BotConversa:', { id, tel, midias: (item.midias || []).length });
    return res.status(200).json({ ok: true, id, midias: (item.midias || []).length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// api/_fss-produtos.js — mensagens prontas de produtos para o painel do FSS.
// Monta texto WhatsApp + video de cada produto a partir do catalogo do banco
// (loadCatalog: 6 ergometros + curados de combo_produtos). Os textos ficam aqui,
// e nao no userscript, para que preco/caracteristicas editados no admin valham
// na hora, sem reinstalar o script no Tampermonkey.

import { loadCatalog } from './_ergo-fetch.js';
import { bcFetch } from './_proposta-pdf.js';

/* Mensagens de inicio de conversa — mesma fonte para o userscript do PC e a
   central mobile (/enviar). */
export const RAPIDAS = [
  {
    id: 'abertura', titulo: '👋 Abertura',
    texto: 'Aqui é o Léo Berg da BRAVE, tudo bem? Quais equipamentos você busca?',
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

/* Remo e SkiErg sao estacoes oficiais de prova do HYROX — argumento de venda
   mais forte que o subtitle generico do catalogo (que segue valendo nas LPs).
   Cada um com angulo diferente para nao soar repetido na mesma conversa. */
const HYROX = {
  remo: {
    subtitle: 'O ergômetro oficial das provas de HYROX e do Cross Training — pronto para transformar suas aulas de endurance.',
    bullet: 'Estação oficial de prova do HYROX — treine seus alunos no equipamento da competição',
  },
  skierg: {
    subtitle: 'O simulador de esqui das provas de HYROX — o mais resistente e inovador do mercado.',
    bullet: 'Estação oficial de prova do HYROX — a modalidade que mais cresce no mundo',
  },
};

function mensagemErgo(p) {
  const hy = HYROX[p.alias];
  let specs = (p.specs || []).filter(Boolean);
  if (hy) {
    // O bullet HYROX substitui o de Cross Training (que ja fica implicito no subtitle)
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
    '🛷 *Sled Importado — Medidas Oficiais HYROX 50kg*',
    'Push e Pull: as estações 2 e 3 da prova, dentro do seu box.',
    '',
    '✅ Medidas oficiais de competição HYROX',
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
    '🛷 *Sled Nacional — Medidas Oficiais HYROX 25kg*',
    'O sled da prova em versão nacional — mesma pegada, preço mais acessível.',
    '',
    '✅ Medidas oficiais de competição HYROX',
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
    '🏟️ *TURF Oficial — Piso Oficial HYROX*',
    'O mesmo piso que o atleta encontra na prova: seu box pronto para treinos de sled, lunges e carries.',
    '',
    '✅ O mesmo piso das provas oficiais de HYROX',
    "✅ Ideal para sled push/pull, lunges e farmer's carry",
    '✅ Transforma qualquer corredor em estação de treino',
  ];
  if (cheio) l.push('', `📏 *16,5m x 2m* — ${linhaPreco(cheio.preco_avista, cheio.preco)}`);
  if (lanes) l.push(`📏 *12,5m x 2m (lanes centrais)* — ${linhaPreco(lanes.preco_avista, lanes.preco)}`);
  if (base)  l.push(`➕ Opcional: *Base do atleta 1,8m x 2m* — ${fmtBR(base.preco_avista)} à vista`);
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

const ERGO_ALIASES = ['esteira', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'];

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
        id: 'turf', titulo: '🏟️ Turf Oficial HYROX',
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
    let tel = String(telefone || '').replace(/\D/g, '');
    if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
    if (tel.length < 12) return res.status(400).json({ ok: false, error: 'Telefone inválido.' });

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

    // Video primeiro, texto por ultimo — o texto (com precos) fica visivel na conversa.
    if (item.video) {
      const rv = await enviar({ type: 'file', value: item.video });
      if (!rv.ok) {
        return res.status(502).json({ ok: false, error: `BotConversa recusou o vídeo (HTTP ${rv.status}): ${rv.texto.slice(0, 250)}` });
      }
      await new Promise((r) => setTimeout(r, 700));
  }
    const rt = await enviar({ type: 'text', value: item.texto });
    if (!rt.ok) {
      return res.status(502).json({ ok: false, error: `Vídeo foi, mas o texto falhou (HTTP ${rt.status}): ${rt.texto.slice(0, 250)}` });
  }

    console.log('[fss-produtos] envio BotConversa:', { id, tel, video: !!item.video });
    return res.status(200).json({ ok: true, id, video: !!item.video });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

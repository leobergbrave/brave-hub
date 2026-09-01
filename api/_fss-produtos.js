// api/_fss-produtos.js — mensagens prontas de produtos para o painel do FSS.
// Monta texto WhatsApp + video de cada produto a partir do catalogo do banco
// (loadCatalog: 6 ergometros + curados de combo_produtos). Os textos ficam aqui,
// e nao no userscript, para que preco/caracteristicas editados no admin valham
// na hora, sem reinstalar o script no Tampermonkey.

import { loadCatalog } from './_ergo-fetch.js';

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

// Familias com variacoes (importado/nacional, metragens): uma mensagem so,
// apresentando o produto e listando as opcoes com preco ao final.
function mensagemSled(imp, nac) {
  const l = [
    '🛷 *Sled Brave — Medidas Oficiais HYROX*',
    'Push e Pull: as estações 2 e 3 da prova, dentro do seu box.',
    '',
    '✅ Medidas oficiais de competição HYROX',
    '✅ Serve para empurrar e puxar — 2 estações em 1',
    '✅ Tubos removíveis para transporte fácil',
    '✅ Compatível com anilhas para carga extra',
    '✅ Adaptável ao Turf',
  ];
  if (imp) l.push('', '🏆 *Importado 50kg* — tubo central inox e grip nos tubos', linhaPreco(imp.preco_avista, imp.preco));
  if (nac) l.push('', '🇧🇷 *Nacional 25kg* — pintura eletrostática (fabricação em 20 dias)', linhaPreco(nac.preco_avista, nac.preco));
  return l.join('\n');
}

function mensagemTurf(cheio, lanes, base) {
  const l = [
    '🏟️ *TURF Oficial 16mm — Piso Oficial HYROX*',
    'O mesmo piso que o atleta encontra na prova: seu box pronto para treinos de sled, lunges e carries.',
    '',
    '✅ Piso oficial das provas de HYROX',
    '✅ 16mm de espessura — atrito real de competição',
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

export async function produtosFss(req, res) {
  try {
    const catalogo = await loadCatalog();
    const por = Object.fromEntries(catalogo.map((p) => [p.alias, p]));
    const itens = [];

    for (const alias of ERGO_ALIASES) {
      const p = por[alias];
      if (!p) continue;
      itens.push({ id: alias, titulo: `${p.emoji} ${p.nome}`, texto: mensagemErgo(p), video: p.video || '' });
    }

    if (por.sledimp || por.slednac) {
      itens.push({
        id: 'sled', titulo: '🛷 Sled (importado e nacional)',
        texto: mensagemSled(por.sledimp, por.slednac),
        video: por.sledimp?.video || por.slednac?.video || '',
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

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ ok: true, itens });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

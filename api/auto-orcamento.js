import { createClient } from '@supabase/supabase-js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Orçamento Automático
   POST /api/auto-orcamento
   
   Recebe dados do BotConversa, gera orçamento
   e retorna link pronto para o cliente.
   ═══════════════════════════════════════════════ */

// ── Alias → nome do produto no banco ──
const PRODUCT_ALIASES = {
  remo: 'Remo Indoor Profissional',
  esteira: 'Esteira Curva Brave 2.0',
  esteiracurva: 'Esteira Curva Brave 2.0',
  skierg: 'SkiErg com Plataforma',
  ski: 'SkiErg com Plataforma',
  bikeerg: 'Bike Erg Brave',
  bike: 'Bike Erg Brave',
  stormbike: 'STORM Bike Brave',
  storm: 'STORM Bike Brave',
  escada: 'Escada Ergométrica - Painel de LED + Botões',
};

// ── CEP → Estado/Zona mapping ──
const ESTADO_ZONA_MAP = {
  AC: 'CAPITAL', AL: 'CAPITAL', AP: 'CAPITAL', AM: 'CAPITAL',
  BA: 'CAPITAL', CE: 'CAPITAL', DF: 'CAPITAL', ES: 'CAPITAL',
  GO: 'CAPITAL', MA: 'CAPITAL', MT: 'CAPITAL', MS: 'CAPITAL',
  MG: 'CAPITAL', PA: 'CAPITAL', PB: 'CAPITAL', PR: 'CAPITAL',
  PE: 'CAPITAL', PI: 'CAPITAL', RJ: 'CAPITAL', RN: 'CAPITAL',
  RS: 'CAPITAL', RO: 'CAPITAL', RR: 'CAPITAL', SC: 'CAPITAL',
  SP: 'CAPITAL', SE: 'CAPITAL', TO: 'CAPITAL',
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { cep, nome, telefone, consultor, produtos, desconto_avista, desconto_cartao, parcelas } = req.body;

    // ── Validações ──
    if (!cep || !produtos || !Array.isArray(produtos) || produtos.length === 0) {
      return res.status(400).json({
        error: 'Campos obrigatórios: cep, produtos (array)',
        exemplo: {
          cep: '01310100',
          nome: 'João Silva',
          telefone: '11999999999',
          produtos: [{ alias: 'skierg', quantidade: 1 }]
        }
      });
    }

    // ── Supabase client ──
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Configuração do Supabase ausente' });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Resolver CEP → Estado/Zona ──
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      return res.status(400).json({ error: 'CEP inválido. Envie 8 dígitos.' });
    }

    let estado = '';
    let zona = 'CAPITAL'; // default
    try {
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const viaCepData = await viaCepRes.json();
      if (viaCepData.erro) {
        return res.status(400).json({ error: 'CEP não encontrado' });
      }
      estado = viaCepData.uf;

      // Tentar detectar zona mais adequada
      // Se a localidade é a capital do estado, usa CAPITAL; senão, INTERIOR 1
      const capitais = {
        AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus',
        BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória',
        GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
        MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba',
        PE: 'Recife', PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal',
        RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis',
        SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
      };
      const capital = capitais[estado];
      if (capital && viaCepData.localidade && viaCepData.localidade.toLowerCase() !== capital.toLowerCase()) {
        zona = 'INTERIOR 1';
      }
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao consultar ViaCEP: ' + err.message });
    }

    // ── 2. Buscar regra de frete ──
    let regraFrete = null;
    // Tentar zona exata, depois fallback para CAPITAL
    const { data: regraExata } = await supabase.from('regras_frete')
      .select('multiplicador, valor_minimo')
      .eq('estado', estado).eq('zona', zona).single();

    if (regraExata) {
      regraFrete = regraExata;
    } else {
      const { data: regraFallback } = await supabase.from('regras_frete')
        .select('multiplicador, valor_minimo')
        .eq('estado', estado).limit(1).single();
      if (regraFallback) {
        regraFrete = regraFallback;
      }
    }

    // ── 3. Resolver produtos (alias → dados do banco) ──
    const { data: allProducts } = await supabase.from('produtos')
      .select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem');

    if (!allProducts || allProducts.length === 0) {
      return res.status(500).json({ error: 'Nenhum produto encontrado no banco' });
    }

    const itensResolvidos = [];
    const errosResolucao = [];

    for (const item of produtos) {
      const alias = (item.alias || item.nome || item.sku || '').toLowerCase().trim();
      const quantidade = parseInt(item.quantidade) || 1;

      // 1. Tentar alias direto
      const nomeMapeado = PRODUCT_ALIASES[alias.replace(/[\s_-]/g, '')];

      // 2. Buscar no banco
      let prodDb = null;
      if (nomeMapeado) {
        prodDb = allProducts.find(p => p.nome.toLowerCase() === nomeMapeado.toLowerCase());
      }

      // 3. Fuzzy match se não encontrou por alias
      if (!prodDb) {
        // Tentar por nome parcial
        prodDb = allProducts.find(p => p.nome.toLowerCase().includes(alias)) ||
                 allProducts.find(p => alias.includes(p.nome.toLowerCase())) ||
                 allProducts.find(p => {
                   const aliasClean = alias.replace(/[^a-z0-9]/g, '');
                   const nomeClean = p.nome.toLowerCase().replace(/[^a-z0-9]/g, '');
                   return nomeClean.includes(aliasClean) || aliasClean.includes(nomeClean);
                 });
      }

      // 4. Tentar por SKU
      if (!prodDb) {
        prodDb = allProducts.find(p => p.codigo_sku && p.codigo_sku.toLowerCase() === alias);
      }

      if (prodDb) {
        itensResolvidos.push({
          id: prodDb.id,
          nome: prodDb.nome,
          preco: prodDb.preco,
          preco_avista: prodDb.preco_avista || null,
          preco_prazo: prodDb.preco_prazo || null,
          peso_kg: prodDb.peso_kg || 0,
          url_imagem: prodDb.url_imagem || '',
          codigo_sku: prodDb.codigo_sku || '',
          quantidade,
          descontoAvistaItem: 0,
          descontoCartaoItem: 0,
        });
      } else {
        errosResolucao.push({ alias, motivo: 'Produto não encontrado no banco' });
      }
    }

    if (itensResolvidos.length === 0) {
      return res.status(400).json({
        error: 'Nenhum produto pôde ser resolvido',
        erros: errosResolucao,
        aliases_disponiveis: Object.keys(PRODUCT_ALIASES),
      });
    }

    // ── 4. Calcular frete ──
    const pesoTotal = itensResolvidos.reduce((acc, i) => acc + (i.peso_kg || 0) * i.quantidade, 0);
    let frete = 0;
    if (regraFrete) {
      const pesoArredondado = Math.floor(pesoTotal);
      const fretePorPeso = pesoArredondado * (regraFrete.multiplicador || 0);
      frete = Math.max(fretePorPeso, regraFrete.valor_minimo || 0);
    }

    // ── 5. Calcular subtotal ──
    const subtotal = itensResolvidos.reduce((acc, i) => acc + i.preco * i.quantidade, 0);

    // ── 6. Montar payload e salvar ──
    const descAvista = desconto_avista ?? 0;
    const descCartao = desconto_cartao ?? 0;
    const numParcelas = parcelas ?? 12;

    const nomeCliente = nome || 'Lead WhatsApp';
    const slugBase = nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slugId = Math.random().toString(36).substring(2, 8);
    const slug = `${slugBase}-${slugId}`;

    const payload = {
      itens: itensResolvidos,
      estado,
      zona,
      telefoneCliente: telefone || '',
      condicoes: {
        descontoAvista: descAvista,
        descontoCartao: descCartao,
        parcelas: numParcelas,
        personalizarPorProduto: false,
      },
    };

    const { error: insertError } = await supabase.from('orcamentos_salvos').insert({
      slug,
      cliente: nomeCliente,
      consultor: consultor || 'Léo Berg',
      payload,
    });

    if (insertError) {
      return res.status(500).json({ error: 'Erro ao salvar orçamento: ' + insertError.message });
    }

    // ── 7. Calcular totais para resposta ──
    const totalAvista = itensResolvidos.reduce((acc, i) => {
      const precoUnit = i.preco_avista ?? (i.preco * (1 - descAvista / 100));
      return acc + precoUnit * i.quantidade;
    }, 0) + frete;

    const totalCartao = itensResolvidos.reduce((acc, i) => {
      const precoUnit = i.preco_prazo ?? (i.preco * (1 + descCartao / 100));
      return acc + precoUnit * i.quantidade;
    }, 0) + frete;

    // ── 8. Responder ──
    const baseUrl = req.headers['x-forwarded-host']
      ? `https://${req.headers['x-forwarded-host']}`
      : req.headers.host
        ? `https://${req.headers.host}`
        : 'https://brave-hub-two.vercel.app';

    const link = `${baseUrl}/orcamento/${slug}`;

    return res.status(200).json({
      sucesso: true,
      link,
      slug,
      dados: {
        cliente: nomeCliente,
        estado,
        zona,
        peso_total_kg: pesoTotal,
        subtotal_equipamentos: subtotal,
        frete,
        total_avista: Math.round(totalAvista * 100) / 100,
        total_cartao: Math.round(totalCartao * 100) / 100,
        parcela_cartao: Math.round((totalCartao / numParcelas) * 100) / 100,
        itens_resolvidos: itensResolvidos.length,
        itens_com_erro: errosResolucao.length,
      },
      erros: errosResolucao.length > 0 ? errosResolucao : undefined,
    });

  } catch (err) {
    console.error('Erro na API auto-orcamento:', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

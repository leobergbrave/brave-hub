import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  MapPin, Loader2, Truck, Package, CreditCard, Banknote,
  ChevronRight, Sparkles, Shield, CheckCircle2, Weight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════
   ORÇAMENTO RÁPIDO — Página self-service para leads do WhatsApp
   URL: /orcamento-rapido/:aliases?nome=Fulano
   Suporta múltiplos produtos: /orcamento-rapido/remo,esteira,skierg
   ═══════════════════════════════════════════════ */

const LOGO_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/brave_logo.png';

const PRODUCT_ALIASES = {
  remo: 'Remo Indoor Profissional',
  esteira: 'Esteira Curva Brave 2.0',
  skierg: 'SkiErg com Plataforma',
  bikeerg: 'Bike Erg Brave',
  bike: 'Bike Erg Brave',
  stormbike: 'STORM Bike Brave',
  storm: 'STORM Bike Brave',
};

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function OrcamentoRapidoPage() {
  const { alias, codigo } = useParams(); // alias for /orcamento-rapido/:alias, codigo for /q/:codigo
  const [searchParams] = useSearchParams();
  const nomeUrlParam = searchParams.get('nome') || '';
  const produtosParam = searchParams.get('produtos') || '';

  // ── States ──
  const [nomeUrl, setNomeUrl] = useState(nomeUrlParam);
  const [produtos, setProdutos] = useState([]); // array of products
  const [quantidades, setQuantidades] = useState({}); // { productId: qty }
  const [regras, setRegras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [cep, setCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepInfo, setCepInfo] = useState(null);
  const [estado, setEstado] = useState('');
  const [zona, setZona] = useState('');

  const [orcamentoGerado, setOrcamentoGerado] = useState(false);
  const [linkGerado, setLinkGerado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modoPagamento, setModoPagamento] = useState('avista');

  // ── Fuzzy match a search term against a product name ──
  function matchScore(termo, nomeProduto) {
    const t = termo.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = nomeProduto.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PRODUCT_ALIASES[t] && PRODUCT_ALIASES[t].toLowerCase() === nomeProduto.toLowerCase()) return 100;
    if (n.includes(t) || t.includes(n)) return 80;
    const tWords = termo.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const nWords = nomeProduto.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let overlap = 0;
    for (const tw of tWords) {
      if (nWords.some(nw => nw.includes(tw) || tw.includes(nw))) overlap++;
    }
    if (tWords.length > 0 && overlap > 0) return 20 + (overlap / tWords.length) * 40;
    return 0;
  }

  // ── Resolve search terms into DB products ──
  function resolveProducts(termos, allProds) {
    const prodsEncontrados = [];
    const qtds = {};
    for (const termo of termos) {
      const aliasClean = termo.toLowerCase().replace(/[\s_-]/g, '');
      const nomeAlias = PRODUCT_ALIASES[aliasClean];
      let bestProd = null;

      if (nomeAlias) {
        bestProd = allProds.find(p => p.nome.toLowerCase().includes(nomeAlias.toLowerCase()));
      }

      if (!bestProd) {
        let bestScore = 0;
        for (const p of allProds) {
          const score = matchScore(termo, p.nome);
          if (score > bestScore) { bestScore = score; bestProd = p; }
        }
        if (bestScore < 20) bestProd = null;
      }

      if (bestProd && !prodsEncontrados.find(p => p.id === bestProd.id)) {
        prodsEncontrados.push(bestProd);
        qtds[bestProd.id] = 1;
      }
    }
    return { prodsEncontrados, qtds };
  }

  // ── Load products + freight rules ──
  useEffect(() => {
    async function load() {
      try {
        // Step 1: Determine product terms
        let termos = [];

        if (codigo) {
          // /q/:codigo — fetch from links_rapidos table
          const { data: linkData, error: linkError } = await supabase
            .from('links_rapidos')
            .select('produtos_texto, nome_lead')
            .eq('codigo', codigo)
            .single();

          if (linkError || !linkData) {
            setErro('Link não encontrado ou expirado.');
            setLoading(false);
            return;
          }

          termos = linkData.produtos_texto.split(',').map(t => t.trim()).filter(Boolean);
          if (linkData.nome_lead) setNomeUrl(linkData.nome_lead);
        } else {
          // /orcamento-rapido/:alias or ?produtos=
          const raw = produtosParam || alias || '';
          termos = raw.split(',').map(t => t.trim()).filter(Boolean);
        }

        if (termos.length === 0) {
          setErro('Nenhum produto informado. Verifique o link.');
          setLoading(false);
          return;
        }

        // Step 2: Fetch all products + freight rules
        const [{ data: allProds }, { data: freteData }] = await Promise.all([
          supabase.from('produtos').select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem'),
          supabase.from('regras_frete').select('estado, zona, multiplicador, valor_minimo').order('estado, zona'),
        ]);

        if (!allProds || allProds.length === 0) {
          setErro('Catálogo vazio.');
          setLoading(false);
          return;
        }

        // Step 3: Resolve terms into products
        const { prodsEncontrados, qtds } = resolveProducts(termos, allProds);

        if (prodsEncontrados.length === 0) {
          setErro('Produtos não encontrados no catálogo.');
          setLoading(false);
          return;
        }

        setProdutos(prodsEncontrados);
        setQuantidades(qtds);
        setRegras(freteData || []);
      } catch (err) {
        console.error(err);
        setErro('Erro ao carregar os produtos.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [codigo, alias, produtosParam]);

  // ── Quantity updater ──
  const updateQtd = useCallback((id, delta) => {
    setQuantidades(prev => ({ ...prev, [id]: Math.max(1, (prev[id] || 1) + delta) }));
  }, []);

  // ── CEP lookup ──
  const buscarCep = useCallback(async (cepValue) => {
    const cepLimpo = cepValue.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepInfo(null);
        setEstado('');
        setZona('');
        return;
      }

      setCepInfo(data);
      setEstado(data.uf);

      const capitais = {
        AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus',
        BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória',
        GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
        MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba',
        PE: 'Recife', PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal',
        RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis',
        SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
      };
      const capital = capitais[data.uf];
      const isCapital = capital && data.localidade && data.localidade.toLowerCase() === capital.toLowerCase();
      const zonaDetectada = isCapital ? 'CAPITAL' : 'INTERIOR 1';

      const regraExata = regras.find(r => r.estado === data.uf && r.zona === zonaDetectada);
      if (regraExata) {
        setZona(zonaDetectada);
      } else {
        const regraFallback = regras.find(r => r.estado === data.uf);
        setZona(regraFallback?.zona || 'CAPITAL');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBuscandoCep(false);
    }
  }, [regras]);

  // ── Derived calculations ──
  const regraFrete = useMemo(
    () => regras.find(r => r.estado === estado && r.zona === zona) || null,
    [regras, estado, zona]
  );

  const pesoTotal = useMemo(
    () => produtos.reduce((acc, p) => acc + (p.peso_kg || 0) * (quantidades[p.id] || 1), 0),
    [produtos, quantidades]
  );

  const frete = useMemo(() => {
    if (!regraFrete) return 0;
    const pesoArredondado = Math.floor(pesoTotal);
    const fretePorPeso = pesoArredondado * (regraFrete.multiplicador || 0);
    return Math.max(fretePorPeso, regraFrete.valor_minimo || 0);
  }, [regraFrete, pesoTotal]);

  const precoAvista = useMemo(() => {
    return produtos.reduce((acc, p) => {
      const precoUnit = p.preco_avista ?? p.preco;
      return acc + precoUnit * (quantidades[p.id] || 1);
    }, 0) + frete;
  }, [produtos, quantidades, frete]);

  const precoPrazo = useMemo(() => {
    return produtos.reduce((acc, p) => {
      const precoUnit = p.preco_prazo ?? p.preco;
      return acc + precoUnit * (quantidades[p.id] || 1);
    }, 0) + frete;
  }, [produtos, quantidades, frete]);

  const economia = precoPrazo - precoAvista;
  const totalModo = modoPagamento === 'avista' ? precoAvista : precoPrazo;

  // ── Generate quote ──
  const handleGerarOrcamento = useCallback(async () => {
    if (produtos.length === 0 || !estado || salvando) return;
    setSalvando(true);

    try {
      const nomeCliente = nomeUrl || 'Lead WhatsApp';
      const slugBase = nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugId = Math.random().toString(36).substring(2, 8);
      const slug = `${slugBase}-${slugId}`;

      const payload = {
        itens: produtos.map(p => ({
          id: p.id,
          nome: p.nome,
          preco: p.preco,
          preco_avista: p.preco_avista || null,
          preco_prazo: p.preco_prazo || null,
          peso_kg: p.peso_kg || 0,
          url_imagem: p.url_imagem || '',
          codigo_sku: p.codigo_sku || '',
          quantidade: quantidades[p.id] || 1,
          descontoAvistaItem: 0,
          descontoCartaoItem: 0,
        })),
        estado,
        zona,
        telefoneCliente: '',
        condicoes: {
          descontoAvista: 0,
          descontoCartao: 0,
          parcelas: 12,
          personalizarPorProduto: false,
        },
      };

      const { error } = await supabase.from('orcamentos_salvos').insert({
        slug,
        cliente: nomeCliente,
        consultor: 'Léo Berg',
        payload,
      });

      if (error) throw error;

      setLinkGerado(`${window.location.origin}/orcamento/${slug}`);
      setOrcamentoGerado(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSalvando(false);
    }
  }, [produtos, quantidades, estado, zona, nomeUrl, salvando]);

  // ── Auto-gerar quando CEP é validado ──
  useEffect(() => {
    if (cepInfo && estado && zona && produtos.length > 0 && !orcamentoGerado && !salvando) {
      handleGerarOrcamento();
    }
  }, [cepInfo, estado, zona, produtos, orcamentoGerado]);

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon animate-spin" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Ops!</h1>
          <p className="text-zinc-400">{erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-neon/5 rounded-full blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 text-center pt-10 pb-6 px-6">
        <img src={LOGO_URL} alt="Brave" className="h-14 mx-auto mb-4 drop-shadow-lg" onError={e => e.target.style.display = 'none'} />
        {nomeUrl && (
          <h1 className="text-2xl md:text-3xl font-black text-white">
            Olá, <span className="text-neon">{nomeUrl}</span>! 👋
          </h1>
        )}
        <p className="text-zinc-400 text-sm mt-2">
          {produtos.length === 1 ? 'Seu orçamento personalizado está a um passo' : `${produtos.length} equipamentos selecionados para você`}
        </p>
      </header>

      {/* Product Cards */}
      <section className="relative z-10 max-w-lg mx-auto px-6 mb-6 space-y-3">
        {produtos.map(prod => {
          const imgUrl = prod.url_imagem || '';
          const qty = quantidades[prod.id] || 1;
          return (
            <div key={prod.id} className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                {/* Thumbnail */}
                <div className="w-20 h-20 rounded-xl bg-dark-900 flex items-center justify-center overflow-hidden shrink-0">
                  {imgUrl ? (
                    <img src={imgUrl} alt={prod.nome} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Package className="w-6 h-6 text-dark-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{prod.nome}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {prod.peso_kg > 0 && (
                      <span className="text-[10px] text-zinc-500 flex items-center gap-0.5"><Weight className="w-3 h-3" /> {prod.peso_kg}kg</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-base font-black text-neon">{fmt(prod.preco_avista ?? prod.preco)}</span>
                    {prod.preco_avista && prod.preco_avista < prod.preco && (
                      <span className="text-[10px] text-zinc-500 line-through">{fmt(prod.preco)}</span>
                    )}
                  </div>
                </div>

                {/* Quantity */}
                <div className="flex items-center bg-dark-900 rounded-lg border border-dark-600 shrink-0">
                  <button onClick={() => updateQtd(prod.id, -1)} className="px-2.5 py-1.5 text-zinc-400 hover:text-white text-xs font-bold cursor-pointer">−</button>
                  <span className="px-2 py-1.5 text-white font-bold text-xs min-w-[1.5rem] text-center">{qty}</span>
                  <button onClick={() => updateQtd(prod.id, 1)} className="px-2.5 py-1.5 text-zinc-400 hover:text-white text-xs font-bold cursor-pointer">+</button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* CEP Input */}
      {!orcamentoGerado && (
        <section className="relative z-10 max-w-lg mx-auto px-6 mb-8">
          <div className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-accent/10 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-orange-accent" />
              </div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Calcular Frete</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Digite seu CEP para calcularmos o frete e montar seu orçamento completo.</p>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                maxLength={9}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '');
                  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5, 8);
                  setCep(v);
                  if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                }}
                placeholder="00000-000"
                autoFocus
                className="w-full bg-dark-900 border border-dark-600 text-white text-lg font-mono rounded-xl px-4 py-4 focus:outline-none focus:border-neon/50 focus:ring-2 focus:ring-neon/20 transition-all placeholder:text-dark-500 text-center tracking-[0.3em]"
              />
              {buscandoCep && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 text-neon animate-spin" />
                </div>
              )}
            </div>

            {cepInfo && (
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400 animate-fade-in-up">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{cepInfo.localidade}, {cepInfo.uf}</span>
              </div>
            )}

            {cep.replace(/\D/g, '').length === 8 && !buscandoCep && !cepInfo && (
              <p className="mt-3 text-xs text-red-400">CEP não encontrado. Verifique e tente novamente.</p>
            )}
          </div>
        </section>
      )}

      {/* Quote Result */}
      {orcamentoGerado && (
        <section className="relative z-10 max-w-lg mx-auto px-6 pb-12 animate-fade-in-up">
          {/* Payment toggle */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-6 bg-dark-900/50 p-1.5 rounded-2xl border border-dark-700/50">
            <button onClick={() => setModoPagamento('avista')} className={`flex-1 w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${modoPagamento === 'avista' ? 'bg-neon text-dark-950 shadow-lg shadow-neon/20' : 'text-zinc-400 hover:text-white'}`}>
              <Banknote className="w-4 h-4" /> À Vista
            </button>
            <button onClick={() => setModoPagamento('cartao')} className={`flex-1 w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${modoPagamento === 'cartao' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'}`}>
              <CreditCard className="w-4 h-4" /> Cartão 12x
            </button>
          </div>

          {/* Summary Card */}
          <div className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neon" /> Resumo do Investimento
            </h3>

            <div className="space-y-2 text-sm">
              {produtos.map(p => {
                const qty = quantidades[p.id] || 1;
                const precoUnit = modoPagamento === 'avista' ? (p.preco_avista ?? p.preco) : (p.preco_prazo ?? p.preco);
                return (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-zinc-400">{qty}x {p.nome}</span>
                    <span className="text-white font-semibold">{fmt(precoUnit * qty)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-1 border-t border-dark-700/30">
                <span className="text-zinc-400 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Frete ({estado} · {zona})</span>
                <span className="text-orange-accent font-semibold">{fmt(frete)}</span>
              </div>
              {cepInfo && (
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="w-3 h-3" /> {cepInfo.localidade}, {cepInfo.uf}
                </div>
              )}
            </div>

            {/* Total Card */}
            <div className={`rounded-xl p-4 border ${modoPagamento === 'avista' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${modoPagamento === 'avista' ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {modoPagamento === 'avista' ? 'TOTAL À VISTA' : `TOTAL 12x`}
                  </p>
                  <p className="text-[10px] text-zinc-500">{modoPagamento === 'avista' ? 'PIX / Boleto' : 'Cartão de Crédito'}</p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-black ${modoPagamento === 'avista' ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {fmt(totalModo)}
                  </p>
                  {modoPagamento === 'avista' && economia > 0 && (
                    <p className="text-[10px] text-emerald-500">economize {fmt(economia)}</p>
                  )}
                  {modoPagamento === 'cartao' && (
                    <p className="text-[10px] text-blue-400">12x de {fmt(totalModo / 12)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Link button */}
            <a href={linkGerado} className="block w-full text-center mt-2 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-accent/25 hover:scale-[1.02] active:scale-[0.98]">
              Ver Orçamento Completo <ChevronRight className="w-4 h-4 inline" />
            </a>

            {/* Toggle link */}
            <button onClick={() => setModoPagamento(m => m === 'avista' ? 'cartao' : 'avista')} className="w-full text-center text-xs text-zinc-500 hover:text-neon transition-colors mt-1 cursor-pointer">
              {modoPagamento === 'avista' ? 'Ver condições no Cartão →' : '← Ver condição À Vista'}
            </button>
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex items-center justify-center gap-6 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Frete garantido</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Preços oficiais</span>
          </div>
        </section>
      )}

      {/* Loading overlay while saving */}
      {salvando && (
        <div className="fixed inset-0 bg-dark-950/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-neon animate-spin mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Montando seu orçamento...</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  MapPin, Loader2, Truck, Package, CreditCard, Banknote,
  ChevronRight, Sparkles, Shield, CheckCircle2, Weight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════
   ORÇAMENTO RÁPIDO — Página self-service para leads do WhatsApp
   URL: /orcamento-rapido/:alias?nome=Fulano
   ═══════════════════════════════════════════════ */

const LOGO_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/brave_logo.png';

// Alias → nome do produto (busca fuzzy no banco)
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
  const { alias } = useParams();
  const [searchParams] = useSearchParams();
  const nomeUrl = searchParams.get('nome') || '';

  // ── States ──
  const [produto, setProduto] = useState(null);
  const [regras, setRegras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [cep, setCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepInfo, setCepInfo] = useState(null);
  const [estado, setEstado] = useState('');
  const [zona, setZona] = useState('');

  const [quantidade, setQuantidade] = useState(1);
  const [orcamentoGerado, setOrcamentoGerado] = useState(false);
  const [linkGerado, setLinkGerado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modoPagamento, setModoPagamento] = useState('avista');

  // ── Load product + freight rules ──
  useEffect(() => {
    async function load() {
      try {
        const nomeProduto = PRODUCT_ALIASES[(alias || '').toLowerCase().replace(/[\s_-]/g, '')];
        if (!nomeProduto) {
          setErro('Produto não encontrado. Verifique o link.');
          setLoading(false);
          return;
        }

        const [{ data: prods }, { data: freteData }] = await Promise.all([
          supabase.from('produtos').select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem').ilike('nome', `%${nomeProduto}%`),
          supabase.from('regras_frete').select('estado, zona, multiplicador, valor_minimo').order('estado, zona'),
        ]);

        const prod = prods?.find(p => p.nome.toLowerCase().includes(nomeProduto.toLowerCase())) || prods?.[0];
        if (!prod) {
          setErro('Produto não encontrado no catálogo.');
          setLoading(false);
          return;
        }

        setProduto(prod);
        setRegras(freteData || []);
      } catch (err) {
        console.error(err);
        setErro('Erro ao carregar o produto.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [alias]);

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

      // Detect zone
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

      // Check if zone exists in rules, fallback
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

  const pesoTotal = produto ? (produto.peso_kg || 0) * quantidade : 0;

  const frete = useMemo(() => {
    if (!regraFrete) return 0;
    const pesoArredondado = Math.floor(pesoTotal);
    const fretePorPeso = pesoArredondado * (regraFrete.multiplicador || 0);
    return Math.max(fretePorPeso, regraFrete.valor_minimo || 0);
  }, [regraFrete, pesoTotal]);

  const subtotal = produto ? produto.preco * quantidade : 0;

  const precoAvista = useMemo(() => {
    if (!produto) return 0;
    const precoUnit = produto.preco_avista ?? produto.preco;
    return precoUnit * quantidade + frete;
  }, [produto, quantidade, frete]);

  const precoPrazo = useMemo(() => {
    if (!produto) return 0;
    const precoUnit = produto.preco_prazo ?? produto.preco;
    return precoUnit * quantidade + frete;
  }, [produto, quantidade, frete]);

  const economia = precoPrazo - precoAvista;

  // ── Generate quote ──
  const handleGerarOrcamento = useCallback(async () => {
    if (!produto || !estado || salvando) return;
    setSalvando(true);

    try {
      const nomeCliente = nomeUrl || 'Lead WhatsApp';
      const slugBase = nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugId = Math.random().toString(36).substring(2, 8);
      const slug = `${slugBase}-${slugId}`;

      const payload = {
        itens: [{
          id: produto.id,
          nome: produto.nome,
          preco: produto.preco,
          preco_avista: produto.preco_avista || null,
          preco_prazo: produto.preco_prazo || null,
          peso_kg: produto.peso_kg || 0,
          url_imagem: produto.url_imagem || '',
          codigo_sku: produto.codigo_sku || '',
          quantidade,
          descontoAvistaItem: 0,
          descontoCartaoItem: 0,
        }],
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
  }, [produto, estado, zona, quantidade, nomeUrl, salvando]);

  // ── Auto-gerar quando CEP é validado ──
  useEffect(() => {
    if (cepInfo && estado && zona && produto && !orcamentoGerado && !salvando) {
      handleGerarOrcamento();
    }
  }, [cepInfo, estado, zona, produto, orcamentoGerado]);

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

  const imgUrl = produto?.url_imagem || '';
  const totalModo = modoPagamento === 'avista' ? precoAvista : precoPrazo;

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
        <p className="text-zinc-400 text-sm mt-2">Seu orçamento personalizado está a um passo</p>
      </header>

      {/* Product Card */}
      <section className="relative z-10 max-w-lg mx-auto px-6 mb-6">
        <div className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden">
          {imgUrl && (
            <div className="w-full h-48 bg-dark-900 flex items-center justify-center overflow-hidden">
              <img src={imgUrl} alt={produto.nome} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <div className="p-5">
            <h2 className="text-lg font-bold text-white mb-1">{produto.nome}</h2>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              {produto.peso_kg > 0 && (
                <span className="flex items-center gap-1"><Weight className="w-3.5 h-3.5" /> {produto.peso_kg} kg</span>
              )}
              {produto.codigo_sku && (
                <span className="text-xs text-dark-500 font-mono">{produto.codigo_sku}</span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-neon">{fmt(produto.preco_avista ?? produto.preco)}</span>
              {produto.preco_avista && produto.preco_avista < produto.preco && (
                <span className="text-xs text-zinc-500 line-through">{fmt(produto.preco)}</span>
              )}
              <span className="text-xs text-zinc-500">à vista</span>
            </div>

            {/* Quantity */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-zinc-400">Quantidade:</span>
              <div className="flex items-center bg-dark-900 rounded-lg border border-dark-600">
                <button onClick={() => setQuantidade(q => Math.max(1, q - 1))} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm font-bold cursor-pointer">−</button>
                <span className="px-3 py-1.5 text-white font-bold text-sm min-w-[2rem] text-center">{quantidade}</span>
                <button onClick={() => setQuantidade(q => q + 1)} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm font-bold cursor-pointer">+</button>
              </div>
            </div>
          </div>
        </div>
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

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">{quantidade}x {produto.nome}</span>
                <span className="text-white font-semibold">{fmt((modoPagamento === 'avista' ? (produto.preco_avista ?? produto.preco) : (produto.preco_prazo ?? produto.preco)) * quantidade)}</span>
              </div>
              <div className="flex justify-between">
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

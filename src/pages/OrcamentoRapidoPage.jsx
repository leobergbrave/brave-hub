import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  MapPin, Loader2, Truck, Package, CreditCard, Banknote,
  ChevronRight, Sparkles, Shield, CheckCircle2, Weight, FolderOpen, Flame, Tag, Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseMediaUrl } from '../data';
import { TrustBar, InstitutionalFooter } from '../components/BraveCredentials';

/* ═══════════════════════════════════════════════
   ORÇAMENTO RÁPIDO — Página self-service para leads do WhatsApp
   URL: /orcamento-rapido/:aliases?nome=Fulano
   Suporta múltiplos produtos: /orcamento-rapido/remo,esteira,skierg
   ═══════════════════════════════════════════════ */

const LOGO_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/brave_logo.png';

// Mapa de capitais por UF — extraído como constante de módulo para evitar duplicação
const CAPITAIS = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus',
  BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória',
  GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
  MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba',
  PE: 'Recife', PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal',
  RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis',
  SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
};

// Detecta zona (CAPITAL ou INTERIOR 1) dada UF, localidade e regras
function detectarZona(uf, localidade, regrasArr) {
  const capital = CAPITAIS[uf];
  const isCapital = capital && localidade && localidade.toLowerCase() === capital.toLowerCase();
  const zonaDetectada = isCapital ? 'CAPITAL' : 'INTERIOR 1';
  const regraExata = regrasArr.find(r => r.estado === uf && r.zona === zonaDetectada);
  if (regraExata) return zonaDetectada;
  const regraFallback = regrasArr.find(r => r.estado === uf);
  return regraFallback ? regraFallback.zona : null; // null = sem cobertura ainda
}

const PRODUCT_ALIASES = {
  remo: 'Remo Indoor Profissional',
  rower: 'Remo Indoor Profissional',
  esteira: 'Esteira Curva Brave 2.0',
  esteiracurva: 'Esteira Curva Brave 2.0',
  estcv: 'Esteira Curva Brave 2.0',
  skierg: 'SkiErg com Plataforma',
  ski: 'SkiErg com Plataforma',
  bikeerg: 'Bike Erg Brave',
  bike: 'Bike Erg Brave',
  bikerg: 'Bike Erg Brave',
  stormbike: 'STORM Bike Brave',
  storm: 'STORM Bike Brave',
  stmbike: 'STORM Bike Brave',
  escada: 'Escada Ergométrica - Painel de LED + Botões',
  stair: 'Escada Ergométrica - Painel de LED + Botões',
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
  const [estadoLead, setEstadoLead] = useState(searchParams.get('estado') || '');
  const [cidadeLead, setCidadeLead] = useState(searchParams.get('cidade') || '');
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
  const [erroGeracao, setErroGeracao] = useState('');
  const hasGeneratedRef = useRef(false);
  const regrasRef = useRef([]); // Ref para regras sempre atualizadas (evita race condition no buscarCep)

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

      // Check by exact SKU
      if (!bestProd) {
        bestProd = allProds.find(p => p.codigo_sku && p.codigo_sku.toLowerCase() === termo.toLowerCase().trim());
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
            .select('produtos_texto, nome_lead, telefone_lead, aberto, estado_lead, cidade_lead')
            .eq('codigo', codigo)
            .single();

          if (linkError || !linkData) {
            setErro('Link não encontrado ou expirado.');
            setLoading(false);
            return;
          }

          // Marca o link como aberto e registra o timestamp para o gatilho "sem CEP"
          if (!linkData.aberto) {
            await supabase.from('links_rapidos').update({
              aberto: true,
              alerta_abandono_enviado: true,
              abandono_stage: 3,
              proximo_alerta_em: null,
              aberto_em: new Date().toISOString(),
            }).eq('codigo', codigo);

            // Avança o lead para "link_aberto" quando o cliente abre o link
            if (linkData.telefone_lead) {
              const tel = linkData.telefone_lead.replace(/\D/g, '');
              const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
              const telSemDDI = tel.startsWith('55') ? tel.slice(2) : tel;
              await supabase
                .from('leads')
                .update({ status: 'link_aberto' })
                .or(`telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI}`)
                .in('status', ['novo', 'fluxo_disparado', 'respondeu', 'orcamento_gerado']);
            }
          }

          termos = linkData.produtos_texto.split(',').map(t => t.trim()).filter(Boolean);
          if (linkData.nome_lead) setNomeUrl(linkData.nome_lead);
          if (linkData.estado_lead) setEstadoLead(linkData.estado_lead);
          if (linkData.cidade_lead) setCidadeLead(linkData.cidade_lead);
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
        regrasRef.current = freteData || [];
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

      // Marca cep_digitado = true para avançar o lead para 'qualificando' via trigger
      if (codigo) {
        supabase.from('links_rapidos').update({ cep_digitado: true }).eq('codigo', codigo)
          .catch(err => console.error('Erro ao atualizar cep_digitado:', err));
      }

      // Usa regrasRef.current para evitar race condition:
      // se o usuário digitou o CEP antes de regras carregar, o ref já tem o valor mais recente.
      // Se regras ainda estiver vazia, zona fica '' e o useEffect de recuperação abaixo vai
      // recalcular quando regras chegar.
      const zona = detectarZona(data.uf, data.localidade, regrasRef.current);
      if (zona) {
        setZona(zona);
      } else {
        setZona(''); // regras ainda não carregaram — o safety useEffect vai corrigir
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBuscandoCep(false);
    }
  }, [codigo]); // sem 'regras' na dep — usamos regrasRef para evitar stale closure

  // ── Usar localização pré-identificada (sem CEP) ──
  const usarLocalizacaoPreenchida = useCallback((uf, cidade) => {
    const zonaDetectada = detectarZona(uf, cidade, regrasRef.current);
    if (!zonaDetectada) return; // regras ainda não carregaram

    setCepInfo({ localidade: cidade || uf, uf });
    setEstado(uf);
    setZona(zonaDetectada);

    if (codigo) {
      supabase.from('links_rapidos').update({ cep_digitado: true }).eq('codigo', codigo)
        .catch(err => console.error('Erro ao atualizar cep_digitado:', err));
    }
  }, [codigo]); // regras via ref, sem stale closure

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
    if (produtos.length === 0 || !estado || !zona || salvando || hasGeneratedRef.current) return;
    setSalvando(true);
    setErroGeracao('');
    hasGeneratedRef.current = true;

    try {
      const nomeCliente = nomeUrl || 'Lead WhatsApp';
      const slugBase = nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugId = Math.random().toString(36).substring(2, 8);
      const slug = `${slugBase}-${slugId}`;

      // Compute frete at call time usando regrasRef.current (sempre atualizado)
      const pesoAtual = produtos.reduce((acc, p) => acc + (p.peso_kg || 0) * (quantidades[p.id] || 1), 0);
      const regraAtual = regrasRef.current.find(r => r.estado === estado && r.zona === zona);
      const freteAtual = regraAtual
        ? Math.max(Math.floor(pesoAtual) * (regraAtual.multiplicador || 0), regraAtual.valor_minimo || 0)
        : 0;

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
        frete: freteAtual,
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

      if (codigo) {
        supabase.from('links_rapidos').update({ slug_gerado: slug }).eq('codigo', codigo)
          .catch(err => console.error('Erro ao atualizar slug_gerado:', err));
      }

      supabase.functions.invoke('sync-bling-proposal', {
        body: { cliente: nomeCliente, consultor: 'Léo Berg', payload }
      }).catch(err => console.error('Erro ao syncar com Bling:', err));
    } catch (err) {
      console.error('Erro ao gerar orçamento:', err);
      setErroGeracao('Não foi possível gerar seu orçamento no momento. Tente novamente.');
      hasGeneratedRef.current = false;
    } finally {
      setSalvando(false);
    }
  }, [produtos, quantidades, estado, zona, regras, nomeUrl, salvando, codigo]);

  // ── Auto-gerar quando CEP é validado ──
  useEffect(() => {
    if (cepInfo && estado && zona && produtos.length > 0 && !orcamentoGerado && !salvando && !hasGeneratedRef.current) {
      handleGerarOrcamento();
    }
  }, [cepInfo, estado, zona, produtos, orcamentoGerado, salvando, handleGerarOrcamento]);

  // ── Safety: se CEP foi digitado antes das regras carregarem, recalcula zona quando regras chegam ──
  useEffect(() => {
    if (cepInfo && estado && !zona && regras.length > 0 && !orcamentoGerado) {
      const zonaRecuperada = detectarZona(estado, cepInfo.localidade, regras);
      if (zonaRecuperada) setZona(zonaRecuperada);
    }
  }, [regras, cepInfo, estado, zona, orcamentoGerado]);

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

      {/* ── Barra de confiança ── */}
      <TrustBar dark={true} />

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

      {/* Product Cards — Show de Preços */}
      <section className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 mb-6 space-y-4">
        {produtos.map(prod => {
          const qty = quantidades[prod.id] || 1;
          const media = prod.url_imagem ? parseMediaUrl(prod.url_imagem) : null;
          const precoTabela = prod.preco;
          const pAvista = prod.preco_avista ?? prod.preco;
          const pPrazo = prod.preco_prazo ?? prod.preco;
          const descAvista = precoTabela > 0 ? Math.round(((precoTabela - pAvista) / precoTabela) * 100) : 0;
          const descPrazo = precoTabela > 0 ? Math.round(((precoTabela - pPrazo) / precoTabela) * 100) : 0;
          const parcelaMensal = pPrazo / 10;
          const economiaUnit = precoTabela - pAvista;
          const unidsDisp = ((prod.id.charCodeAt(0) || 3) % 4) + 2; // 2-5 pseudo-random
          return (
            <div key={prod.id} className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden relative">
              {/* Selo exclusivo */}
              {descAvista > 0 && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-neon to-emerald-500 text-dark-950 text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl z-10 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> OFERTA EXCLUSIVA
                </div>
              )}

              {/* Header: Image + Name + Qty */}
              <div className="flex items-center gap-4 p-4 pb-2">
                <div className="w-16 h-16 rounded-xl bg-dark-900 flex items-center justify-center overflow-hidden shrink-0">
                  {media && media.type === 'image' ? (
                    <img src={media.url} alt={prod.nome} className="max-h-full max-w-full object-contain" />
                  ) : media && media.type === 'folder' ? (
                    <FolderOpen className="w-6 h-6 text-blue-400" />
                  ) : (
                    <Package className="w-6 h-6 text-dark-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white leading-tight pr-20">{prod.nome}</h3>
                  {prod.peso_kg > 0 && (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 mt-0.5"><Weight className="w-3 h-3" /> {prod.peso_kg}kg</span>
                  )}
                </div>
                <div className="flex items-center bg-dark-900 rounded-lg border border-dark-600 shrink-0">
                  <button onClick={() => updateQtd(prod.id, -1)} className="px-2.5 py-1.5 text-zinc-400 hover:text-white text-xs font-bold cursor-pointer">−</button>
                  <span className="px-2 py-1.5 text-white font-bold text-xs min-w-[1.5rem] text-center">{qty}</span>
                  <button onClick={() => updateQtd(prod.id, 1)} className="px-2.5 py-1.5 text-zinc-400 hover:text-white text-xs font-bold cursor-pointer">+</button>
                </div>
              </div>

              {/* 3 Price Tiers */}
              <div className="px-4 pb-2 space-y-1.5">
                {/* Tier 1: Preço de Tabela */}
                <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-dark-900/50">
                  <span className="text-[11px] text-zinc-600 uppercase tracking-wider font-medium">Preço de tabela</span>
                  <span className="text-sm text-zinc-600 line-through font-medium">{fmt(precoTabela)}</span>
                </div>

                {/* Tier 2: Cartão Parcelado */}
                <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/20">
                    <div>
                      <span className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold flex items-center gap-1"><CreditCard className="w-3 h-3" /> Cartão 10x</span>
                      <p className="text-base font-black text-white mt-0.5">10x {fmt(parcelaMensal)}</p>
                      <p className="text-[10px] text-zinc-500">Total: {fmt(pPrazo)}</p>
                    </div>
                    {descPrazo > 0 && (
                      <span className="text-[10px] font-bold text-amber-950 bg-gradient-to-r from-amber-400 to-yellow-300 px-2.5 py-1 rounded-full shadow-sm shadow-amber-500/20 whitespace-nowrap">
                        {descPrazo}% off
                      </span>
                    )}
                  </div>

                {/* Tier 3: À Vista — Destaque máximo */}
                <div className="relative flex items-center justify-between py-2.5 px-3 rounded-xl border border-neon/30" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04) 0%, rgba(16,185,129,0.06) 100%)' }}>
                    <div>
                      <span className="text-[10px] text-neon/80 uppercase tracking-wider font-semibold flex items-center gap-1"><Banknote className="w-3 h-3" /> À Vista (PIX)</span>
                      <p className="text-lg font-black text-neon mt-0.5">{fmt(pAvista)}</p>
                      {economiaUnit > 0 && <p className="text-[10px] text-emerald-400 font-medium">Economia de {fmt(economiaUnit)}</p>}
                    </div>
                    {descAvista > 0 && (
                      <span className="text-[10px] font-bold text-dark-950 bg-gradient-to-r from-neon to-emerald-400 px-2.5 py-1 rounded-full shadow-lg shadow-neon/25 animate-pulse whitespace-nowrap">
                        {descAvista}% off
                      </span>
                    )}
                  </div>
              </div>

              {/* Urgency Bar */}
              <div className="mx-4 mb-3 mt-1 flex items-center gap-2 py-2 px-3 rounded-xl bg-red-500/[0.05] border border-red-500/15">
                <Flame className="w-3.5 h-3.5 text-red-400 animate-pulse shrink-0" />
                <span className="text-[11px] text-red-400 font-semibold">Apenas {unidsDisp} unidades disponíveis</span>
                <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden ml-auto max-w-[50px]">
                  <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full animate-pulse" style={{ width: `${unidsDisp * 15}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* CEP Input */}
      {!orcamentoGerado && (
        <section className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 mb-8">
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

            {estadoLead && !cepInfo && (
              <div className="mt-4 p-3 bg-dark-900/70 border border-dark-600/50 rounded-xl">
                <p className="text-xs text-zinc-400 mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-neon" />
                  Localização identificada: <span className="text-white font-semibold ml-1">{cidadeLead ? `${cidadeLead}, ${estadoLead}` : estadoLead}</span>
                </p>
                <button
                  onClick={() => usarLocalizacaoPreenchida(estadoLead, cidadeLead)}
                  className="w-full text-xs font-bold text-dark-950 bg-neon hover:bg-neon/90 rounded-lg py-2.5 transition-colors"
                >
                  Usar essa localização →
                </button>
                <p className="text-[10px] text-zinc-600 mt-1.5 text-center">ou digite seu CEP acima para maior precisão no frete</p>
              </div>
            )}

            {erroGeracao && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-xs text-red-400 font-medium text-center">{erroGeracao}</p>
                <button onClick={() => { setErroGeracao(''); handleGerarOrcamento(); }} className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quote Result — Dual Totals */}
      {orcamentoGerado && (
        <section className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 pb-12 animate-fade-in-up">
          <div className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neon" /> Resumo do Investimento
            </h3>

            <div className="space-y-2 text-sm">
              {produtos.map(p => {
                const qty = quantidades[p.id] || 1;
                return (
                  <div key={p.id} className="flex justify-between items-center">
                    <span className="text-zinc-400">{qty}x {p.nome}</span>
                    <span className="text-zinc-600 line-through text-xs">{fmt(p.preco * qty)}</span>
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

            {/* Cartão Total */}
            <div className="rounded-xl p-4 border bg-amber-500/[0.04] border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1"><CreditCard className="w-3 h-3" /> CARTÃO 10x</p>
                  <p className="text-[10px] text-zinc-500">Crédito sem juros</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-white">10x {fmt(precoPrazo / 10)}</p>
                  <p className="text-[10px] text-zinc-500">Total: {fmt(precoPrazo)}</p>
                </div>
              </div>
            </div>

            {/* À Vista Total — Destaque */}
            <div className="rounded-xl p-4 border border-neon/25 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04) 0%, rgba(16,185,129,0.06) 100%)' }}>
              <div className="absolute top-0 right-0 bg-gradient-to-l from-neon to-emerald-500 text-dark-950 text-[9px] font-black px-2.5 py-0.5 rounded-bl-lg flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> MELHOR OFERTA
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neon flex items-center gap-1"><Banknote className="w-3 h-3" /> À VISTA (PIX)</p>
                  {economia > 0 && <p className="text-[10px] text-emerald-400 font-medium">Economia de {fmt(economia)}</p>}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-neon">{fmt(precoAvista)}</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <a href={linkGerado} className="block w-full text-center mt-2 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-accent/25 hover:scale-[1.02] active:scale-[0.98]">
              Ver Orçamento Completo <ChevronRight className="w-4 h-4 inline" />
            </a>

          </div>

          {/* Trust badges */}
          <div className="mt-6 flex items-center justify-center gap-6 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Frete garantido</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Preços oficiais</span>
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Preço exclusivo</span>
          </div>
        </section>
      )}

      {/* ── Rodapé institucional ── */}
      <InstitutionalFooter dark={true} />

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

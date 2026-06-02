import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Shield, Package, Weight,
  Truck, Star, Award, Loader2, X, FolderOpen, CreditCard, Banknote,
  Flame, Zap, CheckCircle2, Building2, ExternalLink,
} from 'lucide-react';
import { fetchProdutos, fetchRegrasFrete, calcularFreteComRegra, parseMediaUrl } from '../data';
import { supabase } from '../lib/supabase';
import { InstitutionalFooter } from '../components/BraveCredentials';

/* ═══════════════════════════════════════════════
   VITRINE DO CLIENTE — Orçamento Final
   ═══════════════════════════════════════════════ */

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function OrcamentoPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [expandedImage, setExpandedImage] = useState(null);

  const [produtosDb, setProdutosDb] = useState([]);
  const [regrasFreteDb, setRegrasFreteDb] = useState([]);
  const [orcamentoSalvo, setOrcamentoSalvo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [qtds, setQtds] = useState({});
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [prods, regras] = await Promise.all([fetchProdutos(), fetchRegrasFrete()]);
        setProdutosDb(prods);
        setRegrasFreteDb(regras);

        if (slug) {
          const { data } = await supabase.from('orcamentos_salvos').select('*').eq('slug', slug).single();
          if (data) {
            setOrcamentoSalvo(data);
            // Dispara webhook de abertura (apenas uma vez, edge function garante idempotência)
            if (!data.aberto) {
              supabase.functions.invoke('notificar-orcamento-aberto', { body: { slug } })
                .catch(err => console.error('Erro ao notificar abertura:', err));
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug]);

  // Dynamic title & OG meta for WhatsApp preview
  useEffect(() => {
    if (orcamentoSalvo) {
      const clientName = orcamentoSalvo.cliente || 'Cliente';
      document.title = `BRAVE - ${clientName.toUpperCase()}`;
      
      // Update or create OG meta tags
      const setMeta = (property, content) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };
      setMeta('og:title', `BRAVE - ${clientName.toUpperCase()}`);
      setMeta('og:description', `Orçamento exclusivo de equipamentos de alta performance`);
      setMeta('og:type', 'website');
    }
    return () => { document.title = 'Brave Hub — Gerador de Orçamentos'; };
  }, [orcamentoSalvo]);

  // Initialise qtds from loaded orcamento (runs once after first successful compute)
  useEffect(() => {
    if (orcamentoSalvo && produtosDb.length) {
      const itensRaw = orcamentoSalvo.payload.itens || [];
      const map = {};
      itensRaw.forEach(it => {
        const qty = it.q !== undefined ? it.q : it.quantidade;
        if (it.id && qty !== undefined) map[it.id] = qty;
      });
      setQtds(map);
    }
  }, [orcamentoSalvo, produtosDb]);

  const doSave = useCallback(async (newQtds) => {
    if (!orcamentoSalvo) return;
    setSaving(true);
    const newItens = orcamentoSalvo.payload.itens.map(it => ({
      ...it,
      quantidade: newQtds[it.id] ?? it.quantidade,
      q: newQtds[it.id] ?? (it.q ?? it.quantidade),
    }));
    await supabase.from('orcamentos_salvos').update({
      payload: { ...orcamentoSalvo.payload, itens: newItens },
    }).eq('id', orcamentoSalvo.id);
    setSaving(false);
  }, [orcamentoSalvo]);

  const changeQty = useCallback((itemId, delta) => {
    setQtds(prev => {
      const newQtds = { ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta) };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(newQtds), 1500);
      return newQtds;
    });
  }, [doSave]);

  const orcamento = useMemo(() => {
    try {
      if (!produtosDb.length) return null;

      let itensRaw = [];
      let ufParam = '';
      let zonaParam = '';
      let clienteParam = 'Cliente Brave';
      let consultorParam = 'Consultor Oficial';
      let dataCriacao = new Date().toLocaleDateString('pt-BR');

      if (orcamentoSalvo) {
        itensRaw = orcamentoSalvo.payload.itens;
        ufParam = orcamentoSalvo.payload.estado;
        zonaParam = orcamentoSalvo.payload.zona;
        clienteParam = orcamentoSalvo.cliente;
        consultorParam = orcamentoSalvo.consultor;
        dataCriacao = new Date(orcamentoSalvo.criado_em).toLocaleDateString('pt-BR');
      } else {
        const itensParam = searchParams.get('itens');
        if (!itensParam) return null;
        itensRaw = JSON.parse(itensParam);
        ufParam = searchParams.get('uf');
        zonaParam = searchParams.get('zona');
        clienteParam = searchParams.get('c') || 'Cliente Brave';
        consultorParam = searchParams.get('v') || 'Consultor Oficial';
      }

      if (!itensRaw || !itensRaw.length) return null;

      const itensCompletos = itensRaw.map(itemRaw => {
        const prod = produtosDb.find(p => p.id === itemRaw.id);
        if (!prod) return null;
        
        const precoVenda = itemRaw.p !== undefined ? itemRaw.p : (itemRaw.preco !== undefined ? itemRaw.preco : prod.preco);
        const quantidade = itemRaw.q !== undefined ? itemRaw.q : itemRaw.quantidade;
        const precoOriginal = prod.preco;
        const descontoUnitario = precoOriginal > precoVenda ? precoOriginal - precoVenda : 0;
        
        // Fixed prices: from payload first, then from product DB
        const precoAvista = itemRaw.preco_avista || prod.preco_avista || null;
        const precoPrazo = itemRaw.preco_prazo || prod.preco_prazo || null;
        
        return {
          id: prod.id,
          nome: prod.nome,
          codigo_sku: itemRaw.codigo_sku || prod.codigo_sku || '',
          url_imagem: prod.url_imagem,
          quantidade: quantidade,
          precoOriginal: precoOriginal,
          preco: precoVenda,
          preco_avista: precoAvista,
          preco_prazo: precoPrazo,
          descontoUnitario: descontoUnitario,
          peso: prod.peso_kg || 0
        };
      }).filter(Boolean);

      const pesoTotal = itensCompletos.reduce((acc, i) => acc + i.peso * i.quantidade, 0);
      const subtotal = itensCompletos.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
      const descontoTotal = itensCompletos.reduce((acc, i) => acc + i.descontoUnitario * i.quantidade, 0);

      const regraFrete = regrasFreteDb.find(r => r.estado === ufParam && r.zona === zonaParam);
      const frete = orcamentoSalvo?.payload?.frete !== undefined 
        ? Number(orcamentoSalvo.payload.frete) 
        : calcularFreteComRegra(pesoTotal, regraFrete);
      const total = subtotal + frete;

      // Payment conditions
      const condicoes = orcamentoSalvo?.payload?.condicoes || {};
      const descAvista = condicoes.descontoAvista || 0;
      const descCartao = condicoes.descontoCartao || 0;
      const parcelas = condicoes.parcelas || 10;

      // Hybrid calculation: fixed price per product when available, % fallback
      const subtotalAvista = itensCompletos.reduce((acc, i) => {
        if (i.preco_avista) return acc + i.preco_avista * i.quantidade;
        return acc + i.preco * (1 - descAvista / 100) * i.quantidade;
      }, 0);
      const totalAvista = subtotalAvista + frete;

      const subtotalCartao = itensCompletos.reduce((acc, i) => {
        if (i.preco_prazo) return acc + i.preco_prazo * i.quantidade;
        return acc + i.preco * (1 - descCartao / 100) * i.quantidade;
      }, 0);
      const totalCartao = subtotalCartao + frete;
      const parcelaValor = totalCartao / parcelas;

      // Check if any product has fixed pricing
      const temPrecoFixo = itensCompletos.some(i => i.preco_avista || i.preco_prazo);

      return {
        cliente: clienteParam,
        consultor: consultorParam,
        data: dataCriacao,
        validade: '7 dias',
        itens: itensCompletos,
        pesoTotal,
        subtotal,
        descontoTotal,
        frete,
        total,
        descAvista,
        descCartao,
        parcelas,
        totalAvista,
        totalCartao,
        parcelaValor,
        temPrecoFixo
      };
    } catch (e) {
      console.error('Erro ao processar orçamento:', e);
      return null;
    }
  }, [searchParams, produtosDb, regrasFreteDb, orcamentoSalvo]);

  // Orcamento with client-edited quantities applied
  const activeOrcamento = useMemo(() => {
    if (!orcamento || Object.keys(qtds).length === 0) return orcamento;

    const itens = orcamento.itens.map(i => ({ ...i, quantidade: qtds[i.id] ?? i.quantidade }));
    const ativos = itens.filter(i => i.quantidade > 0);

    const pesoTotal = ativos.reduce((acc, i) => acc + i.peso * i.quantidade, 0);
    const { frete, descAvista, descCartao, parcelas } = orcamento;

    const subtotalAvista = ativos.reduce((acc, i) => {
      if (i.preco_avista) return acc + i.preco_avista * i.quantidade;
      return acc + i.preco * (1 - descAvista / 100) * i.quantidade;
    }, 0);
    const totalAvista = subtotalAvista + frete;

    const subtotalCartao = ativos.reduce((acc, i) => {
      if (i.preco_prazo) return acc + i.preco_prazo * i.quantidade;
      return acc + i.preco * (1 - descCartao / 100) * i.quantidade;
    }, 0);
    const totalCartao = subtotalCartao + frete;
    const parcelaValor = totalCartao / parcelas;

    return { ...orcamento, itens, pesoTotal, totalAvista, totalCartao, parcelaValor };
  }, [orcamento, qtds]);

  const handleNegociarProjeto = useCallback(() => {
    if (!activeOrcamento) return;
    const texto = `Olá ${activeOrcamento.consultor}! Analisei o orçamento no valor de ${fmt(activeOrcamento.totalAvista)} à vista / ${fmt(activeOrcamento.totalCartao)} parcelado. Podemos conversar sobre o projeto?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }, [activeOrcamento]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Carregando seu orçamento exclusivo...</p>
      </div>
    );
  }

  if (!orcamento || !activeOrcamento) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center px-6">
        <p className="text-gray-900 font-bold text-xl mb-2">Orçamento não encontrado</p>
        <p className="text-zinc-500 text-sm">O link pode estar quebrado ou incompleto.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* ── Ambient (subtle on white) ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-emerald-100/40 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-amber-100/30 blur-[120px]" />
      </div>



      {/* ══════════════════════════════════════════
          1. HEADER — Proposta Comercial
          ══════════════════════════════════════════ */}
      <header className="relative z-10 pt-10 pb-6 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <img src="/logo-orcamento.png" alt="Brave" className="h-24 sm:h-14 object-contain" />
            <div className="text-right">
              <h1 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-widest">Proposta Comercial</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5">Equipamentos de alta performance</p>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <InfoCell label="Cliente" value={activeOrcamento.cliente} highlight />
              <InfoCell label="Consultor" value={activeOrcamento.consultor} />
              <InfoCell label="Data" value={activeOrcamento.data} />
              <InfoCell label="Validade" value={activeOrcamento.validade} />
            </div>
          </div>
        </div>
      </header>

      {/* ── CNPJ + Instagram + Badge strip de patrocínio ── */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-5 flex-wrap justify-center sm:justify-start">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              CNPJ 33.167.844/0001-80
            </span>
            <a href="https://instagram.com/bravefitnessbr" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-600 transition-colors">
              <span className="text-[11px] font-black">IG</span>
              @bravefitnessbr
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </div>
          {/* Badge strip */}
          <div className="inline-flex flex-col items-center rounded-2xl bg-gray-50 border border-gray-200 py-2.5 px-6">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.18em] mb-2">Patrocinador Oficial</p>
            <div className="flex items-center justify-center gap-5">
              <img src="/TCB.png" alt="TCB – The CrossFit Games Brasil" className="h-9 object-contain"
                onError={e => e.target.style.display = 'none'} />
              <div className="w-px h-7 bg-gray-200" />
              <img src="/COPASUR.png" alt="Copa SUR de CrossFit" className="h-9 object-contain"
                onError={e => e.target.style.display = 'none'} />
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          2. LISTA DE EQUIPAMENTOS — Horizontal Rows
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Column headers (desktop) */}
        <div className="hidden sm:grid sm:grid-cols-[80px_1fr_auto_220px] items-center gap-4 px-4 pb-3 text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-gray-200 mb-3">
          <span></span>
          <span>Produto</span>
          <span className="text-center">Qtd</span>
          <span className="text-right">Valores</span>
        </div>

        <div className="space-y-3">
          {activeOrcamento.itens.map((item, idx) => {
            const qty = item.quantidade;
            const removed = qty === 0;
            const pTabela = item.precoOriginal;
            const pAvista = item.preco_avista ?? item.preco * (1 - activeOrcamento.descAvista / 100);
            const pPrazo = item.preco_prazo ?? item.preco * (1 - activeOrcamento.descCartao / 100);
            const descAvistaP = pTabela > 0 ? Math.round(((pTabela - pAvista) / pTabela) * 100) : 0;
            const descPrazoP = pTabela > 0 ? Math.round(((pTabela - pPrazo) / pTabela) * 100) : 0;
            const totalPrazo = pPrazo * qty;
            const totalAvistaItem = pAvista * qty;
            const totalTabela = pTabela * qty;
            const parcelaMensal = totalPrazo / activeOrcamento.parcelas;
            const economiaTotal = totalTabela - totalAvistaItem;
            const unidsDisp = ((item.id.charCodeAt(0) || 3) % 4) + 2;
            const media = item.url_imagem ? parseMediaUrl(item.url_imagem) : null;

            return (
              <div
                key={item.id}
                className={`bg-white border border-gray-200 rounded-xl overflow-hidden relative animate-fade-in-up shadow-sm ${removed ? 'opacity-40' : ''}`}
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                {/* Selo exclusivo */}
                {descAvistaP > 0 && !removed && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl z-10 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> OFERTA EXCLUSIVA
                  </div>
                )}

                {/* ── ZONA SUPERIOR: infos (esq) + imagem (dir) ── */}
                <div className="flex items-stretch min-h-[148px]">

                  {/* Coluna esquerda — infos + stepper */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between p-3 pr-2">
                    <div>
                      {/* Nome */}
                      <h3 className={`text-[13px] font-bold leading-tight ${removed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {item.nome}
                      </h3>
                      {/* SKU + Peso */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.codigo_sku && (
                          <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{item.codigo_sku}</span>
                        )}
                        {item.peso > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                            <Weight className="w-3 h-3" /> {item.peso}kg
                          </span>
                        )}
                      </div>
                      {/* Escassez */}
                      {!removed && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Flame className="w-3 h-3 text-red-400 animate-pulse shrink-0" />
                          <span className="text-[10px] text-red-400 font-semibold">{unidsDisp} unid. disponíveis</span>
                          <div className="h-1 w-8 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full animate-pulse" style={{ width: `${unidsDisp * 15}%` }} />
                          </div>
                        </div>
                      )}
                      {removed && (
                        <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Não incluído</span>
                      )}
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center mt-3">
                      <button
                        onClick={() => changeQty(item.id, -1)}
                        disabled={qty === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-l-lg bg-gray-100 border border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-200 disabled:opacity-30 transition-colors cursor-pointer text-base font-bold select-none"
                      >−</button>
                      <span className="w-10 h-8 flex items-center justify-center bg-white border-t border-b border-gray-300 text-sm font-black text-gray-900">
                        {qty}
                      </span>
                      <button
                        onClick={() => changeQty(item.id, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-r-lg bg-gray-100 border border-gray-300 text-gray-500 hover:text-emerald-600 hover:bg-gray-200 transition-colors cursor-pointer text-base font-bold select-none"
                      >+</button>
                    </div>
                  </div>

                  {/* Coluna direita — imagem */}
                  <div
                    className={`shrink-0 w-[42%] bg-gray-50 flex items-center justify-center overflow-hidden ${item.url_imagem && !removed ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
                    onClick={() => item.url_imagem && !removed && setExpandedImage(item.url_imagem)}
                  >
                    {media && media.type === 'image' ? (
                      <img src={media.url} alt={item.nome} className="w-full h-full object-contain p-2" />
                    ) : media && media.type === 'folder' ? (
                      <FolderOpen className="w-6 h-6 text-blue-400" />
                    ) : (
                      <Package className="w-10 h-10 text-gray-200" />
                    )}
                  </div>
                </div>

                {/* ── ZONA INFERIOR: preços — largura total ── */}
                {!removed && (
                  <div className="border-t border-gray-100 px-3 py-3 space-y-1.5">
                    {/* Tabela riscado */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Tabela</span>
                      <span className="text-[11px] text-gray-400 line-through">{fmt(totalTabela)}</span>
                    </div>
                    {/* Cartão parcelado */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <CreditCard className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-sm font-bold text-gray-800">{activeOrcamento.parcelas}x {fmt(parcelaMensal)}</span>
                      {descPrazoP > 0 && (
                        <span className="text-[10px] font-bold text-amber-950 bg-gradient-to-r from-amber-400 to-yellow-300 px-2 py-0.5 rounded-full whitespace-nowrap">{descPrazoP}% off</span>
                      )}
                    </div>
                    {/* À Vista — destaque */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-[17px] font-black text-emerald-600 leading-none">{fmt(totalAvistaItem)}</span>
                      {descAvistaP > 0 && (
                        <span className="text-[10px] font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 px-2 py-0.5 rounded-full shadow-sm shadow-emerald-200 whitespace-nowrap">{descAvistaP}% off</span>
                      )}
                    </div>
                    {/* Economia */}
                    {economiaTotal > 0 && (
                      <p className="text-[11px] text-emerald-600 font-semibold">Economia de {fmt(economiaTotal)}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>


      {/* ══════════════════════════════════════════
          3. RESUMO FINANCEIRO
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
              Resumo do Investimento
            </h3>
          </div>

          {/* Mini-table: item breakdown */}
          <div className="space-y-2 mb-5">
            {activeOrcamento.itens.filter(i => i.quantidade > 0).map(i => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">{i.quantidade}x {i.nome}</span>
                <span className="text-gray-900 font-semibold">{fmt((i.preco_avista ?? i.preco) * i.quantidade)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <SummaryRow icon={<Weight className="w-4 h-4" />} label="Peso Total" value={`${activeOrcamento.pesoTotal.toFixed(1)} kg`} />
            <SummaryRow icon={<Package className="w-4 h-4" />} label="Subtotal Equipamentos" value={fmt(activeOrcamento.totalAvista - activeOrcamento.frete)} />
            <SummaryRow icon={<Truck className="w-4 h-4" />} label="Frete" value={fmt(activeOrcamento.frete)} valueClass="text-orange-accent" />
          </div>

          <div className="my-6 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

          {/* Totais: À Vista e Cartão */}
          <div className="space-y-4">
            {/* Bloco À Vista */}
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 border border-emerald-200" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(5,150,105,0.08) 100%)' }}>
              <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-bl-lg flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> MELHOR OFERTA
              </div>
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(16,185,129,0.1)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100">
                    <Banknote className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-700">Total À Vista</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">PIX</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-emerald-600">{fmt(activeOrcamento.totalAvista)}</p>
                  {activeOrcamento.totalAvista < activeOrcamento.totalCartao && (
                    <p className="text-[10px] text-emerald-600 font-medium mt-1">economize {fmt(activeOrcamento.totalCartao - activeOrcamento.totalAvista)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco Cartão */}
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-amber-50 border border-amber-200">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(245,158,11,0.1)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-700">Total no Cartão</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">Crédito sem juros</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-gray-900">{activeOrcamento.parcelas}x {fmt(activeOrcamento.parcelaValor)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ── Selo de confiança ── */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-8">
        <div className="flex flex-wrap items-center justify-center gap-6 py-6 border-t border-gray-200">
          <TrustBadge icon={Shield} label="Pagamento Seguro" />
          <TrustBadge icon={Truck} label="Entrega Rastreada" />
          <TrustBadge icon={Star} label="Equipamentos Premium" />
        </div>
      </div>

      {/* ── Rodapé institucional ── */}
      <InstitutionalFooter dark={false} />

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 text-xs text-gray-500 shadow-xl">
          <Loader2 className="w-3 h-3 animate-spin" /> Salvando seleção...
        </div>
      )}

      {/* Lightbox / Modal de Imagem Expandida */}
      {expandedImage && (() => {
        const media = parseMediaUrl(expandedImage);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/90 backdrop-blur-sm p-4 animate-fade-in cursor-zoom-out" onClick={() => setExpandedImage(null)}>
            <button onClick={() => setExpandedImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-dark-800 text-white rounded-full flex items-center justify-center hover:bg-neon hover:text-dark-950 transition-colors cursor-pointer z-50">
              <X className="w-5 h-5" />
            </button>
            {media.type === 'folder' ? (
              <div className="w-full max-w-5xl h-[80vh] bg-white rounded-xl overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
                <iframe src={media.url} className="w-full h-full border-0" title="Pasta do Google Drive" />
              </div>
            ) : (
              <img src={media.url} alt="Imagem ampliada" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl shadow-neon/10 cursor-default" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        );
      })()}


    </div>
  );
}

/* ─── Sub-components ─── */

function InfoCell({ label, value, highlight }) {
  return (
    <div className={`px-4 py-3 ${highlight ? 'bg-emerald-50' : ''}`}>
      <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-0.5">{label}</p>
      <p className={`text-sm font-bold truncate ${highlight ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ icon, label, value, valueClass = 'text-gray-900' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-gray-500">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function TrustBadge({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-[11px] text-gray-400 font-medium">{label}</span>
    </div>
  );
}

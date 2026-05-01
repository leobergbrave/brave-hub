import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart, Plus, Trash2, Truck, Weight, DollarSign,
  PackageCheck, Link2, Dumbbell, ChevronDown, Sparkles, MapPin,
  Loader2, BrainCircuit, MessageSquareText, AlertTriangle, Search, Edit2, Check, X, UserRound, ImagePlus, Upload
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import {
  fetchProdutos, fetchRegrasFrete, extrairEstadosEZonas,
  calcularFreteComRegra, formatCurrency, formatWeight
} from './data';
import { supabase } from './lib/supabase';

/* ═══════════════════════════════════════════════
   BRAVE HUB — Gerador de Orçamentos
   ═══════════════════════════════════════════════ */

// ── Skeleton Loader ──
function Skeleton({ className = '' }) {
  return (
    <div className={`bg-dark-700/50 rounded-lg animate-pulse ${className}`} />
  );
}

export default function App() {
  // ── Supabase Data ──
  const [produtos, setProdutos] = useState([]);
  const [regrasFrete, setRegrasFrete] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [loadingFrete, setLoadingFrete] = useState(true);
  const [estados, setEstados] = useState([]);
  const [zonas, setZonas] = useState([]);

  // ── Form State ──
  const [produtoId, setProdutoId] = useState('');
  const [buscaProduto, setBuscaProduto] = useState('');
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [quantidade, setQuantidade] = useState(1);
  const [estado, setEstado] = useState('');
  const [zona, setZona] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [nomeConsultor, setNomeConsultor] = useState('');
  const [itens, setItens] = useState([]);
  const [linkGerado, setLinkGerado] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editingWeightId, setEditingWeightId] = useState(null);
  const [editItemWeight, setEditItemWeight] = useState('');
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [editingImageId, setEditingImageId] = useState(null);
  const [editImageUrl, setEditImageUrl] = useState('');

  // ── IA State ──
  const [iaTexto, setIaTexto] = useState('');
  const [iaProcessando, setIaProcessando] = useState(false);

  // ── Fetch products on mount ──
  useEffect(() => {
    setLoadingProdutos(true);
    fetchProdutos()
      .then((data) => setProdutos(data))
      .catch((err) => console.error('Erro ao buscar produtos:', err))
      .finally(() => setLoadingProdutos(false));
  }, []);

  // ── Fetch freight rules on mount ──
  useEffect(() => {
    setLoadingFrete(true);
    fetchRegrasFrete()
      .then((data) => {
        setRegrasFrete(data);
        const { estados: e, zonas: z } = extrairEstadosEZonas(data);
        setEstados(e);
        setZonas(z);
        if (e.length > 0) setEstado(e[0]);
        if (z.length > 0) setZona(z[0]);
      })
      .catch((err) => console.error('Erro ao buscar frete:', err))
      .finally(() => setLoadingFrete(false));
  }, []);

  // ── Derived calculations ──
  const pesoTotal = useMemo(
    () => itens.reduce((acc, i) => acc + (i.peso_kg || 0) * i.quantidade, 0),
    [itens]
  );
  const subtotalEquip = useMemo(
    () => itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0),
    [itens]
  );
  const regraAtual = useMemo(
    () => regrasFrete.find((r) => r.estado === estado && r.zona === zona) || null,
    [regrasFrete, estado, zona]
  );
  const freteFinal = useMemo(
    () => calcularFreteComRegra(pesoTotal, regraAtual),
    [pesoTotal, regraAtual]
  );
  const totalProjeto = subtotalEquip + freteFinal;
  const temItemSemPeso = useMemo(
    () => itens.some((i) => !i.peso_kg),
    [itens]
  );

  // ── Handlers ──
  const showToastMessage = useCallback((msg, isError = false) => {
    setToastMsg(msg);
    setToastError(isError);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  }, []);

  const adicionarProduto = useCallback((produto, qtd) => {
    setItens((prev) => {
      const existing = prev.find((i) => i.id === produto.id);
      if (existing) {
        return prev.map((i) =>
          i.id === produto.id ? { ...i, quantidade: i.quantidade + qtd } : i
        );
      }
      return [...prev, { ...produto, quantidade: qtd }];
    });
  }, []);

  const handleAdicionar = useCallback(() => {
    if (!produtoId) return;
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    adicionarProduto(produto, quantidade);
    setProdutoId('');
    setQuantidade(1);
  }, [produtoId, quantidade, produtos, adicionarProduto]);

  const handleRemover = useCallback((id) => {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleIniciarEdicao = useCallback((item) => {
    setEditingItemId(item.id);
    setEditItemPrice(item.preco.toString());
  }, []);

  const handleSalvarPreco = useCallback((id) => {
    const novoPreco = parseFloat(editItemPrice);
    if (!isNaN(novoPreco) && novoPreco >= 0) {
      setItens((prev) => prev.map((i) => i.id === id ? { ...i, preco: novoPreco } : i));
    }
    setEditingItemId(null);
  }, [editItemPrice]);

  const handleCancelarEdicao = useCallback(() => {
    setEditingItemId(null);
  }, []);

  const handleIniciarEdicaoPeso = useCallback((item) => {
    setEditingWeightId(item.id);
    setEditItemWeight(item.peso_kg ? item.peso_kg.toString() : '');
  }, []);

  const handleSalvarPeso = useCallback(async (id) => {
    const novoPeso = parseFloat(editItemWeight);
    if (isNaN(novoPeso) || novoPeso < 0) {
      setEditingWeightId(null);
      return;
    }

    const { error } = await supabase
      .from('produtos')
      .update({ peso_kg: novoPeso })
      .eq('id', id);

    if (error) {
      showToastMessage('Erro ao salvar peso. Tente novamente.', true);
      return;
    }

    setItens((prev) => prev.map((i) => i.id === id ? { ...i, peso_kg: novoPeso } : i));
    setProdutos((prev) => prev.map((p) => p.id === id ? { ...p, peso_kg: novoPeso } : p));
    setEditingWeightId(null);
    showToastMessage('Peso cadastrado com sucesso!');
  }, [editItemWeight, showToastMessage]);

  const handleCancelarEdicaoPeso = useCallback(() => {
    setEditingWeightId(null);
  }, []);

  const handleImageUpload = async (event, id) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImageId(id);
    try {
      showToastMessage('Comprimindo e enviando imagem...', false);
      let fileToUpload = file;

      if (file.type.startsWith('image/')) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true };
        fileToUpload = await imageCompression(file, options);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('produtos_media').upload(fileName, fileToUpload);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('produtos_media').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('produtos').update({ url_imagem: publicUrl }).eq('id', id);
      if (dbError) throw dbError;

      setItens((prev) => prev.map((i) => i.id === id ? { ...i, url_imagem: publicUrl } : i));
      setProdutos((prev) => prev.map((p) => p.id === id ? { ...p, url_imagem: publicUrl } : p));
      
      showToastMessage('Imagem salva no produto com sucesso!');
    } catch (err) {
      console.error(err);
      showToastMessage('Erro ao salvar imagem.', true);
    } finally {
      setUploadingImageId(null);
      setEditingImageId(null);
      event.target.value = null;
    }
  };

  const handleSaveImageUrl = async (id) => {
    if (!editImageUrl.trim()) {
      setEditingImageId(null);
      return;
    }
    try {
      showToastMessage('Salvando URL...', false);
      const url = editImageUrl.trim();
      const { error: dbError } = await supabase.from('produtos').update({ url_imagem: url }).eq('id', id);
      if (dbError) throw dbError;

      setItens((prev) => prev.map((i) => i.id === id ? { ...i, url_imagem: url } : i));
      setProdutos((prev) => prev.map((p) => p.id === id ? { ...p, url_imagem: url } : p));
      showToastMessage('URL salva com sucesso!');
      setEditingImageId(null);
    } catch (err) {
      console.error(err);
      showToastMessage('Erro ao salvar URL.', true);
    }
  };

  const handleGerarLink = useCallback(() => {
    if (itens.length === 0) return;
    const params = new URLSearchParams();
    if (nomeCliente.trim()) params.set('c', nomeCliente.trim());
    if (nomeConsultor.trim()) params.set('v', nomeConsultor.trim());
    params.set('itens', JSON.stringify(itens.map((i) => ({ id: i.id, q: i.quantidade, p: i.preco }))));
    params.set('uf', estado);
    params.set('zona', zona);
    const link = `${window.location.origin}/orcamento?${params.toString()}`;
    setLinkGerado(link);
    navigator.clipboard.writeText(link).catch(() => {});
    showToastMessage('Link copiado para a área de transferência!');
  }, [itens, estado, zona, nomeCliente, nomeConsultor, showToastMessage]);

  // ── IA Handler (Edge Function) ──
  const handleProcessarIA = useCallback(async () => {
    if (iaProcessando || !iaTexto.trim()) return;
    setIaProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-equipment-list', {
        body: { texto: iaTexto.trim() },
      });
      if (error) throw error;
      const produtosIA = data?.produtos;
      if (!produtosIA || produtosIA.length === 0) {
        showToastMessage('Não foi possível extrair produtos desse texto. Tente novamente.', true);
        return;
      }
      produtosIA.forEach((p) => adicionarProduto(p, p.quantidade || 1));
      setIaTexto('');
      showToastMessage('Inteligência Artificial finalizou a extração!');
    } catch (err) {
      console.error('Erro IA:', err);
      showToastMessage('Não foi possível extrair produtos desse texto. Tente novamente.', true);
    } finally {
      setIaProcessando(false);
    }
  }, [iaProcessando, iaTexto, adicionarProduto, showToastMessage]);

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-neon/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-orange-accent/[0.04] blur-[140px]" />
        <div className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full bg-purple-500/[0.03] blur-[100px]" />
      </div>

      {/* Toast */}
      {showToast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-in-right">
          <div className={`flex items-center gap-3 bg-dark-700 px-5 py-3 rounded-xl shadow-lg ${toastError ? 'border border-red-500/40 shadow-red-500/10' : 'border border-neon/30 shadow-neon/10'}`}>
            {toastError ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <PackageCheck className="w-5 h-5 text-neon" />}
            <span className="text-sm font-medium text-white">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 border-b border-dark-700/60">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Brave Hub Logo" className="h-10 object-contain" />
            <p className="text-[11px] font-medium text-dark-500 tracking-widest uppercase mt-1">Gerador de Orçamentos</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Equipamentos de Alto Padrão</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ═══ COLUNA ESQUERDA ═══ */}
          <div className="lg:col-span-5 space-y-6 animate-fade-in-up">

            {/* Card: IA */}
            <section className="relative bg-dark-800/60 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Leitura Inteligente</h2>
                  <p className="text-[10px] text-purple-400/70 font-medium tracking-wide">WhatsApp / Áudio</p>
                </div>
              </div>
              <div className="relative">
                <textarea id="textarea-ia" value={iaTexto} onChange={(e) => setIaTexto(e.target.value)} rows={4}
                  placeholder="Cole aqui a mensagem do cliente. Ex: Fala irmão, me vê duas bikes da concept e 5 med balls de 9kg..."
                  className="w-full bg-dark-900/80 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-dark-500 placeholder:text-xs leading-relaxed" />
                <MessageSquareText className="absolute right-3 top-3 w-4 h-4 text-dark-500/50" />
              </div>
              <button id="btn-processar-ia" onClick={handleProcessarIA} disabled={iaProcessando || loadingProdutos}
                className="relative w-full mt-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer overflow-hidden disabled:opacity-50">
                {iaProcessando ? (<><Loader2 className="w-4 h-4 animate-spin" />Processando...</>) : (<><Sparkles className="w-4 h-4" />Processar Lista com IA</>)}
              </button>
            </section>

            {/* Card: Adicionar Produto */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-neon/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-neon" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Adicionar Produto</h2>
              </div>

              <label className="block mb-4">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Produto</span>
                {loadingProdutos ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <div className="flex items-center gap-2"><Loader2 className="w-3 h-3 text-dark-500 animate-spin" /><span className="text-[11px] text-dark-500">Carregando catálogo...</span></div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Selected Product Display / Search Input */}
                    <div className="relative">
                      {produtoId && !dropdownAberto ? (
                        <div 
                          onClick={() => {
                            setDropdownAberto(true);
                            setBuscaProduto('');
                          }}
                          className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 cursor-pointer flex justify-between items-center"
                        >
                          <span className="truncate pr-4">{produtos.find(p => p.id === produtoId)?.nome}</span>
                          <span className="text-neon shrink-0">{formatCurrency(produtos.find(p => p.id === produtoId)?.preco || 0)}</span>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Digite para buscar..."
                            value={buscaProduto}
                            onChange={(e) => {
                              setBuscaProduto(e.target.value);
                              setDropdownAberto(true);
                            }}
                            onFocus={() => setDropdownAberto(true)}
                            onBlur={() => setTimeout(() => setDropdownAberto(false), 200)}
                            className="w-full bg-dark-900 border border-neon/50 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-neon/20 transition-all placeholder:text-dark-500"
                            autoFocus={dropdownAberto}
                          />
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon/50" />
                        </>
                      )}
                    </div>

                    {/* Dropdown Options */}
                    {dropdownAberto && (
                      <div className="absolute z-50 w-full mt-2 bg-dark-800 border border-dark-600 rounded-xl shadow-xl shadow-dark-950/50 max-h-60 overflow-y-auto">
                        {produtos
                          .filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) || (p.codigo_sku && p.codigo_sku.toLowerCase().includes(buscaProduto.toLowerCase())))
                          .slice(0, 50) // Limit to 50 results to prevent lag
                          .map(p => (
                          <div 
                            key={p.id}
                            onClick={() => {
                              setProdutoId(p.id);
                              setDropdownAberto(false);
                              setBuscaProduto('');
                            }}
                            className="px-4 py-2.5 hover:bg-dark-700 cursor-pointer flex justify-between items-center border-b border-dark-700/50 last:border-0"
                          >
                            <span className="text-sm text-white truncate pr-4">{p.nome}</span>
                            <span className="text-sm text-neon font-medium shrink-0">{formatCurrency(p.preco)}</span>
                          </div>
                        ))}
                        {produtos.filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) || (p.codigo_sku && p.codigo_sku.toLowerCase().includes(buscaProduto.toLowerCase()))).length === 0 && (
                          <div className="px-4 py-3 text-sm text-dark-500 text-center">Nenhum produto encontrado.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </label>

              <label className="block mb-5">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Quantidade</span>
                <input id="input-quantidade" type="number" min={1} value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-all" />
              </label>

              <button id="btn-adicionar" onClick={handleAdicionar} disabled={!produtoId || loadingProdutos}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-neon-dim to-neon text-dark-950 font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-neon/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer">
                <Plus className="w-4 h-4" />Adicionar ao Orçamento
              </button>
            </section>

            {/* Card: Dados */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <UserRound className="w-4 h-4 text-blue-400" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Dados do Orçamento</h2>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Nome do Cliente / Box</span>
                  <input type="text" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
                    placeholder="Ex: CrossFit Olympus"
                    className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Nome do Consultor</span>
                  <input type="text" value={nomeConsultor} onChange={(e) => setNomeConsultor(e.target.value)}
                    placeholder="Ex: Rafael Mendes"
                    className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
                </label>
              </div>
            </section>

            {/* Card: Destino */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-orange-accent/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-orange-accent" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Destino da Entrega</h2>
              </div>
              {loadingFrete ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                  <div className="flex items-center gap-2"><Loader2 className="w-3 h-3 text-dark-500 animate-spin" /><span className="text-[11px] text-dark-500">Carregando zonas...</span></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Estado</span>
                    <div className="relative">
                      <select id="select-estado" value={estado} onChange={(e) => setEstado(e.target.value)}
                        className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-orange-accent/50 focus:ring-1 focus:ring-orange-accent/20 transition-all cursor-pointer">
                        {estados.map((uf) => (<option key={uf} value={uf}>{uf}</option>))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Zona</span>
                    <div className="relative">
                      <select id="select-zona" value={zona} onChange={(e) => setZona(e.target.value)}
                        className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-orange-accent/50 focus:ring-1 focus:ring-orange-accent/20 transition-all cursor-pointer">
                        {zonas.map((z) => (<option key={z} value={z}>{z}</option>))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                    </div>
                  </label>
                </div>
              )}
            </section>

            {/* Info card */}
            <div className="bg-dark-800/30 border border-dark-700/30 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 leading-relaxed">
                <span className="text-neon font-semibold">Dica:</span> O frete é calculado automaticamente
                com base no peso total dos equipamentos e na zona de entrega selecionada.
                O valor mínimo do estado é sempre garantido.
              </p>
            </div>
          </div>

          {/* ═══ COLUNA DIREITA ═══ */}
          <div className="lg:col-span-7 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden flex flex-col h-full">

              {/* Header Orçamento */}
              <div className="px-6 py-4 border-b border-dark-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-neon" />
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Orçamento</h2>
                </div>
                <div className="flex items-center gap-2">
                  {temItemSemPeso && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Peso incompleto
                    </span>
                  )}
                  {itens.length > 0 && (
                    <span className="text-xs font-bold text-dark-950 bg-neon px-2.5 py-1 rounded-full">
                      {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                    </span>
                  )}
                </div>
              </div>

              {/* Lista de itens */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[200px]">
                {itens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mb-4">
                      <PackageCheck className="w-7 h-7 text-dark-500" />
                    </div>
                    <p className="text-sm text-zinc-500 font-medium">Nenhum item adicionado</p>
                    <p className="text-xs text-dark-500 mt-1">Selecione um produto e clique em "Adicionar"</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {itens.map((item, idx) => {
                      const semPeso = !item.peso_kg;
                      return (
                        <li key={item.id}
                          className={`group bg-dark-900/50 border rounded-xl p-4 flex items-center gap-4 transition-all animate-slide-in-right ${semPeso ? 'border-amber-500/30' : 'border-dark-700/40 hover:border-dark-600'}`}
                          style={{ animationDelay: `${idx * 0.05}s` }}>
                          
                          {/* Image Upload / Preview */}
                          {editingImageId === item.id ? (
                            <div className="shrink-0 w-full sm:w-56 bg-dark-800 rounded-xl p-3 border border-dark-600 shadow-xl shadow-dark-950/50 z-10">
                              <p className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Alterar Foto</p>
                              <div className="flex flex-col gap-2">
                                <label className={`flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-xs font-semibold text-white py-2 rounded-lg cursor-pointer transition-colors ${uploadingImageId === item.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                  {uploadingImageId === item.id ? <Loader2 className="w-4 h-4 animate-spin text-neon" /> : <Upload className="w-4 h-4 text-zinc-400" />}
                                  {uploadingImageId === item.id ? 'Enviando...' : 'Upload do Computador'}
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, item.id)} disabled={uploadingImageId === item.id} />
                                </label>
                                <div className="flex items-center gap-1 mt-1">
                                  <input type="text" placeholder="Ou cole a URL..." value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-neon/50" />
                                  <button onClick={() => handleSaveImageUrl(item.id)} className="bg-neon/10 text-neon p-1.5 rounded-lg hover:bg-neon/20 transition-colors" title="Salvar URL">
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => setEditingImageId(null)} className="bg-dark-700 text-zinc-400 p-1.5 rounded-lg hover:bg-dark-600 hover:text-white transition-colors" title="Cancelar">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="shrink-0 relative group/img cursor-pointer" onClick={() => { setEditingImageId(item.id); setEditImageUrl(item.url_imagem || ''); }} title="Alterar Foto">
                              {item.url_imagem ? (
                                <img src={item.url_imagem} alt={item.nome} className="w-12 h-12 rounded-lg object-cover border border-dark-700/50 group-hover/img:opacity-40 transition-opacity" />
                              ) : (
                                <div className={`w-12 h-12 rounded-lg border border-dashed border-dark-600 flex flex-col items-center justify-center hover:bg-dark-800 transition-colors group-hover/img:opacity-40`}>
                                  <ImagePlus className="w-4 h-4 text-dark-500 group-hover/img:text-neon transition-colors" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
                                <Edit2 className="w-4 h-4 text-white drop-shadow-md" />
                              </div>
                            </div>
                          )}

                          {/* Warning icon */}
                          {semPeso && (
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center" title="Peso não cadastrado — frete impreciso">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                            </div>
                          )}
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{item.nome}</p>
                            
                            {editingItemId === item.id ? (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-zinc-500">{item.quantidade}x</span>
                                <div className="flex items-center bg-dark-800 border border-dark-600 rounded-lg overflow-hidden h-7">
                                  <span className="px-2 text-xs text-zinc-500 bg-dark-900 h-full flex items-center border-r border-dark-600">R$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editItemPrice}
                                    onChange={(e) => setEditItemPrice(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSalvarPreco(item.id);
                                      if (e.key === 'Escape') handleCancelarEdicao();
                                    }}
                                    className="w-20 bg-transparent text-white text-xs px-2 focus:outline-none h-full"
                                    autoFocus
                                  />
                                </div>
                                <button onClick={() => handleSalvarPreco(item.id)} className="w-7 h-7 flex items-center justify-center bg-neon/10 text-neon rounded-lg hover:bg-neon/20 transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={handleCancelarEdicao} className="w-7 h-7 flex items-center justify-center bg-dark-700 text-zinc-400 rounded-lg hover:bg-dark-600 hover:text-white transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-zinc-500">{item.quantidade}x {formatCurrency(item.preco)}</span>
                                  <button onClick={() => handleIniciarEdicao(item)} className="text-dark-500 hover:text-neon transition-colors" title="Editar valor unitário">
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <span className="text-[10px] text-dark-500">•</span>
                                {editingWeightId === item.id ? (
                                  <div className="flex items-center gap-1.5 h-6">
                                    <div className="flex items-center bg-dark-800 border border-dark-600 rounded-md overflow-hidden h-full">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editItemWeight}
                                        onChange={(e) => setEditItemWeight(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSalvarPeso(item.id);
                                          if (e.key === 'Escape') handleCancelarEdicaoPeso();
                                        }}
                                        className="w-14 bg-transparent text-white text-[10px] px-2 focus:outline-none h-full"
                                        placeholder="kg"
                                        autoFocus
                                      />
                                      <span className="px-1.5 text-[10px] text-zinc-500 bg-dark-900 h-full flex items-center border-l border-dark-600">kg</span>
                                    </div>
                                    <button onClick={() => handleSalvarPeso(item.id)} className="w-6 h-6 flex items-center justify-center bg-neon/10 text-neon rounded-md hover:bg-neon/20 transition-colors">
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button onClick={handleCancelarEdicaoPeso} className="w-6 h-6 flex items-center justify-center bg-dark-700 text-zinc-400 rounded-md hover:bg-dark-600 hover:text-white transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    {semPeso ? (
                                      <span className="text-xs text-amber-400 font-medium">Peso não informado</span>
                                    ) : (
                                      <span className="text-xs text-zinc-500">{formatWeight(item.peso_kg * item.quantidade)}</span>
                                    )}
                                    <button onClick={() => handleIniciarEdicaoPeso(item)} className="text-dark-500 hover:text-neon transition-colors" title="Cadastrar peso do produto">
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Subtotal */}
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-neon">{formatCurrency(item.preco * item.quantidade)}</p>
                          </div>
                          {/* Remove */}
                          <button onClick={() => handleRemover(item.id)}
                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-dark-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer" title="Remover item">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Painel de Resumo */}
              <div className="border-t border-dark-700/50 bg-dark-900/40 px-6 py-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400"><Weight className="w-4 h-4" /><span className="text-xs font-medium">Peso Total</span></div>
                  <div className="flex items-center gap-2">
                    {temItemSemPeso && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                    <span className="text-sm font-semibold text-white">{formatWeight(pesoTotal)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400"><DollarSign className="w-4 h-4" /><span className="text-xs font-medium">Subtotal Equipamentos</span></div>
                  <span className="text-sm font-semibold text-white">{formatCurrency(subtotalEquip)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400"><Truck className="w-4 h-4" /><span className="text-xs font-medium">Frete Final ({estado} · {zona})</span></div>
                  <span className="text-sm font-semibold text-orange-accent">{formatCurrency(freteFinal)}</span>
                </div>
                <div className="border-t border-dark-700/50 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Total do Projeto</span>
                    <span className="text-xl font-black text-neon">{formatCurrency(totalProjeto)}</span>
                  </div>
                </div>
                <button id="btn-gerar-link" onClick={handleGerarLink} disabled={itens.length === 0}
                  className="w-full mt-3 flex items-center justify-center gap-2.5 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-accent/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer">
                  <Link2 className="w-5 h-5" />Gerar Link para o Cliente
                </button>
                {linkGerado && (
                  <div className="mt-3 bg-dark-800 border border-dark-600 rounded-xl p-3 animate-fade-in-up">
                    <p className="text-[10px] uppercase font-semibold text-zinc-500 mb-1.5 tracking-wider">Link do Orçamento</p>
                    <p className="text-xs text-neon/80 break-all font-mono leading-relaxed select-all">{linkGerado}</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-dark-700/30 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-[11px] text-dark-500">© 2026 Brave Hub — Todos os direitos reservados</p>
          <p className="text-[11px] text-dark-500">v1.0.0</p>
        </div>
      </footer>
    </div>
  );
}

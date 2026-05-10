import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, Plus, Trash2, Truck, Weight, DollarSign,
  PackageCheck, Link2, Dumbbell, ChevronDown, Sparkles, MapPin,
  Loader2, BrainCircuit, MessageSquareText, AlertTriangle, Search, Edit2, Check, X, UserRound, ImagePlus, Upload, FolderOpen,
  Mic, Square, FileText, MapPinned, CreditCard, Percent, Bookmark, Save, RotateCcw
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import {
  fetchProdutos, fetchRegrasFrete, extrairEstadosEZonas,
  calcularFreteComRegra, formatCurrency, formatWeight, parseMediaUrl
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
  const [telefoneCliente, setTelefoneCliente] = useState('');
  const [cep, setCep] = useState('');
  const [cepInfo, setCepInfo] = useState(null); // { localidade, uf, logradouro, bairro }
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [nomeConsultor, setNomeConsultor] = useState('');
  const [dataCriacaoCustom, setDataCriacaoCustom] = useState('');
  const [itens, setItens] = useState([]);
  const [linkGerado, setLinkGerado] = useState('');
  const [editingSlug, setEditingSlug] = useState(null); // slug of the quote being edited
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editingWeightId, setEditingWeightId] = useState(null);
  const [editItemWeight, setEditItemWeight] = useState('');
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [freteEditado, setFreteEditado] = useState(null);
  const [isEditingFrete, setIsEditingFrete] = useState(false);
  const [freteInputValue, setFreteInputValue] = useState('');
  const [editingImageId, setEditingImageId] = useState(null);
  const [editImageUrl, setEditImageUrl] = useState('');

  // ── Payment Conditions State ──
  const [descontoAvista, setDescontoAvista] = useState(0);
  const [descontoCartao, setDescontoCartao] = useState(0);
  const [parcelasCartao, setParcelasCartao] = useState(12);

  // ── IA State ──
  const [iaTexto, setIaTexto] = useState('');
  const [iaProcessando, setIaProcessando] = useState(false);
  const [iaPendentes, setIaPendentes] = useState([]); // Array of items needing user choice

  // ── PDF / Audio State ──
  const [iaTab, setIaTab] = useState('texto');
  const [pdfFile, setPdfFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [iaExtraindo, setIaExtraindo] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);

  // ── History State ──
  const [historico, setHistorico] = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);

  // ── Template State ──
  const [modelos, setModelos] = useState([]);
  const [loadingModelos, setLoadingModelos] = useState(true);
  const [showSalvarModelo, setShowSalvarModelo] = useState(false);
  const [nomeModelo, setNomeModelo] = useState('');
  const [descricaoModelo, setDescricaoModelo] = useState('');

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

  // ── Fetch history on mount ──
  const fetchHistorico = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('orcamentos_salvos').select('*').order('criado_em', { ascending: false }).limit(20);
      if (error) throw error;
      setHistorico(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  useEffect(() => {
    fetchHistorico();
  }, [fetchHistorico]);

  // ── Fetch templates on mount ──
  const fetchModelos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('orcamentos_modelo').select('*').eq('ativo', true).order('nome');
      if (error) throw error;
      setModelos(data || []);
    } catch (err) {
      console.error('Erro ao buscar modelos:', err);
    } finally {
      setLoadingModelos(false);
    }
  }, []);

  useEffect(() => {
    fetchModelos();
  }, [fetchModelos]);

  // ── Edit mode: load quote from ?edit=slug ──
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const editSlug = searchParams.get('edit');
    if (!editSlug || !produtos.length) return;

    (async () => {
      try {
        const { data: orc, error } = await supabase.from('orcamentos_salvos').select('*').eq('slug', editSlug).single();
        if (error || !orc) return;

        setEditingSlug(editSlug);
        setNomeCliente(orc.cliente || '');
        setNomeConsultor(orc.consultor || '');
        
        // Formatar data para o input datetime-local (yyyy-MM-ddThh:mm)
        if (orc.criado_em) {
          const d = new Date(orc.criado_em);
          const offset = d.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0,16);
          setDataCriacaoCustom(localISOTime);
        } else {
          setDataCriacaoCustom('');
        }

        const p = orc.payload || {};
        setEstado(p.estado || '');
        setZona(p.zona || '');
        setTelefoneCliente(p.telefoneCliente || '');

        // Payment conditions
        const c = p.condicoes || {};
        setDescontoAvista(c.descontoAvista || 0);
        setDescontoCartao(c.descontoCartao || 0);
        setParcelasCartao(c.parcelas || 12);

        // Items — merge with current product data
        const itensCarregados = (p.itens || []).map(itemSalvo => {
          const prodDb = produtos.find(pr => pr.id === itemSalvo.id);
          return {
            id: itemSalvo.id,
            nome: itemSalvo.nome || prodDb?.nome || 'Produto',
            preco: itemSalvo.preco ?? prodDb?.preco ?? 0,
            preco_avista: itemSalvo.preco_avista ?? prodDb?.preco_avista ?? null,
            preco_prazo: itemSalvo.preco_prazo ?? prodDb?.preco_prazo ?? null,
            peso_kg: itemSalvo.peso_kg ?? prodDb?.peso_kg ?? 0,
            url_imagem: itemSalvo.url_imagem ?? prodDb?.url_imagem ?? '',
            codigo_sku: itemSalvo.codigo_sku ?? prodDb?.codigo_sku ?? '',
            quantidade: itemSalvo.quantidade ?? itemSalvo.q ?? 1,
            descontoAvistaItem: itemSalvo.descontoAvistaItem || 0,
            descontoCartaoItem: itemSalvo.descontoCartaoItem || 0,
          };
        });
        setItens(itensCarregados);
        setLinkGerado('');

        // Clear the ?edit param so it doesn't re-trigger
        setSearchParams({}, { replace: true });
      } catch (err) {
        console.error('Erro ao carregar orçamento para edição:', err);
      }
    })();
  }, [searchParams, produtos]);

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

  useEffect(() => {
    setFreteEditado(null);
  }, [pesoTotal, regraAtual]);

  const freteFinal = useMemo(() => {
    if (freteEditado !== null) return freteEditado;
    return calcularFreteComRegra(pesoTotal, regraAtual);
  }, [pesoTotal, regraAtual, freteEditado]);
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

  const handleGlobalDescontoAvistaChange = useCallback((e) => {
    const num = Math.max(0, Math.min(100, Number(e.target.value)));
    setDescontoAvista(num);
    setItens((prev) => prev.map(item => {
      if (item._precoAvistaFixo) return item;
      return {
        ...item,
        descontoAvistaItem: num,
        preco_avista: item.preco * (1 - num / 100)
      };
    }));
  }, []);

  const handleGlobalDescontoCartaoChange = useCallback((e) => {
    const num = Math.max(0, Math.min(100, Number(e.target.value)));
    setDescontoCartao(num);
    setItens((prev) => prev.map(item => {
      if (item._precoPrazoFixo) return item;
      return {
        ...item,
        descontoCartaoItem: num,
        preco_prazo: item.preco * (1 - num / 100)
      };
    }));
  }, []);

  const adicionarProduto = useCallback((produto, qtd) => {
    setItens((prev) => {
      const existing = prev.find((i) => i.id === produto.id);
      if (existing) {
        return prev.map((i) =>
          i.id === produto.id ? { ...i, quantidade: i.quantidade + qtd } : i
        );
      }
      const item = { ...produto, quantidade: qtd };

      // Pre-fill preco_avista from DB and calculate reverse discount %
      if (produto.preco_avista != null && produto.preco > 0) {
        item.descontoAvistaItem = parseFloat((((produto.preco - produto.preco_avista) / produto.preco) * 100).toFixed(2));
        item._precoAvistaFixo = true;
      } else {
        item.descontoAvistaItem = 0;
      }

      // Pre-fill preco_prazo from DB and calculate reverse discount %
      if (produto.preco_prazo != null && produto.preco > 0) {
        item.descontoCartaoItem = parseFloat((((produto.preco - produto.preco_prazo) / produto.preco) * 100).toFixed(2));
        item._precoPrazoFixo = true;
      } else {
        item.descontoCartaoItem = 0;
      }

      return [...prev, item];
    });
  }, []);

  // ── Mapa de capitais estaduais (para detectar zona CAPITAL) ──
  const CAPITAIS = {
    AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus',
    BA: 'Salvador', CE: 'Fortaleza', ES: 'Vitória', GO: 'Goiânia',
    MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande', MG: 'Belo Horizonte',
    PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife',
    PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre',
    RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis', SP: 'São Paulo',
    SE: 'Aracaju', TO: 'Palmas', DF: 'Brasília',
  };

  // ── CEP Lookup Handler ──
  const handleBuscarCep = useCallback(async (cepValue) => {
    const cepLimpo = cepValue.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    setCepInfo(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (data.erro) {
        showToastMessage('CEP não encontrado. Verifique o número.', true);
        return;
      }

      setCepInfo({ localidade: data.localidade, uf: data.uf, bairro: data.bairro, logradouro: data.logradouro });

      // Mapear UF do ViaCEP para o estado nas regras de frete
      let ufMapeada = data.uf;
      if (data.uf === 'DF' || data.uf === 'GO') ufMapeada = 'GO/DF';
      if (data.uf === 'PB') {
        ufMapeada = data.localidade === 'João Pessoa' ? 'PB (João Pessoa)' : 'PB (Restante do Estado)';
      }

      const estadoEncontrado = estados.find(e => e === ufMapeada);
      if (estadoEncontrado) {
        setEstado(estadoEncontrado);
      } else {
        const match = estados.find(e => e.includes(data.uf));
        if (match) setEstado(match);
      }

      // Detectar zona: CAPITAL vs INTERIOR
      const cidadeCapital = CAPITAIS[data.uf];
      const ehCapital = cidadeCapital && data.localidade.toLowerCase().includes(cidadeCapital.toLowerCase());
      if (ehCapital && zonas.includes('CAPITAL')) {
        setZona('CAPITAL');
      } else if (zonas.includes('INTERIOR 1')) {
        setZona('INTERIOR 1');
      }

      showToastMessage(`CEP: ${data.localidade} - ${data.uf} (${ehCapital ? 'Capital' : 'Interior'})`);
    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
      showToastMessage('Erro ao consultar CEP. Tente novamente.', true);
    } finally {
      setBuscandoCep(false);
    }
  }, [estados, zonas, showToastMessage]);

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

  const handleAlterarQuantidade = useCallback((id, novaQuantidade) => {
    if (novaQuantidade < 1) return;
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, quantidade: novaQuantidade } : i)));
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

  const handleDescontoItemChange = useCallback((id, campo, valor, tipo = 'percentual') => {
    setItens((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      
      let num = valor === '' ? '' : parseFloat(valor);
      const basePrice = i.preco;
      const updated = { ...i };

      if (tipo === 'percentual') {
        if (num !== '') {
          if (num > 100) num = 100;
          if (num < 0) num = 0;
        }
        updated[campo] = num;
        
        if (campo === 'descontoAvistaItem') {
           updated.preco_avista = num === '' ? null : basePrice * (1 - num / 100);
        } else if (campo === 'descontoCartaoItem') {
           updated.preco_prazo = num === '' ? null : basePrice * (1 - num / 100);
        }
      } else {
        if (num !== '' && num < 0) num = 0;
        updated[campo] = num === '' ? null : num;
        
        if (campo === 'preco_avista') {
           updated.descontoAvistaItem = num === '' || basePrice === 0 ? '' : parseFloat((((basePrice - num) / basePrice) * 100).toFixed(2));
        } else if (campo === 'preco_prazo') {
           updated.descontoCartaoItem = num === '' || basePrice === 0 ? '' : parseFloat((((basePrice - num) / basePrice) * 100).toFixed(2));
        }
      }
      return updated;
    }));
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

  const handleGerarLink = useCallback(async () => {
    if (itens.length === 0) return;
    try {
      showToastMessage('Gerando link...', false);
      const btnGerarLink = document.getElementById('btn-gerar-link');
      if (btnGerarLink) btnGerarLink.disabled = true;

      const slugBase = (nomeCliente || 'orcamento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugId = Math.random().toString(36).substring(2, 8);
      const slug = `${slugBase}-${slugId}`;

      const payload = {
        itens: itens.map((i) => ({ id: i.id, quantidade: i.quantidade, preco: i.preco, preco_avista: i.preco_avista || null, preco_prazo: i.preco_prazo || null, nome: i.nome, peso_kg: i.peso_kg, url_imagem: i.url_imagem, codigo_sku: i.codigo_sku, descontoAvistaItem: i.descontoAvistaItem, descontoCartaoItem: i.descontoCartaoItem })),
        estado,
        zona,
        telefoneCliente,
        condicoes: {
          descontoAvista,
          descontoCartao,
          parcelas: parcelasCartao
        },
        frete: freteFinal
      };

      const novoOrcamento = {
        slug,
        cliente: nomeCliente || 'Cliente Brave',
        consultor: nomeConsultor || 'Consultor Oficial',
        payload
      };

      if (dataCriacaoCustom) {
        novoOrcamento.criado_em = new Date(dataCriacaoCustom).toISOString();
      }

      const { error } = await supabase.from('orcamentos_salvos').insert(novoOrcamento);

      if (error) throw error;

      const link = `${window.location.origin}/proposta/${slug}`;
      setLinkGerado(link);
      navigator.clipboard.writeText(link).catch(() => {});
      showToastMessage('Link gerado e copiado para a área de transferência!');
      
      // Envia para a Bling e notifica o resultado
      supabase.functions.invoke('sync-bling-proposal', {
        body: { cliente: nomeCliente, consultor: nomeConsultor, payload }
      }).then(({ error: blingErr }) => {
        if (blingErr) showToastMessage('Orçamento salvo, mas erro ao enviar ao Bling.', true);
        else showToastMessage('Proposta enviada ao Bling com sucesso!');
      }).catch(() => showToastMessage('Orçamento salvo, mas erro ao enviar ao Bling.', true));

      // Atualiza o histórico
      fetchHistorico();
    } catch (err) {
      console.error(err);
      showToastMessage('Erro ao gerar link.', true);
    } finally {
      const btnGerarLink = document.getElementById('btn-gerar-link');
      if (btnGerarLink) btnGerarLink.disabled = false;
    }
  }, [itens, estado, zona, telefoneCliente, descontoAvista, descontoCartao, parcelasCartao, freteFinal, nomeCliente, nomeConsultor, dataCriacaoCustom, showToastMessage, fetchHistorico]);

  // ── Template Handlers ──
  const handleCarregarModelo = useCallback((modelo) => {
    if (!modelo?.itens || !Array.isArray(modelo.itens)) return;

    const itensCarregados = modelo.itens.map(itemModelo => {
      const prodDb = produtos.find(p => p.id === (itemModelo.produto_id || itemModelo.id));
      if (!prodDb) return null;

      const item = { ...prodDb, quantidade: itemModelo.quantidade || 1 };

      if (prodDb.preco_avista != null && prodDb.preco > 0) {
        item.descontoAvistaItem = parseFloat((((prodDb.preco - prodDb.preco_avista) / prodDb.preco) * 100).toFixed(2));
        item._precoAvistaFixo = true;
      } else {
        item.descontoAvistaItem = 0;
      }
      if (prodDb.preco_prazo != null && prodDb.preco > 0) {
        item.descontoCartaoItem = parseFloat((((prodDb.preco - prodDb.preco_prazo) / prodDb.preco) * 100).toFixed(2));
        item._precoPrazoFixo = true;
      } else {
        item.descontoCartaoItem = 0;
      }

      return item;
    }).filter(Boolean);

    if (itensCarregados.length === 0) {
      showToastMessage('Nenhum produto do modelo foi encontrado no catálogo.', true);
      return;
    }

    setItens(itensCarregados);
    if (modelo.consultor) setNomeConsultor(modelo.consultor);
    showToastMessage(`Modelo "${modelo.nome}" carregado com ${itensCarregados.length} itens!`);
  }, [produtos, showToastMessage]);

  const handleSalvarModelo = useCallback(async () => {
    if (!nomeModelo.trim() || itens.length === 0) return;

    try {
      const itensModelo = itens.map(i => ({
        produto_id: i.id,
        quantidade: i.quantidade,
      }));

      const { error } = await supabase.from('orcamentos_modelo').insert({
        nome: nomeModelo.trim(),
        descricao: descricaoModelo.trim() || null,
        itens: itensModelo,
        consultor: nomeConsultor || null,
      });

      if (error) throw error;

      showToastMessage(`Modelo "${nomeModelo}" salvo com sucesso!`);
      setNomeModelo('');
      setDescricaoModelo('');
      setShowSalvarModelo(false);
      fetchModelos();
    } catch (err) {
      console.error('Erro ao salvar modelo:', err);
      showToastMessage('Erro ao salvar modelo. Tente novamente.', true);
    }
  }, [nomeModelo, descricaoModelo, itens, nomeConsultor, showToastMessage, fetchModelos]);

  const handleExcluirModelo = useCallback(async (modeloId) => {
    try {
      const { error } = await supabase.from('orcamentos_modelo').update({ ativo: false }).eq('id', modeloId);
      if (error) throw error;
      showToastMessage('Modelo removido!');
      fetchModelos();
    } catch (err) {
      console.error('Erro ao excluir modelo:', err);
      showToastMessage('Erro ao remover modelo.', true);
    }
  }, [showToastMessage, fetchModelos]);

  // ── IA Handler (Edge Function) ──
  const handleProcessarIA = useCallback(async () => {
    if (iaProcessando || !iaTexto.trim()) return;
    setIaProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-equipment-list', {
        body: { texto: iaTexto.trim() },
      });
      if (error) throw error;
      
      const resolucoes = data?.resolucoes;
      if (!resolucoes || resolucoes.length === 0) {
        showToastMessage('Não foi possível extrair produtos desse texto. Tente novamente.', true);
        return;
      }
      
      const pendentes = [];
      let adicionados = 0;

      resolucoes.forEach((res) => {
        if (res.opcoes && res.opcoes.length === 1) {
          // Apenas uma opção, adiciona direto — buscar produto completo do catálogo local
          const prodCompleto = produtos.find(p => p.id === res.opcoes[0].id) || res.opcoes[0];
          adicionarProduto(prodCompleto, res.quantidade || 1);
          adicionados++;
        } else if (res.opcoes && res.opcoes.length > 1) {
          // Mais de uma opção, manda pra resolução e ordena pelo score de aprendizado
          res.opcoes.sort((a, b) => {
            const scoreA = produtos.find(p => p.id === a.id)?.ia_score || 0;
            const scoreB = produtos.find(p => p.id === b.id)?.ia_score || 0;
            return scoreB - scoreA;
          });
          pendentes.push(res);
        }
      });

      setIaTexto('');
      
      if (pendentes.length > 0) {
        setIaPendentes(pendentes);
        if (adicionados > 0) {
          showToastMessage(`${adicionados} produto(s) adicionado(s). Alguns itens precisam da sua confirmação!`);
        }
      } else {
        showToastMessage('Inteligência Artificial finalizou a extração!');
      }

    } catch (err) {
      console.error('Erro IA:', err);
      showToastMessage('Não foi possível extrair produtos desse texto. Tente novamente.', true);
    } finally {
      setIaProcessando(false);
    }
  }, [iaProcessando, iaTexto, adicionarProduto, produtos, showToastMessage]);

  // Handle Resolution Choice
  const handleResolucaoEscolha = (indexPendente, opcaoEscolhida) => {
    const pendente = iaPendentes[indexPendente];
    // Buscar produto completo do catálogo local (com preco_avista/preco_prazo)
    const prodCompleto = produtos.find(p => p.id === opcaoEscolhida.id) || opcaoEscolhida;
    adicionarProduto(prodCompleto, pendente.quantidade || 1);
    
    // Increment IA Score in DB
    const currentScore = prodCompleto.ia_score || 0;
    supabase.from('produtos').update({ ia_score: currentScore + 1 }).eq('id', opcaoEscolhida.id).then(() => {
      if (prodCompleto) prodCompleto.ia_score = currentScore + 1;
    });

    // Remove from pendentes
    const novosPendentes = [...iaPendentes];
    novosPendentes.splice(indexPendente, 1);
    setIaPendentes(novosPendentes);

    if (novosPendentes.length === 0) {
      showToastMessage('Todas as opções foram resolvidas e adicionadas!');
    }
  };

  // ── Helper: File/Blob to Base64 ──
  const fileToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });

  // ── PDF Extraction Handler ──
  const handleExtrairPDF = useCallback(async () => {
    if (!pdfFile || iaExtraindo) return;
    setIaExtraindo(true);
    try {
      showToastMessage('Extraindo texto do PDF...');
      const base64 = await fileToBase64(pdfFile);
      const { data, error } = await supabase.functions.invoke('extract-pdf-text', {
        body: { fileBase64: base64, mimeType: pdfFile.type || 'application/pdf' },
      });
      if (error) throw error;
      if (!data?.texto?.trim()) {
        showToastMessage('Não foi possível extrair texto do PDF.', true);
        return;
      }
      setIaTexto(data.texto);
      setPdfFile(null);
      setIaTab('texto');
      showToastMessage('Texto extraído! Revise e clique em "Processar Lista com IA".');
    } catch (err) {
      console.error('Erro PDF:', err);
      showToastMessage('Erro ao extrair texto do PDF.', true);
    } finally {
      setIaExtraindo(false);
    }
  }, [pdfFile, iaExtraindo, showToastMessage]);

  // ── Audio Recording Handlers ──
  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      setAudioUrl('');

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 299) {
            recorder.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Erro microfone:', err);
      showToastMessage('Não foi possível acessar o microfone. Verifique as permissões.', true);
    }
  }, [showToastMessage]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }, []);

  const handleDescartarAudio = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setRecordingTime(0);
  }, [audioUrl]);

  const handleAudioFileUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showToastMessage('Arquivo muito grande. Limite: 25 MB.', true);
      return;
    }
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setRecordingTime(0);
    event.target.value = null;
  }, [showToastMessage]);

  // ── Audio Transcription Handler ──
  const handleTranscreverAudio = useCallback(async () => {
    if (!audioBlob || iaExtraindo) return;
    setIaExtraindo(true);
    try {
      showToastMessage('Transcrevendo áudio...');
      const base64 = await fileToBase64(audioBlob);
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { fileBase64: base64, mimeType: audioBlob.type || 'audio/webm' },
      });
      if (error) throw error;
      if (!data?.texto?.trim()) {
        showToastMessage('Não foi possível transcrever o áudio.', true);
        return;
      }
      setIaTexto(data.texto);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl('');
      setRecordingTime(0);
      setIaTab('texto');
      showToastMessage('Áudio transcrito! Revise e clique em "Processar Lista com IA".');
    } catch (err) {
      console.error('Erro áudio:', err);
      showToastMessage('Erro ao transcrever áudio.', true);
    } finally {
      setIaExtraindo(false);
    }
  }, [audioBlob, audioUrl, iaExtraindo, showToastMessage]);

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-neon/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-orange-accent/[0.04] blur-[140px]" />
        <div className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full bg-purple-500/[0.03] blur-[100px]" />
      </div>

      {/* Modal de Resolução de IA */}
      {iaPendentes.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setIaPendentes([])} />
          <div className="relative bg-dark-800 border border-purple-500/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fade-in-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Opções Encontradas</h3>
                  <p className="text-dark-500 text-xs">Qual variação você deseja adicionar?</p>
                </div>
              </div>
              <button onClick={() => setIaPendentes([])} className="p-2 hover:bg-dark-700 rounded-lg text-dark-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-6">
              {iaPendentes.map((pendente, index) => (
                <div key={index} className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-semibold text-white">Item: <span className="text-purple-400">{pendente.termo_original}</span></h4>
                    <span className="text-xs bg-dark-700 px-2 py-1 rounded text-dark-400 font-mono">Qtd: {pendente.quantidade}</span>
                  </div>
                  <div className="space-y-2">
                    {pendente.opcoes.map((opcao, idxOpcao) => {
                      const score = produtos.find(p => p.id === opcao.id)?.ia_score || 0;
                      const isTop = idxOpcao === 0 && score > 0;
                      return (
                      <button
                        key={opcao.id}
                        onClick={() => handleResolucaoEscolha(index, opcao)}
                        className={`w-full text-left flex items-center justify-between p-3 rounded-lg bg-dark-800 border ${isTop ? 'border-amber-500/50 bg-amber-500/5' : 'border-dark-600'} hover:border-neon/50 hover:bg-neon/5 transition-all group`}
                      >
                        <div className="flex items-center gap-3">
                          {(() => {
                            if (!opcao.url_imagem) {
                              return (
                                <div className="w-8 h-8 rounded bg-dark-700 flex items-center justify-center shrink-0">
                                  <Dumbbell className="w-4 h-4 text-dark-500" />
                                </div>
                              );
                            }
                            const media = parseMediaUrl(opcao.url_imagem);
                            if (media.type === 'image') return <img src={media.url} className="w-8 h-8 rounded object-cover shrink-0" />;
                            if (media.type === 'folder') return <div className="w-8 h-8 rounded bg-dark-700 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4 text-blue-400" /></div>;
                            return (
                              <div className="w-8 h-8 rounded bg-dark-700 flex items-center justify-center shrink-0">
                                <Dumbbell className="w-4 h-4 text-dark-500" />
                              </div>
                            );
                          })()}
                          <div className="flex flex-col">
                            <span className={`text-sm ${isTop ? 'text-amber-400 font-bold' : 'text-zinc-300'} group-hover:text-white transition-colors`}>{opcao.nome}</span>
                            {isTop && <span className="text-[10px] text-amber-500 font-medium">✨ Escolha comum</span>}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-neon">{formatCurrency(opcao.preco)}</span>
                      </button>
                    )})}
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row items-center gap-2 pt-4 border-t border-dark-700/50">
                    <select 
                      className="flex-1 w-full bg-dark-900 border border-dark-600 rounded-lg text-sm p-2.5 text-zinc-300 focus:outline-none focus:border-neon/50"
                      onChange={(e) => {
                        if (e.target.value) {
                          const prod = produtos.find(p => p.id === e.target.value);
                          if (prod) handleResolucaoEscolha(index, prod);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Ou busque manualmente no catálogo...</option>
                      {produtos.map(p => (
                        <option key={p.id} value={p.id}>{p.nome} - {formatCurrency(p.preco)}</option>
                      ))}
                    </select>

                    <button 
                      onClick={() => {
                        const novosPendentes = [...iaPendentes];
                        novosPendentes.splice(index, 1);
                        setIaPendentes(novosPendentes);
                        if (novosPendentes.length === 0) showToastMessage('Todas as opções foram resolvidas!');
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-bold border border-red-500/20 transition-colors whitespace-nowrap"
                    >
                      Ignorar Item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
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
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 lg:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">

          {/* ═══ COLUNA ESQUERDA ═══ */}
          <div className="lg:col-span-5 flex flex-col gap-6 animate-fade-in-up">

            {/* Card: IA */}
            <section className="relative bg-dark-800/60 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-4 sm:p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Leitura Inteligente</h2>
                  <p className="text-[10px] text-purple-400/70 font-medium tracking-wide">WhatsApp / PDF / Áudio</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="relative flex bg-dark-900/80 rounded-xl p-1 mb-4 gap-1">
                {[
                  { id: 'texto', label: 'Texto', Icon: MessageSquareText },
                  { id: 'pdf', label: 'PDF', Icon: FileText },
                  { id: 'audio', label: 'Áudio', Icon: Mic },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setIaTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      iaTab === tab.id
                        ? 'bg-purple-500/20 text-purple-300 shadow-sm'
                        : 'text-dark-500 hover:text-zinc-400'
                    }`}
                  >
                    <tab.Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Texto */}
              {iaTab === 'texto' && (
                <div className="relative">
                  <textarea id="textarea-ia" value={iaTexto} onChange={(e) => setIaTexto(e.target.value)} rows={4}
                    placeholder="Cole aqui a mensagem do cliente. Ex: Fala irmão, me vê duas bikes da concept e 5 med balls de 9kg..."
                    className="w-full bg-dark-900/80 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-dark-500 placeholder:text-xs leading-relaxed" />
                  <MessageSquareText className="absolute right-3 top-3 w-4 h-4 text-dark-500/50" />
                </div>
              )}

              {/* Tab: PDF */}
              {iaTab === 'pdf' && (
                <div>
                  {!pdfFile ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-dark-600 rounded-xl cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500/50', 'bg-purple-500/5'); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove('border-purple-500/50', 'bg-purple-500/5'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-purple-500/50', 'bg-purple-500/5');
                        const f = e.dataTransfer.files?.[0];
                        if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) {
                          if (f.size > 50 * 1024 * 1024) { showToastMessage('PDF muito grande. Limite: 50 MB.', true); return; }
                          setPdfFile(f);
                        } else {
                          showToastMessage('Apenas arquivos PDF são aceitos.', true);
                        }
                      }}
                    >
                      <FileText className="w-8 h-8 text-dark-500 group-hover:text-purple-400 transition-colors mb-2" />
                      <span className="text-xs text-dark-500 group-hover:text-zinc-400 transition-colors">Arraste um PDF aqui ou clique para selecionar</span>
                      <span className="text-[10px] text-dark-600 mt-1">Limite: 50 MB</span>
                      <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 50 * 1024 * 1024) { showToastMessage('PDF muito grande. Limite: 50 MB.', true); return; }
                          setPdfFile(f);
                        }
                      }} />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 bg-dark-900/80 border border-purple-500/30 rounded-xl px-4 py-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{pdfFile.name}</p>
                        <p className="text-[10px] text-dark-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button onClick={() => setPdfFile(null)} className="p-1.5 hover:bg-dark-700 rounded-lg text-dark-500 hover:text-red-400 transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Áudio */}
              {iaTab === 'audio' && (
                <div>
                  {!isRecording && !audioBlob && (
                    <div className="space-y-3">
                      <button onClick={handleStartRecording}
                        className="w-full flex flex-col items-center justify-center h-32 border-2 border-dashed border-dark-600 rounded-xl hover:border-red-500/50 hover:bg-red-500/5 transition-all group cursor-pointer">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-2 group-hover:bg-red-500/20 transition-colors">
                          <Mic className="w-7 h-7 text-red-400" />
                        </div>
                        <span className="text-xs text-dark-500 group-hover:text-zinc-400 transition-colors">Toque para gravar</span>
                        <span className="text-[10px] text-dark-600 mt-1">Máximo: 5 minutos</span>
                      </button>
                      <label className="flex items-center justify-center gap-2 w-full py-2.5 border border-dark-600 rounded-xl cursor-pointer hover:border-purple-500/30 hover:bg-dark-900/50 transition-all text-dark-500 hover:text-zinc-400 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        Ou envie um arquivo de áudio
                        <input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.webm" className="hidden" onChange={handleAudioFileUpload} />
                      </label>
                    </div>
                  )}

                  {isRecording && (
                    <div className="flex flex-col items-center justify-center h-32 bg-dark-900/80 border border-red-500/30 rounded-xl animate-pulse-slow">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-lg font-mono text-red-400 font-bold tracking-wider">
                          {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <button onClick={handleStopRecording}
                        className="flex items-center gap-2 bg-red-500/20 text-red-400 px-5 py-2.5 rounded-xl hover:bg-red-500/30 transition-colors font-bold text-sm border border-red-500/30 cursor-pointer">
                        <Square className="w-4 h-4 fill-current" />
                        Parar
                      </button>
                    </div>
                  )}

                  {!isRecording && audioBlob && (
                    <div className="bg-dark-900/80 border border-purple-500/30 rounded-xl p-4 space-y-3">
                      <audio src={audioUrl} controls className="w-full h-10" style={{ colorScheme: 'dark' }} />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-dark-500 flex-1">
                          {audioBlob.size > 1024 * 1024
                            ? `${(audioBlob.size / 1024 / 1024).toFixed(1)} MB`
                            : `${(audioBlob.size / 1024).toFixed(0)} KB`}
                          {recordingTime > 0 && ` • ${String(Math.floor(recordingTime / 60)).padStart(2, '0')}:${String(recordingTime % 60).padStart(2, '0')}`}
                        </span>
                        <button onClick={handleDescartarAudio}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 hover:bg-red-500/10 rounded-lg cursor-pointer">
                          <Trash2 className="w-3 h-3" />
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {iaTab === 'texto' && (
                <button id="btn-processar-ia" onClick={handleProcessarIA} disabled={iaProcessando || loadingProdutos || !iaTexto.trim()}
                  className="relative w-full mt-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer overflow-hidden disabled:opacity-50">
                  {iaProcessando ? (<><Loader2 className="w-4 h-4 animate-spin" />Processando...</>) : (<><Sparkles className="w-4 h-4" />Processar Lista com IA</>)}
                </button>
              )}
              {iaTab === 'pdf' && pdfFile && (
                <button onClick={handleExtrairPDF} disabled={iaExtraindo}
                  className="relative w-full mt-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer overflow-hidden disabled:opacity-50">
                  {iaExtraindo ? (<><Loader2 className="w-4 h-4 animate-spin" />Extraindo texto...</>) : (<><FileText className="w-4 h-4" />Extrair Texto do PDF</>)}
                </button>
              )}
              {iaTab === 'audio' && audioBlob && !isRecording && (
                <button onClick={handleTranscreverAudio} disabled={iaExtraindo}
                  className="relative w-full mt-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer overflow-hidden disabled:opacity-50">
                  {iaExtraindo ? (<><Loader2 className="w-4 h-4 animate-spin" />Transcrevendo...</>) : (<><Mic className="w-4 h-4" />Transcrever Áudio</>)}
                </button>
              )}
            </section>

            {/* Card: Orçamentos Modelo */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-amber-500/20 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Bookmark className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Orçamentos Modelo</h2>
                  <p className="text-[10px] text-amber-400/70 font-medium tracking-wide">Carregar template rápido</p>
                </div>
              </div>

              {loadingModelos ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : modelos.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">Nenhum modelo salvo ainda.<br/>Crie um orçamento e clique em "Salvar como Modelo".</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {modelos.map(modelo => (
                    <div key={modelo.id} className="flex items-center justify-between bg-dark-900/60 border border-dark-700/40 rounded-xl px-3 py-2.5 hover:border-amber-500/30 transition-all group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{modelo.nome}</p>
                        {modelo.descricao && (
                          <p className="text-[10px] text-zinc-500 truncate">{modelo.descricao}</p>
                        )}
                        <p className="text-[10px] text-zinc-600">{modelo.itens?.length || 0} {(modelo.itens?.length || 0) === 1 ? 'item' : 'itens'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          onClick={() => handleCarregarModelo(modelo)}
                          disabled={loadingProdutos}
                          className="px-3 py-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-30"
                        >
                          Usar
                        </button>
                        <button
                          onClick={() => handleExcluirModelo(modelo.id)}
                          className="p-1.5 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Card: Adicionar Produto */}
            <section className="order-first lg:order-none bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-6">
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
                    {/* Selected product tag */}
                    {produtoId && (
                      <div className="flex items-center gap-2 mb-2 bg-neon/10 border border-neon/20 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-neon font-semibold truncate flex-1">{produtos.find(p => p.id === produtoId)?.nome}</span>
                        <span className="text-xs text-neon/70 shrink-0">{formatCurrency(produtos.find(p => p.id === produtoId)?.preco || 0)}</span>
                        <button onClick={() => { setProdutoId(null); setBuscaProduto(''); }} className="shrink-0 text-neon/50 hover:text-red-400 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    )}
                    {/* Always-visible search input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={produtoId ? "Trocar produto..." : "Buscar produto por nome..."}
                        value={buscaProduto}
                        onChange={(e) => {
                          setBuscaProduto(e.target.value);
                          setDropdownAberto(true);
                          if (e.target.value) setProdutoId(null);
                        }}
                        onFocus={() => setDropdownAberto(true)}
                        onBlur={() => setTimeout(() => setDropdownAberto(false), 200)}
                        className="w-full bg-dark-900 border border-dark-600 focus:border-neon/50 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-1 focus:ring-neon/20 transition-all placeholder:text-dark-500"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                    </div>

                    {/* Dropdown Options */}
                    {dropdownAberto && (
                      <div className="absolute z-50 w-full mt-2 bg-dark-800 border border-dark-600 rounded-xl shadow-xl shadow-dark-950/50 max-h-60 overflow-y-auto">
                        {produtos
                          .filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) || (p.codigo_sku && p.codigo_sku.toLowerCase().includes(buscaProduto.toLowerCase())))
                          .slice(0, 50)
                          .map(p => (
                          <div
                            key={p.id}
                            onPointerDown={(e) => {
                              e.preventDefault(); // prevents input blur before selection fires
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
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-6">
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
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Telefone do Cliente (WhatsApp)</span>
                  <input type="text" value={telefoneCliente} onChange={(e) => setTelefoneCliente(e.target.value)}
                    placeholder="Ex: 11999999999"
                    className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Nome do Consultor</span>
                    <input type="text" value={nomeConsultor} onChange={(e) => setNomeConsultor(e.target.value)}
                      placeholder="Ex: Rafael Mendes"
                      className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Data do Orçamento (Opcional)</span>
                    <input type="datetime-local" value={dataCriacaoCustom} onChange={(e) => setDataCriacaoCustom(e.target.value)}
                      className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all [color-scheme:dark]" />
                  </label>
                </div>
              </div>
            </section>

            {/* Card: Destino */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-orange-accent/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-orange-accent" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Destino da Entrega</h2>
              </div>

              {/* CEP Input */}
              <label className="block mb-4">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">CEP do Cliente</span>
                <div className="relative">
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                      const formatted = v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
                      setCep(formatted);
                      if (v.length === 8) handleBuscarCep(v);
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-orange-accent/50 focus:ring-1 focus:ring-orange-accent/20 transition-all placeholder:text-dark-500 font-mono"
                  />
                  {buscandoCep ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-accent animate-spin" />
                  ) : (
                    <MapPinned className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                  )}
                </div>
              </label>

              {/* CEP Result */}
              {cepInfo && (
                <div className="mb-4 bg-dark-900/60 border border-orange-accent/20 rounded-xl px-4 py-2.5 animate-fade-in-up">
                  <p className="text-xs text-white font-medium">{cepInfo.localidade} — {cepInfo.uf}</p>
                  {cepInfo.logradouro && (
                    <p className="text-[10px] text-dark-500 mt-0.5 truncate">{cepInfo.logradouro}{cepInfo.bairro ? `, ${cepInfo.bairro}` : ''}</p>
                  )}
                </div>
              )}

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

            {/* Card: Condições de Pagamento */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Condições de Pagamento</h2>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Desconto à Vista (%)</span>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={1} value={descontoAvista}
                        onChange={handleGlobalDescontoAvistaChange}
                        className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Desconto Cartão (%)</span>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={1} value={descontoCartao}
                        onChange={handleGlobalDescontoCartaoChange}
                        className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                    </div>
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Parcelas no Cartão</span>
                  <div className="relative">
                    <select value={parcelasCartao} onChange={(e) => setParcelasCartao(Number(e.target.value))}
                      className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                        <option key={n} value={n}>{n}x sem juros</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  </div>
                </label>

                {/* Preview */}
                {itens.length > 0 && (
                  <div className="bg-dark-900/60 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1.5 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">💵 À Vista{descontoAvista > 0 ? ` (-${descontoAvista}%)` : ''}</span>
                      <span className="text-sm font-bold text-emerald-400">{formatCurrency(
                        itens.reduce((acc, i) => {
                          if (i.preco_avista) return acc + i.preco_avista * i.quantidade;
                          return acc + i.preco * (1 - descontoAvista / 100) * i.quantidade;
                        }, 0) + freteFinal
                      )}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">💳 Cartão {parcelasCartao}x{descontoCartao > 0 ? ` (-${descontoCartao}%)` : ''}</span>
                      <span className="text-sm font-bold text-white">{formatCurrency(
                        itens.reduce((acc, i) => {
                          if (i.preco_prazo) return acc + i.preco_prazo * i.quantidade;
                          return acc + i.preco * (1 - descontoCartao / 100) * i.quantidade;
                        }, 0) + freteFinal
                      )}</span>
                    </div>
                  </div>
                )}
              </div>
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
              <div className="px-4 sm:px-6 py-4 border-b border-dark-700/50 flex items-center justify-between">
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
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 min-h-[200px]">
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
                          className={`group bg-dark-900/50 border rounded-xl p-3 sm:p-4 transition-all animate-slide-in-right ${semPeso ? 'border-amber-500/30' : 'border-dark-700/40 hover:border-dark-600'}`}
                          style={{ animationDelay: `${idx * 0.05}s` }}>
                          
                          {/* Top row: Image + Name + Subtotal + Remove */}
                          <div className="flex items-center gap-3">
                            {/* Image */}
                            {editingImageId === item.id ? (
                              <div className="w-full bg-dark-800 rounded-xl p-3 border border-dark-600">
                                <p className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Alterar Foto</p>
                                <div className="flex flex-col gap-2">
                                  <label className={`flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-xs font-semibold text-white py-2 rounded-lg cursor-pointer transition-colors ${uploadingImageId === item.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {uploadingImageId === item.id ? <Loader2 className="w-4 h-4 animate-spin text-neon" /> : <Upload className="w-4 h-4 text-zinc-400" />}
                                    {uploadingImageId === item.id ? 'Enviando...' : 'Upload'}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, item.id)} disabled={uploadingImageId === item.id} />
                                  </label>
                                  <div className="flex items-center gap-1">
                                    <input type="text" placeholder="Ou cole a URL..." value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-neon/50" />
                                    <button onClick={() => handleSaveImageUrl(item.id)} className="bg-neon/10 text-neon p-1.5 rounded-lg hover:bg-neon/20"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingImageId(null)} className="bg-dark-700 text-zinc-400 p-1.5 rounded-lg hover:bg-dark-600"><X className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="shrink-0 relative group/img cursor-pointer" onClick={() => { setEditingImageId(item.id); setEditImageUrl(item.url_imagem || ''); }}>
                                {(() => {
                                  if (!item.url_imagem) return (<div className="w-10 h-10 rounded-lg border border-dashed border-dark-600 flex items-center justify-center hover:bg-dark-800 transition-colors group-hover/img:opacity-40"><ImagePlus className="w-4 h-4 text-dark-500 group-hover/img:text-neon" /></div>);
                                  const media = parseMediaUrl(item.url_imagem);
                                  if (media.type === 'image') return <img src={media.url} alt={item.nome} className="w-10 h-10 rounded-lg object-cover border border-dark-700/50 group-hover/img:opacity-40 transition-opacity" />;
                                  if (media.type === 'folder') return (<div className="w-10 h-10 rounded-lg border border-dark-600 bg-dark-800 flex items-center justify-center group-hover/img:opacity-40"><FolderOpen className="w-5 h-5 text-blue-400" /></div>);
                                  return (<div className="w-10 h-10 rounded-lg border border-dashed border-dark-600 flex items-center justify-center hover:bg-dark-800 group-hover/img:opacity-40"><ImagePlus className="w-4 h-4 text-dark-500" /></div>);
                                })()}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none"><Edit2 className="w-3 h-3 text-white drop-shadow-md" /></div>
                              </div>
                            )}

                            {/* Name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-white truncate">{item.nome}</p>
                            </div>

                            {/* Subtotal */}
                            <p className="text-xs sm:text-sm font-bold text-neon shrink-0">{formatCurrency(item.preco * item.quantidade)}</p>

                            {/* Remove */}
                            <button onClick={() => handleRemover(item.id)} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-dark-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Bottom row: Qty × Price • Weight */}
                          <div className="flex items-center gap-2 mt-1.5 pl-[52px] flex-wrap text-[11px]">
                            {editingItemId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1 bg-dark-900 border border-dark-700 rounded overflow-hidden">
                                  <button onClick={() => handleAlterarQuantidade(item.id, item.quantidade - 1)} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-dark-700 transition-colors">-</button>
                                  <span className="text-xs text-white w-6 text-center">{item.quantidade}</span>
                                  <button onClick={() => handleAlterarQuantidade(item.id, item.quantidade + 1)} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-dark-700 transition-colors">+</button>
                                </div>
                                <div className="flex items-center bg-dark-800 border border-dark-600 rounded-lg overflow-hidden h-6">
                                  <span className="px-1.5 text-[10px] text-zinc-500 bg-dark-900 h-full flex items-center border-r border-dark-600">R$</span>
                                  <input type="number" min="0" step="0.01" value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSalvarPreco(item.id); if (e.key === 'Escape') handleCancelarEdicao(); }}
                                    className="w-20 bg-transparent text-white text-xs px-2 focus:outline-none h-full" autoFocus />
                                </div>
                                <button onClick={() => handleSalvarPreco(item.id)} className="w-6 h-6 flex items-center justify-center bg-neon/10 text-neon rounded-lg"><Check className="w-3 h-3" /></button>
                                <button onClick={handleCancelarEdicao} className="w-6 h-6 flex items-center justify-center bg-dark-700 text-zinc-400 rounded-lg"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="flex items-center gap-1 bg-dark-900 border border-dark-700 rounded overflow-hidden">
                                  <button onClick={() => handleAlterarQuantidade(item.id, item.quantidade - 1)} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-dark-700 transition-colors">-</button>
                                  <span className="text-xs text-white w-6 text-center">{item.quantidade}</span>
                                  <button onClick={() => handleAlterarQuantidade(item.id, item.quantidade + 1)} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-dark-700 transition-colors">+</button>
                                </div>
                                <span className="text-zinc-500 ml-1">{formatCurrency(item.preco)}</span>
                                {(item.preco_avista || item.preco_prazo) && (
                                  <span className="text-[10px] text-emerald-400/70 ml-1">
                                    {item.preco_avista ? `À vista: ${formatCurrency(item.preco_avista)}` : ''}
                                    {item.preco_avista && item.preco_prazo ? ' · ' : ''}
                                    {item.preco_prazo ? `Prazo: ${formatCurrency(item.preco_prazo)}` : ''}
                                  </span>
                                )}
                                <button onClick={() => handleIniciarEdicao(item)} className="text-dark-500 hover:text-neon transition-colors"><Edit2 className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                            <span className="text-dark-600">•</span>
                            {editingWeightId === item.id ? (
                              <div className="flex items-center gap-1 h-5">
                                <div className="flex items-center bg-dark-800 border border-dark-600 rounded-md overflow-hidden h-full">
                                  <input type="number" min="0" step="0.01" value={editItemWeight} onChange={(e) => setEditItemWeight(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSalvarPeso(item.id); if (e.key === 'Escape') handleCancelarEdicaoPeso(); }}
                                    className="w-12 bg-transparent text-white text-[10px] px-1 focus:outline-none h-full" placeholder="kg" autoFocus />
                                  <span className="px-1 text-[10px] text-zinc-500 bg-dark-900 h-full flex items-center border-l border-dark-600">kg</span>
                                </div>
                                <button onClick={() => handleSalvarPeso(item.id)} className="w-5 h-5 flex items-center justify-center bg-neon/10 text-neon rounded-md"><Check className="w-2.5 h-2.5" /></button>
                                <button onClick={handleCancelarEdicaoPeso} className="w-5 h-5 flex items-center justify-center bg-dark-700 text-zinc-400 rounded-md"><X className="w-2.5 h-2.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                {semPeso ? (
                                  <span className="text-amber-400">Sem peso</span>
                                ) : (
                                  <span className="text-zinc-500">{formatWeight(item.peso_kg * item.quantidade)}</span>
                                )}
                                <button onClick={() => handleIniciarEdicaoPeso(item)} className="text-dark-500 hover:text-neon transition-colors"><Edit2 className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                          </div>
                          
                          {/* Item Discounts */}
                          <div className="flex flex-col gap-2 mt-2 w-full pt-2 border-t border-dark-700/50">
                            {/* À Vista */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-emerald-400 font-medium w-12 shrink-0">À vista</span>
                              <div className="flex items-center bg-dark-900 border border-emerald-500/30 rounded focus-within:border-emerald-500/60 overflow-hidden">
                                <input type="number" min="0" max="100" step="0.1" value={item.descontoAvistaItem ?? ''} onChange={(e) => handleDescontoItemChange(item.id, 'descontoAvistaItem', e.target.value, 'percentual')}
                                  className="w-12 bg-transparent py-1 px-1.5 text-white text-center text-xs focus:outline-none appearance-none" placeholder="%" />
                                <span className="text-emerald-500/70 text-[10px] pr-1.5">%</span>
                              </div>
                              <span className="text-[10px] text-zinc-600">=</span>
                              <div className="flex items-center bg-dark-900 border border-emerald-500/30 rounded focus-within:border-emerald-500/60 overflow-hidden">
                                <span className="text-emerald-500/70 text-[10px] pl-1.5">R$</span>
                                <input type="number" min="0" step="0.01" value={item.preco_avista ?? ''} onChange={(e) => handleDescontoItemChange(item.id, 'preco_avista', e.target.value, 'valor')}
                                  className="w-20 bg-transparent py-1 px-1.5 text-white text-xs focus:outline-none appearance-none" placeholder={item.preco.toFixed(2)} />
                              </div>
                            </div>
                            
                            {/* Cartão */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-emerald-400/80 font-medium w-12 shrink-0">Cartão</span>
                              <div className="flex items-center bg-dark-900 border border-emerald-500/20 rounded focus-within:border-emerald-500/50 overflow-hidden">
                                <input type="number" min="0" max="100" step="0.1" value={item.descontoCartaoItem ?? ''} onChange={(e) => handleDescontoItemChange(item.id, 'descontoCartaoItem', e.target.value, 'percentual')}
                                  className="w-12 bg-transparent py-1 px-1.5 text-white text-center text-xs focus:outline-none appearance-none" placeholder="%" />
                                <span className="text-emerald-500/50 text-[10px] pr-1.5">%</span>
                              </div>
                              <span className="text-[10px] text-zinc-600">=</span>
                              <div className="flex items-center bg-dark-900 border border-emerald-500/20 rounded focus-within:border-emerald-500/50 overflow-hidden">
                                <span className="text-emerald-500/50 text-[10px] pl-1.5">R$</span>
                                <input type="number" min="0" step="0.01" value={item.preco_prazo ?? ''} onChange={(e) => handleDescontoItemChange(item.id, 'preco_prazo', e.target.value, 'valor')}
                                  className="w-20 bg-transparent py-1 px-1.5 text-white text-xs focus:outline-none appearance-none" placeholder={item.preco.toFixed(2)} />
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Editing banner */}
              {editingSlug && (
                <div className="mx-6 mt-4 flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5">
                  <Edit2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-300 font-medium">Editando orçamento existente. Ao gerar o link, um <strong>novo link</strong> será criado com as alterações.</p>
                </div>
              )}

              {/* Painel de Resumo */}
              <div className="border-t border-dark-700/50 bg-dark-900/40 px-4 sm:px-6 py-5 space-y-3">
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
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Truck className="w-4 h-4" />
                    <span className="text-xs font-medium">Frete Final ({estado} · {zona})</span>
                    {freteEditado !== null && (
                      <button onClick={() => setFreteEditado(null)} className="text-[10px] text-zinc-500 hover:text-white" title="Restaurar frete calculado">
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {isEditingFrete ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-dark-900 border border-orange-accent/50 rounded overflow-hidden">
                        <span className="text-orange-accent/50 text-[10px] pl-1.5">R$</span>
                        <input 
                          type="number" 
                          min="0" step="0.01"
                          value={freteInputValue} 
                          onChange={(e) => setFreteInputValue(e.target.value)} 
                          className="w-20 bg-transparent py-1 px-1.5 text-orange-accent text-xs font-semibold focus:outline-none appearance-none" 
                          autoFocus
                          onBlur={() => {
                            setFreteEditado(Number(freteInputValue) || 0);
                            setIsEditingFrete(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setFreteEditado(Number(freteInputValue) || 0);
                              setIsEditingFrete(false);
                            }
                            if (e.key === 'Escape') {
                              setIsEditingFrete(false);
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group/frete cursor-pointer" onClick={() => { setFreteInputValue(freteFinal); setIsEditingFrete(true); }}>
                      <span className="text-sm font-semibold text-orange-accent">{formatCurrency(freteFinal)}</span>
                      <Edit2 className="w-3 h-3 text-dark-500 group-hover/frete:text-orange-accent transition-colors" />
                    </div>
                  )}
                </div>
                <div className="border-t border-dark-700/50 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Total do Projeto</span>
                    <span className="text-xl font-black text-neon">{formatCurrency(totalProjeto)}</span>
                  </div>
                </div>
                <button id="btn-gerar-link" onClick={handleGerarLink} disabled={itens.length === 0}
                  className="w-full mt-3 flex items-center justify-center gap-2.5 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-accent/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer">
                  <Link2 className="w-5 h-5" />{editingSlug ? 'Regerar Link (Edição)' : 'Gerar Link para o Cliente'}
                </button>
                {linkGerado && (
                  <div className="mt-3 bg-dark-800 border border-dark-600 rounded-xl p-3 animate-fade-in-up">
                    <p className="text-[10px] uppercase font-semibold text-zinc-500 mb-1.5 tracking-wider">Link do Orçamento</p>
                    <p className="text-xs text-neon/80 break-all font-mono leading-relaxed select-all">{linkGerado}</p>
                  </div>
                )}

                {/* Salvar como Modelo */}
                {itens.length > 0 && (
                  <div className="mt-3">
                    {!showSalvarModelo ? (
                      <button
                        onClick={() => setShowSalvarModelo(true)}
                        className="w-full flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-amber-400 transition-colors py-2 cursor-pointer"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        Salvar como Modelo
                      </button>
                    ) : (
                      <div className="bg-dark-800 border border-amber-500/30 rounded-xl p-4 space-y-3 animate-fade-in-up">
                        <div className="flex items-center gap-2 mb-1">
                          <Bookmark className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Salvar como Modelo</span>
                        </div>
                        <input
                          type="text"
                          value={nomeModelo}
                          onChange={(e) => setNomeModelo(e.target.value)}
                          placeholder="Nome do modelo (ex: Kit Básico CrossFit)"
                          className="w-full bg-dark-900 border border-dark-600 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder:text-dark-500"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={descricaoModelo}
                          onChange={(e) => setDescricaoModelo(e.target.value)}
                          placeholder="Descrição (opcional)"
                          className="w-full bg-dark-900 border border-dark-600 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder:text-dark-500"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSalvarModelo}
                            disabled={!nomeModelo.trim()}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold text-xs py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Salvar Modelo
                          </button>
                          <button
                            onClick={() => { setShowSalvarModelo(false); setNomeModelo(''); setDescricaoModelo(''); }}
                            className="px-3 py-2.5 bg-dark-700 text-zinc-400 hover:text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ═══ HISTÓRICO DE ORÇAMENTOS ═══ */}
        <section className="mt-6 sm:mt-8 bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Histórico de Orçamentos</h2>
            </div>
            <button onClick={fetchHistorico} className="text-xs text-dark-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1">
              Atualizar
            </button>
          </div>

          {loadingHistorico ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-500 text-sm">Nenhum orçamento salvo ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-dark-700/50 text-dark-500 uppercase tracking-widest text-[10px]">
                    <th className="pb-3 px-4 font-semibold">Cliente</th>
                    <th className="pb-3 px-4 font-semibold">Consultor</th>
                    <th className="pb-3 px-4 font-semibold">Valor Total</th>
                    <th className="pb-3 px-4 font-semibold">Data</th>
                    <th className="pb-3 px-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/30">
                  {historico.map((orc) => (
                    <tr key={orc.id} className="hover:bg-dark-700/20 transition-colors">
                      <td className="py-4 px-4 font-medium text-zinc-300">{orc.cliente}</td>
                      <td className="py-4 px-4 text-zinc-500">{orc.consultor}</td>
                      <td className="py-4 px-4 font-bold text-neon">{formatCurrency(orc.payload?.itens?.reduce((acc, i) => acc + (i.preco * i.quantidade), 0) + (orc.payload?.frete || 0) || 0)}</td>
                      <td className="py-4 px-4 text-zinc-500">{new Date(orc.criado_em).toLocaleDateString('pt-BR')}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/proposta/${orc.slug}`;
                              navigator.clipboard.writeText(link);
                              showToastMessage('Link copiado!');
                            }}
                            className="p-2 text-dark-500 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition-all cursor-pointer"
                            title="Copiar Link"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/proposta/${orc.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-xs font-semibold text-neon hover:text-dark-950 bg-neon/10 hover:bg-neon rounded-lg transition-all"
                          >
                            Abrir
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ═══ BARRA INFERIOR MOBILE ═══ */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-sm border-t border-dark-700/50 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total do Projeto</p>
            <p className="text-lg font-black text-neon leading-tight">{formatCurrency(totalProjeto)}</p>
          </div>
          <button
            onClick={handleGerarLink}
            disabled={itens.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-black text-sm px-5 py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
          >
            <Link2 className="w-4 h-4" /> Gerar Link
          </button>
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

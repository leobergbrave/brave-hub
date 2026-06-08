import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Plus, Trash2, Save, Upload, Loader2, AlertTriangle, Search, ImagePlus, Download, CheckCircle2, AlertCircle, RefreshCw, Package } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const EditableCell = ({ value, onSave, type = "text", className = "", options = null, placeholder = "" }) => {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => { setVal(value ?? ''); }, [value]);

  const handleBlur = () => {
    if (val != (value ?? '')) {
      onSave(val);
    }
  };

  if (options) {
    return (
      <select 
        value={val} 
        onChange={e => { setVal(e.target.value); onSave(e.target.value); }} 
        className={`bg-dark-800 rounded px-2 py-1 text-xs border border-transparent hover:border-dark-600 focus:border-neon focus:outline-none cursor-pointer ${className}`}
      >
        <option value="">Sem categoria</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input 
      type={type}
      value={val}
      placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`bg-transparent px-1 border-b border-transparent hover:border-dark-600 focus:border-neon focus:outline-none w-full placeholder:text-dark-600 placeholder:text-[10px] ${className}`}
    />
  );
};

export default function ProdutosTab() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ codigo_sku: '', nome: '', preco: '', preco_avista: '', preco_prazo: '', peso_kg: '', url_imagem: '', categoria: '', subcategoria: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);

  // ── Importação Bling ─────────────────────────────────────────────────────
  const [blingModal, setBlingModal] = useState(false);
  const [blingStep, setBlingStep] = useState('idle'); // idle | preview | importing | done | error
  const [blingPreview, setBlingPreview] = useState(null);
  const [blingResult, setBlingResult] = useState(null);
  const [blingLoading, setBlingLoading] = useState(false);

  // ── Recuperação de fotos ──────────────────────────────────────────────────
  const [recuperandoFotos, setRecuperandoFotos] = useState(false);
  const [fotosProgress, setFotosProgress] = useState(null); // { atualizados, restantes }
  const [fotosErro, setFotosErro] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [prodRes, catRes, subRes] = await Promise.all([
      supabase.from('produtos').select('*').order('nome'),
      supabase.from('categorias').select('nome').order('nome'),
      supabase.from('subcategorias').select('nome').order('nome')
    ]);
    setProdutos(prodRes.data || []);
    setCategorias(catRes.data?.map(c => c.nome) || []);
    setSubcategorias(subRes.data?.map(s => s.nome) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInlineUpdate = async (id, field, value) => {
    let finalValue = value;
    if (field === 'preco' || field === 'preco_avista' || field === 'preco_prazo' || field === 'peso_kg') {
      const strVal = value.toString().trim();
      if (strVal === '' && (field === 'preco_avista' || field === 'preco_prazo' || field === 'peso_kg')) {
        finalValue = null;
      } else {
        finalValue = Number(strVal.replace(',', '.'));
        if (isNaN(finalValue)) finalValue = null;
      }
    }
    const { error } = await supabase.from('produtos').update({ [field]: finalValue }).eq('id', id);
    if (!error) {
      setProdutos(prev => prev.map(p => p.id === id ? { ...p, [field]: finalValue } : p));
    } else {
      alert('Erro ao salvar: ' + error.message);
    }
  };

  const handleSave = async () => {
    if (!form.nome) return;
    setSaving(true);
    const payload = { ...form, preco: Number(form.preco) || 0, preco_avista: form.preco_avista !== '' ? Number(form.preco_avista) : null, preco_prazo: form.preco_prazo !== '' ? Number(form.preco_prazo) : null, peso_kg: form.peso_kg ? Number(form.peso_kg) : null };
    if (editId) {
      await supabase.from('produtos').update(payload).eq('id', editId);
    } else {
      await supabase.from('produtos').insert(payload);
    }
    setForm({ codigo_sku: '', nome: '', preco: '', preco_avista: '', preco_prazo: '', peso_kg: '', url_imagem: '', categoria: '', subcategoria: '' });
    setEditId(null);
    setSaving(false);
    load();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      let fileToUpload = file;

      // Compress if it's an image
      if (file.type.startsWith('image/')) {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        };
        fileToUpload = await imageCompression(file, options);
      }

      // Generate unique name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { error } = await supabase.storage.from('produtos_media').upload(fileName, fileToUpload);
      if (error) throw error;

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('produtos_media').getPublicUrl(fileName);
      
      setForm({ ...form, url_imagem: publicUrlData.publicUrl });
    } catch (err) {
      console.error('Error uploading media:', err);
      alert('Erro ao fazer upload da mídia: ' + err.message);
    } finally {
      setUploadingMedia(false);
      // Reset input value to allow uploading the same file again if needed
      e.target.value = null;
    }
  };

  const handleEdit = (p) => {
    setEditId(p.id);
    setForm({ codigo_sku: p.codigo_sku || '', nome: p.nome, preco: p.preco, preco_avista: p.preco_avista ?? '', preco_prazo: p.preco_prazo ?? '', peso_kg: p.peso_kg || '', url_imagem: p.url_imagem || '', categoria: p.categoria || '', subcategoria: p.subcategoria || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este produto?')) return;
    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert('Erro ao excluir: ' + error.message);
    }
    load();
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setSaving(true);
    const lines = csvText.trim().split('\n');
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      // Support either semicolon or comma as separator
      const separator = lines[i].includes(';') ? ';' : ',';
      const cols = lines[i].split(separator).map(c => c.trim());
      if (cols.length < 3) continue;
      
      const precoStr = cols[2] || '0';
      const pesoStr = cols[3] || '';
      
      const avistaStr = cols[6] || '';
      const prazoStr = cols[7] || '';
      rows.push({
        codigo_sku: (cols[0] || '').replace(/^"|"$/g, '') || null,
        nome: (cols[1] || '').replace(/^"|"$/g, ''),
        preco: Number(precoStr.replace(',', '.')) || 0,
        peso_kg: pesoStr && pesoStr !== '0' ? Number(pesoStr.replace(',', '.')) : null,
        categoria: cols[4] || '',
        subcategoria: cols[5] || '',
        preco_avista: avistaStr ? Number(avistaStr.replace(',', '.')) || null : null,
        preco_prazo: prazoStr ? Number(prazoStr.replace(',', '.')) || null : null,
      });
    }
    if (rows.length > 0) {
      await supabase.from('produtos').insert(rows);
      setCsvText('');
      setShowCsv(false);
      load();
    }
    setSaving(false);
  };

  const filtered = produtos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    (p.codigo_sku || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Handlers Bling ────────────────────────────────────────────────────────
  async function handleBlingPreview() {
    setBlingLoading(true);
    setBlingStep('preview');
    setBlingPreview(null);
    try {
      const res = await fetch('/api/importar-produtos-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', apenasAtivos: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setBlingPreview(data);
      } else {
        setBlingStep('error');
        setBlingResult({ mensagem: data.error || 'Erro ao buscar produtos do Bling' });
      }
    } catch (e) {
      setBlingStep('error');
      setBlingResult({ mensagem: e.message });
    } finally {
      setBlingLoading(false);
    }
  }

  async function handleBlingImport() {
    setBlingLoading(true);
    setBlingStep('importing');
    try {
      const res = await fetch('/api/importar-produtos-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'import', apenasAtivos: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setBlingResult(data);
        setBlingStep('done');
        load(); // recarrega lista de produtos
      } else {
        setBlingStep('error');
        setBlingResult({ mensagem: data.error || 'Erro durante importação' });
      }
    } catch (e) {
      setBlingStep('error');
      setBlingResult({ mensagem: e.message });
    } finally {
      setBlingLoading(false);
    }
  }

  function fecharBlingModal() {
    setBlingModal(false);
    setBlingStep('idle');
    setBlingPreview(null);
    setBlingResult(null);
  }

  async function handleRecuperarFotos() {
    setRecuperandoFotos(true);
    setFotosProgress({ atualizados: 0, restantes: '...' });
    setFotosErro('');
    let totalAtualizados = 0;
    const MAX = 30; // no máximo 30 chamadas (300 produtos)
    try {
      for (let i = 0; i < MAX; i++) {
        const { data, error } = await supabase.functions.invoke('sync-bling-images');
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || 'Erro desconhecido na Edge Function');
        totalAtualizados += data.atualizados || 0;
        setFotosProgress({ atualizados: totalAtualizados, restantes: data.restantes ?? 0 });
        if ((data.restantes ?? 0) === 0) break;
        await new Promise(r => setTimeout(r, 800));
      }
      load(); // recarrega lista com novas fotos
    } catch (e) {
      setFotosErro(e.message);
    } finally {
      setRecuperandoFotos(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Produtos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setBlingModal(true); handleBlingPreview(); }}
            className="flex items-center gap-2 text-xs font-semibold text-orange-400 bg-orange-500/10 px-4 py-2 rounded-xl hover:bg-orange-500/20 transition-all cursor-pointer">
            <Download className="w-4 h-4" /> Importar do Bling
          </button>
          <button onClick={handleRecuperarFotos} disabled={recuperandoFotos}
            className="flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-500/10 px-4 py-2 rounded-xl hover:bg-blue-500/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
            {recuperandoFotos
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {fotosProgress?.atualizados ?? 0} fotos... ({fotosProgress?.restantes ?? '?'} restantes)</>
              : <><ImagePlus className="w-4 h-4" /> Recuperar Fotos</>}
          </button>
          {fotosProgress && !recuperandoFotos && (
            <span className="text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-lg">
              ✓ {fotosProgress.atualizados} foto{fotosProgress.atualizados !== 1 ? 's' : ''} recuperada{fotosProgress.atualizados !== 1 ? 's' : ''}
              {fotosProgress.restantes > 0 ? ` · ${fotosProgress.restantes} ainda sem foto no Bling` : ' · Todos atualizados!'}
            </span>
          )}
          {fotosErro && (
            <span className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
              ✗ {fotosErro}
            </span>
          )}
          <button onClick={() => setShowCsv(!showCsv)} className="flex items-center gap-2 text-xs font-semibold text-purple-400 bg-purple-500/10 px-4 py-2 rounded-xl hover:bg-purple-500/20 transition-all cursor-pointer">
            <Upload className="w-4 h-4" />{showCsv ? 'Fechar CSV' : 'Importar CSV'}
          </button>
        </div>
      </div>

      {/* ── Modal Importar do Bling ── */}
      {blingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
                  <Package className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Importar Produtos do Bling</p>
                  <p className="text-[11px] text-zinc-500">Sincronização por código SKU — sem duplicatas</p>
                </div>
              </div>
              <button onClick={fecharBlingModal} className="text-zinc-500 hover:text-white text-xl leading-none cursor-pointer">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Informações da funcionalidade */}
              <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-3 text-[11px] text-zinc-500 space-y-1">
                <p className="font-bold text-zinc-400 mb-1">ℹ️ Como funciona:</p>
                <p>• Busca todos os produtos ativos do Bling</p>
                <p>• Usa o <strong className="text-zinc-300">Código SKU</strong> para evitar duplicatas</p>
                <p>• Produtos já existentes são <strong className="text-zinc-300">atualizados</strong></p>
                <p>• Fotos são importadas direto da URL do Bling</p>
              </div>

              {/* ETAPA: Preview carregando */}
              {blingStep === 'preview' && blingLoading && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                  <div>
                    <p className="text-white font-bold text-sm">Consultando Bling...</p>
                    <p className="text-zinc-500 text-xs">Verificando produtos e comparando com base local</p>
                  </div>
                </div>
              )}

              {/* ETAPA: Preview pronto */}
              {blingStep === 'preview' && !blingLoading && blingPreview && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-zinc-400 uppercase">Resumo da sincronização</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-dark-800/80 border border-dark-700/40 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-white">{blingPreview.totalBling}</p>
                      <p className="text-[10px] text-zinc-500">Total no Bling</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-green-400">{blingPreview.novos}</p>
                      <p className="text-[10px] text-green-600">Produtos novos</p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-blue-400">{blingPreview.jaExistem}</p>
                      <p className="text-[10px] text-blue-600">Serão atualizados</p>
                    </div>
                    <div className="bg-zinc-800/40 border border-dark-700/40 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-zinc-500">{blingPreview.semCodigo}</p>
                      <p className="text-[10px] text-zinc-600">Sem SKU (ignorados)</p>
                    </div>
                  </div>
                  {blingPreview.semCodigo > 0 && (
                    <p className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      ⚠️ {blingPreview.semCodigo} produto(s) sem código SKU não serão importados. Cadastre o código no Bling para incluí-los.
                    </p>
                  )}
                  <button onClick={handleBlingImport}
                    className="w-full py-3 rounded-xl font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 cursor-pointer transition-all flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    Importar {blingPreview.seraoImportados} produto(s)
                  </button>
                </div>
              )}

              {/* ETAPA: Importando */}
              {blingStep === 'importing' && (
                <div className="text-center py-8 space-y-3">
                  <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto" />
                  <p className="text-white font-bold">Importando produtos...</p>
                  <p className="text-zinc-500 text-xs">Buscando detalhes e fotos de cada produto no Bling.<br />Isso pode levar alguns minutos.</p>
                </div>
              )}

              {/* ETAPA: Concluído */}
              {blingStep === 'done' && blingResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
                    <div>
                      <p className="text-green-400 font-bold text-sm">Importação concluída!</p>
                      <p className="text-zinc-400 text-xs mt-0.5">
                        {blingResult.criados} criados · {blingResult.atualizados} atualizados · {blingResult.semFoto} sem foto · {blingResult.erros} erros
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-dark-800/60 rounded-xl p-3">
                      <p className="text-lg font-black text-green-400">{blingResult.criados}</p>
                      <p className="text-[10px] text-zinc-600">Criados</p>
                    </div>
                    <div className="bg-dark-800/60 rounded-xl p-3">
                      <p className="text-lg font-black text-blue-400">{blingResult.atualizados}</p>
                      <p className="text-[10px] text-zinc-600">Atualizados</p>
                    </div>
                    <div className="bg-dark-800/60 rounded-xl p-3">
                      <p className="text-lg font-black text-amber-400">{blingResult.semFoto}</p>
                      <p className="text-[10px] text-zinc-600">Sem foto</p>
                    </div>
                  </div>
                  <button onClick={fecharBlingModal}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-dark-700 hover:bg-dark-600 cursor-pointer transition-all">
                    Fechar
                  </button>
                </div>
              )}

              {/* ETAPA: Erro */}
              {blingStep === 'error' && blingResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 font-bold text-sm">Erro na importação</p>
                      <p className="text-zinc-400 text-xs mt-1">{blingResult.mensagem}</p>
                    </div>
                  </div>
                  <button onClick={handleBlingPreview}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 cursor-pointer transition-all flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Tentar novamente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV Import */}
      {showCsv && (
        <div className="bg-dark-800/60 border border-purple-500/30 rounded-2xl p-5 mb-6">
          <p className="text-xs text-zinc-400 mb-2">Formato: <code className="text-purple-400">SKU, Nome, Preço, Peso, Categoria, Subcategoria, À Vista, A Prazo</code> (separado por vírgula ou ponto e vírgula)</p>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={5} placeholder="BIKE01, BikeErg Concept 2, 18900, 30, Cardio" className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 mb-3 font-mono" />
          <button onClick={handleCsvImport} disabled={saving} className="flex items-center gap-2 bg-purple-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-purple-500 transition-all cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importar
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">{editId ? 'Editar Produto' : 'Novo Produto'}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <input placeholder="SKU" value={form.codigo_sku} onChange={e => setForm({...form, codigo_sku: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Nome *" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="lg:col-span-2 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Preço Tabela" type="number" value={form.preco} onChange={e => setForm({...form, preco: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="À Vista (opc.)" type="number" value={form.preco_avista} onChange={e => setForm({...form, preco_avista: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50" />
          <input placeholder="A Prazo (opc.)" type="number" value={form.preco_prazo} onChange={e => setForm({...form, preco_prazo: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500/50" />
          <input placeholder="Peso (kg)" type="number" value={form.peso_kg} onChange={e => setForm({...form, peso_kg: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer">
            <option value="">Sem Categoria...</option>
            {categorias.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={form.subcategoria} onChange={e => setForm({...form, subcategoria: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer">
            <option value="">Sem Subcategoria...</option>
            {subcategorias.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-3 items-center">
          <input placeholder="URL da Imagem ou Vídeo" value={form.url_imagem} onChange={e => setForm({...form, url_imagem: e.target.value})} className="flex-1 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          
          <label className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${uploadingMedia ? 'bg-dark-700 text-zinc-500' : 'bg-dark-800 border border-dark-600 text-zinc-300 hover:bg-dark-700 hover:text-white'}`}>
            {uploadingMedia ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {uploadingMedia ? 'Enviando...' : 'Anexar Mídia'}
            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} disabled={uploadingMedia} />
          </label>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving || !form.nome} className="flex items-center gap-2 bg-neon text-dark-950 text-sm font-bold px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-neon/25 transition-all cursor-pointer disabled:opacity-30">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editId ? 'Atualizar' : 'Salvar'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm({ codigo_sku: '', nome: '', preco: '', preco_avista: '', preco_prazo: '', peso_kg: '', url_imagem: '', categoria: '', subcategoria: '' }); }} className="text-sm text-zinc-400 px-4 py-2.5 rounded-xl hover:bg-dark-700 cursor-pointer">Cancelar</button>}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-dark-800/60 border border-dark-700/50 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-neon/50" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>
      ) : (
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '80px' }} />
              <col />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '60px' }} />
            </colgroup>
            <thead><tr className="border-b border-dark-700/50 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">SKU</th><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Subcategoria</th><th className="text-right px-4 py-3">Preço</th><th className="text-right px-4 py-3">À Vista</th><th className="text-right px-4 py-3">A Prazo</th><th className="text-right px-4 py-3">Peso</th><th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-dark-700/30 hover:bg-dark-800/80 transition-colors">
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs truncate">{p.codigo_sku || '—'}</td>
                  <td className="px-4 py-3 text-white font-medium" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                    <EditableCell value={p.nome} onSave={val => handleInlineUpdate(p.id, 'nome', val)} />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell 
                      value={p.categoria || ''} 
                      options={categorias}
                      onSave={val => handleInlineUpdate(p.id, 'categoria', val)} 
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell 
                      value={p.subcategoria || ''} 
                      options={subcategorias}
                      onSave={val => handleInlineUpdate(p.id, 'subcategoria', val)} 
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-neon/50 text-xs">R$</span>
                      <EditableCell value={p.preco} onSave={val => handleInlineUpdate(p.id, 'preco', val)} className="text-right text-neon font-semibold w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-emerald-500/50 text-xs">R$</span>
                      <EditableCell value={p.preco_avista ?? ''} onSave={val => handleInlineUpdate(p.id, 'preco_avista', val)} placeholder="—" className="text-right text-emerald-400 font-semibold w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-blue-500/50 text-xs">R$</span>
                      <EditableCell value={p.preco_prazo ?? ''} onSave={val => handleInlineUpdate(p.id, 'preco_prazo', val)} placeholder="—" className="text-right text-blue-400 font-semibold w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <EditableCell value={p.peso_kg || ''} onSave={val => handleInlineUpdate(p.id, 'peso_kg', val)} className="text-right text-zinc-300 w-16" />
                      <span className="text-zinc-500 text-xs">kg</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer text-xs">Excluir</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-zinc-500">Nenhum produto encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Plus, Trash2, Save, Upload, Loader2, AlertTriangle, Search, ImagePlus } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const EditableCell = ({ value, onSave, type = "text", className = "", options = null }) => {
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
      onChange={e => setVal(e.target.value)}
      onBlur={handleBlur}
      className={`bg-transparent px-1 border-b border-transparent hover:border-dark-600 focus:border-neon focus:outline-none w-full ${className}`}
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
      finalValue = Number(value.toString().replace(',', '.'));
      if (isNaN(finalValue)) finalValue = null;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Produtos</h1>
        <button onClick={() => setShowCsv(!showCsv)} className="flex items-center gap-2 text-xs font-semibold text-purple-400 bg-purple-500/10 px-4 py-2 rounded-xl hover:bg-purple-500/20 transition-all cursor-pointer">
          <Upload className="w-4 h-4" />{showCsv ? 'Fechar CSV' : 'Importar CSV'}
        </button>
      </div>

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
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-700/50 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">SKU</th><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Subcategoria</th><th className="text-right px-4 py-3">Preço</th><th className="text-right px-4 py-3">À Vista</th><th className="text-right px-4 py-3">A Prazo</th><th className="text-right px-4 py-3">Peso</th><th className="px-4 py-3 w-20"></th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-dark-700/30 hover:bg-dark-800/80 transition-colors">
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{p.codigo_sku || '—'}</td>
                  <td className="px-4 py-3 text-white font-medium">
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
                      {p.preco_avista != null && <span className="text-emerald-500/50 text-xs">R$</span>}
                      <EditableCell value={p.preco_avista ?? ''} onSave={val => handleInlineUpdate(p.id, 'preco_avista', val)} className="text-right text-emerald-400 font-semibold w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {p.preco_prazo != null && <span className="text-blue-500/50 text-xs">R$</span>}
                      <EditableCell value={p.preco_prazo ?? ''} onSave={val => handleInlineUpdate(p.id, 'preco_prazo', val)} className="text-right text-blue-400 font-semibold w-20" />
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

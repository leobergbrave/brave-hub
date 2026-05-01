import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Plus, Trash2, Save, Upload, Loader2, AlertTriangle, Search } from 'lucide-react';

export default function ProdutosTab() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ codigo_sku: '', nome: '', preco: '', peso_kg: '', url_imagem: '', linha: 'Geral' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showCsv, setShowCsv] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('produtos').select('*').order('nome');
    setProdutos(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.nome) return;
    setSaving(true);
    const payload = { ...form, preco: Number(form.preco) || 0, peso_kg: form.peso_kg ? Number(form.peso_kg) : null };
    if (editId) {
      await supabase.from('produtos').update(payload).eq('id', editId);
    } else {
      await supabase.from('produtos').insert(payload);
    }
    setForm({ codigo_sku: '', nome: '', preco: '', peso_kg: '', url_imagem: '', linha: 'Geral' });
    setEditId(null);
    setSaving(false);
    load();
  };

  const handleEdit = (p) => {
    setEditId(p.id);
    setForm({ codigo_sku: p.codigo_sku || '', nome: p.nome, preco: p.preco, peso_kg: p.peso_kg || '', url_imagem: p.url_imagem || '', linha: p.linha || 'Geral' });
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
      
      rows.push({
        codigo_sku: cols[0] || null,
        nome: cols[1],
        preco: Number(precoStr.replace(',', '.')) || 0,
        peso_kg: pesoStr && pesoStr !== '0' ? Number(pesoStr.replace(',', '.')) : null,
        linha: cols[4] || 'Geral',
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
          <p className="text-xs text-zinc-400 mb-2">Formato: <code className="text-purple-400">SKU, Nome, Preço, Peso, Linha</code> (separado por vírgula ou ponto e vírgula)</p>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={5} placeholder="BIKE01, BikeErg Concept 2, 18900, 30, Cardio" className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 mb-3 font-mono" />
          <button onClick={handleCsvImport} disabled={saving} className="flex items-center gap-2 bg-purple-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-purple-500 transition-all cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importar
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">{editId ? 'Editar Produto' : 'Novo Produto'}</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <input placeholder="SKU" value={form.codigo_sku} onChange={e => setForm({...form, codigo_sku: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Nome *" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="lg:col-span-2 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Preço" type="number" value={form.preco} onChange={e => setForm({...form, preco: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Peso (kg)" type="number" value={form.peso_kg} onChange={e => setForm({...form, peso_kg: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <select value={form.linha} onChange={e => setForm({...form, linha: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer">
            {['Geral','Cardio','Rigs','Pisos','Acessórios','Barras','Anilhas','Kettlebells','Boxes'].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <input placeholder="URL da Imagem" value={form.url_imagem} onChange={e => setForm({...form, url_imagem: e.target.value})} className="w-full mt-3 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving || !form.nome} className="flex items-center gap-2 bg-neon text-dark-950 text-sm font-bold px-5 py-2.5 rounded-xl hover:shadow-lg hover:shadow-neon/25 transition-all cursor-pointer disabled:opacity-30">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editId ? 'Atualizar' : 'Salvar'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm({ codigo_sku: '', nome: '', preco: '', peso_kg: '', url_imagem: '', linha: 'Geral' }); }} className="text-sm text-zinc-400 px-4 py-2.5 rounded-xl hover:bg-dark-700 cursor-pointer">Cancelar</button>}
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
              <th className="text-left px-4 py-3">SKU</th><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Linha</th><th className="text-right px-4 py-3">Preço</th><th className="text-right px-4 py-3">Peso</th><th className="px-4 py-3 w-20"></th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-dark-700/30 hover:bg-dark-800/80 transition-colors">
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{p.codigo_sku || '—'}</td>
                  <td className="px-4 py-3 text-white font-medium">{p.nome}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-dark-700 text-zinc-300 px-2 py-0.5 rounded-full">{p.linha || 'Geral'}</span></td>
                  <td className="px-4 py-3 text-right text-neon font-semibold">{formatCurrency(Number(p.preco))}</td>
                  <td className="px-4 py-3 text-right">{p.peso_kg ? <span className="text-zinc-300">{p.peso_kg} kg</span> : <AlertTriangle className="w-4 h-4 text-amber-400 inline" />}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleEdit(p)} className="text-zinc-500 hover:text-neon mr-2 cursor-pointer text-xs">Editar</button>
                    <button onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer text-xs">Excluir</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-zinc-500">Nenhum produto encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

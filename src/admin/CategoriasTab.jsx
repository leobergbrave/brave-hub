import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Trash2, Plus, Save } from 'lucide-react';

export default function CategoriasTab() {
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novaSubcategoria, setNovaSubcategoria] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, subRes] = await Promise.all([
      supabase.from('categorias').select('*').order('nome'),
      supabase.from('subcategorias').select('*').order('nome')
    ]);
    setCategorias(catRes.data || []);
    setSubcategorias(subRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCategoria = async () => {
    if (!novaCategoria.trim()) return;
    setSavingCat(true);
    await supabase.from('categorias').insert({ nome: novaCategoria.trim().toUpperCase() });
    setNovaCategoria('');
    setSavingCat(false);
    load();
  };

  const addSubcategoria = async () => {
    if (!novaSubcategoria.trim()) return;
    setSavingSub(true);
    await supabase.from('subcategorias').insert({ nome: novaSubcategoria.trim().toUpperCase() });
    setNovaSubcategoria('');
    setSavingSub(false);
    load();
  };

  const removeCategoria = async (id) => {
    if (!window.confirm('Excluir esta categoria? Cuidado, produtos associados podem ficar sem categoria.')) return;
    await supabase.from('categorias').delete().eq('id', id);
    load();
  };

  const removeSubcategoria = async (id) => {
    if (!window.confirm('Excluir esta subcategoria? Cuidado, produtos associados podem ficar sem subcategoria.')) return;
    await supabase.from('subcategorias').delete().eq('id', id);
    load();
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Categorias e Subcategorias</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Categorias */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">Categorias (antiga Linha)</h2>
          
          <div className="flex gap-2 mb-4">
            <input 
              placeholder="Nova categoria..." 
              value={novaCategoria} 
              onChange={e => setNovaCategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategoria()}
              className="flex-1 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50 uppercase" 
            />
            <button onClick={addCategoria} disabled={savingCat || !novaCategoria.trim()} className="bg-neon text-dark-950 px-4 rounded-xl font-bold disabled:opacity-50 hover:bg-neon/80 transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2">
            {categorias.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-dark-900/50 px-4 py-3 rounded-xl border border-dark-700/30">
                <span className="font-semibold text-white">{c.nome}</span>
                <button onClick={() => removeCategoria(c.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {categorias.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">Nenhuma categoria cadastrada</p>}
          </div>
        </div>

        {/* Subcategorias */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">Subcategorias</h2>
          
          <div className="flex gap-2 mb-4">
            <input 
              placeholder="Nova subcategoria..." 
              value={novaSubcategoria} 
              onChange={e => setNovaSubcategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSubcategoria()}
              className="flex-1 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50 uppercase" 
            />
            <button onClick={addSubcategoria} disabled={savingSub || !novaSubcategoria.trim()} className="bg-purple-600 text-white px-4 rounded-xl font-bold disabled:opacity-50 hover:bg-purple-500 transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2">
            {subcategorias.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-dark-900/50 px-4 py-3 rounded-xl border border-dark-700/30">
                <span className="font-semibold text-white">{s.nome}</span>
                <button onClick={() => removeSubcategoria(s.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {subcategorias.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">Nenhuma subcategoria cadastrada</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

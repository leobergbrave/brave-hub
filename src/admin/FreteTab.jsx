import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Trash2, Plus, Loader2 } from 'lucide-react';

export default function FreteTab() {
  const [regras, setRegras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ estado: '', zona: '', multiplicador: '', valor_minimo: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('regras_frete').select('*').order('estado').order('zona');
    setRegras(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.estado || !form.zona) return;
    setSaving(true);
    await supabase.from('regras_frete').upsert({ estado: form.estado.toUpperCase(), zona: form.zona.toUpperCase(), multiplicador: Number(form.multiplicador) || 1, valor_minimo: Number(form.valor_minimo) || 0 }, { onConflict: 'estado,zona' });
    setForm({ estado: '', zona: '', multiplicador: '', valor_minimo: '' });
    setSaving(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta regra?')) return;
    await supabase.from('regras_frete').delete().eq('id', id);
    load();
  };

  const handleInlineEdit = async (id, field, value) => {
    await supabase.from('regras_frete').update({ [field]: Number(value) }).eq('id', id);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Regras de Frete</h1>
      {/* Add form */}
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Nova Regra</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <input placeholder="Estado (UF)" value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-accent/50" />
          <input placeholder="Zona" value={form.zona} onChange={e => setForm({...form, zona: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-accent/50" />
          <input placeholder="Multiplicador" type="number" step="0.1" value={form.multiplicador} onChange={e => setForm({...form, multiplicador: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-accent/50" />
          <input placeholder="Valor Mínimo" type="number" value={form.valor_minimo} onChange={e => setForm({...form, valor_minimo: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-accent/50" />
          <button onClick={handleAdd} disabled={saving} className="flex items-center justify-center gap-2 bg-orange-accent text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-orange-accent/25 transition-all cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </div>
      </div>
      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>
      ) : (
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-700/50 text-xs text-zinc-500 uppercase">
              <th className="text-left px-4 py-3">Estado</th><th className="text-left px-4 py-3">Zona</th><th className="text-right px-4 py-3">Multiplicador</th><th className="text-right px-4 py-3">Mínimo</th><th className="px-4 py-3 w-16"></th>
            </tr></thead>
            <tbody>
              {regras.map(r => (
                <tr key={r.id} className="border-b border-dark-700/30 hover:bg-dark-800/80 transition-colors">
                  <td className="px-4 py-3 text-white font-semibold">{r.estado}</td>
                  <td className="px-4 py-3 text-zinc-300">{r.zona}</td>
                  <td className="px-4 py-3 text-right"><input type="number" step="0.1" defaultValue={r.multiplicador} onBlur={e => handleInlineEdit(r.id, 'multiplicador', e.target.value)} className="w-20 bg-transparent text-right text-orange-accent font-semibold focus:outline-none focus:bg-dark-700 rounded px-1" /></td>
                  <td className="px-4 py-3 text-right"><input type="number" defaultValue={r.valor_minimo} onBlur={e => handleInlineEdit(r.id, 'valor_minimo', e.target.value)} className="w-24 bg-transparent text-right text-zinc-300 focus:outline-none focus:bg-dark-700 rounded px-1" /></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => handleDelete(r.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

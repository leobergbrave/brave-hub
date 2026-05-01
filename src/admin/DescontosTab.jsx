import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Trash2, Plus, Loader2, Percent, TrendingUp, UserCog } from 'lucide-react';

export default function DescontosTab() {
  const [linhas, setLinhas] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [maxManual, setMaxManual] = useState('12');
  const [loading, setLoading] = useState(true);
  const [formL, setFormL] = useState({ linha: '', percentual: '' });
  const [formV, setFormV] = useState({ valor_minimo: '', percentual: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: l }, { data: v }, { data: c }] = await Promise.all([
      supabase.from('descontos_linha').select('*').order('linha'),
      supabase.from('descontos_volume').select('*').order('valor_minimo'),
      supabase.from('config').select('*').eq('chave', 'desconto_manual_max').single(),
    ]);
    setLinhas(l || []);
    setVolumes(v || []);
    if (c) setMaxManual(c.valor);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addLinha = async () => {
    if (!formL.linha) return;
    await supabase.from('descontos_linha').upsert({ linha: formL.linha, percentual: Number(formL.percentual) || 0 }, { onConflict: 'linha' });
    setFormL({ linha: '', percentual: '' });
    load();
  };

  const addVolume = async () => {
    if (!formV.valor_minimo) return;
    await supabase.from('descontos_volume').insert({ valor_minimo: Number(formV.valor_minimo), percentual: Number(formV.percentual) || 0 });
    setFormV({ valor_minimo: '', percentual: '' });
    load();
  };

  const delLinha = async (id) => { await supabase.from('descontos_linha').delete().eq('id', id); load(); };
  const delVolume = async (id) => { await supabase.from('descontos_volume').delete().eq('id', id); load(); };

  const editLinha = async (id, val) => { await supabase.from('descontos_linha').update({ percentual: Number(val) }).eq('id', id); };
  const editVolume = async (id, field, val) => { await supabase.from('descontos_volume').update({ [field]: Number(val) }).eq('id', id); };

  const saveMax = async () => {
    await supabase.from('config').update({ valor: maxManual }).eq('chave', 'desconto_manual_max');
  };

  if (loading) return <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Regras de Desconto</h1>

      {/* ── Desconto por Linha ── */}
      <section className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4"><Percent className="w-5 h-5 text-emerald-400" /><h2 className="text-sm font-bold text-white uppercase tracking-wider">Desconto por Linha de Produto</h2></div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <input placeholder="Linha (ex: Cardio)" value={formL.linha} onChange={e => setFormL({...formL, linha: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50" />
          <input placeholder="% desconto" type="number" value={formL.percentual} onChange={e => setFormL({...formL, percentual: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50" />
          <button onClick={addLinha} className="flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-500 transition-all cursor-pointer"><Plus className="w-4 h-4" /> Adicionar</button>
        </div>
        <div className="space-y-2">
          {linhas.map(l => (
            <div key={l.id} className="flex items-center gap-3 bg-dark-900/50 rounded-xl px-4 py-3">
              <span className="text-sm text-white font-medium flex-1">{l.linha}</span>
              <input type="number" defaultValue={l.percentual} onBlur={e => editLinha(l.id, e.target.value)} className="w-20 bg-transparent text-right text-emerald-400 font-bold focus:outline-none focus:bg-dark-700 rounded px-1" />
              <span className="text-emerald-400 text-sm">%</span>
              <button onClick={() => delLinha(l.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Desconto por Volume ── */}
      <section className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-purple-400" /><h2 className="text-sm font-bold text-white uppercase tracking-wider">Desconto por Faixa de Valor</h2></div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <input placeholder="Valor mínimo (R$)" type="number" value={formV.valor_minimo} onChange={e => setFormV({...formV, valor_minimo: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500/50" />
          <input placeholder="% desconto" type="number" value={formV.percentual} onChange={e => setFormV({...formV, percentual: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500/50" />
          <button onClick={addVolume} className="flex items-center justify-center gap-2 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-500 transition-all cursor-pointer"><Plus className="w-4 h-4" /> Adicionar</button>
        </div>
        <div className="space-y-2">
          {volumes.map(v => (
            <div key={v.id} className="flex items-center gap-3 bg-dark-900/50 rounded-xl px-4 py-3">
              <span className="text-sm text-zinc-400">Acima de</span>
              <input type="number" defaultValue={v.valor_minimo} onBlur={e => editVolume(v.id, 'valor_minimo', e.target.value)} className="w-28 bg-transparent text-white font-semibold focus:outline-none focus:bg-dark-700 rounded px-1" />
              <span className="text-zinc-500 flex-1">→</span>
              <input type="number" defaultValue={v.percentual} onBlur={e => editVolume(v.id, 'percentual', e.target.value)} className="w-16 bg-transparent text-right text-purple-400 font-bold focus:outline-none focus:bg-dark-700 rounded px-1" />
              <span className="text-purple-400 text-sm">%</span>
              <button onClick={() => delVolume(v.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Desconto Manual ── */}
      <section className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4"><UserCog className="w-5 h-5 text-amber-400" /><h2 className="text-sm font-bold text-white uppercase tracking-wider">Limite de Desconto Manual (Consultor)</h2></div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Máximo permitido:</span>
          <input type="number" value={maxManual} onChange={e => setMaxManual(e.target.value)} className="w-20 bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 text-center focus:outline-none focus:border-amber-500/50" />
          <span className="text-amber-400 font-bold">%</span>
          <button onClick={saveMax} className="flex items-center gap-2 bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-amber-500 transition-all cursor-pointer"><Save className="w-4 h-4" /> Salvar</button>
        </div>
      </section>
    </div>
  );
}

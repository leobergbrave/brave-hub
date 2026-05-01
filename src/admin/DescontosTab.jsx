import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Plus, Trash2, Loader2, Tag, Save, UserCog } from 'lucide-react';

export default function DescontosTab() {
  const [regras, setRegras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxManual, setMaxManual] = useState('12');
  const [form, setForm] = useState({ linha: '', valor_min: '0', valor_max: '', desconto_cartao: '', desconto_pix: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: cfg }] = await Promise.all([
      supabase.from('regras_desconto').select('*').order('linha').order('valor_min'),
      supabase.from('config').select('*').eq('chave', 'desconto_manual_max').single(),
    ]);
    setRegras(data || []);
    if (cfg) setMaxManual(cfg.valor);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.linha || form.desconto_cartao === '' || form.desconto_pix === '') return;
    setSaving(true);
    await supabase.from('regras_desconto').insert({
      linha: form.linha.toUpperCase(),
      valor_min: Number(form.valor_min) || 0,
      valor_max: form.valor_max ? Number(form.valor_max) : null,
      desconto_cartao: Number(form.desconto_cartao),
      desconto_pix: Number(form.desconto_pix),
    });
    setForm({ linha: '', valor_min: '0', valor_max: '', desconto_cartao: '', desconto_pix: '' });
    setSaving(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta regra?')) return;
    await supabase.from('regras_desconto').delete().eq('id', id);
    load();
  };

  const handleInline = async (id, field, value) => {
    const val = field === 'valor_max' && value === '' ? null : Number(value);
    await supabase.from('regras_desconto').update({ [field]: val }).eq('id', id);
  };

  const saveMax = async () => {
    await supabase.from('config').update({ valor: maxManual }).eq('chave', 'desconto_manual_max');
  };

  // Group by linha
  const grouped = {};
  regras.forEach(r => {
    if (!grouped[r.linha]) grouped[r.linha] = [];
    grouped[r.linha].push(r);
  });

  if (loading) return <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Regras de Desconto</h1>

      {/* Add Form */}
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Nova Regra</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <input placeholder="Linha (ex: CROSS)" value={form.linha} onChange={e => setForm({...form, linha: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Valor mín (R$)" type="number" value={form.valor_min} onChange={e => setForm({...form, valor_min: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="Valor máx (vazio=∞)" type="number" value={form.valor_max} onChange={e => setForm({...form, valor_max: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
          <input placeholder="% Cartão" type="number" value={form.desconto_cartao} onChange={e => setForm({...form, desconto_cartao: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500/50" />
          <input placeholder="% PIX" type="number" value={form.desconto_pix} onChange={e => setForm({...form, desconto_pix: e.target.value})} className="bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50" />
          <button onClick={handleAdd} disabled={saving} className="flex items-center justify-center gap-2 bg-neon text-dark-950 text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-neon/25 transition-all cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">Deixe "Valor máx" vazio para faixas "acima de..." (sem teto)</p>
      </div>

      {/* Grouped Rules */}
      {Object.entries(grouped).map(([linha, rules]) => (
        <section key={linha} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-700/50 flex items-center gap-2">
            <Tag className="w-5 h-5 text-neon" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Linha {linha}</h2>
            <span className="text-xs text-zinc-500 ml-2">{rules.length} faixa{rules.length > 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-700/40 text-[11px] text-zinc-500 uppercase">
              <th className="text-left px-5 py-2.5">Faixa de Valor</th>
              <th className="text-center px-5 py-2.5">💳 Cartão</th>
              <th className="text-center px-5 py-2.5">⚡ PIX</th>
              <th className="w-12"></th>
            </tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-dark-700/20 hover:bg-dark-800/80 transition-colors">
                  <td className="px-5 py-3 text-zinc-300">
                    {r.valor_max ? (
                      <span>
                        {r.valor_min === 0 ? 'Até' : `${formatCurrency(r.valor_min)} a`}{' '}
                        <span className="text-white font-semibold">{formatCurrency(r.valor_max)}</span>
                      </span>
                    ) : (
                      <span>Acima de <span className="text-white font-semibold">{formatCurrency(r.valor_min)}</span></span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <input type="number" defaultValue={r.desconto_cartao} onBlur={e => handleInline(r.id, 'desconto_cartao', e.target.value)} className="w-14 bg-transparent text-center text-blue-400 font-bold focus:outline-none focus:bg-dark-700 rounded px-1" />
                      <span className="text-blue-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <input type="number" defaultValue={r.desconto_pix} onBlur={e => handleInline(r.id, 'desconto_pix', e.target.value)} className="w-14 bg-transparent text-center text-emerald-400 font-bold focus:outline-none focus:bg-dark-700 rounded px-1" />
                      <span className="text-emerald-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {Object.keys(grouped).length === 0 && (
        <p className="text-zinc-500 text-center py-8">Nenhuma regra cadastrada. Adicione acima.</p>
      )}

      {/* Manual Discount Config */}
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

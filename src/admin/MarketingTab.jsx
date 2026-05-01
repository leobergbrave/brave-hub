import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Save, MessageCircle, AlertTriangle, PlayCircle, Image as ImageIcon } from 'lucide-react';

export default function MarketingTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('marketing_templates').select('*').order('dias_delay', { ascending: true });
    if (!error && data) {
      setTemplates(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id, field, value) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleSave = async (id) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;
    
    setSaving(id);
    await supabase.from('marketing_templates').update({
      mensagem: template.mensagem,
      media_url: template.media_url,
      ativo: template.ativo
    }).eq('id', id);
    
    setTimeout(() => setSaving(null), 1000);
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Automações de Marketing</h1>
        <p className="text-sm text-zinc-400">Configure as mensagens de follow-up que serão enviadas para clientes com orçamentos pendentes.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Carregando campanhas...</div>
      ) : templates.length === 0 ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 flex gap-4 text-amber-400">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <h3 className="font-bold mb-1">Atenção: Tabela não encontrada</h3>
            <p className="text-sm">Por favor, execute o script SQL de criação da tabela <code>marketing_templates</code> no seu Supabase.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {templates.map(t => (
            <div key={t.id} className={`bg-dark-800/60 border ${t.ativo ? 'border-dark-700/50' : 'border-dark-700/20 opacity-60'} rounded-2xl p-6 transition-all`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.ativo ? 'bg-neon/10 text-neon' : 'bg-dark-700 text-dark-500'}`}>
                    <PlayCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{t.nome}</h3>
                    <p className="text-xs text-zinc-500">Disparo automático em {t.dias_delay} dias após a geração do link.</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-zinc-400">Ativar Campanha</span>
                  <input type="checkbox" checked={t.ativo} onChange={(e) => {
                    handleUpdate(t.id, 'ativo', e.target.checked);
                    // Autosave the checkbox state to avoid forgetting
                    supabase.from('marketing_templates').update({ ativo: e.target.checked }).eq('id', t.id);
                  }} className="w-4 h-4 text-neon rounded bg-dark-700 border-dark-600 focus:ring-neon focus:ring-offset-dark-900" />
                </label>
              </div>

              <div className="space-y-4 pl-13">
                {/* Mensagem Text */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Texto da Mensagem (WhatsApp)</label>
                  <div className="relative">
                    <textarea 
                      value={t.mensagem}
                      onChange={(e) => handleUpdate(t.id, 'mensagem', e.target.value)}
                      rows={4}
                      className="w-full bg-dark-900/50 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-all placeholder:text-dark-500"
                      placeholder="Ex: Fala {cliente}, tudo bem?..."
                    />
                    <MessageCircle className="absolute right-3 top-3 w-4 h-4 text-dark-500/50" />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1.5 flex gap-2">
                    <span>Use a variável <strong className="text-neon">{"{cliente}"}</strong> para inserir o nome do box.</span>
                  </p>
                </div>

                {/* Media URL */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Anexo de Mídia (URL do Drive/Imagem)</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={t.media_url || ''}
                      onChange={(e) => handleUpdate(t.id, 'media_url', e.target.value)}
                      className="w-full bg-dark-900/50 border border-dark-600 text-white text-sm rounded-xl px-4 py-2 pl-10 focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
                      placeholder="https://drive.google.com/..."
                    />
                    <ImageIcon className="absolute left-3 top-2.5 w-4 h-4 text-dark-500/80" />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Opcional. Adicione o link de um vídeo, PDF ou imagem para enviar junto com a mensagem.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={() => handleSave(t.id)}
                    disabled={saving === t.id}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-neon text-dark-950 font-bold text-sm hover:bg-neon/90 transition-colors disabled:opacity-50"
                  >
                    {saving === t.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar Modelo</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

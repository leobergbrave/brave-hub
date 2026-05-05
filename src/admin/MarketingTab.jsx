import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Save, MessageCircle, AlertTriangle, PlayCircle, Image as ImageIcon, Send, Smartphone } from 'lucide-react';

export default function MarketingTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [testing, setTesting] = useState(null);
  const [pendingDisparos, setPendingDisparos] = useState([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: tData, error } = await supabase.from('marketing_templates').select('*').order('dias_delay', { ascending: true });
    
    if (!error && tData) {
      setTemplates(tData);
      
      // Calculate Disparos
      const { data: orcs } = await supabase.from('orcamentos_salvos').select('*');
      const activeTemplates = tData.filter(t => t.ativo).sort((a, b) => b.dias_delay - a.dias_delay);
      const now = new Date();
      const disparos = [];

      for (const o of (orcs || [])) {
        if ((o.payload?.status || 'Pendente') !== 'Pendente') continue;
        if (!o.payload?.telefoneCliente) continue;

        const dateCreated = new Date(o.criado_em);
        const diffTime = Math.abs(now - dateCreated);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const marketingSent = o.payload?.marketing_sent || [];
        
        for (const t of activeTemplates) {
          if (diffDays >= t.dias_delay && !marketingSent.includes(t.id)) {
            disparos.push({ orcamento: o, template: t });
            break;
          }
        }
      }
      setPendingDisparos(disparos);
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

  const handleDisparar = async () => {
    const webhookUrl = import.meta.env.VITE_BOTCONVERSA_WEBHOOK;
    if (!webhookUrl) {
      alert("⚠️ A URL do Webhook do BotConversa (VITE_BOTCONVERSA_WEBHOOK) não está configurada na Vercel!");
      return;
    }

    setSending(true);
    let successCount = 0;

    for (const d of pendingDisparos) {
      try {
        const mensagemFormatada = d.template.mensagem.replace(/{cliente}/g, d.orcamento.cliente);
        
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: d.orcamento.cliente,
            telefone: d.orcamento.payload.telefoneCliente,
            consultor: d.orcamento.consultor,
            campanha: d.template.nome,
            mensagem_formatada: mensagemFormatada,
            media_url: d.template.media_url || ''
          })
        });

        // Save progress to avoid sending again tomorrow
        const sent = d.orcamento.payload.marketing_sent || [];
        const newPayload = { ...d.orcamento.payload, marketing_sent: [...sent, d.template.id] };
        await supabase.from('orcamentos_salvos').update({ payload: newPayload }).eq('id', d.orcamento.id);
        
        successCount++;
      } catch (err) {
        console.error("Erro disparando:", err);
      }
    }

    setSending(false);
    alert(`Mágica feita! ${successCount} campanhas disparadas com sucesso!`);
    load(); // Refresh lists
  };

  const handleTestar = async (template) => {
    const webhookUrl = import.meta.env.VITE_BOTCONVERSA_WEBHOOK;
    if (!webhookUrl) {
      alert("⚠️ A URL do Webhook do BotConversa (VITE_BOTCONVERSA_WEBHOOK) não está configurada!");
      return;
    }

    const telefone = window.prompt("Digite o número do seu WhatsApp com DDD para receber o teste (ex: 11999999999):");
    if (!telefone) return;

    setTesting(template.id);
    try {
      const mensagemFormatada = template.mensagem.replace(/{cliente}/g, "BOX TESTE BRAVE");
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: "BOX TESTE BRAVE",
          telefone: telefone.replace(/\D/g, ''),
          consultor: "Consultor de Teste",
          campanha: `[TESTE] ${template.nome}`,
          mensagem_formatada: mensagemFormatada,
          media_url: template.media_url || ''
        })
      });

      alert("✅ Teste enviado com sucesso! Verifique seu WhatsApp em alguns instantes.");
    } catch (err) {
      console.error("Erro no teste:", err);
      alert("❌ Erro ao enviar teste. Verifique o console.");
    } finally {
      setTesting(null);
    }
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
          
          {/* Painel de Disparos do Dia */}
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Disparos de Hoje</h2>
              <p className="text-sm text-blue-200/70">
                {pendingDisparos.length === 0 
                  ? "Todos os follow-ups estão em dia. Nenhuma mensagem pendente hoje." 
                  : `Temos ${pendingDisparos.length} cliente${pendingDisparos.length > 1 ? 's' : ''} aguardando follow-up neste momento.`}
              </p>
            </div>
            
            <button
              onClick={handleDisparar}
              disabled={pendingDisparos.length === 0 || sending}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 shadow-lg shadow-blue-500/20"
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</> : <><Send className="w-4 h-4" /> Enviar Campanhas de Hoje</>}
            </button>
          </div>
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

                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    onClick={() => handleTestar(t)}
                    disabled={testing === t.id}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg border border-dark-600 text-zinc-300 font-bold text-sm hover:bg-dark-700 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {testing === t.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Smartphone className="w-4 h-4" /> Testar no WhatsApp</>}
                  </button>
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

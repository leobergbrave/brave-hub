import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Eye, CheckCircle2, XCircle, TrendingUp, Save, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

const LOGO_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/branding/logo-brave.png';
const WHATSAPP_CONSULTOR = 'https://wa.me/5531973446109';

const DEFAULT_CONFIG = {
  from_name: 'Brave Equipamentos',
  from_email: 'contato@alwaysprofit.com.br',
  assunto_template: '{{nome}}, recebemos seu contato! 🏋️',
  texto_saudacao: 'Recebemos seu contato! Já preparamos as informações dos equipamentos que você tem interesse.',
  texto_corpo: 'Nosso consultor {{consultor}} já foi notificado e entrará em contato em breve com uma proposta personalizada.',
  texto_botao: '💬 Falar com o Consultor agora',
  texto_rodape: 'Brave Equipamentos · São Paulo, SP',
};

function renderTemplate(template, vars) {
  return (template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

function fmtBRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildPreviewHtml(config) {
  const vars = { nome: 'João', consultor: 'Léo Berg' };
  const saudacao = renderTemplate(config.texto_saudacao, vars);
  const corpo = renderTemplate(config.texto_corpo, vars);

  const produtoDemo = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#09090b;border:1px solid #27272a;border-radius:10px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#ffffff;">Bike Erg Brave</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">À vista</p>
            <p style="margin:3px 0 0;font-size:18px;font-weight:800;color:#4ade80;">${fmtBRL(5990)}</p>
          </td>
          <td style="text-align:right;">
            <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">12x cartão</p>
            <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#a1a1aa;">${fmtBRL(582.5)}/mês</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#09090b;border:1px solid #27272a;border-radius:10px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#ffffff;">Esteira Curva Premium</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">À vista</p>
            <p style="margin:3px 0 0;font-size:18px;font-weight:800;color:#4ade80;">${fmtBRL(14990)}</p>
          </td>
          <td style="text-align:right;">
            <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">12x cartão</p>
            <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#a1a1aa;">${fmtBRL(1374.17)}/mês</p>
          </td>
        </tr></table>
      </td></tr>
    </table>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:24px 12px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #27272a;">
        <img src="${LOGO_URL}" alt="Brave" height="32" style="display:block;height:32px;width:auto;" />
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#fff;">Olá, João! 👋</p>
        <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;">${saudacao}<br/><br/>${corpo}</p>
        <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#71717a;letter-spacing:2px;text-transform:uppercase;">Equipamentos de interesse</p>
        ${produtoDemo}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr><td align="center">
            <a href="${WHATSAPP_CONSULTOR}" style="display:inline-block;background:#4ade80;color:#09090b;font-weight:800;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:10px;">${config.texto_botao}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #27272a;">
        <p style="margin:0;font-size:11px;color:#52525b;text-align:center;line-height:1.5;">${config.texto_rodape}<br/>Você está recebendo este email porque nos enviou seu contato.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function FieldEditor({ label, value, onChange, multiline, hint }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>
        {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full bg-dark-900 border border-dark-600 focus:border-neon/50 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-neon/20 transition-all resize-none placeholder:text-dark-500"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-dark-900 border border-dark-600 focus:border-neon/50 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-neon/20 transition-all placeholder:text-dark-500"
        />
      )}
    </div>
  );
}

export default function EmailsTab() {
  const [section, setSection] = useState('historico');
  const [emails, setEmails] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: emailsData }, { data: configData }] = await Promise.all([
      supabase.from('emails_enviados').select('*, leads(nome)').order('criado_em', { ascending: false }),
      supabase.from('configuracoes_email').select('*').eq('id', 1).single(),
    ]);
    setEmails(emailsData || []);
    if (configData) setConfig(configData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = emails.length;
  const abertos = emails.filter(e => e.aberto).length;
  const falhou = emails.filter(e => e.status === 'falhou').length;
  const taxa = total > 0 ? ((abertos / total) * 100).toFixed(1) : '0.0';

  const previewHtml = useMemo(() => buildPreviewHtml(config), [config]);

  const updateConfig = (field) => (value) => setConfig(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('configuracoes_email')
      .upsert({ ...config, id: 1, atualizado_em: new Date().toISOString() });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-zinc-500 py-16 justify-center">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Emails</h1>
        <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard icon={Mail} label="Enviados" value={total} color="bg-blue-500/10 text-blue-400" />
        <StatCard icon={Eye} label={`Abertos (${taxa}%)`} value={abertos} color="bg-neon/10 text-neon" />
        <StatCard icon={AlertCircle} label="Falhou" value={falhou} color="bg-red-500/10 text-red-400" />
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-5 bg-dark-800/40 p-1 rounded-xl w-fit">
        {[['historico', 'Histórico'], ['template', 'Template']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${section === id ? 'bg-dark-700 text-white' : 'text-zinc-500 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Histórico */}
      {section === 'historico' && (
        <div className="space-y-2">
          {emails.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">Nenhum email enviado ainda</p>
          ) : emails.map(e => (
            <div key={e.id} className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 flex items-center gap-4">
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${e.aberto ? 'bg-neon/10' : 'bg-dark-700'}`}>
                {e.aberto ? <Eye className="w-4 h-4 text-neon" /> : <Mail className="w-4 h-4 text-zinc-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{e.leads?.nome || e.destinatario}</p>
                <p className="text-xs text-zinc-500 truncate">{e.destinatario}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.status === 'falhou' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                  {e.status === 'falhou' ? 'Falhou' : 'Enviado'}
                </span>
                <p className="text-[10px] text-zinc-600 mt-1">{new Date(e.criado_em).toLocaleDateString('pt-BR')} {new Date(e.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Editor */}
      {section === 'template' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="space-y-4">
            <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Remetente</p>
              <FieldEditor label="Nome" value={config.from_name} onChange={updateConfig('from_name')} />
              <FieldEditor label="Email" value={config.from_email} onChange={updateConfig('from_email')} />
            </div>

            <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Conteúdo</p>
              <FieldEditor
                label="Assunto"
                value={config.assunto_template}
                onChange={updateConfig('assunto_template')}
                hint="Use {{nome}}"
              />
              <FieldEditor
                label="Texto de saudação"
                value={config.texto_saudacao}
                onChange={updateConfig('texto_saudacao')}
                multiline
                hint="Use {{nome}}, {{consultor}}"
              />
              <FieldEditor
                label="Texto do corpo"
                value={config.texto_corpo}
                onChange={updateConfig('texto_corpo')}
                multiline
                hint="Use {{consultor}}"
              />
              <FieldEditor label="Texto do botão" value={config.texto_botao} onChange={updateConfig('texto_botao')} />
              <FieldEditor label="Rodapé" value={config.texto_rodape} onChange={updateConfig('texto_rodape')} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-neon-dim to-neon text-dark-950 font-bold text-sm py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar template'}
            </button>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Preview</p>
            <div className="border border-dark-700/50 rounded-2xl overflow-hidden" style={{ height: '600px' }}>
              <iframe
                srcDoc={previewHtml}
                title="Preview do email"
                className="w-full h-full"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

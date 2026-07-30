import { useState, useRef, useCallback } from 'react';
import { Camera, Loader2, Sparkles, Send, CheckCircle2, MessageCircle, RotateCcw, X } from 'lucide-react';

/* Entrada Rápida — canal "Tiago": cola o print com os dados do cliente,
   a IA extrai telefone/nome/equipamentos, você confere e dispara a 1ª
   mensagem no WhatsApp do cliente (via BotConversa, do número do Léo).
   Mobile-first: dá pra fazer tudo do celular em menos de 1 minuto. */

export default function EntradaRapidaTab() {
  const [imagem, setImagem]   = useState(null);   // dataURL
  const [texto, setTexto]     = useState('');
  const [lendo, setLendo]     = useState(false);
  const [dados, setDados]     = useState(null);   // { nome, telefone, equipamentos[], observacao }
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro]       = useState('');
  const fileRef = useRef(null);

  const carregarArquivo = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setImagem(reader.result);
    reader.readAsDataURL(file);
  };

  const onPaste = useCallback((e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { carregarArquivo(item.getAsFile()); e.preventDefault(); }
  }, []);

  const analisar = async () => {
    setErro(''); setLendo(true); setDados(null);
    try {
      const r = await fetch('/api/entrada-rapida', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem, texto: texto.trim() || undefined }),
      });
      const j = await r.json();
      if (!j.ok) { setErro(j.error || 'Não consegui ler.'); return; }
      setDados({ nome: j.nome, telefone: j.telefone, equipamentos: j.equipamentos, observacao: j.observacao });
    } catch { setErro('Falha de conexão.'); }
    finally { setLendo(false); }
  };

  const disparar = async () => {
    if ((dados?.telefone || '').replace(/\D/g, '').length < 10) { setErro('Confira o telefone (DDD + número).'); return; }
    setErro(''); setEnviando(true);
    try {
      const r = await fetch('/api/lead-contato', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: dados.telefone,
          nome: dados.nome || 'Cliente Brave',
          origem: 'TIAGO',
          titulo: 'Indicação Tiago',
          equipamentos: dados.equipamentos,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErro(j.error || 'O disparo falhou.'); return; }
      setSucesso(true);
    } catch { setErro('Falha de conexão.'); }
    finally { setEnviando(false); }
  };

  const resetar = () => { setImagem(null); setTexto(''); setDados(null); setSucesso(false); setErro(''); };

  const telLimpo = (dados?.telefone || '').replace(/\D/g, '');
  const waLink = telLimpo ? `https://wa.me/${telLimpo.startsWith('55') ? telLimpo : '55' + telLimpo}` : null;

  return (
    <div className="max-w-lg mx-auto" onPaste={onPaste}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Entrada Rápida</h1>
        <p className="text-zinc-500 text-sm mt-1">Print do Tiago → lead no funil + 1ª mensagem no WhatsApp do cliente. Tudo em 1 minuto.</p>
      </div>

      {sucesso ? (
        <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-white font-black text-xl mb-2">Lead criado e mensagem disparada! 🚀</h2>
          <p className="text-zinc-400 text-sm mb-6">{dados?.nome || 'Cliente'} · {dados?.telefone}<br />{(dados?.equipamentos || []).join(', ')}</p>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 font-bold rounded-xl py-3.5 mb-3 hover:bg-green-500/20 transition-colors">
              <MessageCircle className="w-5 h-5" /> Abrir a conversa no WhatsApp
            </a>
          )}
          <button onClick={resetar}
            className="w-full flex items-center justify-center gap-2 bg-dark-700 text-white font-bold rounded-xl py-3.5 hover:bg-dark-600 transition-colors">
            <RotateCcw className="w-4 h-4" /> Novo print
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Print */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">1 · O print do Tiago</p>
            {imagem ? (
              <div className="relative">
                <img src={imagem} alt="print" className="w-full max-h-80 object-contain rounded-2xl border border-dark-700 bg-dark-900" />
                <button onClick={() => setImagem(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500/80">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-dark-600 hover:border-orange-500/50 rounded-2xl py-10 flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <Camera className="w-8 h-8" />
                <span className="text-sm font-bold">Toque pra escolher o print</span>
                <span className="text-xs">ou cole aqui com Ctrl+V</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => carregarArquivo(e.target.files?.[0])} />
          </div>

          {/* texto opcional */}
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
            placeholder="Ou cole o texto da mensagem aqui (opcional)"
            className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 placeholder:text-zinc-700 resize-none" />

          {/* 2. Analisar */}
          {!dados && (
            <button onClick={analisar} disabled={lendo || (!imagem && !texto.trim())}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-black rounded-xl py-4 transition-colors">
              {lendo ? <><Loader2 className="w-5 h-5 animate-spin" /> Lendo o print…</> : <><Sparkles className="w-5 h-5" /> Ler dados com IA</>}
            </button>
          )}

          {/* 3. Conferir e disparar */}
          {dados && (
            <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">2 · Confira e dispare</p>
              <label className="block">
                <span className="text-xs text-zinc-500 mb-1 block">Nome</span>
                <input value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} placeholder="Nome do cliente"
                  className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50" />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-500 mb-1 block">WhatsApp (DDD + número)</span>
                <input inputMode="tel" value={dados.telefone} onChange={e => setDados({ ...dados, telefone: e.target.value })} placeholder="48999999999"
                  className="w-full bg-dark-900 border border-dark-700 text-white text-base font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50" />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-500 mb-1 block">Equipamentos de interesse (um por linha)</span>
                <textarea value={(dados.equipamentos || []).join('\n')} rows={3}
                  onChange={e => setDados({ ...dados, equipamentos: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                  className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 resize-none" />
              </label>
              {dados.observacao && <p className="text-zinc-500 text-xs italic">💡 {dados.observacao}</p>}

              <button onClick={disparar} disabled={enviando}
                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-dark-950 font-black rounded-xl py-4 transition-colors">
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Criar lead + enviar 1ª mensagem
              </button>
              <button onClick={resetar} className="w-full text-zinc-500 hover:text-white text-sm font-bold py-1.5 transition-colors">
                Recomeçar
              </button>
            </div>
          )}

          {erro && <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{erro}</p>}
        </div>
      )}
    </div>
  );
}

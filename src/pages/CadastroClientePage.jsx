import { useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, Building2, User, MapPin, Phone, CreditCard, Search, Shield } from 'lucide-react';
import { InstitutionalFooter } from '../components/BraveCredentials';

function formatCpf(v) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
}
function formatCnpj(v) {
  return v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2').slice(0, 18);
}
function formatTel(v) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  return n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}
function formatCep(v) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d{0,3})/, '$1-$2').slice(0, 9);
}

function validateCpf(cpf) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}
function validateCnpj(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (str, w) => { const s = str.split('').reduce((a, n, i) => a + parseInt(n) * w[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(c[12]) && calc(c.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(c[13]);
}

// Classes para o tema claro (igual orçamentos)
const inputCls = 'w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all';
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide';
const cardCls = 'bg-white border border-gray-200 rounded-2xl p-5 shadow-sm';

export default function CadastroClientePage() {
  const [submitting, setSubmitting] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');
  const [erros, setErros] = useState({});
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [form, setForm] = useState({
    tipoPessoa: 'F',
    tipoNegocio: '',
    nomeCompleto: '',
    cpfCnpj: '',
    dataNascimento: '',
    nomeFantasia: '',
    inscricaoEstadual: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
  });

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (erros[field]) setErros(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  async function buscarCep(cep) {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch (_) {} finally { setBuscandoCep(false); }
  }

  function validar() {
    const e = {};
    if (!form.nomeCompleto.trim()) e.nomeCompleto = 'Obrigatório';
    if (!form.cpfCnpj.trim()) {
      e.cpfCnpj = 'Obrigatório';
    } else if (form.tipoPessoa === 'F' && !validateCpf(form.cpfCnpj)) {
      e.cpfCnpj = 'CPF inválido';
    } else if (form.tipoPessoa === 'J' && !validateCnpj(form.cpfCnpj)) {
      e.cpfCnpj = 'CNPJ inválido';
    }
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'E-mail inválido';
    if (!form.telefone.trim()) e.telefone = 'Obrigatório';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    setErro('');
    try {
      const res = await fetch('/api/submit-cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.ok) {
        setSucesso(true);
      } else {
        setErro(result.error || 'Ocorreu um erro. Tente novamente.');
      }
    } catch (ex) {
      setErro('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Tela de sucesso ───────────────────────────────────────────────────────
  if (sucesso) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <img src="/logo-orcamento.png" alt="Brave" className="h-12 object-contain mx-auto mb-8" />
        <div className="w-20 h-20 rounded-full bg-green-100 border border-green-200 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Cadastro realizado!</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Seus dados foram cadastrados com sucesso.<br />Nossa equipe entrará em contato em breve.
        </p>
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-gray-400 text-xs">Brave Fitness Equipment · CNPJ 33.167.844/0001-80</p>
        </div>
      </div>
    </div>
  );

  const isPJ = form.tipoPessoa === 'J';

  return (
    <div className="min-h-screen bg-white py-10 px-4">

      {/* ── Header com logo preta ─────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto mb-8">
        <div className="text-center mb-6">
          <img
            src="/logo-orcamento.png"
            alt="Brave"
            className="h-14 object-contain mx-auto mb-5"
          />
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-widest mb-2">
            Cadastro de Cliente
          </h1>
          <p className="text-gray-500 text-sm">
            Preencha seus dados para fazer parte da família Brave e receber nossas propostas.
          </p>
        </div>

        {/* Info box */}
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Seus dados serão usados apenas para contato comercial e emissão de documentos fiscais. Não compartilhamos com terceiros.
          </p>
        </div>
      </div>

      {/* ── Formulário ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-5">

        {/* Tipo de Negócio */}
        <div className={cardCls}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Tipo de Negócio</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'box', label: 'Box / CrossFit', emoji: '🥊' },
              { v: 'academia', label: 'Academia', emoji: '🏋️' },
              { v: 'studio', label: 'Studio', emoji: '💠' },
              { v: 'clube', label: 'Clube', emoji: '🌿' },
              { v: 'uso_proprio', label: 'Uso Próprio', emoji: '🏠' },
              { v: 'outro', label: 'Outro', emoji: '❓' },
            ].map(({ v, label, emoji }) => (
              <button key={v} type="button" onClick={() => set('tipoNegocio', v)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer text-center ${
                  form.tipoNegocio === v
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                }`}>
                <span className="text-xl">{emoji}</span>
                <span className="text-[10px] font-semibold leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tipo de Pessoa */}
        <div className={cardCls}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Tipo de Cadastro</p>
          <div className="grid grid-cols-2 gap-3">
            {[{ v: 'F', label: 'Pessoa Física', Icon: User }, { v: 'J', label: 'Pessoa Jurídica', Icon: Building2 }].map(({ v, label, Icon }) => (
              <button key={v} type="button" onClick={() => set('tipoPessoa', v)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  form.tipoPessoa === v
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300 bg-white'
                }`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dados Principais */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-gray-400" /> Dados {isPJ ? 'da Empresa' : 'Pessoais'}
          </p>

          <div>
            <label className={labelCls}>{isPJ ? 'Razão Social' : 'Nome Completo'} <span className="text-red-500">*</span></label>
            <input className={`${inputCls} ${erros.nomeCompleto ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10' : ''}`}
              value={form.nomeCompleto} onChange={e => set('nomeCompleto', e.target.value)}
              placeholder={isPJ ? 'Razão Social da Empresa' : 'Seu nome completo'} />
            {erros.nomeCompleto && <p className="text-red-500 text-xs mt-1">{erros.nomeCompleto}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{isPJ ? 'CNPJ' : 'CPF'} <span className="text-red-500">*</span></label>
              <input className={`${inputCls} ${erros.cpfCnpj ? 'border-red-400' : ''}`}
                value={form.cpfCnpj}
                onChange={e => set('cpfCnpj', isPJ ? formatCnpj(e.target.value) : formatCpf(e.target.value))}
                placeholder={isPJ ? '00.000.000/0001-00' : '000.000.000-00'} />
              {erros.cpfCnpj && <p className="text-red-500 text-xs mt-1">{erros.cpfCnpj}</p>}
            </div>
            {isPJ ? (
              <div>
                <label className={labelCls}>Inscrição Estadual</label>
                <input className={inputCls} value={form.inscricaoEstadual}
                  onChange={e => set('inscricaoEstadual', e.target.value)} placeholder="IE (opcional)" />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Data de Nascimento</label>
                <input type="date" className={inputCls} value={form.dataNascimento}
                  onChange={e => set('dataNascimento', e.target.value)} />
              </div>
            )}
          </div>

          {isPJ && (
            <div>
              <label className={labelCls}>Nome Fantasia</label>
              <input className={inputCls} value={form.nomeFantasia}
                onChange={e => set('nomeFantasia', e.target.value)} placeholder="Nome fantasia (opcional)" />
            </div>
          )}
        </div>

        {/* Contato */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-gray-400" /> Contato
          </p>
          <div>
            <label className={labelCls}>E-mail <span className="text-red-500">*</span></label>
            <input type="email" className={`${inputCls} ${erros.email ? 'border-red-400' : ''}`}
              value={form.email} onChange={e => set('email', e.target.value)} placeholder="seu@email.com" />
            {erros.email && <p className="text-red-500 text-xs mt-1">{erros.email}</p>}
          </div>
          <div>
            <label className={labelCls}>WhatsApp / Telefone <span className="text-red-500">*</span></label>
            <input className={`${inputCls} ${erros.telefone ? 'border-red-400' : ''}`}
              value={form.telefone}
              onChange={e => set('telefone', formatTel(e.target.value))}
              placeholder="(11) 99999-9999" />
            {erros.telefone && <p className="text-red-500 text-xs mt-1">{erros.telefone}</p>}
          </div>
        </div>

        {/* Endereço */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400" /> Endereço <span className="text-gray-400 font-normal normal-case">(opcional)</span>
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>CEP</label>
              <input className={inputCls} value={form.cep}
                onChange={e => { const v = formatCep(e.target.value); set('cep', v); if (v.replace(/\D/g, '').length === 8) buscarCep(v); }}
                placeholder="00000-000" />
            </div>
            <div className="flex items-end pb-3">
              {buscandoCep
                ? <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                : <Search className="w-5 h-5 text-gray-300" />}
            </div>
          </div>

          {(form.logradouro || form.cep) && (
            <>
              <div>
                <label className={labelCls}>Logradouro</label>
                <input className={inputCls} value={form.logradouro}
                  onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Número</label>
                  <input className={inputCls} value={form.numero}
                    onChange={e => set('numero', e.target.value)} placeholder="123" />
                </div>
                <div>
                  <label className={labelCls}>Complemento</label>
                  <input className={inputCls} value={form.complemento}
                    onChange={e => set('complemento', e.target.value)} placeholder="Apto, sala..." />
                </div>
              </div>
              <div>
                <label className={labelCls}>Bairro</label>
                <input className={inputCls} value={form.bairro}
                  onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Cidade</label>
                  <input className={inputCls} value={form.cidade}
                    onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div>
                  <label className={labelCls}>Estado</label>
                  <input maxLength={2} className={inputCls} value={form.estado}
                    onChange={e => set('estado', e.target.value.toUpperCase())} placeholder="SP" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Erro geral */}
        {erro && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {erro}
          </div>
        )}

        {/* Botão submit */}
        <button type="submit" disabled={submitting}
          className="w-full py-4 rounded-2xl font-black text-white text-base bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-500/25">
          {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : '✓ Realizar Cadastro'}
        </button>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Shield className="w-3.5 h-3.5" /> Dados protegidos
          </span>
          <span className="text-gray-200">|</span>
          <span className="text-[11px] text-gray-400">CNPJ 33.167.844/0001-80</span>
        </div>

        <p className="text-center text-gray-400 text-xs pb-6">
          Campos com <span className="text-red-500">*</span> são obrigatórios.
        </p>
      </form>

      {/* Rodapé */}
      <InstitutionalFooter dark={false} />
    </div>
  );
}

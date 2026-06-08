import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Loader2, AlertCircle, Building2, User, MapPin, Phone, Mail, CreditCard, Calendar, Search } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

function validateCnpj(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (str, weights) => {
    const sum = str.split('').reduce((acc, n, i) => acc + parseInt(n) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(c[12])
    && calc(c.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(c[13]);
}

const inputCls = 'w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm outline-none focus:border-orange-500 transition-colors';
const labelCls = 'block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide';

export default function FormularioFiscalPage() {
  const { token } = useParams();
  const [orcamento, setOrcamento] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [jaPreenchido, setJaPreenchido] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [form, setForm] = useState({
    tipoPessoa: 'F',
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

  const [erros, setErros] = useState({});

  useEffect(() => {
    async function carregarOrcamento() {
      const { data, error } = await supabase
        .from('orcamentos_salvos')
        .select('id, cliente, payload, dados_fiscais_recebidos_em')
        .eq('formulario_fiscal_token', token)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoadingPage(false); return; }

      setOrcamento(data);

      // Se já há dados fiscais, pré-preencher
      const df = data.payload?.dadosFiscais;
      if (df) {
        setJaPreenchido(true);
        setForm(prev => ({ ...prev, ...df }));
      } else {
        // Pré-preencher nome e telefone do orçamento
        setForm(prev => ({
          ...prev,
          nomeCompleto: data.cliente || '',
          telefone: formatTel(data.payload?.telefoneCliente || ''),
          email: data.payload?.emailCliente || '',
        }));
      }
      setLoadingPage(false);
    }
    carregarOrcamento();
  }, [token]);

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
    if (form.tipoPessoa === 'F' && !form.dataNascimento) e.dataNascimento = 'Obrigatório';
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'E-mail inválido';
    if (!form.telefone.trim()) e.telefone = 'Obrigatório';
    if (!form.cep.trim()) e.cep = 'Obrigatório';
    if (!form.logradouro.trim()) e.logradouro = 'Obrigatório';
    if (!form.numero.trim()) e.numero = 'Obrigatório';
    if (!form.cidade.trim()) e.cidade = 'Obrigatório';
    if (!form.estado.trim()) e.estado = 'Obrigatório';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    setErro('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-dados-fiscais`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, dadosFiscais: form }),
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

  if (loadingPage) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Link não encontrado</h1>
        <p className="text-zinc-500 text-sm">Este link é inválido ou não existe. Entre em contato com seu consultor.</p>
      </div>
    </div>
  );

  if (sucesso) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Dados enviados!</h1>
        <p className="text-zinc-400 text-sm mb-2">
          Suas informações fiscais foram recebidas e serão usadas para emissão da nota fiscal.
        </p>
        <p className="text-zinc-600 text-xs mt-4">Brave Fitness Equipment · brave.gg</p>
      </div>
    </div>
  );

  const isPJ = form.tipoPessoa === 'J';

  return (
    <div className="min-h-screen bg-zinc-950 py-10 px-4">
      {/* Header */}
      <div className="max-w-lg mx-auto mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <span className="text-white font-black text-sm">B</span>
          </div>
          <span className="font-black text-white text-lg">BRAVE</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Dados para Nota Fiscal</h1>
        <p className="text-zinc-500 text-sm">
          Olá, <strong className="text-zinc-300">{orcamento?.cliente}</strong>! Preencha seus dados abaixo para emitirmos sua nota fiscal.
        </p>
        {jaPreenchido && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
            <AlertCircle className="w-3 h-3" /> Você já preencheu este formulário. Pode atualizar os dados abaixo.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-6">

        {/* Tipo de Pessoa */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Tipo de Cadastro</p>
          <div className="grid grid-cols-2 gap-3">
            {[{ v: 'F', label: 'Pessoa Física', Icon: User }, { v: 'J', label: 'Pessoa Jurídica', Icon: Building2 }].map(({ v, label, Icon }) => (
              <button key={v} type="button" onClick={() => set('tipoPessoa', v)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  form.tipoPessoa === v
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dados Principais */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5" /> Dados {isPJ ? 'da Empresa' : 'Pessoais'}
          </p>

          <div>
            <label className={labelCls}>{isPJ ? 'Razão Social' : 'Nome Completo'}</label>
            <input className={`${inputCls} ${erros.nomeCompleto ? 'border-red-500' : ''}`}
              value={form.nomeCompleto} onChange={e => set('nomeCompleto', e.target.value)}
              placeholder={isPJ ? 'Razão Social da Empresa' : 'Seu nome completo'} />
            {erros.nomeCompleto && <p className="text-red-400 text-xs mt-1">{erros.nomeCompleto}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{isPJ ? 'CNPJ' : 'CPF'}</label>
              <input className={`${inputCls} ${erros.cpfCnpj ? 'border-red-500' : ''}`}
                value={form.cpfCnpj}
                onChange={e => set('cpfCnpj', isPJ ? formatCnpj(e.target.value) : formatCpf(e.target.value))}
                placeholder={isPJ ? '00.000.000/0001-00' : '000.000.000-00'} />
              {erros.cpfCnpj && <p className="text-red-400 text-xs mt-1">{erros.cpfCnpj}</p>}
            </div>
            {isPJ ? (
              <div>
                <label className={labelCls}>Inscrição Estadual</label>
                <input className={inputCls} value={form.inscricaoEstadual}
                  onChange={e => set('inscricaoEstadual', e.target.value)}
                  placeholder="IE (opcional)" />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Data de Nascimento</label>
                <input type="date" className={`${inputCls} ${erros.dataNascimento ? 'border-red-500' : ''}`}
                  value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
                {erros.dataNascimento && <p className="text-red-400 text-xs mt-1">{erros.dataNascimento}</p>}
              </div>
            )}
          </div>

          {isPJ && (
            <div>
              <label className={labelCls}>Nome Fantasia</label>
              <input className={inputCls} value={form.nomeFantasia}
                onChange={e => set('nomeFantasia', e.target.value)}
                placeholder="Nome fantasia (opcional)" />
            </div>
          )}
        </div>

        {/* Contato */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" /> Contato
          </p>
          <div>
            <label className={labelCls}>E-mail</label>
            <input type="email" className={`${inputCls} ${erros.email ? 'border-red-500' : ''}`}
              value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="seu@email.com" />
            {erros.email && <p className="text-red-400 text-xs mt-1">{erros.email}</p>}
          </div>
          <div>
            <label className={labelCls}>Telefone / WhatsApp</label>
            <input className={`${inputCls} ${erros.telefone ? 'border-red-500' : ''}`}
              value={form.telefone}
              onChange={e => set('telefone', formatTel(e.target.value))}
              placeholder="(11) 99999-9999" />
            {erros.telefone && <p className="text-red-400 text-xs mt-1">{erros.telefone}</p>}
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" /> Endereço de Entrega / Cobrança
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>CEP</label>
              <input className={`${inputCls} ${erros.cep ? 'border-red-500' : ''}`}
                value={form.cep}
                onChange={e => {
                  const v = formatCep(e.target.value);
                  set('cep', v);
                  if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                }}
                placeholder="00000-000" />
              {erros.cep && <p className="text-red-400 text-xs mt-1">{erros.cep}</p>}
            </div>
            <div className="flex items-end pb-0.5">
              {buscandoCep
                ? <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                : <Search className="w-5 h-5 text-zinc-600" />}
            </div>
          </div>

          <div>
            <label className={labelCls}>Logradouro</label>
            <input className={`${inputCls} ${erros.logradouro ? 'border-red-500' : ''}`}
              value={form.logradouro} onChange={e => set('logradouro', e.target.value)}
              placeholder="Rua, Avenida..." />
            {erros.logradouro && <p className="text-red-400 text-xs mt-1">{erros.logradouro}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Número</label>
              <input className={`${inputCls} ${erros.numero ? 'border-red-500' : ''}`}
                value={form.numero} onChange={e => set('numero', e.target.value)}
                placeholder="123" />
              {erros.numero && <p className="text-red-400 text-xs mt-1">{erros.numero}</p>}
            </div>
            <div>
              <label className={labelCls}>Complemento</label>
              <input className={inputCls} value={form.complemento}
                onChange={e => set('complemento', e.target.value)}
                placeholder="Apto, sala... (opcional)" />
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
              <input className={`${inputCls} ${erros.cidade ? 'border-red-500' : ''}`}
                value={form.cidade} onChange={e => set('cidade', e.target.value)}
                placeholder="Cidade" />
              {erros.cidade && <p className="text-red-400 text-xs mt-1">{erros.cidade}</p>}
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <input maxLength={2} className={`${inputCls} ${erros.estado ? 'border-red-500' : ''}`}
                value={form.estado}
                onChange={e => set('estado', e.target.value.toUpperCase())}
                placeholder="SP" />
              {erros.estado && <p className="text-red-400 text-xs mt-1">{erros.estado}</p>}
            </div>
          </div>
        </div>

        {erro && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {erro}
          </div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full py-4 rounded-2xl font-black text-white text-base bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-500/20">
          {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : '✓ Enviar Dados Fiscais'}
        </button>

        <p className="text-center text-zinc-600 text-xs pb-8">
          Seus dados são protegidos e usados exclusivamente para emissão de nota fiscal.<br />
          <strong className="text-zinc-500">Brave Fitness Equipment</strong>
        </p>
      </form>
    </div>
  );
}

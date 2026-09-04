// api/_cadastro-colar.js — interpreta um bloco de texto colado no seletor de
// cliente do orcamento e devolve os campos do cadastro prontos para conferencia.
//
// Estrategia hibrida, nessa ordem:
//   1. REGRAS   — CPF/CNPJ (com digito verificador), CEP, telefone e e-mail tem
//                 formato rigido: regex acerta sempre e nao custa nada.
//   2. ViaCEP   — o CEP entrega logradouro, bairro, cidade e UF. Por isso a
//                 linha de endereco colada so precisa do NUMERO.
//   3. IA       — so entra no que sobrou (tipicamente o nome, quando a colagem
//                 foge do padrao). Rede de seguranca, nao o caminho principal.
//
// Nada aqui grava: quem grava e o POST /api/cadastro, depois da conferencia.
import { createClient } from '@supabase/supabase-js';

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

/* CPF e CNPJ carregam digito verificador — da para ter CERTEZA de que a
   sequencia e um documento, e nao um telefone ou um CEP grudado. */
function cpfValido(cpf) {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

function cnpjValido(cnpj) {
  const c = soDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

const telefoneValido = (t) => {
  const d = soDigitos(t);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  return d.length === 10 || d[2] === '9'; // celular brasileiro comeca com 9
};

/* Extrai o que tem formato inequivoco. Procura primeiro os campos ROTULADOS
   ("cpf 123...", "cep 17515220") — sem isso, um CEP de 8 digitos e um telefone
   de 8 digitos disputariam a mesma sequencia. */
function extrairPorRegras(texto) {
  const t = String(texto || '');
  const achado = {};
  const usados = [];  // trechos ja consumidos, para nao reaproveitar digitos

  const email = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  if (email) { achado.email = email[0].toLowerCase(); usados.push(email[0]); }

  const docRot = t.match(/\bc(?:pf|npj)\b\W{0,3}([\d.\-/\s]{11,20})/i);
  if (docRot) {
    const d = soDigitos(docRot[1]).slice(0, 14);
    if (cpfValido(d.slice(0, 11))) { achado.cpfCnpj = d.slice(0, 11); achado.tipoPessoa = 'F'; usados.push(docRot[0]); }
    else if (cnpjValido(d)) { achado.cpfCnpj = d; achado.tipoPessoa = 'J'; usados.push(docRot[0]); }
  }

  const cepRot = t.match(/\bcep\b\W{0,3}(\d{5}\s?-?\s?\d{3})/i);
  if (cepRot) { achado.cep = soDigitos(cepRot[1]); usados.push(cepRot[0]); }

  const telRot = t.match(/\b(?:tel|fone|celular|whats(?:app)?|zap)\b\W{0,3}((?:\+?55)?[\s()\d.-]{10,18})/i);
  if (telRot) {
    const d = soDigitos(telRot[1]).replace(/^55(?=\d{10,11}$)/, '');
    if (telefoneValido(d)) { achado.telefone = d; usados.push(telRot[0]); }
  }

  // ── sem rotulo: varre as sequencias numericas restantes ──
  const resto = usados.reduce((acc, u) => acc.replace(u, ' '), t);
  for (const m of resto.matchAll(/(?:\+?55)?[\s()\d.\-/]{8,20}/g)) {
    const d = soDigitos(m[0]).replace(/^55(?=\d{10,11}$)/, '');
    if (!achado.cpfCnpj && d.length === 11 && cpfValido(d)) { achado.cpfCnpj = d; achado.tipoPessoa = 'F'; continue; }
    if (!achado.cpfCnpj && d.length === 14 && cnpjValido(d)) { achado.cpfCnpj = d; achado.tipoPessoa = 'J'; continue; }
    if (!achado.telefone && telefoneValido(d)) { achado.telefone = d; continue; }
    if (!achado.cep && d.length === 8) { achado.cep = d; continue; }
  }

  // ── linhas: nome (so letras) e endereco (logradouro + numero) ──
  const LOGRADOURO = /^(rua|r\.|av|avenida|alameda|al\.|travessa|tv|rod|rodovia|estrada|pra[cç]a)\b/i;
  for (const linha of t.split(/\r?\n|[;|]/).map((l) => l.trim()).filter(Boolean)) {
    const limpa = linha.replace(/\b(nome|cliente)\b\W*/i, '').trim();

    if (!achado.nomeCompleto && limpa.includes(' ')
        && /^[\p{L}\s.'-]{5,60}$/u.test(limpa) && !LOGRADOURO.test(limpa)) {
      achado.nomeCompleto = limpa.replace(/\s+/g, ' ');
      continue;
    }

    if (!achado.logradouro && LOGRADOURO.test(limpa)) {
      Object.assign(achado, separarEndereco(limpa));
    }
  }
  return achado;
}

/* Separa "Rua 21 de abril 731, apto 3" em logradouro / numero / complemento.
   O numero da casa NAO e o primeiro da linha (nome de rua costuma ter numero:
   "Rua 21 de Abril", "Av 9 de Julho") nem sempre o ultimo (depois pode vir
   "apto 32"). Regra: havendo palavra de complemento, o numero e o ultimo ANTES
   dela; senao, e o ultimo da linha. */
const COMPLEMENTO = /\b(apto?|ap|apartamento|bloco|bl|casa|fundos|sala|sl|conj(?:unto)?|andar|lote|lt|quadra|qd|galp[aã]o|loja|km)\b/i;

function separarEndereco(linha) {
  const corte = linha.search(COMPLEMENTO);
  const base = corte >= 0 ? linha.slice(0, corte) : linha;
  const cauda = corte >= 0 ? linha.slice(corte).trim() : '';

  const nums = [...base.matchAll(/\d{1,6}/g)];
  const ultimo = nums[nums.length - 1];
  const res = {};
  if (ultimo && ultimo.index > 0) {
    res.logradouro = base.slice(0, ultimo.index).replace(/[\s,\-]+$/, '').trim();
    res.numero = ultimo[0];
    const sobra = base.slice(ultimo.index + ultimo[0].length).replace(/^[\s,\-]+/, '').trim();
    const compl = [sobra, cauda].filter(Boolean).join(' ').trim();
    if (compl) res.complemento = compl;
  } else {
    res.logradouro = base.replace(/[\s,\-]+$/, '').trim();
    if (cauda) res.complemento = cauda;
  }
  return res;
}

/* O CEP resolve o endereco inteiro — por isso a colagem so precisa do numero.
   Falha de rede aqui nao derruba a interpretacao: os campos ficam para o
   consultor completar no card de conferencia. */
async function completarPorCep(dados) {
  const cep = soDigitos(dados.cep);
  if (cep.length !== 8) return dados;
  try {
    const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    const j = await r.json();
    if (j && !j.erro) {
      return {
        ...dados,
        // O ViaCEP e a fonte oficial do logradouro: prevalece sobre o digitado.
        logradouro: j.logradouro || dados.logradouro || '',
        bairro: j.bairro || dados.bairro || '',
        cidade: j.localidade || dados.cidade || '',
        estado: j.uf || dados.estado || '',
      };
    }
  } catch (_) { /* segue com o que as regras acharam */ }
  return dados;
}

/* Reforco de IA: so para o que as regras nao conseguiram. Mesma chave da
   Entrada Rapida (prospeccao_config.gemini_key). */
async function reforcarComIa(texto, faltando) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: cfg } = await supabase.from('prospeccao_config').select('gemini_key').eq('id', 1).maybeSingle();
  if (!cfg?.gemini_key) return {};

  const prompt = [
    'Extraia os dados de cadastro do texto abaixo e responda SOMENTE um JSON valido, sem markdown:',
    '{"nomeCompleto":"","cpfCnpj":"","telefone":"","email":"","cep":"","logradouro":"","numero":"","complemento":"","bairro":"","cidade":"","estado":""}',
    'Regras: telefone so digitos com DDD (sem o 55); cpfCnpj so digitos; cep so digitos; estado com 2 letras; campo desconhecido fica string vazia.',
    'Preencha com atencao: ' + faltando.join(', ') + '.',
    '',
    'Texto:',
    String(texto).slice(0, 2000),
  ].join('\n');

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + cfg.gemini_key.trim();
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) return {};
    const j = await r.json();
    const bruto = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();
    return JSON.parse(bruto.slice(bruto.indexOf('{'), bruto.lastIndexOf('}') + 1)) || {};
  } catch (_) {
    return {};
  }
}

const ESSENCIAIS = ['nomeCompleto', 'cpfCnpj', 'cep'];

export async function interpretarColagem(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const texto = String(req.body?.texto || '').trim();
  if (texto.length < 8) {
    return res.status(400).json({ ok: false, error: 'Cole os dados do cliente (nome, endereço, CEP, CPF...).' });
  }

  try {
    const dados = extrairPorRegras(texto);
    let fonte = 'regras';

    const faltando = ESSENCIAIS.filter((c) => !dados[c]);
    if (faltando.length) {
      const ia = await reforcarComIa(texto, faltando);
      // As regras vencem: o que elas acharam foi VALIDADO (digito verificador).
      for (const [k, v] of Object.entries(ia)) {
        if (!dados[k] && String(v || '').trim()) dados[k] = String(v).trim();
      }
      if (dados.cpfCnpj) {
        const d = soDigitos(dados.cpfCnpj);
        if (cpfValido(d)) { dados.cpfCnpj = d; dados.tipoPessoa = 'F'; }
        else if (cnpjValido(d)) { dados.cpfCnpj = d; dados.tipoPessoa = 'J'; }
        else delete dados.cpfCnpj;   // a IA chutou um documento invalido
      }
      if (dados.telefone && !telefoneValido(dados.telefone)) delete dados.telefone;
      if (Object.keys(ia).length) fonte = 'regras+ia';
    }

    const completo = await completarPorCep(dados);
    completo.tipoPessoa = completo.tipoPessoa || 'F';

    return res.status(200).json({
      ok: true,
      fonte,
      dados: completo,
      faltando: ESSENCIAIS.filter((c) => !completo[c]),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

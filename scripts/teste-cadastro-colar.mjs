// scripts/teste-cadastro-colar.mjs — trava a leitura da resposta do cliente ao
// pedido de dados (mensagem "Pedir cadastro").
//
// Em 08/10/2026 o "Pedir cadastro" deixou de mandar um link e passou a mandar um
// modelo para o cliente preencher:
//     Empresa/Nome:
//     CNPJ/CPF:
//     Endereço:
//     CEP:
//     WhatsApp:
// A resposta chega COM OS ROTULOS, e o parser so entendia linhas soltas
// ("João da Silva", "Rua 21 de abril 731"): o nome virava "Empresa/João" (a
// barra reprova) e o endereço nem era reconhecido porque a linha começa com
// "Endereço:". O cadastro dependeria da IA para o que a regra deveria resolver.
//
// DADOS 100% FICTICIOS (CPF/CNPJ de exemplo com digito verificador valido).
// Rodar:  node scripts/teste-cadastro-colar.mjs
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { extrairPorRegras } = await import('../api/_cadastro-colar.js');

const casos = [];
const caso = (nome, texto, esperado, ausentes = []) => casos.push({ nome, texto, esperado, ausentes });

// 1) O modelo novo, respondido por uma EMPRESA.
caso('modelo novo — empresa', [
  'Empresa/Nome: CrossFit Olympus Ltda',
  'CNPJ/CPF: 11.222.333/0001-81',
  'Endereço: Rua das Flores 123',
  'CEP: 17515-220',
  'WhatsApp: (14) 99999-9999',
].join('\n'), {
  nomeCompleto: 'CrossFit Olympus Ltda', cpfCnpj: '11222333000181', tipoPessoa: 'J',
  logradouro: 'Rua das Flores', numero: '123', cep: '17515220', telefone: '14999999999',
});

// 2) O modelo novo, respondido por uma PESSOA, com complemento no endereço.
caso('modelo novo — pessoa com complemento', [
  'Empresa/Nome: João da Silva',
  'CNPJ/CPF: 123.456.789-09',
  'Endereço: Av. Brasil, 1500 apto 32',
  'CEP: 01310-100',
  'WhatsApp: 11 98888-7777',
].join('\n'), {
  nomeCompleto: 'João da Silva', cpfCnpj: '12345678909', tipoPessoa: 'F',
  logradouro: 'Av. Brasil', numero: '1500', complemento: 'apto 32',
  cep: '01310100', telefone: '11988887777',
});

// 3) Cliente que deixou campos em branco: nao pode inventar nada.
caso('modelo novo — campos em branco', [
  'Empresa/Nome: Maria Souza',
  'CNPJ/CPF:',
  'Endereço:',
  'CEP: 17515-220',
  'WhatsApp:',
].join('\n'), { nomeCompleto: 'Maria Souza', cep: '17515220' }, ['cpfCnpj', 'logradouro', 'telefone']);

// 4) Nome de empresa com digito, "&" e virgula: o filtro de nome solto reprovaria.
caso('empresa com simbolos e digitos', [
  'Empresa/Nome: Studio Fit & Cia 24h, Ltda',
  'CNPJ/CPF: 11.222.333/0001-81',
].join('\n'), { nomeCompleto: 'Studio Fit & Cia 24h, Ltda', cpfCnpj: '11222333000181' });

// 5) Rotulos em minusculo e com variacoes comuns.
caso('rotulos variados', [
  'razão social: Academia Força Total Ltda',
  'endereço: Rua 21 de abril 731',
  'cep 17515220',
].join('\n'), { nomeCompleto: 'Academia Força Total Ltda', logradouro: 'Rua 21 de abril', numero: '731', cep: '17515220' });

// ── REGRESSAO: os formatos que JA funcionavam nao podem mudar ──────────────
caso('sem rotulos (formato antigo)', [
  'João da Silva',
  '123.456.789-09',
  'Rua 21 de abril 731',
  '17515-220',
  '(14) 99999-9999',
].join('\n'), {
  nomeCompleto: 'João da Silva', cpfCnpj: '12345678909', tipoPessoa: 'F',
  logradouro: 'Rua 21 de abril', numero: '731', cep: '17515220', telefone: '14999999999',
});

caso('rotulo "Nome:" antigo', [
  'Nome: João da Silva',
  'cpf 123.456.789-09',
  'Rua das Palmeiras 40',
  'cep 17515220',
].join('\n'), {
  nomeCompleto: 'João da Silva', cpfCnpj: '12345678909',
  logradouro: 'Rua das Palmeiras', numero: '40', cep: '17515220',
});

let falhas = 0;
for (const c of casos) {
  const r = extrairPorRegras(c.texto);
  const erros = [];
  for (const [k, v] of Object.entries(c.esperado)) {
    if (r[k] !== v) erros.push(`${k}: esperava ${JSON.stringify(v)}, veio ${JSON.stringify(r[k])}`);
  }
  for (const k of c.ausentes) if (r[k]) erros.push(`${k}: nao deveria existir, veio ${JSON.stringify(r[k])}`);
  if (erros.length) { falhas++; console.log(`FALHOU  ${c.nome}\n   ${erros.join('\n   ')}`); }
  else console.log(`ok      ${c.nome}`);
}
assert.equal(falhas, 0, `${falhas} caso(s) falharam`);
console.log('OK — modelo novo, campos em branco, rotulos variados e formatos antigos cobertos');

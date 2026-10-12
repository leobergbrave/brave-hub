// O módulo cria o cliente do Supabase ao ser importado; o teste dá URLs de mentira
// antes do import e só exercita a função pura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.VITE_SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste';
const { mapearContato } = await import('./_bling-contatos-export.js');

test('detalhe do Bling: devolve rua, número, bairro e CEP além de cidade e UF', () => {
  const c = mapearContato({
    id: 7, nome: 'Box 83 LTDA', fantasia: 'BOX 83', tipo: 'J', numeroDocumento: '12.345.678/0001-90',
    email: 'a@b.com', celular: '(12) 99735-9991',
    endereco: { geral: { endereco: 'Rua das Flores', numero: '83', complemento: 'galpão', bairro: 'Centro', cep: '12.281-000', municipio: 'Caçapava', uf: 'SP' } },
  });
  assert.equal(c.endereco, 'Rua das Flores');
  assert.equal(c.numero, '83');
  assert.equal(c.bairro, 'Centro');
  assert.equal(c.cep, '12281000');
  assert.equal(c.cidade, 'Caçapava');
  assert.equal(c.uf, 'SP');
  assert.equal(c.detalhado, true);
});

test('lista do Bling (sem endereço): os campos novos vêm null e o resto fica igual', () => {
  const c = mapearContato({ id: 8, nome: 'Fulano', numeroDocumento: '12345678901', telefone: '1133334444' });
  assert.equal(c.endereco, null);
  assert.equal(c.numero, null);
  assert.equal(c.bairro, null);
  assert.equal(c.cep, null);
  assert.equal(c.tipo, 'F');
  assert.equal(c.detalhado, false);
});

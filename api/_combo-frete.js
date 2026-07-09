// api/_combo-frete.js — calcula o frete real de um combo por CEP (peso × regra).
// Reusa a tabela regras_frete e a lógica de CEP→estado/zona dos orçamentos.
// GET /api/render?tipo=frete&slug=remo-skierg-storm&cep=01310100
import { createClient } from '@supabase/supabase-js';
import { calcularFrete } from './_frete.js';
import { loadCatalog } from './_ergo-fetch.js';
import { parseComboSlug } from '../src/data/ergoCatalog.js';

const CAPITAIS = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
  DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
  MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
  RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista',
  SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
};

async function resolverCep(cep) {
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
    if (j.erro) return { estado: '', zona: 'CAPITAL', cidade: '' };
    const estado = j.uf || '';
    const cidade = j.localidade || '';
    const capital = CAPITAIS[estado];
    const zona = capital && cidade && cidade.toLowerCase() !== capital.toLowerCase() ? 'INTERIOR 1' : 'CAPITAL';
    return { estado, zona, cidade };
  } catch {
    return { estado: '', zona: 'CAPITAL', cidade: '' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cep = String(req.query.cep || '').replace(/\D/g, '');
  const slug = req.query.slug || '';
  if (cep.length !== 8) return res.status(200).json({ ok: false, error: 'CEP inválido' });

  const catalog = await loadCatalog();
  const produtos = parseComboSlug(slug, catalog);
  if (!produtos.length) return res.status(200).json({ ok: false, error: 'Combo inválido' });
  const pesoTotal = produtos.reduce((a, p) => a + (Number(p.peso_kg) || 0), 0);

  const { estado, zona, cidade } = await resolverCep(cep);
  if (!estado) return res.status(200).json({ ok: false, error: 'CEP não encontrado' });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let regra = null;
  const { data: exata } = await supabase.from('regras_frete').select('multiplicador, valor_minimo').eq('estado', estado).eq('zona', zona).maybeSingle();
  regra = exata;
  if (!regra) {
    const { data: fb } = await supabase.from('regras_frete').select('multiplicador, valor_minimo').eq('estado', estado).limit(1).maybeSingle();
    regra = fb;
  }

  const frete = calcularFrete(pesoTotal, regra);
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  return res.status(200).json({ ok: true, frete, estado, zona, cidade, pesoTotal });
}

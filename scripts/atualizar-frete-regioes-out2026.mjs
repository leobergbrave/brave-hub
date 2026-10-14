// Atualiza regras_frete com a nova tabela por regiões (out/2026).
// Mantém a estrutura de chaves existente (GO/DF, PB João Pessoa / Restante)
// para não quebrar o mapeamento CEP->estado em src/App.jsx.
// Rodar na raiz do projeto:  node scripts/atualizar-frete-regioes-out2026.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_SB = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL_SB || !KEY) { console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env'); process.exit(1); }

// UF -> [minimo, capital, interior1, interior2]
const M = {
  AL: [420, 3.75, 4.2, 4.5], BA: [315, 3.15, 3.3, 4.1], CE: [400, 4, 4.15, 4.5], MA: [415, 4.15, 4.25, 4.75],
  PE: [345, 3.15, 3.45, 3.9], PI: [410, 3.75, 4.1, 4.65], RN: [400, 3.85, 4.35, 4.8], SE: [345, 3.15, 3.45, 3.9],
  AC: [530, 4.85, 5.3, 5.9], AP: [560, 5.1, 5.6, 6.3], AM: [550, 5, 5.5, 6.2], PA: [450, 4.1, 4.5, 5.1],
  RO: [430, 3.95, 4.3, 4.9], RR: [580, 5.3, 5.8, 6.5], TO: [420, 3.7, 3.9, 4.2],
  MT: [350, 2.8, 3.1, 3.6], MS: [300, 2.25, 2.45, 2.85],
  ES: [250, 1.85, 2, 2.4], MG: [250, 1.6, 1.8, 2.15], RJ: [250, 1.75, 1.9, 2.2], SP: [230, 1.3, 1.2, 1.45],
  PR: [250, 1.35, 1.55, 2.1], RS: [250, 2.1, 2.3, 2.65], SC: [250, 1.85, 2, 2.35],
};
// Chaves especiais mantidas (estrutura legada usada pelo auto-preenchimento por CEP)
const ESPECIAIS = {
  'GO/DF': [250, 2.15, 2.35, 2.7],           // Goiás (DF difere em ~0,10/kg)
  'PB (João Pessoa)': [400, 3.25, 3.8, 4.45],
  'PB (Restante do Estado)': [400, 3.25, 3.8, 4.45],
};
const ZONAS = ['CAPITAL', 'INTERIOR 1', 'INTERIOR 2'];

const rows = [];
const push = (estado, v) => ZONAS.forEach((zona, i) =>
  rows.push({ estado, zona, multiplicador: v[1 + i], valor_minimo: v[0] }));
for (const uf in M) push(uf, M[uf]);
for (const k in ESPECIAIS) push(k, ESPECIAIS[k]);

const r = await fetch(`${URL_SB}/rest/v1/regras_frete?on_conflict=estado,zona`, {
  method: 'POST',
  headers: {
    apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});
console.log(r.ok ? `OK — ${rows.length} linhas gravadas (${rows.length / 3} chaves).` : `ERRO ${r.status}: ${await r.text()}`);

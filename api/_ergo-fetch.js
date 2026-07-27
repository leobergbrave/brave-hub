// api/_ergo-fetch.js — carrega o catálogo de ergômetros do banco (row ergo-catalog),
// mesclado sobre o catálogo base. Fallback para o base se não houver row/erro.
import { createClient } from '@supabase/supabase-js';
import { ERGO_CATALOG, mergeCatalog } from '../src/data/ergoCatalog.js';

export async function loadCatalog() {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Os 6 ergometros nucleo: base + overrides (inalterado — nao quebra combos no ar)
    const { data: cfg } = await supabase.from('landing_pages_config').select('config').eq('id', 'ergo-catalog').maybeSingle();
    const overrides = cfg?.config?.produtos;
    const base = overrides?.length ? mergeCatalog(overrides) : ERGO_CATALOG;

    // 2. Produtos curados extras (qualquer item do catalogo liberado pra combo)
    const { data: extras } = await supabase
      .from('combo_produtos').select('*').eq('ativo', true).order('ordem', { ascending: true });

    const aliasBase = new Set(base.map((p) => p.alias));
    const mapped = (extras || [])
      .filter((r) => r.alias && !aliasBase.has(r.alias)) // sem colidir com os 6
      .map((r) => ({
        alias: r.alias,
        nome: r.nome,
        subtitle: r.subtitle || '',
        emoji: r.emoji || '📦',
        preco: Number(r.preco) || 0,
        preco_avista: r.preco_avista != null ? Number(r.preco_avista) : null,
        peso_kg: Number(r.peso_kg) || 0,
        specs: Array.isArray(r.specs) ? r.specs : [],
        fotos: Array.isArray(r.fotos) ? r.fotos.filter(Boolean) : (r.imagem ? [r.imagem] : []),
        video: r.video || '',
      }));

    return [...base, ...mapped];
  } catch {
    return ERGO_CATALOG;
  }
}

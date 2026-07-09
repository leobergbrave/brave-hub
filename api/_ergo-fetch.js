// api/_ergo-fetch.js — carrega o catálogo de ergômetros do banco (row ergo-catalog),
// mesclado sobre o catálogo base. Fallback para o base se não houver row/erro.
import { createClient } from '@supabase/supabase-js';
import { ERGO_CATALOG, mergeCatalog } from '../src/data/ergoCatalog.js';

export async function loadCatalog() {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('landing_pages_config').select('config').eq('id', 'ergo-catalog').maybeSingle();
    const overrides = data?.config?.produtos;
    return overrides?.length ? mergeCatalog(overrides) : ERGO_CATALOG;
  } catch {
    return ERGO_CATALOG;
  }
}

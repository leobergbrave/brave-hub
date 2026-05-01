/**
 * Script para executar a migração SQL no Supabase
 * Usa a API REST do Supabase com pg_net ou conexão direta
 */

const SUPABASE_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
// Database password for direct connection
const DB_PASS = 'j&Nbz8+6%jR%3mE';

const SQL = `
CREATE TABLE IF NOT EXISTS produtos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_sku  TEXT,
  nome        TEXT NOT NULL,
  preco       NUMERIC NOT NULL DEFAULT 0,
  peso_kg     NUMERIC,
  url_imagem  TEXT
);

CREATE TABLE IF NOT EXISTS regras_frete (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estado        TEXT NOT NULL,
  zona          TEXT NOT NULL,
  multiplicador NUMERIC NOT NULL DEFAULT 1.0,
  valor_minimo  NUMERIC NOT NULL DEFAULT 0
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_estado_zona'
  ) THEN
    ALTER TABLE regras_frete ADD CONSTRAINT uq_estado_zona UNIQUE (estado, zona);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orcamentos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_em         TIMESTAMPTZ DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'Pendente',
  valor_total       NUMERIC NOT NULL DEFAULT 0,
  peso_total        NUMERIC NOT NULL DEFAULT 0,
  payload_carrinho  JSONB NOT NULL DEFAULT '[]'::jsonb
);

INSERT INTO regras_frete (estado, zona, multiplicador, valor_minimo) VALUES
  ('SP', 'CAPITAL',     1.2, 100),
  ('SP', 'INTERIOR 1',  1.4, 100),
  ('SP', 'INTERIOR 2',  1.6, 100),
  ('MG', 'CAPITAL',     1.4, 150),
  ('MG', 'INTERIOR 1',  1.6, 150),
  ('MG', 'INTERIOR 2',  1.8, 150),
  ('BA', 'CAPITAL',     3.0, 280),
  ('BA', 'INTERIOR 1',  3.0, 280),
  ('BA', 'INTERIOR 2',  4.0, 280)
ON CONFLICT (estado, zona) DO NOTHING;

ALTER TABLE produtos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_frete ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Produtos visíveis publicamente') THEN
    CREATE POLICY "Produtos visíveis publicamente" ON produtos FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Regras de frete visíveis publicamente') THEN
    CREATE POLICY "Regras de frete visíveis publicamente" ON regras_frete FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Orçamentos visíveis por link') THEN
    CREATE POLICY "Orçamentos visíveis por link" ON orcamentos FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir criação de orçamentos') THEN
    CREATE POLICY "Permitir criação de orçamentos" ON orcamentos FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir atualização de status do orçamento') THEN
    CREATE POLICY "Permitir atualização de status do orçamento" ON orcamentos FOR UPDATE USING (true);
  END IF;
END $$;
`;

async function runMigration() {
  console.log('🚀 Executando migração no Supabase...\n');
  
  // Try using the Supabase SQL endpoint (available on newer versions)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    console.log('✅ Conexão com Supabase OK (status:', res.status, ')');
  } catch (e) {
    console.error('❌ Falha na conexão:', e.message);
    return;
  }

  // Execute SQL via pg-meta API (management)
  // Note: This requires the service_role key or dashboard access
  // For anon key, we'll verify tables exist via REST API
  
  console.log('\n📋 SQL da migração gerado com sucesso.');
  console.log('📌 Para executar, acesse o SQL Editor do Supabase:');
  console.log(`   ${SUPABASE_URL.replace('.supabase.co', '')}`);
  console.log('   Dashboard > SQL Editor > New Query > Cole o SQL\n');
  
  // Let's try the direct approach via Supabase Management API
  const mgmtUrl = `https://api.supabase.com/v1/projects/jisbvqrnnujqgbsfondy/database/query`;
  
  try {
    const res = await fetch(mgmtUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    });
    
    if (res.ok) {
      console.log('✅ Migração executada com sucesso via Management API!');
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errText = await res.text();
      console.log('⚠️  Management API não disponível (esperado com anon key).');
      console.log('   Status:', res.status);
      console.log('\n🔧 Alternativa: executar via SQL Editor do Supabase Dashboard.');
      console.log('   O arquivo SQL está em: supabase/migrations/001_initial_tables.sql\n');
    }
  } catch (e) {
    console.log('⚠️  Management API inacessível:', e.message);
    console.log('   Execute o SQL manualmente no Dashboard do Supabase.\n');
  }

  // Verify by trying to query the tables (will fail if they don't exist)
  console.log('🔍 Verificando se as tabelas já existem...');
  
  for (const table of ['produtos', 'regras_frete', 'orcamentos']) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`   ✅ ${table} — OK (${data.length} registros encontrados)`);
      } else {
        console.log(`   ❌ ${table} — Não encontrada (status: ${res.status})`);
      }
    } catch (e) {
      console.log(`   ❌ ${table} — Erro: ${e.message}`);
    }
  }
}

runMigration();

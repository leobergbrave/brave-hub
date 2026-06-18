/**
 * Aplica a migration de campos de entrega Bling no Supabase
 * Execute: node supabase/apply_bling_entrega.mjs
 */

const SUPABASE_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzU5MTA3NSwiZXhwIjoyMDkzMTY3MDc1fQ.Xt8Zu7NQ1CUuFf7k8gTr4rXJZ08YE1LNmXj4vg_4VBY';

const SQL = `
-- Campos de entrega Bling em orcamentos_salvos

ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_pedido_id bigint;

ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS data_entrega timestamp with time zone;

ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_status_pedido text;

ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_status_verificado_em timestamp with time zone;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orcamentos_salvos'
    AND policyname = 'Edge functions podem atualizar orcamentos'
  ) THEN
    CREATE POLICY "Edge functions podem atualizar orcamentos"
      ON public.orcamentos_salvos FOR UPDATE
      USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function applyMigration() {
  console.log('🚀 Aplicando migration de campos de entrega Bling...\n');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!res.ok) {
    // Fallback: tentar via Management API
    console.log('⚠️  rpc/exec_sql não disponível. Tentando Management API...');
    const mgmt = await fetch(`https://api.supabase.com/v1/projects/jisbvqrnnujqgbsfondy/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    });

    if (mgmt.ok) {
      console.log('✅ Migration aplicada via Management API!');
    } else {
      const errText = await mgmt.text();
      console.log('⚠️  Não foi possível executar automaticamente.');
      console.log('\n📋 Execute o SQL abaixo manualmente no Supabase Dashboard:');
      console.log('   https://supabase.com/dashboard/project/jisbvqrnnujqgbsfondy/sql/new\n');
      console.log('─'.repeat(60));
      console.log(SQL);
      console.log('─'.repeat(60));
      return;
    }
  } else {
    console.log('✅ Migration aplicada!');
  }

  // Verificar se os campos foram criados
  console.log('\n🔍 Verificando campos criados...');
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/orcamentos_salvos?select=bling_pedido_id,data_entrega,bling_status_pedido&limit=1`,
    {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (check.ok) {
    console.log('✅ Campos data_entrega, bling_pedido_id e bling_status_pedido criados com sucesso!');
  } else {
    const err = await check.text();
    console.log('⚠️  Verificação falhou:', err);
    console.log('\nExecute o SQL manualmente no Dashboard:');
    console.log('https://supabase.com/dashboard/project/jisbvqrnnujqgbsfondy/sql/new');
    console.log('\nSQL:\n' + SQL);
  }
}

applyMigration().catch(console.error);

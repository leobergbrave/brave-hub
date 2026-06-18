const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const content = fs.readFileSync('.env', 'utf8');
  const url = content.match(/VITE_SUPABASE_URL\s*=\s*(.*)/)[1].trim();
  const key = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/)[1].trim();
  const supabase = createClient(url, key);

  const { data: config } = await supabase
    .from('prospeccao_config')
    .select('apify_token')
    .eq('id', 1)
    .single();

  if (!config || !config.apify_token) {
    console.error('Token do Apify não configurado no banco.');
    return;
  }

  const token = config.apify_token.trim();
  console.log('Buscando runs do Apify com o token...');

  const response = await fetch(`https://api.apify.com/v2/actor-runs?token=${token}&limit=5`);
  if (!response.ok) {
    console.error('Erro ao buscar runs:', await response.text());
    return;
  }

  const data = await response.json();
  const runs = data.data?.items || [];
  console.log(`Encontradas ${runs.length} runs recentes:`);
  
  for (const r of runs) {
    console.log(`- ID: ${r.id} | Status: ${r.status} | ActorId: ${r.actId} | Started: ${r.startedAt}`);
    
    // Obter detalhes da run incluindo webhooks
    const detailRes = await fetch(`https://api.apify.com/v2/actor-runs/${r.id}?token=${token}`);
    if (detailRes.ok) {
      const detail = await detailRes.json();
      console.log(`  Webhook Configured URL:`, detail.data?.meta?.clientWebhooks?.map(w => w.requestUrl) || 'None');
      console.log(`  DatasetId: ${r.defaultDatasetId}`);
      if (r.status === 'FAILED') {
        console.log(`  ErrorMessage: ${detail.data?.errorMessage || 'N/A'}`);
      }
    }
  }
}

run().catch(console.error);

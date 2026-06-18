async function abort() {
  try {
    const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
    
    // Buscar token
    const resConfig = await fetch(`${supabaseUrl}/rest/v1/prospeccao_config?id=eq.1&select=apify_token`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const config = (await resConfig.json())[0];
    const token = config.apify_token.trim();
    const runId = 'g4Abu01kQ7Wkv7DXl';
    
    console.log(`Abortando execucao ${runId} no Apify...`);
    const resAbort = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort?token=${token}`, {
      method: 'POST'
    });
    
    console.log(`Status: ${resAbort.status}`);
    console.log(`Response: ${await resAbort.text()}`);
  } catch (err) {
    console.error(err);
  }
}

abort();

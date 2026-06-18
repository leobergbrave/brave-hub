import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env variables if .env exists
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('No Supabase Anon Key found!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  console.log('--- Configuração (disparo_config) ---');
  const { data: configs, error: configErr } = await supabase.from('disparo_config').select('*');
  if (configErr) {
    console.error('Erro ao buscar disparo_config:', configErr);
  } else {
    console.log(configs);
  }

  console.log('\n--- Campanhas (disparo_campanhas) ---');
  const { data: campaigns, error: campaignErr } = await supabase.from('disparo_campanhas').select('*');
  if (campaignErr) {
    console.error('Erro ao buscar disparo_campanhas:', campaignErr);
  } else {
    console.log(campaigns);
  }

  console.log('\n--- Contagem da Fila (disparo_fila) ---');
  const statuses = ['pending', 'sent', 'failed'];
  for (const status of statuses) {
    const { count, error: countErr } = await supabase
      .from('disparo_fila')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    if (countErr) {
      console.error(`Erro ao contar status ${status}:`, countErr);
    } else {
      console.log(`Status ${status}: ${count} itens`);
    }
  }

  console.log('\n--- Últimos 10 itens enviados/falhos da Fila ---');
  const { data: lastProcessed, error: procErr } = await supabase
    .from('disparo_fila')
    .select('*')
    .not('status', 'eq', 'pending')
    .order('sent_at', { ascending: false })
    .limit(10);
  if (procErr) {
    console.error('Erro ao buscar itens processados:', procErr);
  } else {
    console.log(lastProcessed?.map(i => ({
      id: i.id,
      campanha_id: i.campanha_id,
      nome: i.nome,
      telefone: i.telefone,
      status: i.status,
      send_after: i.send_after,
      sent_at: i.sent_at,
      erro: i.erro
    })));
  }

  console.log('\n--- Próximos 10 itens pendentes na Fila (send_after asc) ---');
  const { data: nextPending, error: pendErr } = await supabase
    .from('disparo_fila')
    .select('*')
    .eq('status', 'pending')
    .order('send_after', { ascending: true })
    .limit(10);
  if (pendErr) {
    console.error('Erro ao buscar itens pendentes:', pendErr);
  } else {
    console.log(nextPending?.map(i => ({
      id: i.id,
      campanha_id: i.campanha_id,
      nome: i.nome,
      telefone: i.telefone,
      status: i.status,
      send_after: i.send_after,
      criado_em: i.criado_em
    })));
  }
}

runCheck();

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

async function getBlingToken() {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas no banco.');
  return data;
}

async function refreshBlingToken(config) {
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);
  
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Erro ao atualizar token:', err);
    throw new Error('Falha ao renovar o token da Bling.');
  }

  const tokenData = await response.json();
  
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString()
  }).eq('id', 1);

  return tokenData.access_token;
}

async function fetchWithBlingAuth(url, options) {
  let config = await getBlingToken();
  
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${config.access_token}`,
      'Accept': '1.0'
    }
  });

  if (res.status === 401) {
    console.log('Token expirado. Tentando renovar...');
    const newAccessToken = await refreshBlingToken(config);
    res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${newAccessToken}`,
        'Accept': '1.0'
      }
    });
  }

  return res;
}

async function checkSellers() {
  try {
    console.log('Fetching sellers from Bling...');
    const res = await fetchWithBlingAuth('https://api.bling.com.br/v3/vendedores', { method: 'GET' });
    if (!res.ok) {
      console.error(`Bling API returned ${res.status}:`, await res.text());
      return;
    }
    const vendData = await res.json();
    console.log('\n--- Vendedores Registrados no Bling ---');
    if (vendData && vendData.data) {
      vendData.data.forEach(v => {
        console.log(`ID: ${v.id} | Nome: "${v.contato.nome}" | Situação: ${v.situacao}`);
      });
    } else {
      console.log('Nenhum vendedor retornado:', vendData);
    }
  } catch (err) {
    console.error('Error checking sellers:', err);
  }
}

checkSellers();

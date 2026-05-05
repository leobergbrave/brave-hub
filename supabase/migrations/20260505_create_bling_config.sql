CREATE TABLE IF NOT EXISTS bling_config (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserir as credenciais iniciais
INSERT INTO bling_config (id, client_id, client_secret) 
VALUES (
  1, 
  '8d756b83ffeb052612698b6000b0975961dbabb7', 
  'dc5de1bd869f30d49c522df76e8cf5bf55f86094ff9ad1a91d760b0a0616'
) ON CONFLICT (id) DO UPDATE SET 
  client_id = EXCLUDED.client_id, 
  client_secret = EXCLUDED.client_secret;

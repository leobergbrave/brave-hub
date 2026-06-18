import os
import sys
import json
import urllib.request

# Carrega .env
def load_env(env_path=".env"):
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

load_env()
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
}

# Pegar token
url_config = f"{SUPABASE_URL}/rest/v1/prospeccao_config?id=eq.1&select=apify_token"
req = urllib.request.Request(url_config, headers=headers)
with urllib.request.urlopen(req) as res:
    config = json.loads(res.read().decode("utf-8"))[0]

token = config["apify_token"].strip()
run_id = "vdgEIFnsTc8Mqpkl6"

print(f"Buscando detalhes da execucao {run_id}...")
url_run = f"https://api.apify.com/v2/actor-runs/{run_id}?token={token}"
try:
    with urllib.request.urlopen(url_run) as res:
        data = json.loads(res.read().decode("utf-8"))
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Erro na requisicao:", e)

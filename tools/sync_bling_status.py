#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta
import time

# Forçar codificação UTF-8 para saída se o terminal suportar
if sys.platform.startswith("win"):
    # Tenta configurar o console para UTF-8
    try:
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# 1. Carregamento Autônomo de Variáveis do .env
# ──────────────────────────────────────────────────────────────────────────────
def load_env(env_path=".env"):
    if not os.path.exists(env_path):
        print(f"[AVISO] Arquivo {env_path} nao encontrado. Usando variaveis de ambiente do sistema.")
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
# Usar a Service Role Key como prioridade, e a Anon Key como fallback
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[ERRO] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY nao definidos no .env")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Helpers para Requisições HTTP (urllib)
# ──────────────────────────────────────────────────────────────────────────────
def http_request(url, method="GET", headers=None, body=None):
    if headers is None:
        headers = {}
    
    data = None
    if body is not None:
        if isinstance(body, dict) or isinstance(body, list):
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(body, str):
            data = body.encode("utf-8")
        else:
            data = body

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            status = response.status
            return status, res_body
    except urllib.error.HTTPError as e:
        res_body = e.read().decode("utf-8")
        return e.code, res_body
    except Exception as e:
        return 0, str(e)

# ──────────────────────────────────────────────────────────────────────────────
# 3. Integração Supabase via REST
# ──────────────────────────────────────────────────────────────────────────────
def get_supabase_headers():
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Prefer": "return=representation"
    }

def get_bling_config():
    url = f"{SUPABASE_URL}/rest/v1/bling_config?id=eq.1&select=*"
    status, body = http_request(url, headers=get_supabase_headers())
    if status == 200:
        data = json.loads(body)
        return data[0] if data else None
    else:
        raise Exception(f"Erro ao buscar bling_config no Supabase (HTTP {status}): {body}")

def update_bling_tokens(access_token, refresh_token):
    url = f"{SUPABASE_URL}/rest/v1/bling_config?id=eq.1"
    payload = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }
    status, body = http_request(url, method="PATCH", headers=get_supabase_headers(), body=payload)
    if status not in [200, 204]:
        raise Exception(f"Erro ao atualizar tokens do Bling no Supabase (HTTP {status}): {body}")
    print("[OK] Tokens do Bling atualizados no Supabase com sucesso.")

def get_pending_quotes():
    # payload->>status = 'Aprovado', data_entrega is null, bling_pedido_id not null
    # Filtro Postgrest correspondente:
    url = (
        f"{SUPABASE_URL}/rest/v1/orcamentos_salvos?"
        "select=id,cliente,bling_pedido_id,bling_status_pedido,data_entrega&"
        "payload->>status=eq.Aprovado&"
        "bling_pedido_id=not.is.null&"
        "data_entrega=is.null&"
        "bling_status_pedido=neq.cancelado&"
        "limit=50"
    )
    status, body = http_request(url, headers=get_supabase_headers())
    if status == 200:
        return json.loads(body)
    else:
        raise Exception(f"Erro ao buscar orçamentos no Supabase (HTTP {status}): {body}")

def update_quote_status(quote_id, status_pedido, data_entrega=None):
    url = f"{SUPABASE_URL}/rest/v1/orcamentos_salvos?id=eq.{quote_id}"
    payload = {
        "bling_status_pedido": status_pedido,
        "bling_status_verificado_em": datetime.utcnow().isoformat() + "Z"
    }
    if data_entrega:
        payload["data_entrega"] = data_entrega
    
    status, body = http_request(url, method="PATCH", headers=get_supabase_headers(), body=payload)
    if status not in [200, 204]:
        print(f"[AVISO] Falha ao atualizar status do orçamento {quote_id} no Supabase: {body}")

def update_posv_agenda(quote_id, data_entrega_iso):
    # Calcula datas do pós-venda
    dt_entrega = datetime.fromisoformat(data_entrega_iso.replace("Z", "+00:00"))
    dt_nps = dt_entrega + timedelta(days=7)
    agora_ts = datetime.utcnow().isoformat() + "Z"

    # Atualiza ação 'avaliacao'
    url_av = f"{SUPABASE_URL}/rest/v1/posv_acoes?orcamento_id=eq.{quote_id}&estrategia_id=eq.avaliacao&executado_em=is.null&prevista_em=is.null"
    http_request(url_av, method="PATCH", headers=get_supabase_headers(), body={
        "prevista_em": dt_entrega.isoformat().replace("+00:00", "Z"),
        "atualizado_em": agora_ts
    })

    # Atualiza ação 'nps'
    url_nps = f"{SUPABASE_URL}/rest/v1/posv_acoes?orcamento_id=eq.{quote_id}&estrategia_id=eq.nps&executado_em=is.null&prevista_em=is.null"
    http_request(url_nps, method="PATCH", headers=get_supabase_headers(), body={
        "prevista_em": dt_nps.isoformat().replace("+00:00", "Z"),
        "atualizado_em": agora_ts
    })
    print(f"[INFO] Agenda de pos-venda atualizada para o orcamento {quote_id}.")

# ──────────────────────────────────────────────────────────────────────────────
# 4. Integração Bling API v3
# ──────────────────────────────────────────────────────────────────────────────
def refresh_bling_token(client_id, client_secret, refresh_token):
    url = "https://www.bling.com.br/Api/v3/oauth/token"
    auth_str = f"{client_id}:{client_secret}".encode("utf-8")
    import base64
    auth_header = base64.b64encode(auth_str).decode("utf-8")
    
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "1.0"
    }
    
    payload = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token
    })
    
    status, body = http_request(url, method="POST", headers=headers, body=payload)
    if status == 200:
        data = json.loads(body)
        return data["access_token"], data["refresh_token"]
    else:
        raise Exception(f"Falha ao renovar token no Bling (HTTP {status}): {body}")

def get_bling_pedido(pedido_id, access_token):
    url = f"https://api.bling.com.br/v3/pedidos/vendas/{pedido_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "1.0"
    }
    status, body = http_request(url, headers=headers)
    return status, body

# ──────────────────────────────────────────────────────────────────────────────
# 5. Execução Principal (Orquestração)
# ──────────────────────────────────────────────────────────────────────────────
def main():
    print("[PROCESSO] Iniciando Sincronizacao de Status do Bling v3...")
    
    try:
        config = get_bling_config()
    except Exception as e:
        print(f"[ERRO] Falha na configuracao: {e}")
        sys.exit(1)
        
    if not config:
        print("[ERRO] Configuracao do Bling nao encontrada no Supabase.")
        sys.exit(1)

    client_id = config.get("client_id")
    client_secret = config.get("client_secret")
    access_token = config.get("access_token")
    refresh_token_val = config.get("refresh_token")

    # Passo 1: Obter orçamentos pendentes de sincronização
    try:
        quotes = get_pending_quotes()
    except Exception as e:
        print(f"[ERRO] Ao buscar orcamentos: {e}")
        sys.exit(1)

    total_quotes = len(quotes)
    print(f"[INFO] Encontrados {total_quotes} orcamento(s) aprovado(s) pendente(s) de entrega.")

    if total_quotes == 0:
        print("[INFO] Nada para sincronizar. Finalizado.")
        sys.exit(0)

    # Status de entrega considerados no Bling
    STATUS_ENTREGUE = {"atendido", "entregue", "concluido", "concluído"}

    entregues_count = 0
    token_renovado = False

    for quote in quotes:
        quote_id = quote.get("id")
        cliente_nome = quote.get("cliente")
        bling_pedido_id = quote.get("bling_pedido_id")
        
        print(f"\n[PROCESSO] Verificando pedido {bling_pedido_id} do cliente '{cliente_nome}'...")
        
        try:
            status_http, body_http = get_bling_pedido(bling_pedido_id, access_token)
            
            # Se der 401, renova o token e tenta novamente uma vez
            if status_http == 401 and not token_renovado:
                print("[INFO] Token expirado (401). Renovando token do Bling...")
                try:
                    access_token, refresh_token_val = refresh_bling_token(client_id, client_secret, refresh_token_val)
                    update_bling_tokens(access_token, refresh_token_val)
                    token_renovado = True
                    # Tenta a consulta novamente
                    status_http, body_http = get_bling_pedido(bling_pedido_id, access_token)
                except Exception as ex_token:
                    print(f"[ERRO] Ao renovar token: {ex_token}")
                    break

            if status_http == 200:
                pedido_data = json.loads(body_http).get("data", {})
                
                # Mapeamento determinístico de IDs de situação do Bling v3
                MAPA_SITUACOES = {
                    6: "em aberto",
                    9: "em andamento",
                    12: "atendido",
                    15: "concluido",
                    18: "cancelado"
                }
                situacao_data = pedido_data.get("situacao", {})
                situacao_id = situacao_data.get("id")
                situacao = MAPA_SITUACOES.get(situacao_id, "").lower().strip()
                if not situacao:
                    situacao = (situacao_data.get("nome") or "").lower().strip()
                
                print(f"[STATUS] Status no Bling: '{situacao}' (ID: {situacao_id})")

                
                is_entregue = situacao in STATUS_ENTREGUE
                
                # Determina a data da entrega
                data_entrega_bling = (
                    pedido_data.get("dataEntrega") or 
                    pedido_data.get("dataSaida") or 
                    pedido_data.get("dataPrevista") or 
                    None
                )
                
                agora_iso = datetime.utcnow().isoformat() + "Z"
                
                if is_entregue:
                    if data_entrega_bling:
                        # Bling pode retornar data no formato AAAA-MM-DD
                        if len(data_entrega_bling) == 10:
                            data_entrega_iso = data_entrega_bling + "T12:00:00Z"
                        else:
                            data_entrega_iso = data_entrega_bling
                    else:
                        data_entrega_iso = agora_iso
                    
                    # Atualiza orçamento
                    update_quote_status(quote_id, situacao, data_entrega_iso)
                    print(f"[OK] Pedido entregue! Salva data_entrega = {data_entrega_iso}")
                    
                    # Atualiza posv_acoes
                    update_posv_agenda(quote_id, data_entrega_iso)
                    entregues_count += 1
                else:
                    # Apenas atualiza o status de verificação
                    update_quote_status(quote_id, situacao)
                    print("[INFO] Pedido ainda em andamento.")
            else:
                print(f"[AVISO] Nao foi possivel obter dados do pedido {bling_pedido_id} (HTTP {status_http}): {body_http}")

            # Respeitar rate limit do Bling (3 req/s max)
            time.sleep(0.4)

        except Exception as e:
            print(f"[ERRO] Ao processar orcamento {quote_id}: {e}")
            time.sleep(0.4)
            continue

    print(f"\n[OK] Sincronizacao finalizada. Total verificados: {total_quotes} | Entregues: {entregues_count}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
import time
import argparse

# Configurar encoding do terminal no Windows para evitar erros
if sys.platform.startswith("win"):
    try:
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# 1. Carregamento do .env
# ──────────────────────────────────────────────────────────────────────────────
def load_env(env_path=".env"):
    if not os.path.exists(env_path):
        print(f"[AVISO] Arquivo {env_path} nao encontrado. Usando variaveis do sistema.")
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

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[ERRO] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY nao definidos no .env")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Requisicoes HTTP (urllib)
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
# 3. Supabase REST Helpers
# ──────────────────────────────────────────────────────────────────────────────
def get_supabase_headers():
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
    }

def get_prospeccao_config():
    url = f"{SUPABASE_URL}/rest/v1/prospeccao_config?id=eq.1&select=*"
    status, body = http_request(url, headers=get_supabase_headers())
    if status == 200:
        data = json.loads(body)
        return data[0] if data else None
    else:
        raise Exception(f"Erro ao buscar prospeccao_config no Supabase (HTTP {status}): {body}")

def get_lead_existe(nome, cidade):
    nome_escaped = urllib.parse.quote(nome)
    cidade_escaped = urllib.parse.quote(cidade)
    url = f"{SUPABASE_URL}/rest/v1/potenciais_clientes?nome_empresa=eq.{nome_escaped}&cidade=eq.{cidade_escaped}&select=id"
    status, body = http_request(url, headers=get_supabase_headers())
    if status == 200:
        data = json.loads(body)
        return len(data) > 0
    return False

def insert_lead(lead_payload):
    url = f"{SUPABASE_URL}/rest/v1/potenciais_clientes"
    status, body = http_request(url, method="POST", headers=get_supabase_headers(), body=lead_payload)
    if status not in [200, 201, 204]:
        print(f"[AVISO] Falha ao inserir lead {lead_payload.get('nome_empresa')}: {body}")
        return False
    return True

# ──────────────────────────────────────────────────────────────────────────────
# 4. APIs Externas (Gemini & Apify)
# ──────────────────────────────────────────────────────────────────────────────
def extrair_gancho_gemini(gemini_key, prompt_base, lead_info):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={gemini_key}"
    
    # Montar contexto para a IA
    prompt = (
        f"{prompt_base}\n\n"
        f"Dados da Empresa Prospectada:\n"
        f"Nome: {lead_info.get('title')}\n"
        f"Categoria/Segmento: {lead_info.get('categoryName')}\n"
        f"Site: {lead_info.get('website')}\n"
        f"Telefone: {lead_info.get('phone')}\n"
        f"Endereco: {lead_info.get('address')}\n"
        f"Avaliacao Google Maps: {lead_info.get('stars', 'Nao avaliado')}\n"
        f"Subtitulo/Descricao: {lead_info.get('subTitle', '')}\n\n"
        f"Instrucao: Gere apenas o gancho comercial em formato de texto para WhatsApp/Email. Seja breve e direto."
    )
    
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    }
    
    status, body = http_request(url, method="POST", body=payload)
    if status == 200:
        try:
            res_json = json.loads(body)
            texto = res_json["candidates"][0]["content"]["parts"][0]["text"]
            return texto.strip()
        except Exception as e:
            print(f"[ERRO] Falha ao decodificar retorno da IA Gemini: {e}")
            return ""
    else:
        print(f"[AVISO] Chamada a API do Gemini falhou (HTTP {status}): {body}")
        return ""

def executar_raspagem_apify(apify_token, search_query, limite):
    print(f"[INFO] Disparando tarefa no Apify para: '{search_query}'...")
    url = f"https://api.apify.com/v2/acts/apify~google-maps-scraper/runs?token={apify_token}"
    
    payload = {
        "searchStrings": [search_query],
        "maxCrawledPlacesPerSearch": limite,
        "scrapeWebsite": True,
        "scrapeReviews": False,
        "scrapePeople": False,
        "language": "pt"
    }
    
    status, body = http_request(url, method="POST", body=payload)
    if status not in [200, 201]:
        raise Exception(f"Falha ao iniciar act no Apify (HTTP {status}): {body}")
        
    run_data = json.loads(body).get("data", {})
    run_id = run_data.get("id")
    dataset_id = run_data.get("defaultDatasetId")
    
    print(f"[INFO] Scraping iniciado. Run ID: {run_id} | Dataset ID: {dataset_id}")
    
    # Loop de Polling de Status
    status_url = f"https://api.apify.com/v2/actor-runs/{run_id}?token={apify_token}"
    tentativas = 0
    max_tentativas = 60 # Max 10 minutos
    
    while tentativas < max_tentativas:
        time.sleep(10)
        tentativas += 1
        s_status, s_body = http_request(status_url)
        
        if s_status == 200:
            s_data = json.loads(s_body).get("data", {})
            run_status = s_data.get("status")
            print(f"[PROCESSO] Progresso Apify: '{run_status}' (tempo decorrido: {tentativas * 10}s)")
            
            if run_status == "SUCCEEDED":
                break
            elif run_status in ["FAILED", "ABORTED", "TIMED-OUT"]:
                raise Exception(f"Tarefa do Apify finalizou com falha. Status: {run_status}")
        else:
            print(f"[AVISO] Nao foi possivel obter status da execucao (HTTP {s_status})")
            
    # Baixar dataset
    dataset_url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={apify_token}"
    d_status, d_body = http_request(dataset_url)
    if d_status == 200:
        return json.loads(d_body)
    else:
        raise Exception(f"Erro ao baixar dataset de resultados (HTTP {d_status}): {d_body}")

# ──────────────────────────────────────────────────────────────────────────────
# 5. Core Execution (Orquestrador)
# ──────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Automação B.L.A.S.T. para raspagem e qualificação de Leads frios.")
    parser.add_argument("--nicho", type=str, default="Box de Crossfit", help="Nicho de busca (ex: Box de Crossfit)")
    parser.add_argument("--cidade", type=str, default="Sao Paulo", help="Cidade de busca")
    parser.add_argument("--estado", type=str, default="SP", help="Sigla do Estado")
    parser.add_argument("--limite", type=int, default=5, help="Quantidade de leads a raspar")
    
    args = parser.parse_args()
    
    print("[PROCESSO] Carregando configuracoes de prospeccao do Supabase...")
    try:
        config = get_prospeccao_config()
    except Exception as e:
        print(f"[ERRO] Falha ao carregar credenciais do Supabase: {e}")
        sys.exit(1)
        
    if not config:
        print("[ERRO] Tabela prospeccao_config nao configurada. Configure na tela ou adicione a linha id=1.")
        sys.exit(1)
        
    apify_token = config.get("apify_token")
    if apify_token:
        apify_token = apify_token.strip()
        if apify_token.startswith("apify_api_key_"):
            apify_token = apify_token.replace("apify_api_key_", "")
        elif apify_token.startswith("apify_api_"):
            apify_token = apify_token.replace("apify_api_", "")
        elif apify_token.startswith("apify_token_"):
            apify_token = apify_token.replace("apify_token_", "")
            
    gemini_key = config.get("gemini_key")
    prompt_base = config.get("prompt_personalizacao") or "Escreva uma abordagem de vendas para esta academia."
    
    if not apify_token:
        print("[ERRO] Token do Apify nao configurado na tabela prospeccao_config.")
        sys.exit(1)
        
    search_query = f"{args.nicho} em {args.cidade} - {args.estado}"
    print(f"[INFO] Parametros de Busca: niche='{args.nicho}', location='{args.cidade}-{args.estado}', limit={args.limite}")
    
    try:
        itens = executar_raspagem_apify(apify_token, search_query, args.limite)
    except Exception as e:
        print(f"[ERRO] Falha na raspagem de dados: {e}")
        sys.exit(1)
        
    total_leads = len(itens)
    print(f"\n[INFO] Raspagem concluida. Encontradas {total_leads} localizacoes.")
    
    salvos = 0
    enriquecidos = 0
    
    for item in itens:
        nome_empresa = item.get("title")
        if not nome_empresa:
            continue
            
        # 1. Verificar duplicidade
        if get_lead_existe(nome_empresa, args.cidade):
            print(f"[INFO] Lead '{nome_empresa}' em '{args.cidade}' ja existe no banco de dados. Ignorando.")
            continue
            
        print(f"\n[PROCESSO] Processando lead: '{nome_empresa}'...")
        
        # 2. Sanitizar dados do lead
        telefone_bruto = item.get("phone") or item.get("phoneUnformatted") or ""
        telefone_limpo = "".join([c for c in telefone_bruto if c.isdigit()])
        # Mapeamento do email
        email_lead = item.get("email") or ""
        
        lead_payload = {
            "nome_empresa": nome_empresa,
            "segmento": item.get("categoryName") or args.nicho,
            "telefone": telefone_limpo if len(telefone_limpo) >= 8 else None,
            "email": email_lead if email_lead else None,
            "site": item.get("website") or None,
            "cidade": args.cidade,
            "estado": args.estado,
            "origem": "raspagem",
            "status": "prospecto",
            "dados_personalizados": {
                "stars": item.get("stars"),
                "reviews": item.get("reviewsCount"),
                "maps_url": item.get("url"),
                "gancho_whatsapp": ""
            }
        }
        
        # 3. Enriquecer com IA (Gemini 3.5 Flash) se gemini_key estiver configurada
        if gemini_key:
            print(f"[INFO] Chamando Gemini para gerar gancho comercial...")
            gancho = extrair_gancho_gemini(gemini_key, prompt_base, item)
            if gancho:
                lead_payload["dados_personalizados"]["gancho_whatsapp"] = gancho
                enriquecidos += 1
                print(f"[STATUS] Gancho gerado com sucesso.")
            else:
                print(f"[AVISO] Nao foi possivel gerar o gancho comercial.")
        else:
            print(f"[AVISO] gemini_key nao configurada. Pulando geracao de gancho.")
            
        # 4. Inserir no Supabase
        if insert_lead(lead_payload):
            salvos += 1
            
    print(f"\n[OK] Processo de prospeccao concluido!")
    print(f"[INFO] Total coletados: {total_leads} | Salvos no banco: {salvos} | Enriquecidos por IA: {enriquecidos}")

if __name__ == "__main__":
    main()

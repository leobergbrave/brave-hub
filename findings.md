# Descobertas e Restrições (findings.md)

Este documento registra as pesquisas, descobertas tecnológicas, restrições (constraints) e decisões técnicas ao longo da implementação.

## Descobertas Iniciais
- **Tecnologia do Brave Hub**: O frontend é construído em Vite + React + Tailwind (ou CSS Customizado). Há uma pasta `api/` na raiz, e suporte a Supabase para banco de dados.
- **Protocolo**: Estamos implementando automações e funcionalidades utilizando o protocolo B.L.A.S.T. e a arquitetura A.N.T. de 3 camadas.

## Restrições (Constraints)
- O código em `tools/` deve ser estritamente em Python e determinístico.
- Variáveis de ambiente devem vir exclusivamente do `.env` local.
- Operações intermediárias de arquivo devem usar a pasta `.tmp/`.
- Mudanças de banco de dados (migrations) devem ser geradas em formato SQL e entregues para o usuário rodar de forma manual no console do Supabase.

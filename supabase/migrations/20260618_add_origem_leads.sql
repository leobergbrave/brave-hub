-- Migration: Adicionar coluna origem na tabela leads do CRM
-- Data: 2026-06-18

ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual';

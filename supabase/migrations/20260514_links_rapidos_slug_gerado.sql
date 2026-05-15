-- Migration: Add slug_gerado to links_rapidos
ALTER TABLE public.links_rapidos ADD COLUMN IF NOT EXISTS slug_gerado TEXT;

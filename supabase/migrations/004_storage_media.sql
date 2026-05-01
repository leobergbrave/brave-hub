-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração 004: Storage de Mídias
-- ═══════════════════════════════════════════════

-- Cria o bucket se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos_media', 'produtos_media', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket produtos_media
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'produtos_media');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Upload Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Upload Access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'produtos_media');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Update Access" ON storage.objects FOR UPDATE USING (bucket_id = 'produtos_media');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Delete Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Delete Access" ON storage.objects FOR DELETE USING (bucket_id = 'produtos_media');
  END IF;
END $$;

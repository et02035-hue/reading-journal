CREATE POLICY "page photos readable" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'page-photos');
CREATE POLICY "page photos insertable" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'page-photos');
CREATE POLICY "page photos deletable" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'page-photos');
-- Bucket public pentru replicile asistentului vocal (audio generat o singură dată, refolosit pentru toți).
-- Conține DOAR replici generice ale aplicației, niciodată texte personale. Fără politici pe storage.objects:
-- citirea după URL merge (bucket public), dar nu se poate lista conținutul, iar scrierea o face doar funcția `tts`
-- (cu service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts-cache', 'tts-cache', true, 2097152, array['audio/mpeg'])
on conflict (id) do nothing;

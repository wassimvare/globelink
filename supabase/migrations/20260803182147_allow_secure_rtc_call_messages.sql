-- Autorise les signaux WebRTC et l'historique d'appel sans relâcher
-- les limites de taille appliquées aux messages classiques.
alter table public.messages drop constraint if exists messages_payload_safe;

alter table public.messages
  add constraint messages_payload_safe check (
    char_length(coalesce(content, '')) <= 5000
    and char_length(coalesce(attachment_url, '')) <= 1200
    and char_length(coalesce(attachment_meta::text, '')) <= 65535
    and (
      attachment_type is null
      or attachment_type in ('image', 'video', 'file', 'audio', 'rtc', 'call')
    )
    and (
      nullif(btrim(coalesce(content, '')), '') is not null
      or attachment_url is not null
      or (attachment_type = 'rtc' and attachment_meta is not null)
    )
  ) not valid;

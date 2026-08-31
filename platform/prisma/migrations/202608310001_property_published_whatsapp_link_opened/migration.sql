-- Fase 1 / Diretriz Mestre do MVP, Secao 12 (correcao do mecanismo de WhatsApp):
-- adiciona um valor de auditoria distinto de "owner_notified" para registrar que
-- um usuario da imobiliaria ABRIU o deeplink wa.me para o proprietario, sem que
-- isso implique que uma mensagem foi de fato enviada/recebida. A diretriz proibe
-- explicitamente afirmar envio quando apenas o link foi aberto — por isso este e
-- um valor de enum novo, e nao uma reutilizacao de 'property_published_owner_notified'.
ALTER TABLE `website_audit_logs`
  MODIFY COLUMN `action` ENUM(
    'website_created','website_updated','website_deleted','website_cloned',
    'page_created','page_updated','page_deleted',
    'section_created','section_updated','section_deleted',
    'component_created','component_updated','component_deleted',
    'asset_upload_requested','asset_uploaded','asset_deleted',
    'domain_created','domain_updated','domain_deleted',
    'seo_updated',
    'code_editor_opened','code_file_selected','code_file_created','code_file_updated','code_file_deleted','code_editor_saved',
    'site_settings_saved','site_published','site_unpublished',
    'site_property_published','site_property_unpublished',
    'property_published_owner_notified','property_published_owner_notification_skipped',
    'property_published_whatsapp_link_opened'
  ) NOT NULL;

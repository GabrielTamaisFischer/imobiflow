-- Item 15 do escopo: evento property.published -> WhatsAppProvider
-- sintético. Adiciona os dois novos valores de auditoria usados por
-- services/property-events.ts (emitPropertyPublishedEvent) ao enum
-- WebsiteAuditAction, para que a notificação (ou o motivo de ela ter sido
-- pulada) fique registrada em website_audit_logs como qualquer outra ação
-- do site.
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
    'property_published_owner_notified','property_published_owner_notification_skipped'
  ) NOT NULL;

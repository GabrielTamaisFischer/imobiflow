-- Isolamento multiempresa do site público (P0 segurança).
--
-- company_sites.slug era único apenas por empresa (company_id, slug), mas o
-- slug é usado como identificador GLOBAL na rota pública (GET
-- /public/sites/:slug), que não tem como saber a qual empresa o visitante
-- se referia. Duas empresas diferentes conseguiam publicar o MESMO slug;
-- nesse caso a rota pública resolvia sempre para a mesma (a primeira
-- encontrada), inclusive desviando leads (nome/telefone/e-mail/mensagem)
-- de visitantes da segunda empresa para a primeira — vazamento real de
-- dados entre empresas. Reproduzido e confirmado neste sandbox antes desta
-- migração (ver log de desenvolvimento 2026-08-30).
--
-- Esta migração torna o slug único globalmente. Uma checagem equivalente
-- já foi adicionada em PUT /site/settings (routes/sites.ts) para devolver
-- um erro amigável antes de depender só da constraint do banco.
ALTER TABLE `company_sites` DROP INDEX `company_sites_company_id_slug_key`;
ALTER TABLE `company_sites` ADD UNIQUE INDEX `company_sites_slug_key` (`slug`);

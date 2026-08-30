-- Fase B (checkpoint B4): properties.responsible_user_id sempre existiu como
-- coluna solta, sem FK nem relation Prisma — o "corretor responsável" nunca
-- foi de fato validado nem consultável via relação. Não cria uma nova
-- entidade Broker: reaproveita AppUser (users), como pedido no escopo da
-- Fase B. Nenhuma linha existente ficou órfã (conferido antes de migrar:
-- 0 properties.responsible_user_id sem users.id correspondente).
ALTER TABLE `properties`
  ADD CONSTRAINT `properties_responsible_user_id_fkey`
  FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

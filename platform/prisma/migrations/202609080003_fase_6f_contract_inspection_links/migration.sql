-- F6F: explicit, optional links to entry/exit inspections of the same property.
-- Additive and nullable so draft contracts remain valid before a vistoria exists.
ALTER TABLE `contracts_mysql`
  ADD COLUMN `entry_inspection_id` CHAR(36) NULL,
  ADD COLUMN `exit_inspection_id` CHAR(36) NULL,
  ADD INDEX `contracts_mysql_entry_inspection_id_idx` (`entry_inspection_id`),
  ADD INDEX `contracts_mysql_exit_inspection_id_idx` (`exit_inspection_id`),
  ADD CONSTRAINT `contracts_mysql_entry_inspection_id_fkey` FOREIGN KEY (`entry_inspection_id`) REFERENCES `inspections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `contracts_mysql_exit_inspection_id_fkey` FOREIGN KEY (`exit_inspection_id`) REFERENCES `inspections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- F6O: recovery for the TiDB staging failure of 202609080003.
-- Do not edit the historical migration. TiDB rejected the original combined
-- ALTER because it added columns, indexes and foreign keys in one operation.
-- This repair is intentionally additive and separates each dependency step.

ALTER TABLE `contracts_mysql`
  ADD COLUMN IF NOT EXISTS `entry_inspection_id` CHAR(36) NULL;

ALTER TABLE `contracts_mysql`
  ADD COLUMN IF NOT EXISTS `exit_inspection_id` CHAR(36) NULL;

CREATE INDEX IF NOT EXISTS `contracts_mysql_entry_inspection_id_idx`
  ON `contracts_mysql` (`entry_inspection_id`);

CREATE INDEX IF NOT EXISTS `contracts_mysql_exit_inspection_id_idx`
  ON `contracts_mysql` (`exit_inspection_id`);

ALTER TABLE `contracts_mysql`
  ADD CONSTRAINT `contracts_mysql_entry_inspection_id_fkey`
    FOREIGN KEY (`entry_inspection_id`)
    REFERENCES `inspections`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  ADD CONSTRAINT `contracts_mysql_exit_inspection_id_fkey`
    FOREIGN KEY (`exit_inspection_id`)
    REFERENCES `inspections`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

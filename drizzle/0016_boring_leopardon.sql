ALTER TABLE `schedules` ADD COLUMN IF NOT EXISTS `eTimeWorkerId` int;--> statement-breakpoint
ALTER TABLE `schedules` ADD COLUMN IF NOT EXISTS `eTimeStartTime` varchar(10);--> statement-breakpoint
ALTER TABLE `schedules` ADD COLUMN IF NOT EXISTS `eTimeEndTime` varchar(10);--> statement-breakpoint
ALTER TABLE `schedules` ADD COLUMN IF NOT EXISTS `eTimeActualStartTime` varchar(10);--> statement-breakpoint
ALTER TABLE `schedules` ADD COLUMN IF NOT EXISTS `eTimeActualEndTime` varchar(10);

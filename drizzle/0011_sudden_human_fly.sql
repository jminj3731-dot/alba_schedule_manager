ALTER TABLE `workers` MODIFY COLUMN `skillLevel` enum('main','sub','trainee') NOT NULL;--> statement-breakpoint
ALTER TABLE `workers` ADD `hourlyWage` int;--> statement-breakpoint
ALTER TABLE `workers` ADD `defaultStartTime` varchar(10);--> statement-breakpoint
ALTER TABLE `workers` ADD `defaultEndTime` varchar(10);
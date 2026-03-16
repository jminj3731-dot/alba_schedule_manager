CREATE TABLE `schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleDate` varchar(10) NOT NULL,
	`dayOfWeek` varchar(10) NOT NULL,
	`isOperating` boolean NOT NULL DEFAULT true,
	`aTimeWorkerId` int,
	`bTimeWorkerId` int,
	`cTimeWorkerId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedules_scheduleDate_unique` UNIQUE(`scheduleDate`)
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`skillLevel` enum('main','sub') NOT NULL,
	`fixedDaysOff` varchar(100) DEFAULT '',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workers_id` PRIMARY KEY(`id`)
);

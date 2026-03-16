CREATE TABLE `notificationLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`notificationType` enum('schedule_view','preferred_days_update') NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificationLogs_id` PRIMARY KEY(`id`)
);

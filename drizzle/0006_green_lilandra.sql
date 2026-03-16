CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int,
	`workerName` varchar(100) NOT NULL,
	`actionType` enum('end_time_update','start_time_update','preferred_days_update','fixed_days_off_update','worker_created','worker_updated','worker_deleted') NOT NULL,
	`description` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);

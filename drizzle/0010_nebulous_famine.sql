CREATE TABLE `appSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `appSettings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `attendanceCorrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int,
	`workerName` varchar(100) NOT NULL,
	`scheduleDate` varchar(10) NOT NULL,
	`timeSlot` enum('a','b','c') NOT NULL,
	`correctionType` enum('check_in','check_out','both') NOT NULL,
	`actionType` enum('corrected','skipped') NOT NULL,
	`originalCheckInTime` varchar(10),
	`correctedCheckInTime` varchar(10),
	`originalCheckOutTime` varchar(10),
	`correctedCheckOutTime` varchar(10),
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendanceCorrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `actionType` enum('end_time_update','start_time_update','preferred_days_update','fixed_days_off_update','worker_created','worker_updated','worker_deleted','attendance_correction','correction_skipped') NOT NULL;
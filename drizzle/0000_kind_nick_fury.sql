CREATE TABLE `flights` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`sequence` integer NOT NULL,
	`selected_level` integer NOT NULL,
	`actual_level` integer NOT NULL,
	`outcome` text,
	`record` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `flights_owner_started` ON `flights` (`owner`,`started_at`,`id`);--> statement-breakpoint
CREATE TABLE `players` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL
);

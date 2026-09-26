CREATE TABLE `support_choices` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`offer_id` text NOT NULL,
	`selected_level` integer NOT NULL,
	`epoch` integer NOT NULL,
	`accept` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `support_choices_owner_time` ON `support_choices` (`owner`,`at`);
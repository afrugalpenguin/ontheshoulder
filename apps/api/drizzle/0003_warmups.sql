alter table `programme_slot` add `warmups_enabled` integer default true not null;--> statement-breakpoint
alter table `set_log` add `warmup` integer default false not null;
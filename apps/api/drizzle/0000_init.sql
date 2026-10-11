create table `activity` (
	`id` integer primary key autoincrement not null,
	`date` text not null,
	`kind` text not null,
	`start_time` text,
	`duration_min` real,
	`distance_km` real,
	`source` text default 'manual' not null,
	`garmin_activity_id` text,
	`avg_hr` integer,
	`max_hr` integer,
	`elevation_m` real,
	`rpe` integer,
	`notes` text,
	`detail` text
);
--> statement-breakpoint
create unique index `activity_garmin_activity_id` on `activity` (`garmin_activity_id`) where "activity"."garmin_activity_id" is not null;--> statement-breakpoint
create table `app_state` (
	`key` text primary key not null,
	`value` text
);
--> statement-breakpoint
create table `athlete` (
	`id` integer primary key autoincrement not null,
	`display_name` text not null,
	`units` text default 'metric' not null,
	`week_start` text default 'monday' not null,
	`timezone` text default 'UTC' not null
);
--> statement-breakpoint
create table `block` (
	`id` integer primary key autoincrement not null,
	`name` text not null,
	`start_date` text not null,
	`end_date` text not null,
	`purpose` text not null,
	`progression_rules` text,
	`ends_at_event_id` integer,
	foreign key (`ends_at_event_id`) references `event`(`id`) on update no action on delete set null
);
--> statement-breakpoint
create unique index `block_name_unique` on `block` (`name`);--> statement-breakpoint
create table `body_metric` (
	`id` integer primary key autoincrement not null,
	`date` text not null,
	`metric` text not null,
	`value` real not null,
	`source` text not null
);
--> statement-breakpoint
create unique index `body_metric_date_metric_source` on `body_metric` (`date`,`metric`,`source`);--> statement-breakpoint
create table `daily_checkin` (
	`id` integer primary key autoincrement not null,
	`date` text not null,
	`sleep_quality` integer,
	`energy` integer,
	`weight_kg` real,
	`ankle_score` integer,
	`sunday_got_up` integer,
	`habits` text default '{}' not null,
	`dismissed_prompts` text default '[]' not null,
	`notes` text
);
--> statement-breakpoint
create unique index `daily_checkin_date_unique` on `daily_checkin` (`date`);--> statement-breakpoint
create table `equipment` (
	`id` integer primary key not null,
	`bar_kg` real,
	`plates` text not null,
	`dumbbells` text not null,
	`kettlebells` text not null,
	`vest_kg` real
);
--> statement-breakpoint
create table `event` (
	`id` integer primary key autoincrement not null,
	`name` text not null,
	`date` text not null,
	`distance_km` real,
	`location` text,
	`url` text,
	`time_limit_h` real,
	`priority` text not null,
	`status` text default 'planned' not null,
	`date_confirmed` integer default false not null,
	`result_notes` text
);
--> statement-breakpoint
create table `exercise` (
	`id` integer primary key autoincrement not null,
	`name` text not null,
	`pattern` text not null,
	`equipment` text not null,
	`unilateral` integer default false not null,
	`cues` text,
	`video_url` text
);
--> statement-breakpoint
create unique index `exercise_name_unique` on `exercise` (`name`);--> statement-breakpoint
create table `fixture` (
	`id` integer primary key autoincrement not null,
	`weekday` integer not null,
	`slot` text not null,
	`template_id` integer not null,
	foreign key (`template_id`) references `session_template`(`id`) on update no action on delete no action
);
--> statement-breakpoint
create unique index `fixture_weekday_slot_template` on `fixture` (`weekday`,`slot`,`template_id`);--> statement-breakpoint
create table `garmin_import` (
	`id` integer primary key autoincrement not null,
	`kind` text not null,
	`ref` text not null,
	`payload` text not null,
	`received_at` text not null
);
--> statement-breakpoint
create table `habit_definition` (
	`id` integer primary key autoincrement not null,
	`key` text not null,
	`label` text not null,
	`prompt_text` text,
	`prompt_until` text,
	`enabled` integer default true not null
);
--> statement-breakpoint
create unique index `habit_definition_key_unique` on `habit_definition` (`key`);--> statement-breakpoint
create table `planned_session` (
	`id` integer primary key autoincrement not null,
	`week_plan_id` integer not null,
	`date` text not null,
	`template_id` integer not null,
	`slot` text not null,
	`targets` text default '{}' not null,
	`status` text default 'planned' not null,
	`skip_reason` text,
	`edited_by_user` integer default false not null,
	`linked_activity_id` integer,
	`optional` integer default false not null,
	foreign key (`week_plan_id`) references `week_plan`(`id`) on update no action on delete cascade,
	foreign key (`template_id`) references `session_template`(`id`) on update no action on delete no action,
	foreign key (`linked_activity_id`) references `activity`(`id`) on update no action on delete set null
);
--> statement-breakpoint
create unique index `planned_session_date_template_slot` on `planned_session` (`date`,`template_id`,`slot`);--> statement-breakpoint
create table `programme_day` (
	`id` integer primary key autoincrement not null,
	`name` text not null
);
--> statement-breakpoint
create unique index `programme_day_name_unique` on `programme_day` (`name`);--> statement-breakpoint
create table `programme_slot` (
	`id` integer primary key autoincrement not null,
	`programme_day_id` integer not null,
	`position` integer not null,
	`exercise_id` integer not null,
	`sets` integer not null,
	`reps` integer,
	`seconds` integer,
	`rest_sec` integer not null,
	`load_rule` text not null,
	`increment_kg` real,
	`start_load_kg` real,
	`notes` text,
	foreign key (`programme_day_id`) references `programme_day`(`id`) on update no action on delete cascade,
	foreign key (`exercise_id`) references `exercise`(`id`) on update no action on delete no action
);
--> statement-breakpoint
create table `session_template` (
	`id` integer primary key autoincrement not null,
	`key` text,
	`kind` text not null,
	`name` text not null,
	`default_duration_min` integer,
	`structure` text,
	`programme_day_id` integer,
	`notes` text,
	`tags` text default '[]' not null,
	foreign key (`programme_day_id`) references `programme_day`(`id`) on update no action on delete no action
);
--> statement-breakpoint
create unique index `session_template_key_unique` on `session_template` (`key`);--> statement-breakpoint
create table `set_log` (
	`id` integer primary key autoincrement not null,
	`strength_session_id` integer not null,
	`slot_id` integer not null,
	`set_no` integer not null,
	`reps` integer not null,
	`load_kg` real,
	`rpe` real,
	`done_at` text,
	`notes` text,
	foreign key (`strength_session_id`) references `strength_session`(`id`) on update no action on delete cascade,
	foreign key (`slot_id`) references `programme_slot`(`id`) on update no action on delete no action
);
--> statement-breakpoint
create table `strength_session` (
	`id` integer primary key autoincrement not null,
	`activity_id` integer not null,
	`programme_day_id` integer not null,
	`started_at` text,
	`finished_at` text,
	`partial` integer default false not null,
	foreign key (`activity_id`) references `activity`(`id`) on update no action on delete cascade,
	foreign key (`programme_day_id`) references `programme_day`(`id`) on update no action on delete no action
);
--> statement-breakpoint
create unique index `strength_session_activity_id_unique` on `strength_session` (`activity_id`);--> statement-breakpoint
create table `week_plan` (
	`id` integer primary key autoincrement not null,
	`iso_week` text not null,
	`generated_at` text,
	`reasoning` text default '[]' not null
);
--> statement-breakpoint
create unique index `week_plan_iso_week_unique` on `week_plan` (`iso_week`);
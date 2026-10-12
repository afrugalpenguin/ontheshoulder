alter table `habit_definition` add `weekdays` text;--> statement-breakpoint
alter table `habit_definition` add `answer_labels` text;--> statement-breakpoint
update `habit_definition` set `label` = 'Last night', `answer_labels` = '["Alcohol-free","Had a drink"]', `weekdays` = '[2,3,4,5]' where `key` = 'alcohol_free';--> statement-breakpoint
update `habit_definition` set `enabled` = false where `key` = 'prehab_done';
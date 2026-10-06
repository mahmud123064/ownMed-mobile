ALTER TABLE "medicines" ADD COLUMN "days" integer[] DEFAULT '{0,1,2,3,4,5,6}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "started_on" text;
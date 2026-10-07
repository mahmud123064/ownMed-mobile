ALTER TABLE "users" ADD COLUMN "share_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blood_group" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" text;--> statement-breakpoint
-- Backfill accounts that predate the Family ID, before the unique index below
-- can reject them for being NULL (a unique index allows repeated NULLs, but an
-- account with no code could never be shared). Codes come from the same
-- misread-resistant alphabet the app generates from, and each candidate is
-- checked against the rows already assigned so the index cannot fail on a clash.
DO $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  target record;
  candidate text;
  i int;
BEGIN
  FOR target IN SELECT id FROM users WHERE share_id IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE share_id = candidate);
    END LOOP;
    UPDATE users SET share_id = candidate WHERE id = target.id;
  END LOOP;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "users_share_id_unique" ON "users" USING btree ("share_id");

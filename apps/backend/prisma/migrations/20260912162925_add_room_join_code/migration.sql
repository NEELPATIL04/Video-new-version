-- Add joinCode as nullable first — the table already has existing rows,
-- so a required column can't be added directly without a default.
ALTER TABLE "rooms" ADD COLUMN "joinCode" TEXT;

-- Backfill existing rows with a random 9-digit code (zero-padded, as
-- text — matches the format the application generates for new rooms).
-- A collision here across a handful of dev-database rows is negligible;
-- the UNIQUE index below would simply fail loudly if it ever happened,
-- rather than silently succeeding with a duplicate.
UPDATE "rooms" SET "joinCode" = LPAD(FLOOR(RANDOM() * 1000000000)::text, 9, '0') WHERE "joinCode" IS NULL;

-- Now that every row has a value, enforce the real constraints.
ALTER TABLE "rooms" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "rooms_joinCode_key" ON "rooms"("joinCode");

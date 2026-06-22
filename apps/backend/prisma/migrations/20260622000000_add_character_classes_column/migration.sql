-- AddColumn: classes on Character
-- Stores per-class levels for multiclassed characters as a JSONB array.
-- Each entry: { "name": "ClassName / SubclassName", "level": N }
-- classes[0] is always the primary class; null means single-class (use legacy class/subclass columns).
ALTER TABLE "Character" ADD COLUMN "classes" JSONB;

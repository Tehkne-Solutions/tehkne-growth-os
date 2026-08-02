INSERT INTO "permissions" ("id", "key", "description")
VALUES (
  '1f2d53ae-cf27-4fe5-a719-b28a6bd6b501',
  'growth.goals.manage',
  'Create and update metric goals within an authorized Growth OS workspace.'
)
ON CONFLICT ("key") DO NOTHING;

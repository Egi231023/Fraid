-- SAFE rollback after activation: preserve data and permissions; stop writes.
-- Re-deploy the previous verified v2 Git commit, not the insecure legacy UI.
begin;
update fraid_private.release set live=false;
commit;
-- Original snapshots remain in fraid_backup. Restore into isolated temporary
-- tables first (see verify-migration.sql). Never overwrite newer live records
-- without a reviewed merge. Biogreens remains unchanged by this rollback.

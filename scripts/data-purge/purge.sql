-- Runner for the one-time scheduling and billing purge. Not a migration: `supabase db push`
-- never sees this folder.
--
--   Dry run (default):  psql -X "$DB_URL" -f scripts/data-purge/purge.sql
--   Commit:             psql -X "$DB_URL" -v confirm=PURGE -f scripts/data-purge/purge.sql
--
-- A dry run does the whole purge, prints the counts, then rolls back. Only confirm=PURGE,
-- exactly, commits. -X skips ~/.psqlrc, so it can't set confirm. Any error stops psql and
-- the open transaction changes nothing.

\set ON_ERROR_STOP on

-- \if takes only booleans, so the comparison runs as a query; an unset confirm means dry run.
\if :{?confirm}
\else
	\set confirm ''
\endif
select :'confirm' = 'PURGE' as is_commit \gset

\echo
\echo 'host:' :HOST
\echo 'port:' :PORT
\echo 'database:' :DBNAME
\if :is_commit
	\echo 'mode: COMMIT (confirm=PURGE): the purge is permanent'
\else
	\echo 'mode: DRY RUN (pass -v confirm=PURGE to commit)'
\endif

begin;

\ir purge-body.sql

\if :is_commit
	commit;
	\echo
	\echo 'COMMITTED: purge is permanent'
\else
	rollback;
	\echo
	\echo 'DRY RUN: rolled back, nothing changed'
\endif

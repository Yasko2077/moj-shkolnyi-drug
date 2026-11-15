#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

psql -v ON_ERROR_STOP=1 -f supabase/tests/local_auth_fixture.sql
psql -v ON_ERROR_STOP=1 -f supabase/snapshots/core_schema_ddl_20261115.sql

SQL_FILES=(
  supabase/patches/20261115_events_cloud.sql
  supabase/patches/20261115_event_creator_scope.sql
  supabase/patches/20261115_event_registration_hardening.sql
  supabase/patches/20261115_event_registration_consent.sql
  supabase/patches/20261115_event_roster_scope.sql
  supabase/patches/20261115_event_registration_counts.sql
  supabase/patches/20261115_project_lab.sql
  supabase/patches/20261115_project_join_review.sql
  supabase/patches/20261115_project_membership.sql
  supabase/patches/20261115_initiatives_cloud.sql
  supabase/patches/20261115_initiative_school_scope.sql
  supabase/patches/20261115_news_polls_cloud.sql
  supabase/patches/20261115_poll_option_write_lock.sql
  supabase/patches/20261115_profile_school_integrity.sql
  supabase/patches/20261115_tester_onboarding.sql
  supabase/patches/20261115_ai_quota.sql
  supabase/patches/20261115_trusted_school_assignment.sql
  supabase/patches/20261115_elections_foundation.sql
  supabase/patches/20261115_fk_indexes.sql
  supabase/patches/20261116_news_publish_atomic.sql
  supabase/patches/20261117_rls_initplan_tuning.sql
  supabase/patches/20261115_role_assignments_acl.sql
)

for file in "${SQL_FILES[@]}"; do
  echo "::group::Apply ${file}"
  psql -v ON_ERROR_STOP=1 -f "${file}"
  echo "::endgroup::"
done

psql -v ON_ERROR_STOP=1 -f supabase/tests/verify_security_grants.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_event_security.psql
psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_project_membership.psql
psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_poll_privacy.psql
psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_tester_onboarding.psql
echo "Fresh PostgreSQL 17 bootstrap, ordered migrations, ACL checks, and event, project membership, poll privacy, and tester onboarding scenarios passed."

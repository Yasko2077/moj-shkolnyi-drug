#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const read = (path) => {
  if (!existsSync(path)) {
    errors.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
};

for (const path of ['app.js', 'cloud.js', 'supabase-config.js']) {
  const source = read(path);
  if (source) {
    try {
      new vm.Script(source, { filename: path });
    } catch (error) {
      errors.push(`JavaScript syntax error in ${path}: ${error.message}`);
    }
  }
}

const config = read('supabase-config.js');
check(config.includes('supabasePublishableKey: ""'),
  'The public Supabase key must remain blank in the repository.');
check(config.includes('enableHostedAI: false'), 'Hosted AI must remain disabled by default.');
for (const flag of [
  'enableCloudInitiatives',
  'enableCloudProjects',
  'enableCloudEvents',
  'enableCloudContent',
  'enableCloudElections'
]) {
  check(config.includes(`${flag}: false`), `${flag} must remain disabled by default.`);
}
check(!/(?:service_role|sb_secret|sk-[A-Za-z0-9]{20,})/i.test(config),
  'A server-side or provider secret-like value was found in browser config.');

const election = read('supabase/patches/20261115_elections_foundation.sql');
function sqlTableBody(tableName) {
  const marker = `create table if not exists public.${tableName} (`;
  const start = election.indexOf(marker);
  if (start < 0) return '';
  const end = election.indexOf('\\n);', start);
  return end < 0 ? '' : election.slice(start, end);
}
const receiptBody = sqlTableBody('election_voter_receipts');
const ballotBody = sqlTableBody('election_ballots');
check(Boolean(receiptBody), 'Election voter receipt table definition is missing.');
check(Boolean(ballotBody), 'Election ballot table definition is missing.');
check(!/ballot_id|candidate_id/.test(receiptBody),
  'Voter receipt must not link the account to a ballot or candidate.');
check(!/user_id|cast_at/.test(ballotBody),
  'Ballots must not contain voter IDs or per-ballot timestamps.');
check(election.includes('primary key(election_id,user_id)'),
  'One-vote-per-account unique receipt key is missing.');
check(election.includes('from public.elections where id=p_election_id for update'),
  'Vote RPC must lock the election row before checking/inserting a vote.');
check(election.includes('revoke all on public.elections,public.election_candidates,public.election_eligibility,'),
  'Direct client table privileges must be revoked for election data.');
check(election.includes('revoke all on function public.cast_election_vote(uuid,uuid) from public,anon;'),
  'Anonymous/public execution of the vote RPC must be revoked.');
check(election.includes('grant execute on function public.cast_election_vote(uuid,uuid) to authenticated;'),
  'Authenticated vote RPC grant is missing.');
check(election.includes("stage in ('objections','certified')"),
  'Election results must not be visible before the objection stage.');
check(!election.includes('insert into public.election_voter_receipts(election_id,user_id,ballot_id)'),
  'Vote receipt must not store a ballot identifier.');

const profilePatch = read('supabase/patches/20261115_profile_school_integrity.sql');
check(profilePatch.includes('grant update (display_name, preferred_language, grade_label) on public.profiles'),
  'Profile self-update must be restricted to display name, language, and grade.');
check(!profilePatch.includes('grant update (school_id'),
  'Self-service profile update must not grant school_id changes.');

const cloud = read('cloud.js');
const app = read('app.js');
check(cloud.includes('async function getMyProfile()') && cloud.includes('async function updateMyProfile('),
  'Cloud profile read/update methods are missing.');
check(app.includes('async function loadCloudProfile()'),
  'App must load the authenticated cloud profile.');
check(app.includes('readonly disabled'),
  'Cloud-verified school and district fields must be read-only in the UI.');
check(app.includes('Поле «О себе» осталось только в этом браузере.'),
  'The UI must explain that the bio field is local-only.');

const matrix = read('docs/SECURITY_TEST_MATRIX.md');
check(matrix.includes('20261115_elections_foundation.sql'),
  'Security matrix must include the elections migration.');
check(matrix.includes('35. Квитанция не содержит'),
  'Security matrix must include the voter/ballot separation check.');

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  console.error(`${errors.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('All static project checks passed.');
}

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
check(/supabasePublishableKey:\s*"sb_publishable_[^"]+"/.test(config),
  'A Supabase publishable key must be configured for the connected project.');
const browserKeyValues = [...config.matchAll(/(?:supabasePublishableKey|supabaseAnonKey|serviceRoleKey|secretKey)\s*:\s*["']([^"']*)["']/gi)].map(match => match[1]);
check(!browserKeyValues.some(value => /service_role|sb_secret|^sk-[A-Za-z0-9]/i.test(value)),
  'Server-side or secret API keys must never appear in browser configuration.');
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

const election = read('supabase/patches/20261115_elections_foundation.sql');
function sqlTableBody(tableName) {
  const marker = `create table if not exists public.${tableName} (`;
  const start = election.indexOf(marker);
  if (start < 0) return '';
  const end = election.indexOf('\n);', start);
  return end < 0 ? '' : election.slice(start, end);
}

function sqlFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const remaining = source.slice(start);
  const delimiterMatch = remaining.match(/\bas\s+(\$[a-z_]*\$)/i);
  if (!delimiterMatch) return '';
  const bodyStart = start + delimiterMatch.index + delimiterMatch[0].length;
  const bodyEnd = source.indexOf(delimiterMatch[1], bodyStart);
  return bodyEnd < 0 ? '' : source.slice(bodyStart, bodyEnd);
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
check(election.includes('list_election_candidate_applications(uuid)') && election.includes('list_election_objections(uuid)'),
  'Restricted election moderation queue RPCs are missing.');
check(election.includes('returns table(candidate_id uuid,display_name text,program text,submitted_at timestamptz)'),
  'Candidate review queue must not return voter/account IDs.');
check(election.includes('public_name_consent boolean not null default false') && election.includes('public_program_consent boolean not null default false'),
  'Candidate publication consent must default to false.');
check(election.includes('p_public_name_consent boolean,p_public_program_consent boolean') && election.includes('candidate_publication_consent_required'),
  'Candidate submission must require both explicit publication consents.');
check(election.includes('c.public_name_consent and c.public_program_consent and c.public_consent_at is not null'),
  'Public candidate listing must require both recorded publication consents.');
check(election.includes('returns table(objection_id uuid,category text,description text,status text,created_at timestamptz)'),
  'Objection review queue must not return submitter IDs.');
check(election.includes("stage in ('objections','certified')"),
  'Election results must not be visible before the objection stage.');

const electionResultsBody = sqlFunctionBody(
  election,
  'create or replace function public.get_election_results(p_election_id uuid)'
);
check(Boolean(electionResultsBody), 'Election result RPC body is missing.');
check(electionResultsBody.includes("if auth.uid() is null then raise exception 'not_authenticated'; end if;"),
  'Election result RPC must reject calls without an authenticated account.');
check(/if not exists\s*\(\s*select 1 from public\.elections where id=p_election_id and stage in \('objections','certified'\)\s*\)/.test(electionResultsBody),
  'Election results must be gated specifically to objections/certified stages.');
check(!/stage\s+in\s*\([^)]*'counting'/.test(electionResultsBody),
  'Election results must remain unavailable during counting.');
check(/count\(b\.ballot_id\)/.test(electionResultsBody) && /group by c\.id,c\.display_name/.test(electionResultsBody),
  'Election result RPC must return candidate aggregates, not individual ballots.');
check(election.includes("if auth.uid() is null then raise exception 'not_authenticated'; end if;") &&
  election.includes("if not exists(select 1 from public.elections where id=p_election_id and stage in ('objections','certified'))"),
  'Election result RPC must reject calls without an authenticated account.');
check(election.includes('select auth.uid() is not null') &&
  election.includes('exists(select 1 from public.election_voter_receipts'),
  'Election receipt RPC must return no positive result without an authenticated account.');
check(election.includes("and auth.uid() is not null"),
  'Public candidate RPC must require an authenticated account.');
check(!election.includes('insert into public.election_voter_receipts(election_id,user_id,ballot_id)'),
  'Vote receipt must not store a ballot identifier.');

const indexPatch = read('supabase/patches/20261115_fk_indexes.sql');
for (const indexName of [
  'event_registrations_user_id_idx',
  'profiles_school_id_idx',
  'role_assignments_school_id_idx',
  'role_assignments_verified_by_idx',
  'role_requests_requested_role_key_idx',
  'role_requests_reviewed_by_idx',
  'role_requests_school_id_idx'
]) {
  check(indexPatch.includes(indexName), `Missing baseline foreign-key index: ${indexName}`);
}

const eventCreatorPatch = read('supabase/patches/20261115_event_creator_scope.sql');
const eventRosterPatch = read('supabase/patches/20261115_event_roster_scope.sql');
check(eventCreatorPatch.includes('v_platform_verifier := public.is_verification_representative();') &&
  eventCreatorPatch.includes("p_scope='city' and v_platform_verifier"),
  'Verified platform representative must be restricted to creating city events.');
check(eventRosterPatch.includes('v_own_event := v_event.created_by = auth.uid();') &&
  eventRosterPatch.includes('if not v_own_event and not v_city_scope'),
  'Platform verifier must only read the roster of events they created.');
check(eventCreatorPatch.includes('revoke all on function public.create_platform_event') &&
  eventRosterPatch.includes('revoke all on function public.get_event_roster(uuid)'),
  'Event creation and roster functions must revoke public/anonymous access.');

const eventRegistrationPatch = read('supabase/patches/20261115_event_registration_consent.sql');
check(eventRegistrationPatch.includes('organizer_access_consent boolean not null default false') &&
  eventRegistrationPatch.includes('organizer_access_consent_at timestamptz'),
  'Event organizer-access consent must be stored separately and default to false.');
check(eventRegistrationPatch.includes('register_for_event(uuid,boolean)') &&
  eventRegistrationPatch.includes('organizer_access_consent_required'),
  'Cloud event registration must require explicit organizer-access consent.');
check(eventRegistrationPatch.includes('from public.profiles p') &&
  eventRegistrationPatch.includes('from public.schools s'),
  'Event registration must derive identity and school from trusted profile data.');
check(eventRegistrationPatch.includes('event_requires_verified_school_in_district'),
  'District event registration must verify the participant school district.');
check(eventRegistrationPatch.includes("participant_name=v_display_name") &&
  eventRegistrationPatch.includes("where id=v_existing_id"),
  'Event registration should use the server-derived profile name and update cancelled records safely.');
check(eventRosterPatch.includes('r.organizer_access_consent is true'),
  'Event roster must include only participants who consented to organizer access.');

const profilePatch = read('supabase/patches/20261115_profile_school_integrity.sql');
check(profilePatch.includes('grant update(display_name, preferred_language, grade_label) on public.profiles'),
  'Profile self-update must be restricted to display name, language, and grade.');
check(!profilePatch.includes('grant update(school_id'),
  'Self-service profile update must not grant school_id changes.');

const cloud = read('cloud.js');
const app = read('app.js');
check(cloud.includes('p_organizer_access_consent:organizerAccessConsent') &&
  cloud.includes('organizerAccessConsent!==true'),
  'Cloud client must require event-specific organizer-access consent.');
check(app.includes('name="organizerAccessConsent"') &&
  app.includes("organizerAccessConsent:d.get('organizerAccessConsent')==='on'"),
  'Cloud event registration UI must require a separate organizer-access checkbox.');

check(cloud.includes('async function listElectionCandidateApplications(') && cloud.includes('async function listElectionObjections('),
  'Cloud client moderation queue methods are missing.');
check(cloud.includes('publicNameConsent!==true||publicProgramConsent!==true'),
  'Cloud client must reject candidate submission without both consents.');
check(cloud.includes('async function getMyProfile()') && cloud.includes('async function updateMyProfile('),
  'Cloud profile read/update methods are missing.');
check(cloud.includes("select('display_name,preferred_language,school_id,grade_label,account_type')") &&
  cloud.includes("select('display_name,preferred_language,school_id,grade_label')") &&
  cloud.includes("accountType:data.account_type||'tester'"),
  'Tester profiles must remain readable before and after the account_type migration, and default to least privilege.');
check(cloud.includes("accountType:data.account_type||'tester'") &&
  !cloud.includes("user_metadata: { account_type") &&
  !cloud.includes("user_metadata: { role"),
  'Public signup must never accept an account type or privileged role from client metadata.');
check(app.includes('Создать аккаунт тестировщика') &&
  app.includes('Тестировщик') &&
  app.includes('Администраторские права здесь не выбираются'),
  'Signup UI must clearly label tester access and separate administrator provisioning.');
check(read('ADMIN_SETUP.txt').includes('schema_mvp07.sql') &&
  read('ADMIN_SETUP.txt').includes('Не запускай старые SQL-файлы') &&
  !read('ADMIN_SETUP.txt').includes('insert into public.platform_admins'),
  'Legacy admin setup must warn against the retired platform_admins workflow.');
check(read('docs/TESTER_QUICK_START.md').includes('Кыргызча') &&
  read('docs/TESTER_QUICK_START.md').includes('Русский'),
  'External tester quick start must be bilingual.');

check(app.includes('async function loadCloudProfile()'),
  'App must load the authenticated cloud profile.');
check(app.includes("const langCode=()=>state.lang==='KG'?'ky':'ru';"),
  'Kyrgyz locale must map to the Supabase language code ky.');
check(app.includes('function activateAccountStore()') && app.includes('localStorage.setItem(activeStore,JSON.stringify(db))'),
  'Browser demo data must be stored in an account-specific local namespace.');
check(app.includes('readonly disabled'),
  'Cloud-verified school and district fields must be read-only in the UI.');
check(app.includes("kicker:'ЖЕКЕ КАБИНЕТИҢ'") && app.includes("kicker:'ТВОЯ УЧЁТНАЯ ЗАПИСЬ'"),
  'The profile screen must have Kyrgyz and Russian labels.');
check(app.includes('Поле «О себе» осталось только в этом браузере.'),
  'The UI must explain that the bio field is local-only.');
check(app.includes('name="publicNameConsent"') && app.includes('name="publicProgramConsent"'),
  'The nomination form must request separate name and program publication consent.');
check(app.includes("d.get('publicNameConsent')!=='on'||d.get('publicProgramConsent')!=='on'"),
  'The nomination handler must enforce both publication consents.');

// Student workspace regression checks
check(app.includes('function workspace()'), 'Student personal workspace page is missing.');
check(app.includes('function toggleFavorite(type,id)'), 'Saved-items interaction is missing.');
check(app.includes('function addNotification(title,detail'), 'In-app notification helper is missing.');
check(app.includes('data-task-toggle') && app.includes("document.addEventListener('change'"),
  'Project task checkboxes must work both in page content and modal dialogs.');
check(app.includes("action==='mark-notifications-read'"), 'Notification read-all action is missing.');
check(app.includes("data-cancel-registration"), 'Local event registration cancellation is missing.');
check(app.includes('id="eventSearch"') && app.includes('id="eventCategory"') && app.includes('id="eventTime"'),
  'Event calendar search and filter controls are missing.');
check(app.includes('function applyEventFilters()') && app.includes("time==='registered'") && app.includes("time==='upcoming'"),
  'Event calendar filters must support upcoming dates and registrations for the current browser profile.');
check(app.includes('data-event-reset') && app.includes("e.target.id==='eventSearch'"),
  'Event calendar filter reset and live search handlers are missing.');
check(app.includes("state.page==='workspace'?t('workspace')"), 'Workspace breadcrumb must follow the selected language.');
check(app.includes("workspace:'Жеке кабинет'") && app.includes("workspace:'Мой кабинет'"),
  'Workspace navigation must have Russian and Kyrgyz labels.');

// Atomic news publishing and removal of the legacy event-registration overload
const newsHardening = read('supabase/patches/20261116_news_publish_atomic.sql');
check(newsHardening.includes('create or replace function public.publish_news_post(') &&
  newsHardening.includes('public.is_verification_representative()'),
  'News publishing must use a server-side RPC with representative authorization.');
check(newsHardening.includes('revoke all privileges on table public.news_posts from anon, authenticated;') &&
  newsHardening.includes('revoke insert (created_by,title,body,category,is_published)'),
  'Direct client writes to news posts must be disabled after atomic publishing is introduced.');
check(newsHardening.includes('drop function if exists public.register_for_event(uuid,text,text,text,text,text);'),
  'Legacy event registration overload must be removed.');
check(cloud.includes("c.rpc('publish_news_post'") &&
  !cloud.includes("c.from('news_posts').insert(") &&
  !cloud.includes("c.from('news_posts').update("),
  'Cloud news client must publish only through the atomic publish_news_post RPC.');

const eventSchemaPatch = read('supabase/patches/20261115_events_cloud.sql');
check(eventSchemaPatch.includes('revoke all on function public.can_manage_events() from public, anon, authenticated;'),
  'Legacy event-management helper must not remain directly executable by browser clients.');


check(eventSchemaPatch.includes('drop constraint if exists events_event_key_key;'),
  'Event categories must not remain globally unique; multiple events may share one category.');

// Explicitly revoke historical column-level grants, not only table privileges
const eventHardening = read('supabase/patches/20261115_event_registration_hardening.sql');
check(eventHardening.includes('revoke insert (') &&
  eventHardening.includes('event_id,user_id,participant_name,school_label,grade_label,') &&
  eventHardening.includes('on public.event_registrations from anon, authenticated;'),
  'Event registration must revoke the historical column-level INSERT grants.');
check(eventHardening.includes('revoke all on function public.get_event_roster(text) from public, anon, authenticated;'),
  'Legacy unscoped event roster RPC must be inaccessible before the scoped replacement is installed.');
check(eventHardening.includes('revoke all on function public.register_for_event(uuid,text,text,text,text,text)') &&
  !eventHardening.includes('grant execute on function public.register_for_event(uuid,text,text,text,text,text)'),
  'Legacy unconsented registration RPC must stay disabled until the consent-based overload is installed.');

const initialEventsPatch = read('supabase/patches/20261115_events_cloud.sql');
check(initialEventsPatch.includes('revoke all on function public.get_event_roster(text) from public, anon, authenticated;') &&
  initialEventsPatch.includes('revoke all on function public.register_for_event(uuid,text,text,text,text,text)') &&
  initialEventsPatch.includes('revoke all on function public.create_platform_event(text,text,text,date,text,integer,text,text,text)'),
  'The first events migration must close legacy RPC access during the multi-patch rollout.');

const profileIntegrity = read('supabase/patches/20261115_profile_school_integrity.sql');
check(profileIntegrity.includes('revoke update (id,display_name,preferred_language,school_id,grade_label,created_at,updated_at)') &&
  profileIntegrity.includes('grant update(display_name, preferred_language, grade_label)'),
  'Profile migration must clear prior column UPDATE grants before applying the safe allow-list.');

const pollLock = read('supabase/patches/20261115_poll_option_write_lock.sql');
check(pollLock.includes('revoke insert (poll_id,label,sort_order)') &&
  pollLock.includes('revoke update (poll_id,label,sort_order)'),
  'Poll option migration must revoke prior column-level writes.');

const newsAtomic = read('supabase/patches/20261116_news_publish_atomic.sql');
check(newsAtomic.includes('revoke insert (created_by,title,body,category,is_published)') &&
  newsAtomic.includes('revoke update (title,body,category,is_published)'),
  'Atomic news migration must revoke prior column-level writes.');

const projectLab = read('supabase/patches/20261115_project_lab.sql');
check(projectLab.includes('revoke update on public.project_join_requests from anon, authenticated;') &&
  projectLab.includes('revoke update(status,updated_at) on public.project_join_requests from anon, authenticated;'),
  'Project join request status must not be directly writable by clients.');
check(!projectLab.includes('grant update(status,updated_at) on public.project_join_requests to authenticated;'),
  'Project join requests must be updated only through the review/withdraw RPCs.');

const rlsTuning = read('supabase/patches/20261117_rls_initplan_tuning.sql');
for (const policyName of [
  'profiles_select_self_or_verifier',
  'profiles_update_self',
  'role_requests_insert_self',
  'role_requests_select_owner_or_verifier',
  'role_assignments_select_owner_or_verifier'
]) {
  check(rlsTuning.includes(policyName), `RLS initplan tuning must recreate ${policyName}.`);
}
check((rlsTuning.split('(select auth.uid())').length - 1) >= 5,
  'RLS policies should wrap auth.uid() in scalar SELECT initplans.');
check(rlsTuning.includes('(select public.is_verification_representative())'),
  'RLS verifier checks should be evaluated as statement initplans.');

const testerPatch = read('supabase/patches/20261115_tester_onboarding.sql');
check(testerPatch.includes("add column if not exists account_type text not null default 'tester'") &&
  testerPatch.includes("check (account_type = 'tester')") &&
  testerPatch.includes('revoke update (account_type) on public.profiles from anon, authenticated;'),
  'Every self-service profile must default to an immutable tester account type.');

const adminProvisioning = read('supabase/admin/assign_privileged_accounts.sql.template');
check(adminProvisioning.includes("'verification_representative'") &&
  adminProvisioning.includes('email_confirmed_at is not null') &&
  adminProvisioning.includes('verified_by, request_id') &&
  adminProvisioning.includes('REPLACE_WITH_NESTEROV_AUTH_USER_UUID'),
  'Privileged Nesterov/admin assignments must use a separate owner-only provisioning template.');
check(!adminProvisioning.includes('create_my_profile(') &&
  !adminProvisioning.includes('auth.admin.createUser') &&
  !adminProvisioning.includes('supabase.auth.signUp'),
  'The privileged-account template must not create accounts or bypass ordinary signup.');

const signupStart = cloud.indexOf('async function signUp(');
const signinStart = cloud.indexOf('async function signIn(', signupStart);
const signupSource = signupStart >= 0 && signinStart > signupStart ? cloud.slice(signupStart, signinStart) : '';
check(Boolean(signupSource) && signupSource.includes('options: { data: { display_name: displayName, preferred_language: language }'),
  'Signup must create a basic profile using only display-name/language metadata.');
const signupMetadata = signupSource.match(/options:\s*\{\s*data:\s*\{([^}]*)\}/);
check(Boolean(signupMetadata) &&
  signupMetadata[1].includes('display_name') &&
  signupMetadata[1].includes('preferred_language') &&
  !/role|isAdmin|account_type|verification_representative/i.test(signupMetadata[1]),
  'Signup metadata must not accept a client-selected role or administrator flag.');
check(cloud.includes(".select('display_name,preferred_language,school_id,grade_label,account_type')") &&
  cloud.includes(".select('display_name,preferred_language,school_id,grade_label')") &&
  cloud.includes("accountType:data.account_type||'tester'"),
  'Cloud profile loading must support both current and tester-onboarding schemas while keeping the default unprivileged.');

const authModalStart = app.indexOf('function loginModal(){');
const electionModalStart = app.indexOf('function viewElection', authModalStart);
const authModalSource = authModalStart >= 0 && electionModalStart > authModalStart ? app.slice(authModalStart, electionModalStart) : '';
check(authModalSource.includes('Тестировщик') && authModalSource.includes('Сыноочу') &&
  authModalSource.includes('name="privacyAck"') &&
  !authModalSource.includes('name="role"'),
  'Public signup must be bilingual, privacy-aware, and must not offer a role selector.');
check(app.includes('testerBadge') && app.includes('adminBadge') &&
  app.includes('window.YntymakCloud?.isAdmin?.()'),
  'Profile must distinguish testers from server-verified administrators.');

const matrix = read('docs/SECURITY_TEST_MATRIX.md');
check(matrix.includes('20261115_elections_foundation.sql'),
  'Security matrix must include the elections migration.');
check(matrix.includes('Квитанция не содержит'),
  'Security matrix must include the voter/ballot separation check.');

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  console.error(`${errors.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('All static project checks passed.');
}

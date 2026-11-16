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
const html = read('index.html');
const styles = read('styles.css');
check(styles.includes(':is(a,button,input,select,textarea,[tabindex]):focus-visible'),
  'Keyboard focus indicators must be visible for interactive elements.');
check(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(styles) &&
  styles.includes('transition-duration:.01ms!important') &&
  styles.includes('animation-duration:.01ms!important'),
  'Reduced-motion preferences must disable non-essential motion.');
check(/supabasePublishableKey:\s*"sb_publishable_[^"]+"/.test(config),
  'A Supabase publishable key must be configured for the connected project.');
const browserConfigValues = [...config.matchAll(/:\s*"([^"]*)"/g)].map(([, value]) => value).join('\n');
check(!/service_role|sb_secret|sk-[A-Za-z0-9]/i.test(browserConfigValues),
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
const toastRegion = html.match(/<div id="toastRegion"[^>]*>/)?.[0] || '';
check(/role="status"/.test(toastRegion) &&
  /aria-live="polite"/.test(toastRegion) &&
  /aria-atomic="true"/.test(toastRegion),
  'Toast region must announce each complete notification as a polite status update.');
check(app.includes("function toast(s){const el=document.createElement('div');el.className='toast';el.textContent=s;$('#toastRegion').append(el);"),
  'Toast messages must be inserted as text inside the accessible status region.');
check(app.includes('aria-modal="true" aria-labelledby="modalTitle" tabindex="-1"') &&
  app.includes('<h2 id="modalTitle">'),
  'Modal dialogs must have an explicit accessible name and be programmatically focusable.');
check(app.includes('modalReturnFocus=document.activeElement') &&
  app.includes('focusTarget.focus()') &&
  app.includes('if(returnFocus?.isConnected){returnFocus.focus();return;}'),
  'Opening a modal must move focus inside and closing it must restore focus or move to the updated page heading.');
const modalFocusHandler=app.slice(
  app.indexOf("$('#modalRoot').addEventListener('keydown'"),
  app.indexOf("$('#pageContent').addEventListener('input'")
);
check(modalFocusHandler.includes("if(e.key!=='Tab')return;") &&
  modalFocusHandler.includes('e.shiftKey') &&
  modalFocusHandler.includes('last.focus()') &&
  modalFocusHandler.includes('first.focus()'),
  'Modal keyboard focus must remain trapped for both Tab and Shift+Tab.');
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
check(app.includes('async function loadCloudProfile()'),
  'App must load the authenticated cloud profile.');
check(app.includes('name="name" minlength="2" maxlength="70"') &&
  app.includes("displayName=String(d.get('name')||'').trim()") &&
  app.includes('if(displayName.length<2||displayName.length>70)'),
  'Profile form must validate a trimmed 2–70 character display name before local or cloud persistence.');
const profileMarkup = app.slice(app.indexOf('function profile(){'), app.indexOf('function help(){', app.indexOf('function profile(){')));
check(profileMarkup.includes('aria-labelledby="profileFormTitle"') && profileMarkup.includes('id="profileFormTitle"'),
  'Profile form must have an accessible name.');
for (const fieldId of ['profileName','profileSchool','profileDistrict','profileGrade','profileAbout']) {
  check(profileMarkup.includes(`for="${fieldId}"`) && profileMarkup.includes(`id="${fieldId}"`),
    `Profile field label must be programmatically associated: ${fieldId}.`);
}
check(profileMarkup.includes('aria-describedby="profileNameHelp"') && profileMarkup.includes('id="profileNameHelp"') &&
  profileMarkup.includes('aria-describedby="profileAboutHelp"') && profileMarkup.includes('id="profileAboutHelp"'),
  'Profile name and about fields must expose their visible help text to assistive technology.');

const authModalStart = app.indexOf('function loginModal(){');
const authModalEnd = app.indexOf('\nfunction viewElection', authModalStart);
const authModalMarkup = authModalStart >= 0 && authModalEnd > authModalStart
  ? app.slice(authModalStart, authModalEnd)
  : '';
check(authModalMarkup.includes('aria-labelledby="loginFormTitle"') &&
  authModalMarkup.includes('aria-labelledby="signupFormTitle"'),
  'Login and signup forms must each have an accessible name.');
for (const fieldId of ['loginEmail','loginPassword','signupDisplayName','signupEmail','signupPassword','signupPrivacyAck']) {
  check(authModalMarkup.includes('for="'+fieldId+'"') && authModalMarkup.includes('id="'+fieldId+'"'),
    'Authentication field label must be associated with its control: '+fieldId+'.');
}
for (const helpId of ['loginPasswordHelp','signupNameHelp','signupPasswordHelp']) {
  check(authModalMarkup.includes('aria-describedby="'+helpId+'"') && authModalMarkup.includes('id="'+helpId+'"'),
    'Authentication field must expose its visible help text: '+helpId+'.');
}
check(authModalMarkup.includes("emailLabel:'Электронная почта'") &&
  authModalMarkup.includes("emailLabel:'Электрондук почта'") &&
  authModalMarkup.includes("passwordLabel:'Пароль'") &&
  authModalMarkup.includes("passwordLabel:'Сырсөз'"),
  'Authentication labels must be available in Russian and Kyrgyz.');
const signupHandlerStart = app.indexOf("if(f.id==='signupForm'){");
const signupHandlerEnd = app.indexOf('\n});', signupHandlerStart);
const signupHandlerMarkup = signupHandlerStart >= 0 && signupHandlerEnd > signupHandlerStart
  ? app.slice(signupHandlerStart, signupHandlerEnd)
  : '';
check(signupHandlerMarkup.includes("displayName.length<2||displayName.length>70") &&
  signupHandlerMarkup.includes('nameField.reportValidity()') &&
  signupHandlerMarkup.indexOf('nameField.reportValidity()') < signupHandlerMarkup.indexOf('window.YntymakCloud.signUp'),
  'Signup must reject a trimmed display name outside 2–70 characters before calling Supabase.');
const cloudSignupStart = cloud.indexOf('async function signUp(');
const cloudSignupEnd = cloud.indexOf('\n  async function signIn(', cloudSignupStart);
const cloudSignupMarkup = cloudSignupStart >= 0 && cloudSignupEnd > cloudSignupStart
  ? cloud.slice(cloudSignupStart, cloudSignupEnd)
  : '';
check(cloudSignupMarkup.includes("const cleanName=String(displayName||'').trim();") &&
  cloudSignupMarkup.includes('cleanName.length<2||cleanName.length>70') &&
  cloudSignupMarkup.includes("typeof password!=='string'||password.length<8") &&
  cloudSignupMarkup.includes("!['ru','ky'].includes(language)") &&
  cloudSignupMarkup.includes('display_name: cleanName'),
  'Cloud signup helper must validate normalized name, password length and supported language before Auth signup.');

check(app.includes("const langCode=()=>state.lang==='KG'?'ky':'ru';"),
  'Kyrgyz locale must map to the Supabase language code ky.');
const statusLabels = app.slice(app.indexOf('const STATUS_LABELS ='), app.indexOf('const statusName ='));
const statusKeys = ['review','open','in_progress','accepted','rejected','closed','draft','nominations','campaign','voting','cancelled','planning','team','active','completed'];
check(statusLabels.includes('RU: {') && statusLabels.includes('KG: {') &&
  statusKeys.every(key => statusLabels.split(key + ':').length - 1 === 2),
  'Every known status must have Russian and Kyrgyz labels.');
const scopeLabels = app.slice(app.indexOf('const SCOPE_LABELS ='), app.indexOf('const scopeLabel ='));
check(scopeLabels.includes('RU: {') && scopeLabels.includes('KG: {') &&
  ['school','district','city'].every(key => scopeLabels.split(key + ':').length - 1 === 2),
  'Every territory scope must have Russian and Kyrgyz labels.');
check(app.includes("const statusName = s => STATUS_LABELS[state.lang]?.[s] || STATUS_LABELS.RU[s] || s;") &&
  app.includes("const scopeLabel = x => SCOPE_LABELS[state.lang]?.[x] || SCOPE_LABELS.RU[x] || SCOPE_LABELS.RU.city;"),
  'Status and scope labels must use the selected language with safe fallbacks.');
check(app.includes("$('#crumb').textContent=t(pageNames[state.page]||'home');"),
  'The current-page breadcrumb must use the selected navigation dictionary.');
check(app.includes("toLocaleDateString(state.lang==='KG'?'ky-KG':'ru-RU'") &&
  app.includes("Intl.DateTimeFormat.supportedLocalesOf(['ky-KG']).length") &&
  app.includes("padStart(2,'0')"),
  'Visible dates must use Kyrgyz locale data when supported and a language-neutral numeric fallback otherwise.');
check(app.includes('function activateAccountStore()') && app.includes('localStorage.setItem(activeStore,JSON.stringify(db))'),
  'Browser demo data must be stored in an account-specific local namespace.');
const authStateHandler = cloud.slice(
  cloud.indexOf('c.auth.onAuthStateChange('),
  cloud.indexOf('    if (session) {', cloud.indexOf('c.auth.onAuthStateChange('))
);
check(authStateHandler.includes('previousUserId !== nextUserId') &&
  authStateHandler.includes("new CustomEvent('yntymak:auth-change'") &&
  !authStateHandler.includes('await '),
  'Auth callback must notify identity changes without awaiting Supabase work.');
const authChangeHandler = app.slice(
  app.indexOf("window.addEventListener('yntymak:auth-change'"),
  app.indexOf("$('#authButton').addEventListener", app.indexOf("window.addEventListener('yntymak:auth-change'"))
);
check(authChangeHandler.includes('activateAccountStore();') &&
  authChangeHandler.indexOf('activateAccountStore();') < authChangeHandler.indexOf('Promise.resolve().then') &&
  authChangeHandler.includes('state.cloudProfile=false') &&
  authChangeHandler.includes('await window.YntymakCloud.ensureProfile()') &&
  authChangeHandler.includes('await window.YntymakCloud.checkAdmin()') &&
  authChangeHandler.includes('await loadCloudProfile()'),
  'Auth identity changes must switch local storage first, clear stale privileges, and reload the new account profile.');
const loadCloudProfileBody = app.slice(
  app.indexOf('async function loadCloudProfile()'),
  app.indexOf('\nfunction profile()', app.indexOf('async function loadCloudProfile()'))
);
const profileRequest = loadCloudProfileBody.indexOf('const p=await window.YntymakCloud.getMyProfile();');
const profileSuccessGuard = loadCloudProfileBody.indexOf(
  'if(window.YntymakCloud?.getSession()?.user?.id!==requestedUserId)return false;',
  profileRequest
);
const profileWrite = loadCloudProfileBody.indexOf('db.profile={...db.profile,name:p.displayName', profileRequest);
const profileCatch = loadCloudProfileBody.indexOf('}catch(err){');
const profileErrorGuard = loadCloudProfileBody.indexOf(
  'if(window.YntymakCloud?.getSession()?.user?.id!==requestedUserId)return false;',
  profileCatch
);
const profileErrorWrite = loadCloudProfileBody.indexOf("db.profile={...db.profile,name:'Участник'", profileCatch);
check(loadCloudProfileBody.includes('const requestedUserId=session?.user?.id;') &&
  profileRequest >= 0 && profileSuccessGuard > profileRequest && profileSuccessGuard < profileWrite &&
  profileCatch > profileWrite && profileErrorGuard > profileCatch && profileErrorWrite > profileErrorGuard,
  'A delayed cloud-profile response or error must be ignored after the authenticated user changes.');
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

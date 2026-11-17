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

check(app.includes('function resetAccountScopedAssistantState(){') &&
  app.includes('chatSessionRevision++') &&
  app.includes("state.chat=[]") &&
  app.includes("state.pendingQuestion=''") &&
  app.includes("state.aiConsent=false") &&
  app.includes("state.busy=false"),
  'Account changes must clear assistant history, pending consent, and request state.');
const assistantStart=app.indexOf('async function sendChat(');
const assistantEnd=app.indexOf('\nfunction addAudit',assistantStart);
const assistantSource=assistantStart>=0&&assistantEnd>assistantStart?app.slice(assistantStart,assistantEnd):'';
check(assistantSource.includes('const requestRevision=chatSessionRevision') &&
  assistantSource.includes('if(requestRevision!==chatSessionRevision)return;'),
  'Late assistant responses must not update a newer account chat.');
const assistantMarkupStart=app.indexOf('function assistant(){');
const assistantMarkupEnd=app.indexOf('\nasync function loadCloudProfile()',assistantMarkupStart);
const assistantMarkup=assistantMarkupStart>=0&&assistantMarkupEnd>assistantMarkupStart
  ? app.slice(assistantMarkupStart,assistantMarkupEnd) : '';
check(assistantMarkup.includes('aria-label="${chatFormLabel}"') &&
  assistantMarkup.includes('aria-label="${chatInputLabel}"') &&
  assistantMarkup.includes('placeholder="${chatInputPlaceholder}"') &&
  assistantMarkup.includes('${chatSendLabel}') &&
  assistantMarkup.includes("chatFormLabel=state.lang==='KG'?'Жардамчыга билдирүү жөнөтүү':'Форма отправки сообщения помощнику'") &&
  assistantMarkup.includes("chatInputLabel=state.lang==='KG'?'Жардамчыга билдирүү':'Сообщение помощнику'") &&
  assistantMarkup.includes("chatInputPlaceholder=state.lang==='KG'?'Жеке маалыматтарды кошпой, тапшырмаңды жаз…':'Опиши задачу без личных данных…'") &&
  assistantMarkup.includes("chatSendLabel=state.lang==='KG'?'Жөнөтүү ↗':'Отправить ↗'"),
  'Assistant chat form and input must expose localized accessible names, placeholder, and action in RU/KY.');

check(app.includes("resetAccountScopedAssistantState();\n state.admin=false;"),
  'Auth changes must reset account-scoped assistant state before rendering the new account.');

const moduleLoaderStart=app.indexOf('async function loadCloudModulesForSession(requestedUserId){');
const moduleLoaderEnd=app.indexOf('function resetAccountScopedAssistantState()',moduleLoaderStart);
const moduleLoader=moduleLoaderStart>=0&&moduleLoaderEnd>moduleLoaderStart?app.slice(moduleLoaderStart,moduleLoaderEnd):'';
check(moduleLoader.includes('const isCurrent=()=>Boolean(requestedUserId)&&cloud?.getSession()?.user?.id===requestedUserId;') &&
  (moduleLoader.match(/if\(!isCurrent\(\)\)return false;/g)||[]).length>=5 &&
  moduleLoader.includes('if(!isCurrent())return false;\n   db.news=news;') &&
  moduleLoader.includes('if(!isCurrent())return false;\n   db.surveys=polls;'),
  'Every cloud collection response must be checked against the initiating account before assignment.');
const authChangeStart=app.indexOf("window.addEventListener('yntymak:auth-change'");
const authChangeEnd=app.indexOf("$('#authButton')",authChangeStart);
const authChangeSource=authChangeStart>=0&&authChangeEnd>authChangeStart?app.slice(authChangeStart,authChangeEnd):'';
check(authChangeSource.includes('await loadCloudModulesForSession(userId);'),
  'Account changes must reload cloud collections under the newly active session.');
const cloudInitStart=app.indexOf('if(window.YntymakCloud?.configured()){');
const cloudInitEnd=app.indexOf('\nrender();',cloudInitStart);
const cloudInitSource=cloudInitStart>=0&&cloudInitEnd>cloudInitStart?app.slice(cloudInitStart,cloudInitEnd):'';
check(cloudInitSource.includes('const requestedUserId=result.session?.user?.id||null;') &&
  cloudInitSource.includes('if(!isCurrentSession())return;') &&
  cloudInitSource.includes('await loadCloudModulesForSession(requestedUserId);'),
  'Initial cloud bootstrap must reject a stale session before setting roles or loading modules.');

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
const modalCloseLabel = app.match(/data-close-modal aria-label="([^"]+)">×/)?.[1] || '';
check(modalCloseLabel === "${esc(t('close'))}" &&
  app.includes("close:'Закрыть'") &&
  app.includes("close:'Жабуу'"),
  'Modal close buttons must expose the active Russian or Kyrgyz accessible name.');
const languageSwitchLabels = [
  "switchLanguage:'Переключить язык интерфейса на кыргызский'",
  "switchLanguage:'Интерфейстин тилин орусчага которуу'"
];
for (const entry of languageSwitchLabels) {
  check(app.includes(entry), 'RU/KY language switch accessible name is missing: ' + entry);
}
const shellDictionaryChecks = [
  "environmentAdmin:'АККАУНТ АДМИНИСТРАТОРА ПРОВЕРЕН · ДЕМО-ДАННЫЕ ЛОКАЛЬНЫЕ'",
  "environmentDemo:'ПРОТОТИП · ТОЛЬКО ВЫМЫШЛЕННЫЕ ДАННЫЕ'",
  "modeAdmin:'Администратор · локальный тест'",
  "modeConnected:'Supabase Auth подключён'",
  "modeDemo:'Демо-режим'",
  "environmentAdmin:'АДМИНИСТРАТОРДУН АККАУНТУ ТЕКШЕРИЛДИ · ЖЕРГИЛИКТҮҮ ДЕМО МААЛЫМАТТАРЫ'",
  "environmentDemo:'ПРОТОТИП · ОЙДОН ЧЫГАРЫЛГАН ТЕСТ МААЛЫМАТТАРЫ ГАНА'",
  "modeAdmin:'Администратор · жергиликтүү сыноо'",
  "modeConnected:'Supabase Auth туташтырылды'",
  "modeDemo:'Демо режими'"
];
for (const entry of shellDictionaryChecks) {
  check(app.includes(entry), 'RU/KY shell status translation is missing: ' + entry);
}
const shellUpdateStart=app.indexOf('function updateShell(){');
const shellUpdateEnd=app.indexOf('function home(){',shellUpdateStart);
const shellUpdate=shellUpdateStart>=0&&shellUpdateEnd>shellUpdateStart?app.slice(shellUpdateStart,shellUpdateEnd):'';
check(shellUpdate.includes("$('#environmentLabel').textContent=state.realAdmin?t('environmentAdmin'):t('environmentDemo')") &&
  shellUpdate.includes("$('#modeLabel').textContent=state.realAdmin?t('modeAdmin'):window.YntymakCloud?.configured()?t('modeConnected'):t('modeDemo')"),
  'Environment warning and connection mode must use the currently selected RU/KY dictionary.');
check(shellUpdate.includes("$('#languageBtn').setAttribute('aria-label',t('switchLanguage'))"),
  'Language switch accessible name must follow the selected RU/KY interface language.');
check(html.includes('<html lang="ru">'),
  'The document must declare Russian as its initial language.');
check(shellUpdate.includes("document.documentElement.lang=state.lang==='KG'?'ky':'ru'"),
  'Document language must follow the selected RU/KY interface language for assistive technologies.');
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
const loginPasswordInput = authModalMarkup.match(/<input id="loginPassword"[^>]*>/)?.[0] || '';
const signupPasswordInput = authModalMarkup.match(/<input id="signupPassword"[^>]*>/)?.[0] || '';
check(loginPasswordInput.includes('required') && !loginPasswordInput.includes('minlength=') &&
  authModalMarkup.includes("'+tx.loginPasswordHelp+'"),
  'Login must require a password without applying the signup-only minimum length.');
check(signupPasswordInput.includes('minlength="8"') &&
  authModalMarkup.includes("'+tx.passwordHelp+'"),
  'Signup must retain the eight-character minimum and its own password guidance.');
check(authModalMarkup.includes("loginPasswordHelp:'Введите пароль от аккаунта.'") &&
  authModalMarkup.includes("loginPasswordHelp:'Аккаунтуңуздун сырсөзүн киргизиңиз.'"),
  'Login password guidance must be available in Russian and Kyrgyz.');
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
const authStateHandlerStart = cloud.indexOf('c.auth.onAuthStateChange(');
const authStateHandlerEnd = cloud.indexOf('\n    });', authStateHandlerStart);
const authStateHandler = authStateHandlerStart >= 0 && authStateHandlerEnd > authStateHandlerStart
  ? cloud.slice(authStateHandlerStart, authStateHandlerEnd) : '';
check(authStateHandler.includes('previousUserId !== nextUserId') &&
  authStateHandler.includes("new CustomEvent('yntymak:auth-change'") &&
  authStateHandler.includes('authStateRevision++;') &&
  authStateHandler.includes('if (!authInitializing)') &&
  !authStateHandler.includes('await '),
  'Auth callback must notify post-initialization identity changes synchronously without awaiting Supabase work.');
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
const signOutHandlerStart = app.indexOf("$('#signOutButton').addEventListener");
const signOutHandlerEnd = app.indexOf("$('#languageBtn').addEventListener", signOutHandlerStart);
const signOutHandler = signOutHandlerStart >= 0 && signOutHandlerEnd > signOutHandlerStart
  ? app.slice(signOutHandlerStart, signOutHandlerEnd) : '';
check(signOutHandler.includes('if(window.YntymakCloud?.getSession())') &&
  !signOutHandler.includes('state.admin=false') &&
  !signOutHandler.includes('state.realAdmin=false') &&
  !signOutHandler.includes('state.cloudProfile=false') &&
  !signOutHandler.includes('activateAccountStore();') &&
  signOutHandler.includes('Сессия всё ещё активна.') &&
  signOutHandler.includes('Сеанс дагы эле активдүү.'),
  'The sign-out button must not clear a newer session after the auth-change handler has switched accounts.');
const signOutStart = cloud.indexOf('async function signOut()');
const signOutEnd = cloud.indexOf('async function getMyProfile()', signOutStart);
const signOutBody = signOutStart >= 0 && signOutEnd > signOutStart
  ? cloud.slice(signOutStart, signOutEnd) : '';
check(signOutBody.includes('const revision = authStateRevision;') &&
  signOutBody.includes('if (revision === authStateRevision)') &&
  signOutBody.indexOf('const revision = authStateRevision;') < signOutBody.indexOf('await c.auth.signOut()'),
  'Cloud sign-out may clear local auth state only when no newer auth event arrived during the request.');
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

const nominationStart = app.indexOf('function nominate(id){');
const nominationEnd = app.indexOf('\nfunction registerEvent(id){', nominationStart);
const nominationMarkup = nominationStart >= 0 && nominationEnd > nominationStart
  ? app.slice(nominationStart, nominationEnd)
  : '';
check(Boolean(nominationMarkup) &&
  nominationMarkup.includes('aria-labelledby="modalTitle"'),
  'Nomination form must have an accessible name.');
for (const fieldId of ['candidateName','candidateProgram']) {
  check(nominationMarkup.includes('for="'+fieldId+'"') &&
    nominationMarkup.includes('id="'+fieldId+'"'),
    'Nomination form label must be associated with its control: '+fieldId);
}
check(nominationMarkup.includes("const tx=state.lang==='KG'?{") &&
  nominationMarkup.includes("title:'Талапкер болууга арыз'") &&
  nominationMarkup.includes("nameLabel:'Көрсөтүлүүчү ысым'") &&
  nominationMarkup.includes("programLabel:'Талапкердин программасы'"),
  'Nomination form must provide Kyrgyz labels and title.');
check(nominationMarkup.includes("title:'Заявка кандидата'") &&
  nominationMarkup.includes("nameLabel:'Имя для отображения'") &&
  nominationMarkup.includes("programLabel:'Программа кандидата'"),
  'Nomination form must retain Russian labels and title.');
check(nominationMarkup.includes('${tx.nameConsent}') &&
  nominationMarkup.includes('${tx.programConsent}') &&
  nominationMarkup.includes('name="publicNameConsent" required') &&
  nominationMarkup.includes('name="publicProgramConsent" required'),
  'Both separate publication consents must remain required in both languages.');
check(nominationMarkup.includes('${tx.officialNote}') &&
  nominationMarkup.includes('aria-labelledby="modalTitle"'),
  'The localized nomination form must retain the demo-only notice and accessible name.');


const matrix = read('docs/SECURITY_TEST_MATRIX.md');
check(matrix.includes('20261115_elections_foundation.sql'),
  'Security matrix must include the elections migration.');
check(matrix.includes('Квитанция не содержит'),
  'Security matrix must include the voter/ballot separation check.');

for (const [formId, fieldIds] of [
  ['ideaForm', ['ideaTitle','ideaDescription','ideaCategory','ideaScope','ideaTarget']],
  ['projectForm', ['projectTitle','projectDescription','projectCategory','projectScope','projectTarget','projectFirstTask']]
]) {
  const formStart = app.indexOf('<form id="'+formId+'"');
  const formEnd = formStart >= 0 ? app.indexOf('</form>', formStart) : -1;
  const formMarkup = formStart >= 0 && formEnd > formStart ? app.slice(formStart, formEnd) : '';
  check(Boolean(formMarkup), 'Student form markup must exist: '+formId);
  check(formMarkup.includes('aria-labelledby="modalTitle"'),
    'Student form must have an accessible name: '+formId);
  for (const fieldId of fieldIds) {
    check(formMarkup.includes('for="'+fieldId+'"') && formMarkup.includes('id="'+fieldId+'"'),
      'Student form label must be associated with its control: '+fieldId);
  }
}



const registrationStart = app.indexOf('function registerEvent(id){');
const registrationEnd = app.indexOf('\nasync function adminRoster', registrationStart);
const registrationBody = registrationStart >= 0 && registrationEnd > registrationStart
  ? app.slice(registrationStart, registrationEnd)
  : '';
check(Boolean(registrationBody), 'Event registration handler must exist.');
check((registrationBody.match(/<form id="registrationForm"/g) || []).length === 2 &&
  (registrationBody.match(/aria-labelledby="modalTitle"/g) || []).length === 2,
  'Cloud and local event-registration forms must both have accessible names.');
for (const fieldId of ['registrationName','registrationSchool','registrationGrade']) {
  check(registrationBody.includes('for="'+fieldId+'"') &&
    registrationBody.includes('id="'+fieldId+'"'),
    'Local event-registration label must be associated with its control: '+fieldId);
}
check(registrationBody.includes('<label class="lang-hint"><input type="checkbox" name="organizerAccessConsent" required>'),
  'Cloud event-registration consent checkbox must remain associated with its label.');

const registrationSubmitStart = app.indexOf("if(f.id==='registrationForm'){", app.indexOf("document.addEventListener('submit'"));
const registrationSubmitEnd = app.indexOf("\n if(f.id==='profileForm')", registrationSubmitStart);
const registrationSubmitBody = registrationSubmitStart >= 0 && registrationSubmitEnd > registrationSubmitStart
  ? app.slice(registrationSubmitStart, registrationSubmitEnd)
  : '';
check(Boolean(registrationSubmitBody), 'Event registration submit handler must exist.');
check(registrationSubmitBody.includes("if(f.dataset.submitting==='true')return;") &&
  registrationSubmitBody.includes("f.setAttribute('aria-busy','true')") &&
  registrationSubmitBody.includes("submitButton.disabled=true") &&
  registrationSubmitBody.includes("submitButton.disabled=false") &&
  registrationSubmitBody.includes("f.removeAttribute('aria-busy')") &&
  registrationSubmitBody.includes("unlockRegistration();"),
  'Event registration must ignore duplicate in-flight submits, announce busy state, and unlock after recoverable errors.');
const registrationRpcIndex = registrationSubmitBody.indexOf('await window.YntymakCloud.registerForEvent');
const registrationCloseIndex = registrationSubmitBody.indexOf('if(registrationFormWasOpen)closeModal()', registrationRpcIndex);
const registrationRefreshIndex = registrationSubmitBody.indexOf('db.events=await window.YntymakCloud.listEvents()', registrationRpcIndex);
check(registrationRpcIndex >= 0 && registrationCloseIndex > registrationRpcIndex &&
  registrationRefreshIndex > registrationCloseIndex,
  'After a successful registration RPC, close the submitted form before refreshing the event list to avoid retrying a saved registration.');
const surveyStart = app.indexOf('function surveys(){');
const surveyEnd = app.indexOf('function news(){', surveyStart);
const surveyMarkup = surveyStart >= 0 && surveyEnd > surveyStart
  ? app.slice(surveyStart, surveyEnd)
  : '';
check(Boolean(surveyMarkup) &&
  surveyMarkup.includes('<div class="bar" aria-hidden="true">') &&
  surveyMarkup.includes('<span>${esc(o)}</span><strong>${pct}%</strong>'),
  'Survey result bars must be hidden from assistive technology while option labels and percentages remain readable text.');



const newsFormStart = app.indexOf('function newNews(){');
const newsFormEnd = app.indexOf('function loginModal(){', newsFormStart);
const newsFormMarkup = newsFormStart >= 0 && newsFormEnd > newsFormStart
  ? app.slice(newsFormStart, newsFormEnd)
  : '';
check(Boolean(newsFormMarkup) &&
  newsFormMarkup.includes('<form id="newsForm"') &&
  newsFormMarkup.includes('aria-labelledby="modalTitle"'),
  'News form must have an accessible name.');
for (const fieldId of ['newsTitle','newsText','newsCategory','newsDate']) {
  check(newsFormMarkup.includes('for="'+fieldId+'"') &&
    newsFormMarkup.includes('id="'+fieldId+'"'),
    'News form label must be associated with its control: '+fieldId);
}
check(newsFormMarkup.includes("title:'Добавить новость'") &&
  newsFormMarkup.includes("titleLabel:'Заголовок'") &&
  newsFormMarkup.includes("submit:'Опубликовать'") &&
  newsFormMarkup.includes("title:'Жаңылык кошуу'") &&
  newsFormMarkup.includes("titleLabel:'Аталышы'") &&
  newsFormMarkup.includes("submit:'Жарыялоо'"),
  'News form must provide Russian and Kyrgyz titles, labels, and actions.');
check(newsFormMarkup.includes('value="Объявление"') &&
  newsFormMarkup.includes('value="Возможности"') &&
  newsFormMarkup.includes('value="Образование"') &&
  newsFormMarkup.includes('value="Платформа"'),
  'Localized news category labels must preserve existing stored category values.');
const newsCategoryStart = app.indexOf('function newsCategoryLabel(category){');
const newsCategoryEnd = app.indexOf('function ', newsCategoryStart + 1);
const newsCategoryMarkup = newsCategoryStart >= 0 && newsCategoryEnd > newsCategoryStart
  ? app.slice(newsCategoryStart, newsCategoryEnd)
  : '';
check(Boolean(newsCategoryMarkup) &&
  newsCategoryMarkup.includes("'Объявление':'Жарыя'") &&
  newsCategoryMarkup.includes("'Возможности':'Мүмкүнчүлүктөр'") &&
  newsCategoryMarkup.includes("'Образование':'Билим берүү'") &&
  newsCategoryMarkup.includes('return labels[category]||category;') &&
  app.includes("newsCategoryLabel(n.category||'Объявление')"),
  'News categories must be localized without changing stored values or unknown categories.');


const adminCheckStart = cloud.indexOf('async function checkAdmin()');
const adminCheckEnd = cloud.indexOf('  async function init()', adminCheckStart);
const adminCheckBody = adminCheckStart >= 0 && adminCheckEnd > adminCheckStart
  ? cloud.slice(adminCheckStart, adminCheckEnd)
  : '';
check(adminCheckBody.includes('const requestedUserId = session?.user?.id || null;') &&
  adminCheckBody.includes('if (session?.user?.id !== requestedUserId) return false;') &&
  adminCheckBody.indexOf('if (session?.user?.id !== requestedUserId) return false;') <
    adminCheckBody.indexOf('if (error)'),
  'Admin verification must ignore stale responses before mutating the current account privilege state.');

async function verifyAdminCheckRace(lateResponse, currentResponse, expectedAdmin) {
  let authChangeListener = null;
  let resolveFirstStarted;
  let resolveSecondStarted;
  const firstStarted = new Promise(resolve => { resolveFirstStarted = resolve; });
  const secondStarted = new Promise(resolve => { resolveSecondStarted = resolve; });
  const pendingAdminChecks = [];
  const sessionA = { user: { id: 'synthetic-account-a', email: 'a@example.invalid', user_metadata: {} } };
  const sessionB = { user: { id: 'synthetic-account-b', email: 'b@example.invalid', user_metadata: {} } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessionA }, error: null }),
      onAuthStateChange: callback => {
        authChangeListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    rpc: name => {
      if (name === 'create_my_profile') return Promise.resolve({ data: true, error: null });
      if (name === 'is_verification_representative') {
        const index = pendingAdminChecks.length;
        const pending = new Promise(resolve => pendingAdminChecks.push(resolve));
        if (index === 0) resolveFirstStarted();
        if (index === 1) resolveSecondStarted();
        return pending;
      }
      return Promise.resolve({ data: null, error: null });
    }
  };
  const testWindow = {
    YNTYMAK_CONFIG: {
      supabaseUrl: 'https://example.invalid',
      supabasePublishableKey: 'sb_publishable_synthetic_test'
    },
    supabase: { createClient: () => client },
    dispatchEvent() {}
  };
  class TestCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const context = {
    window: testWindow,
    CustomEvent: TestCustomEvent,
    console: { warn() {}, error() {}, log() {} }
  };
  new vm.Script(cloud, { filename: 'cloud.js' }).runInNewContext(context);
  const api = testWindow.YntymakCloud;
  const initPromise = api.init();
  await firstStarted;
  if (typeof authChangeListener !== 'function') throw new Error('Auth listener was not registered.');
  authChangeListener('SIGNED_IN', sessionB);
  const currentCheckPromise = api.checkAdmin();
  await secondStarted;
  pendingAdminChecks[1](currentResponse);
  const currentResult = await currentCheckPromise;
  pendingAdminChecks[0](lateResponse);
  const initResult = await initPromise;
  check(currentResult === expectedAdmin &&
    api.isAdmin() === expectedAdmin &&
    initResult.isAdmin === expectedAdmin &&
    initResult.session?.user?.id === 'synthetic-account-b',
    'A delayed admin response from account A must not grant or revoke account B privileges.');
}
try {
  await verifyAdminCheckRace(
    { data: true, error: null },
    { data: false, error: null },
    false
  );
  await verifyAdminCheckRace(
    { data: null, error: new Error('stale synthetic account error') },
    { data: true, error: null },
    true
  );
} catch (error) {
  check(false, 'Synthetic admin-session race test failed: ' + error.message);
}



const authInitStart = cloud.indexOf('async function init()');
const authSubscribeIndex = cloud.indexOf('c.auth.onAuthStateChange', authInitStart);
const authRefreshIndex = cloud.indexOf('try { await refresh(); }', authInitStart);
const authRevisionGuardIndex = cloud.indexOf('if (revision !== authStateRevision) return session;');
const authRefreshErrorIndex = cloud.indexOf('if (error) throw error;', cloud.indexOf('async function refresh()'));
check(authSubscribeIndex >= 0 && authRefreshIndex > authSubscribeIndex &&
  authRevisionGuardIndex >= 0 && authRevisionGuardIndex < authRefreshErrorIndex &&
  cloud.includes('let authStateRevision = 0, authInitializing = false;'),
  'Auth changes must be observed before the initial session read, and stale session reads/errors must not overwrite newer auth events.');

async function verifyInitSessionRace({eventType,eventUser,staleUser,staleError=false,expectedUser,label}) {
  let authChangeListener=null, resolveSession, markGetSessionStarted;
  const getSessionStarted=new Promise(resolve=>{markGetSessionStarted=resolve;});
  const sessions={
    A:{user:{id:'synthetic-account-a',email:'a@example.invalid',user_metadata:{}}},
    B:{user:{id:'synthetic-account-b',email:'b@example.invalid',user_metadata:{}}}
  };
  const eventSession=eventUser?sessions[eventUser]:null;
  const staleSession=staleUser?sessions[staleUser]:null;
  const expectedUserId=expectedUser?sessions[expectedUser].user.id:null;
  let profileBootstrapCount=0,adminCheckCount=0,authChangeDispatchCount=0;
  const client={
    auth:{
      getSession:()=>{
        markGetSessionStarted();
        return new Promise(resolve=>{resolveSession=resolve;});
      },
      onAuthStateChange:callback=>{
        authChangeListener=callback;
        return {data:{subscription:{unsubscribe(){}}}};
      }
    },
    rpc:async name=>{
      if(name==='create_my_profile')profileBootstrapCount++;
      if(name==='is_verification_representative')adminCheckCount++;
      return {data:false,error:null};
    }
  };
  const testWindow={
    YNTYMAK_CONFIG:{
      supabaseUrl:'https://example.invalid',
      supabasePublishableKey:'sb_publishable_synthetic_test'
    },
    supabase:{createClient:()=>client},
    dispatchEvent:event=>{if(event?.type==='yntymak:auth-change')authChangeDispatchCount++;}
  };
  class TestCustomEvent {
    constructor(type,options){this.type=type;this.detail=options?.detail;}
  }
  const context={window:testWindow,CustomEvent:TestCustomEvent,console:{warn(){},error(){},log(){}}};
  new vm.Script(cloud,{filename:'cloud.js'}).runInNewContext(context);
  const api=testWindow.YntymakCloud;
  const initPromise=api.init();
  await getSessionStarted;
  if(typeof authChangeListener!=='function')throw new Error('Auth listener was not registered before getSession().');
  authChangeListener(eventType,eventSession);
  resolveSession(staleError
    ? {data:null,error:new Error('stale synthetic getSession error')}
    : {data:{session:staleSession},error:null});
  const result=await initPromise;
  const actualUserId=result.session?.user?.id||null;
  check(actualUserId===expectedUserId &&
    (api.getSession()?.user?.id||null)===expectedUserId &&
    (api.getUser()?.id||null)===expectedUserId,
    'A late getSession result must not replace the newer ' + label + '.');
  check(profileBootstrapCount===(expectedUserId?1:0) &&
    adminCheckCount===(expectedUserId?1:0),
    'Initialization must bootstrap only the final session after ' + label + '.');
  check(authChangeDispatchCount===0,
    'Auth changes during initialization must not trigger a duplicate account bootstrap for ' + label + '.');
  check(api.isAdmin()===false,
    'Initialization must not retain stale administrator state after ' + label + '.');
}

try {
  await verifyInitSessionRace({
    eventType:'SIGNED_OUT',eventUser:null,staleUser:'A',expectedUser:null,
    label:'sign-out event'
  });
  await verifyInitSessionRace({
    eventType:'SIGNED_IN',eventUser:'B',staleUser:'A',expectedUser:'B',
    label:'account B sign-in'
  });
  await verifyInitSessionRace({
    eventType:'INITIAL_SESSION',eventUser:'A',staleUser:null,expectedUser:'A',
    label:'initial session event'
  });
  await verifyInitSessionRace({
    eventType:'SIGNED_IN',eventUser:'B',staleError:true,expectedUser:'B',
    label:'account B sign-in with a stale getSession error'
  });
} catch(error) {
  check(false,'Synthetic auth initialization race test failed: '+error.message);
}

function createSignOutHarness(signOutAction) {
  let authChangeListener = null;
  const sessionA = { user: { id: 'synthetic-account-a', email: 'a@example.invalid', user_metadata: {} } };
  const sessionB = { user: { id: 'synthetic-account-b', email: 'b@example.invalid', user_metadata: {} } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessionA }, error: null }),
      onAuthStateChange: callback => {
        authChangeListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: () => signOutAction({
        emit: (event, nextSession) => authChangeListener(event, nextSession),
        sessionA,
        sessionB
      })
    },
    rpc: async name => ({ data: name === 'is_verification_representative', error: null })
  };
  const testWindow = {
    YNTYMAK_CONFIG: {
      supabaseUrl: 'https://example.invalid',
      supabasePublishableKey: 'sb_publishable_synthetic_test'
    },
    supabase: { createClient: () => client },
    dispatchEvent() {}
  };
  class TestCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const context = {
    window: testWindow,
    CustomEvent: TestCustomEvent,
    console: { warn() {}, error() {}, log() {} }
  };
  new vm.Script(cloud, { filename: 'cloud.js' }).runInNewContext(context);
  return {
    api: testWindow.YntymakCloud,
    sessionA,
    sessionB,
    emitAuth: (event, nextSession) => {
      if (typeof authChangeListener !== 'function') throw new Error('Auth listener was not registered.');
      authChangeListener(event, nextSession);
    }
  };
}

async function verifySignOutRace() {
  let resolveSignOut, markSignOutStarted;
  const signOutStarted = new Promise(resolve => { markSignOutStarted = resolve; });
  const harness = createSignOutHarness(() => {
    markSignOutStarted();
    return new Promise(resolve => { resolveSignOut = resolve; });
  });
  await harness.api.init();
  check(harness.api.isAdmin() === true, 'Synthetic account A must begin with its verified test permission.');
  const request = harness.api.signOut();
  await signOutStarted;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  resolveSignOut({ error: null });
  await request;
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.getUser()?.id === harness.sessionB.user.id &&
    harness.api.isAdmin() === false,
    'A delayed sign-out completion for account A must not clear the newer account B session or retain A permissions.');
  await harness.api.checkAdmin();
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.isAdmin() === true,
    'Account B must be able to complete its own permission check after A sign-out finishes.');
}

async function verifySignOutEventClearsState() {
  const harness = createSignOutHarness(({ emit }) => {
    emit('SIGNED_OUT', null);
    return Promise.resolve({ error: null });
  });
  await harness.api.init();
  await harness.api.signOut();
  check(harness.api.getSession() === null && harness.api.getUser() === null &&
    harness.api.isAdmin() === false,
    'A normal SIGNED_OUT event must clear the session, user and administrator state.');
}

async function verifySignOutFallbackClearsState() {
  const harness = createSignOutHarness(() => Promise.resolve({ error: null }));
  await harness.api.init();
  await harness.api.signOut();
  check(harness.api.getSession() === null && harness.api.getUser() === null &&
    harness.api.isAdmin() === false,
    'A successful sign-out without an auth callback must still clear the unchanged local session.');
}

async function verifySignOutFailurePreservesState() {
  const failure = new Error('synthetic sign-out failure');
  const harness = createSignOutHarness(() => Promise.resolve({ error: failure }));
  await harness.api.init();
  const outcome = await harness.api.signOut().then(
    () => ({ rejected: false }),
    error => ({ rejected: error === failure })
  );
  check(outcome.rejected && harness.api.getSession()?.user?.id === harness.sessionA.user.id &&
    harness.api.isAdmin() === true,
    'A failed sign-out without an auth event must preserve the still-active account A state.');
}

try {
  await verifySignOutRace();
  await verifySignOutEventClearsState();
  await verifySignOutFallbackClearsState();
  await verifySignOutFailurePreservesState();
} catch (error) {
  check(false, 'Synthetic sign-out lifecycle test failed: ' + error.message);
}

const profileReadStart = cloud.indexOf('async function getMyProfile()');
const profileReadEnd = cloud.indexOf('  async function updateMyProfile(', profileReadStart);
const profileReadBody = profileReadStart >= 0 && profileReadEnd > profileReadStart
  ? cloud.slice(profileReadStart, profileReadEnd) : '';
check(profileReadBody.includes('const requestedUserId=session?.user?.id||null;') &&
  profileReadBody.includes(".eq('id',requestedUserId)") &&
  profileReadBody.includes('const assertCurrentUser = () => {') &&
  (profileReadBody.match(/assertCurrentUser\(\);/g) || []).length === 2,
  'Cloud profile reads must capture the requested account and re-check it after each awaited query.');

async function verifyProfileReadRace(stage, lateResponse) {
  let authChangeListener = null, resolveProfile, resolveSchool, markProfileStarted, markSchoolStarted;
  const profileStarted = new Promise(resolve => { markProfileStarted = resolve; });
  const schoolStarted = new Promise(resolve => { markSchoolStarted = resolve; });
  const sessionA = { user: { id: 'synthetic-account-a', email: 'a@example.invalid', user_metadata: {} } };
  const sessionB = { user: { id: 'synthetic-account-b', email: 'b@example.invalid', user_metadata: {} } };
  let schoolQueryCount = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessionA }, error: null }),
      onAuthStateChange: callback => { authChangeListener = callback; return { data: { subscription: { unsubscribe() {} } } }; }
    },
    rpc: async name => ({ data: name === 'is_verification_representative' ? false : true, error: null }),
    from: table => ({
      select: () => ({
        eq: (_column, value) => ({
          maybeSingle: () => {
            if (table === 'profiles') {
              if (value !== sessionA.user.id) throw new Error('Profile query was not bound to account A.');
              markProfileStarted(); return new Promise(resolve => { resolveProfile = resolve; });
            }
            if (table === 'schools') {
              schoolQueryCount++;
              if (value !== 'synthetic-school-a') throw new Error('School lookup was not bound to account A.');
              markSchoolStarted(); return new Promise(resolve => { resolveSchool = resolve; });
            }
            throw new Error('Unexpected table in synthetic profile test: ' + table);
          }
        })
      })
    })
  };
  const testWindow = {
    YNTYMAK_CONFIG: { supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'sb_publishable_synthetic_test' },
    supabase: { createClient: () => client },
    dispatchEvent() {}
  };
  class TestCustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const context = { window: testWindow, CustomEvent: TestCustomEvent, console: { warn() {}, error() {}, log() {} } };
  new vm.Script(cloud, { filename: 'cloud.js' }).runInNewContext(context);
  const api = testWindow.YntymakCloud;
  await api.init();
  const request = api.getMyProfile();
  await profileStarted;
  if (stage === 'school') {
    resolveProfile({ data: { display_name: 'Synthetic A', preferred_language: 'ru', school_id: 'synthetic-school-a', grade_label: '9' }, error: null });
    await schoolStarted;
  }
  if (typeof authChangeListener !== 'function') throw new Error('Auth listener was not registered.');
  authChangeListener('SIGNED_IN', sessionB);
  if (stage === 'profile') {
    resolveProfile({ data: { display_name: 'Synthetic A', preferred_language: 'ru', school_id: null, grade_label: '9' }, error: null });
  } else if (stage === 'profile-error') {
    resolveProfile({ data: null, error: new Error('stale synthetic profile error') });
  } else {
    resolveSchool(lateResponse);
  }
  const outcome = await request.then(() => ({ rejected: false, message: '' }), error => ({ rejected: true, message: error.message }));
  check(outcome.rejected && outcome.message === 'Сессия изменилась во время загрузки профиля. Повтори запрос.',
    'A stale ' + stage + ' response from account A must be rejected after switching to account B.');
  check(schoolQueryCount === (stage === 'school' ? 1 : 0),
    'A stale profile response must not trigger an unrelated school lookup.');
}
try {
  await verifyProfileReadRace('profile', null);
  await verifyProfileReadRace('profile-error', null);
  await verifyProfileReadRace('school', { data: { name: 'Synthetic school A', district_key: 'lenin' }, error: null });
} catch (error) {
  check(false, 'Synthetic profile-session race test failed: ' + error.message);
}


const profileUpdateStart = cloud.indexOf('async function updateMyProfile(');
const profileUpdateEnd = cloud.indexOf('  async function listActiveSchools()', profileUpdateStart);
const profileUpdateBody = profileUpdateStart >= 0 && profileUpdateEnd > profileUpdateStart
  ? cloud.slice(profileUpdateStart, profileUpdateEnd) : '';
check(profileUpdateBody.includes('const requestedUserId=session?.user?.id||null;') &&
  profileUpdateBody.includes(".eq('id',requestedUserId)") &&
  profileUpdateBody.includes('const assertCurrentUser = () => {') &&
  profileUpdateBody.split('assertCurrentUser();').length === 3 &&
  profileUpdateBody.indexOf('assertCurrentUser();') < profileUpdateBody.indexOf('if(error)') &&
  profileUpdateBody.lastIndexOf('assertCurrentUser();') > profileUpdateBody.indexOf('const saved=await getMyProfile();'),
  'Cloud profile updates must remain bound to the initiating account and re-check the session after each awaited operation.');

async function verifyProfileUpdateRace(lateResponse, label) {
  let authChangeListener = null, resolveUpdate, markUpdateStarted;
  const updateStarted = new Promise(resolve => { markUpdateStarted = resolve; });
  const sessionA = { user: { id: 'synthetic-account-a', email: 'a@example.invalid', user_metadata: {} } };
  const sessionB = { user: { id: 'synthetic-account-b', email: 'b@example.invalid', user_metadata: {} } };
  let profileReadCount = 0, updateUserId = null;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessionA }, error: null }),
      onAuthStateChange: callback => {
        authChangeListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    rpc: async name => ({ data: name === 'is_verification_representative' ? false : true, error: null }),
    from: table => ({
      update: payload => ({
        eq: (_column, value) => {
          if (table !== 'profiles' || payload.display_name !== 'Synthetic A') {
            throw new Error('Unexpected synthetic profile update.');
          }
          updateUserId = value;
          markUpdateStarted();
          return new Promise(resolve => { resolveUpdate = resolve; });
        }
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            profileReadCount++;
            return {
              data: { display_name: 'Synthetic B', preferred_language: 'ru', school_id: null, grade_label: '9' },
              error: null
            };
          }
        })
      })
    })
  };
  const testWindow = {
    YNTYMAK_CONFIG: {
      supabaseUrl: 'https://example.invalid',
      supabasePublishableKey: 'sb_publishable_synthetic_test'
    },
    supabase: { createClient: () => client },
    dispatchEvent() {}
  };
  class TestCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const context = {
    window: testWindow,
    CustomEvent: TestCustomEvent,
    console: { warn() {}, error() {}, log() {} }
  };
  new vm.Script(cloud, { filename: 'cloud.js' }).runInNewContext(context);
  const api = testWindow.YntymakCloud;
  await api.init();
  const request = api.updateMyProfile({
    displayName: 'Synthetic A',
    gradeLabel: '9',
    language: 'ru'
  });
  await updateStarted;
  if (typeof authChangeListener !== 'function') throw new Error('Auth listener was not registered.');
  authChangeListener('SIGNED_IN', sessionB);
  resolveUpdate(lateResponse);
  const outcome = await request.then(
    value => ({ rejected: false, value }),
    error => ({ rejected: true, message: error.message })
  );
  check(updateUserId === sessionA.user.id,
    'A profile save must remain bound to account A when ' + label + ' arrives.');
  check(outcome.rejected &&
    outcome.message === 'Сессия изменилась во время сохранения профиля. Повтори запрос.',
    'A late ' + label + ' after switching A → B must be rejected as a session change.');
  check(profileReadCount === 0,
    'A stale profile save must not start a profile refresh for the newly active account B.');
}

async function verifyProfileUpdateSuccess() {
  const sessionA = { user: { id: 'synthetic-account-a', email: 'a@example.invalid', user_metadata: {} } };
  let updateUserId = null, profileReadCount = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessionA }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    rpc: async name => ({ data: name === 'is_verification_representative' ? false : true, error: null }),
    from: table => ({
      update: () => ({
        eq: (_column, value) => {
          updateUserId = value;
          return Promise.resolve({ data: null, error: null });
        }
      }),
      select: () => ({
        eq: (_column, value) => ({
          maybeSingle: async () => {
            profileReadCount++;
            if (table !== 'profiles' || value !== sessionA.user.id) {
              throw new Error('Successful profile refresh was not bound to account A.');
            }
            return {
              data: { display_name: 'Synthetic A', preferred_language: 'ky', school_id: null, grade_label: '9' },
              error: null
            };
          }
        })
      })
    })
  };
  const testWindow = {
    YNTYMAK_CONFIG: {
      supabaseUrl: 'https://example.invalid',
      supabasePublishableKey: 'sb_publishable_synthetic_test'
    },
    supabase: { createClient: () => client },
    dispatchEvent() {}
  };
  class TestCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }
  const context = {
    window: testWindow,
    CustomEvent: TestCustomEvent,
    console: { warn() {}, error() {}, log() {} }
  };
  new vm.Script(cloud, { filename: 'cloud.js' }).runInNewContext(context);
  const api = testWindow.YntymakCloud;
  await api.init();
  const saved = await api.updateMyProfile({
    displayName: 'Synthetic A',
    gradeLabel: '9',
    language: 'ky'
  });
  check(updateUserId === sessionA.user.id && profileReadCount === 1 &&
    saved.displayName === 'Synthetic A' && saved.preferredLanguage === 'ky',
    'A successful profile save in the same session must still return the saved profile.');
}

try {
  await verifyProfileUpdateRace({ data: null, error: null }, 'successful update response');
  await verifyProfileUpdateRace(
    { data: null, error: new Error('stale synthetic update error') },
    'failed update response'
  );
  await verifyProfileUpdateSuccess();
} catch (error) {
  check(false, 'Synthetic profile-update session test failed: ' + error.message);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  console.error(`${errors.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('All static project checks passed.');
}

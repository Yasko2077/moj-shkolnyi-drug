#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const helperStart = app.indexOf('async function loadCloudModulesForSession(requestedUserId){');
const helperEnd = app.indexOf('function resetAccountScopedAssistantState()', helperStart);
check(helperStart >= 0 && helperEnd > helperStart,
  'Cloud module loader must exist before account-scoped reset helpers.');

const authStart = app.indexOf("window.addEventListener('yntymak:auth-change'");
const authEnd = app.indexOf("$('#authButton')", authStart);
const authSource = authStart >= 0 && authEnd > authStart ? app.slice(authStart, authEnd) : '';
check(authSource.includes('await loadCloudModulesForSession(userId);'),
  'The auth-change handler must reload collections for the new account.');

const initStart = app.indexOf('if(window.YntymakCloud?.configured()){');
const initEnd = app.indexOf('\nrender();', initStart);
const initSource = initStart >= 0 && initEnd > initStart ? app.slice(initStart, initEnd) : '';
check(initSource.includes('const requestedUserId=result.session?.user?.id||null;') &&
  initSource.includes('if(!isCurrentSession())return;') &&
  initSource.includes('await loadCloudModulesForSession(requestedUserId);'),
  'Initial module loading must be bound to the session returned by init().');

async function verifyStaleCollection(stage, lateFailure = false) {
  let activeUserId = 'synthetic-account-a';
  const held = deferred();
  const stageStarted = deferred();
  const warnings = [];
  const db = { ideas: [], projects: [], events: [], news: [], surveys: [] };
  const methods = ['listInitiatives', 'listProjects', 'listEvents', 'listNews', 'listPolls'];
  const cloud = {
    getSession: () => ({ user: { id: activeUserId } }),
    initiativesEnabled: () => true,
    projectsEnabled: () => true,
    eventsEnabled: () => true,
    contentEnabled: () => true
  };
  for (const method of methods) {
    cloud[method] = () => {
      const owner = activeUserId;
      if (owner === 'synthetic-account-a' && method === stage) {
        stageStarted.resolve();
        return held.promise;
      }
      return Promise.resolve([owner + ':' + method]);
    };
  }
  const context = { window: { YntymakCloud: cloud }, db, console: { warn: (...args) => warnings.push(args) } };
  vm.createContext(context);
  const helperSource = app.slice(helperStart, helperEnd) +
    '\nglobalThis.loadCloudModulesForSession=loadCloudModulesForSession;';
  new vm.Script(helperSource, { filename: 'app-cloud-module-bootstrap.js' }).runInContext(context);

  const requestA = context.loadCloudModulesForSession('synthetic-account-a');
  await stageStarted.promise;
  activeUserId = 'synthetic-account-b';
  const loadedB = await context.loadCloudModulesForSession('synthetic-account-b');
  if (lateFailure) held.reject(new Error('late synthetic A failure'));
  else held.resolve(['synthetic-account-a:' + stage]);
  const loadedA = await requestA;

  check(loadedB === true && loadedA === false,
    stage + ': account A loader must stop after the active session changes to B.');
  const expected = {
    ideas: 'listInitiatives',
    projects: 'listProjects',
    events: 'listEvents',
    news: 'listNews',
    surveys: 'listPolls'
  };
  for (const [key, method] of Object.entries(expected)) {
    check(Array.isArray(db[key]) && db[key][0] === 'synthetic-account-b:' + method,
      stage + ': stale account A response must not overwrite B ' + key + ' data.');
  }
  if (lateFailure) {
    check(warnings.length === 0,
      'A stale account A error must not be reported as an error for account B.');
  }
}

if (!failures.length) {
  try {
    for (const stage of ['listInitiatives', 'listProjects', 'listEvents', 'listNews', 'listPolls']) {
      await verifyStaleCollection(stage);
    }
    await verifyStaleCollection('listPolls', true);
  } catch (error) {
    failures.push('Synthetic cloud-module isolation harness crashed: ' + error.message);
  }
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Synthetic cloud-module account-isolation checks passed.');
}

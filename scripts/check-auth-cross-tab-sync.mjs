#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const cloud = readFileSync('cloud.js', 'utf8');
new vm.Script(app, { filename: 'app.js' });
new vm.Script(cloud, { filename: 'cloud.js' });

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const authStart = app.indexOf("window.addEventListener('yntymak:auth-change'");
const authEnd = app.indexOf("$('#authButton')", authStart);
check(authStart >= 0 && authEnd > authStart,
  'The application must handle account-change events before wiring the account button.');
const authSource = authStart >= 0 && authEnd > authStart
  ? app.slice(authStart, authEnd)
  : '';
check(authSource.includes('resetAccountScopedAssistantState();') &&
  authSource.includes('state.admin=false;state.realAdmin=false;state.cloudProfile=false;') &&
  authSource.includes('await loadCloudModulesForSession(userId);'),
  'An account-change event must clear prior account state and reload the new account collections.');

function createTab(name, initialSession) {
  let authListener = null;
  let appAuthListener = null;
  const events = [];
  const warnings = [];
  const loadedModuleUserIds = [];
  const state = { admin: true, realAdmin: true, cloudProfile: true };
  let activeStoreUserId = initialSession?.user?.id || null;
  let profileUserId = initialSession?.user?.id || null;
  let renderCount = 0;
  let resetCount = 0;

  const client = {
    auth: {
      getSession: async () => ({ data: { session: initialSession }, error: null }),
      onAuthStateChange: callback => {
        authListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    rpc: async name => ({
      data: name === 'is_verification_representative',
      error: null
    })
  };

  const testWindow = {
    YNTYMAK_CONFIG: {
      supabaseUrl: 'https://example.invalid',
      supabasePublishableKey: 'sb_publishable_synthetic_test'
    },
    supabase: { createClient: () => client },
    addEventListener(type, listener) {
      if (type === 'yntymak:auth-change') appAuthListener = listener;
    },
    dispatchEvent(event) {
      events.push(event);
      if (event.type === 'yntymak:auth-change') appAuthListener?.(event);
    }
  };

  class TestCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }

  const context = {
    window: testWindow,
    CustomEvent: TestCustomEvent,
    state,
    resetAccountScopedAssistantState() {
      resetCount++;
    },
    activateAccountStore() {
      activeStoreUserId = testWindow.YntymakCloud?.getSession()?.user?.id || null;
    },
    render() {
      renderCount++;
    },
    async loadCloudProfile() {
      profileUserId = testWindow.YntymakCloud?.getSession()?.user?.id || null;
      state.cloudProfile = Boolean(profileUserId);
      activeStoreUserId = profileUserId;
      return true;
    },
    async loadCloudModulesForSession(userId) {
      loadedModuleUserIds.push(userId);
      return true;
    },
    console: { warn: (...args) => warnings.push(args) }
  };

  vm.createContext(context);
  new vm.Script(cloud, { filename: 'cloud.js' }).runInContext(context);
  if (authSource) {
    new vm.Script(authSource, { filename: 'app-auth-change-handler.js' }).runInContext(context);
  }

  return {
    name,
    api: testWindow.YntymakCloud,
    state,
    events,
    warnings,
    loadedModuleUserIds,
    emitAuth(event, nextSession) {
      if (typeof authListener !== 'function') throw new Error(name + ': Supabase auth listener was not registered.');
      authListener(event, nextSession);
    },
    snapshot() {
      return {
        userId: testWindow.YntymakCloud?.getSession()?.user?.id || null,
        authUserId: testWindow.YntymakCloud?.getUser()?.id || null,
        isAdmin: testWindow.YntymakCloud?.isAdmin(),
        activeStoreUserId,
        profileUserId,
        renderCount,
        resetCount
      };
    }
  };
}

const sessionA = {
  access_token: 'synthetic-a-token',
  user: {
    id: 'synthetic-account-a',
    email: 'a@example.invalid',
    user_metadata: { display_name: 'Synthetic A', preferred_language: 'ru' }
  }
};
const sessionB = {
  access_token: 'synthetic-b-token',
  user: {
    id: 'synthetic-account-b',
    email: 'b@example.invalid',
    user_metadata: { display_name: 'Synthetic B', preferred_language: 'ky' }
  }
};

async function flushApplicationTasks() {
  await new Promise(resolve => setImmediate(resolve));
}

async function run() {
  if (failures.length) return;

  const tabs = [
    createTab('synthetic-tab-one', sessionA),
    createTab('synthetic-tab-two', sessionA)
  ];

  await Promise.all(tabs.map(tab => tab.api.init()));
  for (const tab of tabs) {
    const snapshot = tab.snapshot();
    check(snapshot.userId === sessionA.user.id && snapshot.authUserId === sessionA.user.id,
      tab.name + ': initial session A must be loaded in the tab.');
    check(snapshot.isAdmin === true,
      tab.name + ': the synthetic initial permission check should be successful.');
  }

  // Emulate Supabase Auth delivering one cross-tab session event to each tab client.
  function broadcast(event, nextSession) {
    for (const tab of tabs) tab.emitAuth(event, nextSession);
  }

  broadcast('SIGNED_OUT', null);
  for (const tab of tabs) {
    const snapshot = tab.snapshot();
    check(snapshot.userId === null && snapshot.authUserId === null && snapshot.isAdmin === false,
      tab.name + ': a sign-out event must clear session, user, and admin state.');
    check(snapshot.activeStoreUserId === null && tab.state.admin === false &&
      tab.state.realAdmin === false && tab.state.cloudProfile === false,
      tab.name + ': the UI must switch away from account A and hide its admin/profile state.');
    check(tab.events.length === 1 && tab.events[0].type === 'yntymak:auth-change' &&
      tab.events[0].detail?.userId === null,
      tab.name + ': sign-out must dispatch one account-change event with a null user ID.');
  }

  broadcast('SIGNED_IN', sessionB);
  for (const tab of tabs) {
    const snapshot = tab.snapshot();
    check(snapshot.userId === sessionB.user.id && snapshot.authUserId === sessionB.user.id,
      tab.name + ': the new account B session must be adopted immediately.');
    check(snapshot.isAdmin === false && tab.state.admin === false && tab.state.realAdmin === false,
      tab.name + ': account A permissions must not carry over to account B.');
    check(snapshot.activeStoreUserId === sessionB.user.id,
      tab.name + ': the local account store must switch to account B immediately.');
    check(tab.events.length === 2 && tab.events[1].detail?.userId === sessionB.user.id,
      tab.name + ': sign-in for B must dispatch a second account-change event.');
  }

  await flushApplicationTasks();
  for (const tab of tabs) {
    const snapshot = tab.snapshot();
    check(snapshot.isAdmin === true && tab.state.admin === true &&
      tab.state.realAdmin === true && tab.state.cloudProfile === true,
      tab.name + ': B must receive its own completed profile and permission bootstrap.');
    check(snapshot.profileUserId === sessionB.user.id &&
      tab.loadedModuleUserIds.length === 1 &&
      tab.loadedModuleUserIds[0] === sessionB.user.id,
      tab.name + ': profile and cloud collections must reload for B, not A.');
    check(tab.warnings.length === 0,
      tab.name + ': normal cross-tab account changes must not produce bootstrap errors.');
  }

  const refreshedB = {
    ...sessionB,
    access_token: 'synthetic-b-refreshed-token'
  };
  broadcast('TOKEN_REFRESHED', refreshedB);
  broadcast('SIGNED_IN', refreshedB);
  for (const tab of tabs) {
    const snapshot = tab.snapshot();
    check(tab.api.getSession()?.access_token === refreshedB.access_token,
      tab.name + ': a same-user token refresh must update the current session.');
    check(tab.events.length === 2 && tab.loadedModuleUserIds.length === 1 &&
      snapshot.isAdmin === true,
      tab.name + ': same-user token refresh/sign-in must not clear permissions or trigger redundant account reloads.');
  }
}

run().then(() => {
  if (failures.length) {
    for (const failure of failures) console.error('FAIL: ' + failure);
    process.exitCode = 1;
  } else {
    console.log('Synthetic cross-tab auth synchronization checks passed.');
  }
}).catch(error => {
  console.error('FAIL: cross-tab auth test harness crashed: ' + error.message);
  process.exitCode = 1;
});

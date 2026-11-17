#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cloud = readFileSync('cloud.js', 'utf8');
new vm.Script(cloud, { filename: 'cloud.js' });

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function createHarness({ languageA = 'ru', signInAction, rpcAction }) {
  let authChangeListener = null;
  const sessionA = {
    user: {
      id: 'synthetic-account-a',
      email: 'a@example.invalid',
      user_metadata: { preferred_language: languageA }
    }
  };
  const sessionB = {
    user: {
      id: 'synthetic-account-b',
      email: 'b@example.invalid',
      user_metadata: { preferred_language: 'ru' }
    }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: callback => {
        authChangeListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: credentials => signInAction({
        credentials,
        emit: (event, nextSession) => authChangeListener(event, nextSession),
        sessionA,
        sessionB
      })
    },
    rpc: (name, args) => rpcAction(name, args)
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
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
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
    emitAuth(event, nextSession) {
      if (typeof authChangeListener !== 'function') throw new Error('Auth listener was not registered.');
      authChangeListener(event, nextSession);
    }
  };
}

async function verifyStaleSignInResponse(languageA, expectedMessage) {
  let resolveLogin;
  let markLoginStarted;
  const loginStarted = new Promise(resolve => { markLoginStarted = resolve; });
  let rpcCalls = 0;
  const harness = createHarness({
    languageA,
    signInAction: () => {
      markLoginStarted();
      return new Promise(resolve => { resolveLogin = resolve; });
    },
    rpcAction: async () => {
      rpcCalls++;
      return { data: true, error: null };
    }
  });
  await harness.api.init();
  const request = harness.api.signIn({
    email: 'a@example.invalid',
    password: 'synthetic-password'
  });
  await loginStarted;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  resolveLogin({
    data: { session: harness.sessionA, user: harness.sessionA.user },
    error: null
  });
  const outcome = await request.then(
    value => ({ rejected: false, value }),
    error => ({ rejected: true, message: error.message })
  );
  check(outcome.rejected && outcome.message === expectedMessage,
    'A delayed account A sign-in response must be rejected after account B becomes active (' + languageA + ').');
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.getUser()?.id === harness.sessionB.user.id &&
    harness.api.isAdmin() === false,
    'A stale sign-in response must preserve account B and must not grant account A privileges.');
  check(rpcCalls === 0,
    'A stale sign-in response must not bootstrap a profile or start an admin check.');
}

async function verifyOwnSignInEventIsAccepted() {
  const rpcCalls = [];
  const harness = createHarness({
    signInAction: ({ emit, sessionA }) => {
      emit('SIGNED_IN', sessionA);
      return Promise.resolve({
        data: { session: sessionA, user: sessionA.user },
        error: null
      });
    },
    rpcAction: async name => {
      rpcCalls.push(name);
      return { data: name === 'is_verification_representative', error: null };
    }
  });
  await harness.api.init();
  const result = await harness.api.signIn({
    email: 'a@example.invalid',
    password: 'synthetic-password'
  });
  check(result.user?.id === harness.sessionA.user.id &&
    result.isAdmin === true &&
    harness.api.getSession()?.user?.id === harness.sessionA.user.id &&
    harness.api.isAdmin() === true,
    'The auth event belonging to the same sign-in request must remain valid.');
  check(rpcCalls.join(',') === 'create_my_profile,is_verification_representative',
    'A valid sign-in must bootstrap only its own profile and permissions.');
}

async function verifySwitchDuringProfileBootstrap() {
  let resolveProfile;
  let markProfileStarted;
  const profileStarted = new Promise(resolve => { markProfileStarted = resolve; });
  let adminChecks = 0;
  const harness = createHarness({
    signInAction: ({ sessionA }) => Promise.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null
    }),
    rpcAction: name => {
      if (name === 'create_my_profile') {
        markProfileStarted();
        return new Promise(resolve => { resolveProfile = resolve; });
      }
      if (name === 'is_verification_representative') {
        adminChecks++;
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
  });
  await harness.api.init();
  const request = harness.api.signIn({
    email: 'a@example.invalid',
    password: 'synthetic-password'
  });
  await profileStarted;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  resolveProfile({ data: true, error: null });
  const outcome = await request.then(
    () => ({ rejected: false }),
    error => ({ rejected: true, message: error.message })
  );
  check(outcome.rejected &&
    outcome.message === 'Сессия изменилась во время входа. Повтори попытку.',
    'A sign-in must stop if the active account changes during profile bootstrap.');
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.isAdmin() === false && adminChecks === 0,
    'A stale profile bootstrap must not continue into an admin check or alter account B.');
}

try {
  await verifyStaleSignInResponse('ru', 'Сессия изменилась во время входа. Повтори попытку.');
  await verifyStaleSignInResponse('ky', 'Кирүү учурунда сеанс өзгөрдү. Кайра аракет кыл.');
  await verifyOwnSignInEventIsAccepted();
  await verifySwitchDuringProfileBootstrap();
} catch (error) {
  failures.push('Synthetic sign-in race test crashed: ' + error.message);
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Synthetic sign-in session-race checks passed.');
}

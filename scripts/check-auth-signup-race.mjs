#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cloud = readFileSync('cloud.js', 'utf8');
new vm.Script(cloud, { filename: 'cloud.js' });

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function createHarness({ languageA = 'ru', initialSession = null, signUpAction, rpcAction }) {
  let authChangeListener = null;
  const sessionA = {
    user: {
      id: 'synthetic-account-a',
      email: 'a@example.invalid',
      user_metadata: { preferred_language: languageA, display_name: 'Synthetic A' }
    }
  };
  const sessionB = {
    user: {
      id: 'synthetic-account-b',
      email: 'b@example.invalid',
      user_metadata: { preferred_language: 'ru', display_name: 'Synthetic B' }
    }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: initialSession }, error: null }),
      onAuthStateChange: callback => {
        authChangeListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signUp: options => signUpAction({
        options,
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
    location: { origin: 'https://example.invalid', pathname: '/' },
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
const defaultRpc = async name => ({ data: name === 'is_verification_representative', error: null });
async function register(api, language = 'ru') {
  return api.signUp({
    email: 'a@example.invalid',
    password: 'synthetic-password',
    displayName: 'Synthetic A',
    language
  });
}

async function verifyStaleSignupResponse(language, expectedMessage) {
  const signup = deferred();
  const started = deferred();
  let rpcCalls = 0;
  const harness = createHarness({
    languageA: language,
    signUpAction: () => {
      started.resolve();
      return signup.promise;
    },
    rpcAction: async () => {
      rpcCalls++;
      return { data: true, error: null };
    }
  });
  await harness.api.init();
  const request = register(harness.api, language);
  await started.promise;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  signup.resolve({ data: { session: harness.sessionA, user: harness.sessionA.user }, error: null });
  const outcome = await request.then(
    value => ({ rejected: false, value }),
    error => ({ rejected: true, message: error.message })
  );
  check(outcome.rejected && outcome.message === expectedMessage,
    'A delayed signup response must be rejected after another account becomes active (' + language + ').');
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.getUser()?.id === harness.sessionB.user.id &&
    harness.api.isAdmin() === false,
    'A stale signup response must preserve the newer account.');
  check(rpcCalls === 0, 'A stale signup response must not create a profile.');
}

async function verifyConfirmationPreservesNewerSession() {
  const signup = deferred();
  const started = deferred();
  let rpcCalls = 0;
  const harness = createHarness({
    signUpAction: () => {
      started.resolve();
      return signup.promise;
    },
    rpcAction: async () => {
      rpcCalls++;
      return { data: true, error: null };
    }
  });
  await harness.api.init();
  const request = register(harness.api);
  await started.promise;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  signup.resolve({ data: { session: null, user: harness.sessionA.user }, error: null });
  const result = await request;
  check(result.emailConfirmationRequired === true,
    'Email-confirmation signup must report that confirmation is required.');
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.getUser()?.id === harness.sessionB.user.id,
    'A signup response without a session must not clear or replace the newer account.');
  check(rpcCalls === 0, 'A signup response without a session must not create a profile.');
}

async function verifyPendingUserIsNotAuthenticated() {
  let rpcCalls = 0;
  const harness = createHarness({
    signUpAction: ({ sessionA }) => Promise.resolve({
      data: { session: null, user: sessionA.user },
      error: null
    }),
    rpcAction: async () => {
      rpcCalls++;
      return { data: true, error: null };
    }
  });
  await harness.api.init();
  const result = await register(harness.api);
  check(result.emailConfirmationRequired === true,
    'A signup without a session must request email confirmation.');
  check(harness.api.getSession() === null && harness.api.getUser() === null,
    'A pending email-confirmation user must not be exposed as authenticated.');
  check(rpcCalls === 0, 'Profile bootstrap must wait for an authenticated session.');
}

async function verifyOwnSignupEventIsAccepted() {
  const calls = [];
  const harness = createHarness({
    signUpAction: ({ emit, sessionA }) => {
      emit('SIGNED_IN', sessionA);
      return Promise.resolve({ data: { session: sessionA, user: sessionA.user }, error: null });
    },
    rpcAction: async name => {
      calls.push(name);
      return defaultRpc(name);
    }
  });
  await harness.api.init();
  const result = await register(harness.api);
  check(result.emailConfirmationRequired === false &&
    harness.api.getSession()?.user?.id === harness.sessionA.user.id &&
    harness.api.getUser()?.id === harness.sessionA.user.id,
    'The auth event belonging to the same signup request must remain valid.');
  check(calls.join(',') === 'create_my_profile',
    'A valid signup must bootstrap only its own profile.');
}

async function verifySwitchDuringProfileBootstrap() {
  const profile = deferred();
  const started = deferred();
  const calls = [];
  const harness = createHarness({
    signUpAction: ({ sessionA }) => Promise.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null
    }),
    rpcAction: name => {
      calls.push(name);
      started.resolve();
      return profile.promise;
    }
  });
  await harness.api.init();
  const request = register(harness.api);
  await started.promise;
  harness.emitAuth('SIGNED_IN', harness.sessionB);
  profile.resolve({ data: true, error: null });
  const outcome = await request.then(
    () => ({ rejected: false }),
    error => ({ rejected: true, message: error.message })
  );
  check(outcome.rejected &&
    outcome.message === 'Сессия изменилась во время регистрации. Повтори попытку.',
    'Signup must stop if the active account changes during profile bootstrap.');
  check(harness.api.getSession()?.user?.id === harness.sessionB.user.id &&
    harness.api.getUser()?.id === harness.sessionB.user.id &&
    calls.join(',') === 'create_my_profile',
    'A stale profile bootstrap must not replace the newer account or continue.');
}

async function verifyExistingSessionIsNotReplaced() {
  const calls = [];
  const harness = createHarness({
    initialSession: {
      user: {
        id: 'synthetic-account-b',
        email: 'b@example.invalid',
        user_metadata: { preferred_language: 'ru', display_name: 'Synthetic B' }
      }
    },
    signUpAction: ({ sessionA }) => Promise.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null
    }),
    rpcAction: async name => {
      calls.push(name);
      return defaultRpc(name);
    }
  });
  await harness.api.init();
  const beforeCalls = calls.length;
  const outcome = await register(harness.api).then(
    () => ({ rejected: false }),
    error => ({ rejected: true, message: error.message })
  );
  check(outcome.rejected &&
    outcome.message === 'Сессия изменилась во время регистрации. Повтори попытку.',
    'Signup must not replace a different account that was already active.');
  check(harness.api.getSession()?.user?.id === 'synthetic-account-b' &&
    harness.api.getUser()?.id === 'synthetic-account-b' &&
    harness.api.isAdmin() === true,
    'An existing account and its admin state must remain intact.');
  check(calls.length === beforeCalls,
    'Rejected signup must not bootstrap a profile for the new account.');
}

async function verifyConfirmationPreservesExistingSessionAndPermissions() {
  const calls = [];
  const harness = createHarness({
    initialSession: {
      user: {
        id: 'synthetic-account-b',
        email: 'b@example.invalid',
        user_metadata: { preferred_language: 'ru', display_name: 'Synthetic B' }
      }
    },
    signUpAction: ({ sessionA }) => Promise.resolve({
      data: { session: null, user: sessionA.user },
      error: null
    }),
    rpcAction: async name => {
      calls.push(name);
      return defaultRpc(name);
    }
  });
  await harness.api.init();
  const beforeCalls = calls.length;
  const result = await register(harness.api);
  check(result.emailConfirmationRequired === true,
    'Signup without a session must report email confirmation.');
  check(harness.api.getSession()?.user?.id === 'synthetic-account-b' &&
    harness.api.getUser()?.id === 'synthetic-account-b' &&
    harness.api.isAdmin() === true,
    'Email-confirmation response must preserve the existing account and its permissions.');
  check(calls.length === beforeCalls,
    'Email-confirmation response must not bootstrap the pending account.');
}

try {
  await verifyStaleSignupResponse('ru', 'Сессия изменилась во время регистрации. Повтори попытку.');
  await verifyStaleSignupResponse('ky', 'Катталуу учурунда сеанс өзгөрдү. Кайра аракет кыл.');
  await verifyConfirmationPreservesNewerSession();
  await verifyPendingUserIsNotAuthenticated();
  await verifyOwnSignupEventIsAccepted();
  await verifySwitchDuringProfileBootstrap();
  await verifyExistingSessionIsNotReplaced();
  await verifyConfirmationPreservesExistingSessionAndPermissions();
} catch (error) {
  failures.push('Synthetic sign-up race test crashed: ' + error.message);
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Synthetic sign-up session-race checks passed.');
}

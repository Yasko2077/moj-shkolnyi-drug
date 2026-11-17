#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const submitStart = app.indexOf("if(f.id==='registrationForm'){", app.indexOf("document.addEventListener('submit'"));
const submitEnd = app.indexOf("\n if(f.id==='profileForm')", submitStart);
const submitBody = submitStart >= 0 && submitEnd > submitStart ? app.slice(submitStart, submitEnd) : '';
const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function createHarness({ language = 'RU', register, listEvents, initialSession } = {}) {
  let activeSession = initialSession || { user: { id: 'synthetic-account-a' }, revision: 1 };
  const button = { textContent: 'Зарегистрироваться', disabled: false };
  const form = {
    id: 'registrationForm',
    dataset: { event: 'EV-SYNTHETIC' },
    isConnected: true,
    attributes: new Map(),
    querySelector: () => button,
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); }
  };
  const db = {
    events: [{ id: 'EV-SYNTHETIC', title: 'Synthetic event', registered: 2, capacity: 10, source: 'cloud' }],
    registrations: []
  };
  const messages = [];
  let registerCalls = 0, listCalls = 0, closeCalls = 0, renderCalls = 0;
  const cloud = {
    eventsEnabled: () => true,
    getSession: () => activeSession,
    registerForEvent: args => { registerCalls++; return register(args); },
    listEvents: () => { listCalls++; return listEvents(); }
  };
  const context = {
    window: { YntymakCloud: cloud },
    db,
    state: { lang: language },
    FormData: class { get(name) { return name === 'organizerAccessConsent' ? 'on' : null; } },
    toast: message => messages.push(message),
    closeModal: () => { closeCalls++; form.isConnected = false; },
    render: () => { renderCalls++; },
    persist() {},
    console
  };
  vm.createContext(context);
  const wrapped = `async function runRegistration(f) {
    const e = { preventDefault() {} };
    ${submitBody}
  }
  globalThis.runRegistration = runRegistration;`;
  new vm.Script(wrapped, { filename: 'event-registration-handler.js' }).runInContext(context);
  return {
    run: () => context.runRegistration(form),
    form, button, db, messages,
    get registerCalls() { return registerCalls; },
    get listCalls() { return listCalls; },
    get closeCalls() { return closeCalls; },
    get renderCalls() { return renderCalls; },
    setSession: value => { activeSession = value; }
  };
}

async function verifySuccessAfterAccountSwitch() {
  const request = deferred();
  const harness = createHarness({ register: () => request.promise, listEvents: async () => [{ id: 'should-not-load' }] });
  const pending = harness.run();
  check(harness.registerCalls === 1, 'Registration RPC must start once.');
  harness.setSession({ user: { id: 'synthetic-account-b' }, revision: 2 });
  request.resolve({ ok: true });
  await pending;
  check(harness.closeCalls === 1 && harness.form.isConnected === false,
    'A successful response for the previous account must close the stale registration form.');
  check(harness.listCalls === 0 && harness.db.events[0].id === 'EV-SYNTHETIC',
    'A previous-account response must not refresh or overwrite the current account event list.');
  check(harness.messages.some(message => message.includes('изменился сеанс')),
    'Russian UI must explain that the account changed and the original registration status must be checked.');
}

async function verifyFailureAfterAccountSwitch() {
  const request = deferred();
  const harness = createHarness({
    language: 'KG',
    register: () => request.promise,
    listEvents: async () => []
  });
  const pending = harness.run();
  harness.setSession({ user: { id: 'synthetic-account-b' }, revision: 2 });
  request.reject(new Error('synthetic registration failure'));
  await pending;
  check(harness.closeCalls === 1 && harness.listCalls === 0,
    'A failed response after an account switch must close the stale form and skip list refresh.');
  check(harness.messages.some(message => message.includes('Катталуу учурунда сеанс өзгөрдү')),
    'Kyrgyz UI must explain an account change without implying that the registration definitely failed.');
  check(!harness.messages.includes('synthetic registration failure'),
    'A stale account error must not be presented as an actionable error for the newly active account.');
}

async function verifySessionReplacementDuringRefresh() {
  const listRequest = deferred();
  let markListStarted;
  const listStarted = new Promise(resolve => { markListStarted = resolve; });
  const harness = createHarness({
    register: async () => ({ ok: true }),
    listEvents: () => { markListStarted(); return listRequest.promise; }
  });
  const pending = harness.run();
  await listStarted;
  harness.setSession({ user: { id: 'synthetic-account-a' }, revision: 2 });
  listRequest.resolve([{ id: 'stale-session-list' }]);
  await pending;
  check(harness.listCalls === 1 && harness.db.events[0].id === 'EV-SYNTHETIC',
    'A list response from a replaced session object must not overwrite current account state, even if the user ID is unchanged.');
  check(harness.messages.some(message => message.includes('изменился сеанс')),
    'A session replacement during list refresh must produce the safe account-change notice.');
}

async function verifySameSessionSuccess() {
  const expectedEvents = [{ id: 'EV-SYNTHETIC', registered: 3 }];
  const harness = createHarness({
    register: async () => ({ ok: true }),
    listEvents: async () => expectedEvents
  });
  await harness.run();
  check(harness.closeCalls === 1 && harness.renderCalls === 1,
    'A normal successful registration must close the form and render the refreshed list.');
  check(harness.db.events === expectedEvents && harness.messages.some(message => message.includes('Регистрация сохранена')),
    'A normal successful registration must retain its existing success flow.');
}

async function verifyRecoverableFailure() {
  const harness = createHarness({
    register: async () => { throw new Error('synthetic server rejection'); },
    listEvents: async () => []
  });
  await harness.run();
  check(harness.form.isConnected && harness.button.disabled === false &&
    harness.form.dataset.submitting === 'false' && !harness.form.attributes.has('aria-busy'),
    'A server rejection in the same session must keep the form open and unlock its submit button.');
  check(harness.messages.includes('synthetic server rejection'),
    'A server rejection in the same session must preserve the actionable error message.');
}

try {
  check(Boolean(submitBody), 'Event registration handler must be extractable for the session-race test.');
  if (submitBody) {
    await verifySuccessAfterAccountSwitch();
    await verifyFailureAfterAccountSwitch();
    await verifySessionReplacementDuringRefresh();
    await verifySameSessionSuccess();
    await verifyRecoverableFailure();
  }
} catch (error) {
  failures.push('Synthetic event-registration session-race test crashed: ' + error.message);
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Synthetic event-registration session-isolation checks passed.');
}

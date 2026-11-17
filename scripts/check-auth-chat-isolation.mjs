#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const helperStart = app.indexOf('function resetAccountScopedAssistantState(){');
const helperEnd = app.indexOf('\nconst districtOptions=', helperStart);
const sendStart = app.indexOf('async function sendChat(q,forceLocal=false){');
const sendEnd = app.indexOf('\nfunction addAudit', sendStart);
check(helperStart >= 0 && helperEnd > helperStart,
  'Account-scoped assistant reset helper must exist.');
check(sendStart >= 0 && sendEnd > sendStart,
  'Assistant sendChat function must exist.');

if (!failures.length) {
  const context = {
    state: { chat: [], busy: false, aiConsent: true, pendingQuestion: '' },
    window: {
      YntymakCloud: {
        hostedAIEnabled: () => true,
        getSession: () => ({ user: { id: 'synthetic-account-a' } }),
        askHostedAI: () => context.activeResponse.promise
      }
    },
    closeModal() {
      if (context.modalOpen) {
        context.modalOpen = false;
        context.closedModals++;
      }
    },
    hasPersonalData: () => false,
    render() {},
    modal(...args) { context.modalOpen = true; context.modals.push(args); },
    btn() { return ''; },
    langCode: () => 'ru',
    localAssistant: () => 'локальный ответ',
    activeResponse: null,
    modalOpen: false,
    closedModals: 0,
    modals: []
  };
  vm.createContext(context);
  const source = [
    'let chatSessionRevision=0;',
    app.slice(helperStart, helperEnd),
    app.slice(sendStart, sendEnd),
    'globalThis.api={resetAccountScopedAssistantState,sendChat};'
  ].join('\n');
  try {
    new vm.Script(source, { filename: 'app-assistant-isolation.js' }).runInContext(context);
    let resolveA, resolveB;
    const responseA = new Promise(resolve => { resolveA = resolve; });
    const responseB = new Promise(resolve => { resolveB = resolve; });
    context.activeResponse = { promise: responseA };
    const firstRequest = context.api.sendChat('Вопрос аккаунта A');
    check(context.state.chat.length === 1 && context.state.busy,
      'Account A request should enter its own pending chat state.');

    context.api.resetAccountScopedAssistantState();
    check(context.state.chat.length === 0 &&
      context.state.pendingQuestion === '' &&
      context.state.aiConsent === false &&
      context.state.busy === false,
      'Account change must clear chat, pending consent, and busy state.');

    context.state.aiConsent = true;
    context.activeResponse = { promise: responseB };
    const secondRequest = context.api.sendChat('Вопрос аккаунта B');
    resolveA('Ответ аккаунта A');
    await firstRequest;
    check(context.state.chat.length === 1 &&
      context.state.chat[0].text === 'Вопрос аккаунта B' &&
      context.state.busy === true,
      'Late account A response must not enter B chat or clear B pending state.');

    resolveB('Ответ аккаунта B');
    await secondRequest;
    check(context.state.chat.length === 2 &&
      context.state.chat[0].text === 'Вопрос аккаунта B' &&
      context.state.chat[1].text === 'Ответ аккаунта B' &&
      context.state.busy === false,
      'Current account B response should still be displayed normally.');

    context.state.aiConsent = false;
    await context.api.sendChat('Вопрос A ожидает согласия');
    check(context.state.pendingQuestion === 'Вопрос A ожидает согласия' &&
      context.modals.length === 1 && context.modalOpen,
      'Hosted AI consent must retain the pending question only before account change.');
    context.api.resetAccountScopedAssistantState();
    check(context.state.pendingQuestion === '' &&
      context.state.aiConsent === false &&
      context.state.chat.length === 0 &&
      context.closedModals === 1 &&
      context.modalOpen === false,
      'Account change must invalidate and close the pending hosted-AI consent dialog.');
  } catch (error) {
    failures.push('Assistant isolation harness crashed: ' + error.message);
  }
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Synthetic assistant account-isolation checks passed.');
}

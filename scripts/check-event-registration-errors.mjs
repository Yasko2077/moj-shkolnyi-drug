#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('app.js', 'utf8');
const registrationSql = readFileSync('supabase/patches/20261115_event_registration_consent.sql', 'utf8');
const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const helperStart = app.indexOf('function eventRegistrationErrorMessage(');
const helperEnd = app.indexOf('\nfunction toast(s)', helperStart);
const helperSource = helperStart >= 0 && helperEnd > helperStart
  ? app.slice(helperStart, helperEnd)
  : '';
check(Boolean(helperSource), 'Localized event-registration error helper must exist.');

const context = {};
try {
  if (helperSource) {
    vm.createContext(context);
    new vm.Script(helperSource + '\nglobalThis.resolveEventRegistrationError = eventRegistrationErrorMessage;')
      .runInContext(context);
  }
} catch (error) {
  failures.push('Localized event-registration error helper could not be evaluated: ' + error.message);
}

const expected = [["not_authenticated","Сессия завершилась. Войди снова.","Сеанс аяктады. Кайра кир."],["organizer_access_consent_required","Подтверди согласие на передачу минимальных данных организатору этого мероприятия.","Бул иш-чаранын уюштуруучусуна минималдуу маалыматтарды берүүгө макулдугуңду ыраста."],["event_not_open","Регистрация на это мероприятие закрыта.","Бул иш-чарага катталуу жабылган."],["event_expired","Дата мероприятия уже прошла.","Иш-чаранын күнү өтүп кетти."],["profile_required_for_event_registration","Сначала укажи имя в профиле (от 2 до 70 символов).","Адегенде профилиңе атыңды жаз (2ден 70 белгиге чейин)."],["profile_school_not_active","Школа в профиле сейчас не подтверждена или неактивна. Обратись к уполномоченному представителю.","Профилиңдеги мектеп ырасталган эмес же активдүү эмес. Ыйгарым укуктуу өкүлгө кайрыл."],["school_event_requires_verified_school_scope","Для регистрации на школьное мероприятие требуется подтверждённая школа в профиле.","Мектептеги иш-чарага катталуу үчүн профилиңдеги мектеп ырасталышы керек."],["event_requires_verified_school_in_district","Это районное мероприятие доступно только участникам с подтверждённой школой в этом районе.","Бул райондук иш-чарага ушул райондогу мектеби ырасталган катышуучулар гана каттала алышат."],["invalid_event_scope","Для этого мероприятия сейчас недоступна регистрация. Обратись к организатору.","Бул иш-чарага азыр катталуу мүмкүн эмес. Уюштуруучуга кайрыл."],["already_registered","Ты уже зарегистрирован(а) на это мероприятие.","Сен бул иш-чарага катталгансың."],["event_capacity_reached","Свободные места закончились.","Бош орундар калбады."]];
const sqlCodes = [...registrationSql.matchAll(/raise exception\s+'([^']+)'/gi)].map(match => match[1]).sort();
const expectedCodes = expected.map(([code]) => code).sort();
check(sqlCodes.length > 0, 'Event-registration SQL must expose at least one server error code for coverage.');
check(sqlCodes.join('|') === expectedCodes.join('|'),
  'Every server-side event-registration error code must have an explicit localized mapping.');

if (context.resolveEventRegistrationError) {
  for (const [code, russian, kyrgyz] of expected) {
    check(context.resolveEventRegistrationError(new Error(code), 'RU') === russian,
      'Russian message mismatch for ' + code + '.');
    check(context.resolveEventRegistrationError(new Error(code), 'KG') === kyrgyz,
      'Kyrgyz message mismatch for ' + code + '.');
  }
  const fallbackRu = context.resolveEventRegistrationError(new Error('internal database detail'), 'RU');
  const fallbackKg = context.resolveEventRegistrationError(new Error('internal database detail'), 'KG');
  check(fallbackRu === 'Не удалось зарегистрироваться. Проверь подключение и попробуй ещё раз.',
    'Unknown backend errors must use a safe Russian fallback.');
  check(fallbackKg === 'Катталуу мүмкүн болгон жок. Интернет байланышын текшерип, кайра аракет кыл.',
    'Unknown backend errors must use a safe Kyrgyz fallback.');
  check(!fallbackRu.includes('internal database detail') && !fallbackKg.includes('internal database detail'),
    'Unknown backend details must not be exposed to participants.');
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Localized event-registration error checks passed.');
}

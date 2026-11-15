(() => {
'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const STORE = 'yntymak-09-demo-v1';
const DISTRICTS = [
  {key:'lenin', ru:'Ленинский район', ky:'Ленин району'},
  {key:'pervomai', ru:'Первомайский район', ky:'Биринчи май району'},
  {key:'oktyabr', ru:'Октябрьский район', ky:'Октябрь району'},
  {key:'sverdlov', ru:'Свердловский район', ky:'Свердлов району'}
];
const TXT = {
  RU:{home:'Главная',workspace:'Мой кабинет',ideas:'Предложения',elections:'Выборы',projects:'Проекты и команды',events:'Мероприятия',surveys:'Опросы мнения',news:'Новости и ресурсы',assistant:'ИИ-помощник',profile:'Мой профиль',help:'Помощь и безопасность',admin:'Управление',login:'Войти / регистрация',logout:'Выйти'},
  KG:{home:'Башкы бет',workspace:'Жеке кабинет',ideas:'Сунуштар',elections:'Шайлоолор',projects:'Долбоорлор жана командалар',events:'Иш-чаралар',surveys:'Пикир сурамжылоолору',news:'Жаңылыктар жана ресурстар',assistant:'ЖИ жардамчысы',profile:'Менин профилим',help:'Жардам жана коопсуздук',admin:'Башкаруу',login:'Кирүү / катталуу',logout:'Чыгуу'}
};
const now = new Date();
const dateLabel = d => new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
const seed = {
  profile:{name:'Тестовый участник',school:'Школа № 12 (вымышленный пример)',district:'lenin',grade:'9 класс',about:'Интересуюсь школьными проектами, волонтёрством и командной работой.',interests:['Проекты','Экология'],verified:false},
  ideas:[
    {id:'IDEA-101',title:'Больше мест для отдыха во дворе',description:'Предлагаем обсудить с администрацией школы удобные места для отдыха и озеленение свободной части двора.',category:'Школьная среда',scope:'school',target:'Школа № 12 (вымышленный пример)',district:'lenin',status:'open',created:'2026-11-10',author:'Демо-участник',support:18,response:'Идея передана на предварительное обсуждение ученическому совету.',comments:[]},
    {id:'IDEA-102',title:'Межшкольный клуб дебатов',description:'Создать регулярные встречи команд из разных школ Бишкека для практики публичных выступлений и уважительного обсуждения.',category:'Образование',scope:'city',target:'Весь Бишкек',district:'',status:'review',created:'2026-11-13',author:'Демо-команда',support:31,response:'',comments:[]},
    {id:'IDEA-103',title:'Общий календарь школьных событий района',description:'Собрать открытые ученические мероприятия района в одном календаре, чтобы команды могли участвовать друг у друга.',category:'Сотрудничество',scope:'district',target:'Первомайский район',district:'pervomai',status:'in_progress',created:'2026-11-08',author:'Школьная команда',support:24,response:'Подготовлен черновик календаря.',comments:[]}
  ],
  elections:[
    {id:'EL-101',title:'Президент ученического совета',position:'Президент ученического совета',scope:'school',target:'Школа № 12 (вымышленный пример)',district:'lenin',description:'Учебный сценарий школьных выборов. Круг избирателей, положение и наблюдение должны быть утверждены школой.',stage:'voting',nominationEnd:'2026-11-18',campaignEnd:'2026-11-20',votingStart:'2026-11-15',votingEnd:'2026-11-23',candidates:[{id:'C-101',name:'Алия Н.',program:'Открытая обратная связь, школьные клубы и регулярные встречи ученического совета.',status:'approved'},{id:'C-102',name:'Тимур К.',program:'Командные проекты, дебаты и волонтёрские активности.',status:'approved'}],myVote:null,resultsVisible:false,eligibleLabel:'Демо-профиль школы № 12'},
    {id:'EL-102',title:'Представитель учеников района',position:'Районный представитель',scope:'district',target:'Ленинский район',district:'lenin',description:'Демонстрационный пример выборов районного уровня. Порядок представительства требует отдельного положения.',stage:'nominations',nominationEnd:'2026-11-25',campaignEnd:'2026-11-28',votingStart:'2026-11-29',votingEnd:'2026-12-02',candidates:[],myVote:null,resultsVisible:false,eligibleLabel:'Школы Ленинского района'}
  ],
  projects:[
    {id:'PR-101',title:'Книжный обмен между классами',description:'Поставить полку книгообмена, договориться о правилах и провести первый месячный обмен.',category:'Образование',scope:'school',target:'Школа № 12 (вымышленный пример)',district:'lenin',stage:'planning',owner:'Демо-команда',members:3,created:'2026-11-09',tasks:['Согласовать место с администрацией','Подготовить правила обмена','Провести пробную неделю']},
    {id:'PR-102',title:'Межшкольная эко-неделя',description:'Команды школ района проводят экологические активности и делятся итогами.',category:'Экология',scope:'district',target:'Октябрьский район',district:'oktyabr',stage:'team',owner:'Ученическая команда',members:6,created:'2026-11-12',tasks:['Сформировать команды','Составить календарь','Подготовить итоговый отчёт']}
  ],
  events:[
    {id:'EV-101',title:'Форум школьных инициатив',description:'Встреча ученических команд для обмена идеями, коротких презентаций и поиска партнёров.',date:'2026-12-05',place:'Бишкек · учебная демо-площадка',scope:'city',target:'Весь Бишкек',district:'',capacity:60,registered:18,status:'open',organizer:'Администратор демо'},
    {id:'EV-102',title:'Мастерская школьных проектов',description:'Практическая встреча: цель, команда, бюджет, календарь и оценка результата.',date:'2026-12-12',place:'Школы-участницы · формат уточняется',scope:'district',target:'Ленинский район',district:'lenin',capacity:30,registered:9,status:'open',organizer:'Координатор демо'}
  ],
  registrations:[],
  surveys:[{id:'SV-101',title:'Какие школьные клубы стоит развивать?',description:'Необязательный опрос мнения для планирования внутренней программы.',options:['Дебаты и публичные выступления','Экология и волонтёрство','Технологии и программирование','Творчество и медиа'],votes:[12,18,21,9],myChoice:null,status:'open'}],
  news:[
    {id:'N-1',title:'Ынтымак: пространство для школьных идей',date:'2026-11-15',category:'Платформа',text:'В тестовой версии можно создавать предложения, собирать проектные команды и изучать сценарии ученического участия.'},
    {id:'N-2',title:'Школьное самоуправление и устав школы',date:'2026-11-12',category:'Полезно знать',text:'Порядок формирования школьных советов и их компетенции следует согласовывать с законодательством и уставом образовательной организации.'}
  ],
  audit:[],
  favorites:[],
  notifications:[]
};
function readLocalStore(key){
 try {
  const raw=JSON.parse(localStorage.getItem(key)||'null');
  const data=raw?{...structuredClone(seed),...raw}:structuredClone(seed);
  data.favorites=Array.isArray(data.favorites)?data.favorites:[];
  data.notifications=Array.isArray(data.notifications)?data.notifications:[];
  data.registrations=Array.isArray(data.registrations)?data.registrations:[];
  return data;
 } catch {
  return structuredClone(seed);
 }
}
let activeStore=STORE;
let db=readLocalStore(activeStore);
const state={page:'home',lang:'RU',chat:[],admin:false,realAdmin:false,cloudProfile:false,adminTab:'overview',filter:'all',busy:false,aiConsent:false,pendingQuestion:''};
const t=k=>TXT[state.lang][k]||TXT.RU[k]||k;
const langCode=()=>state.lang==='KG'?'ky':'ru';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=v=>(v||'Ы').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const distName=k=>DISTRICTS.find(x=>x.key===k)?.[state.lang==='KG'?'ky':'ru']||'';
const statusName=s=>({review:'На проверке',open:'Открыто для обсуждения',in_progress:'В работе',accepted:'Принято к реализации',rejected:'Не принято',closed:'Завершено',draft:'Черновик',nominations:'Приём заявок',campaign:'Кампания кандидатов',voting:'Голосование',cancelled:'Отменено',planning:'Планирование',team:'Поиск команды',active:'Выполняется',completed:'Завершён'})[s]||s;
const pageNames={home:'Главная',workspace:'Мой кабинет',ideas:'Предложения',elections:'Выборы',projects:'Проекты и команды',events:'Мероприятия',surveys:'Опросы мнения',news:'Новости и ресурсы',assistant:'ИИ-помощник',profile:'Мой профиль',help:'Помощь и безопасность',admin:'Панель управления'};
function activateAccountStore(){const userId=window.YntymakCloud?.getSession()?.user?.id;const nextStore=userId?`${STORE}:account:${userId}`:STORE;if(nextStore!==activeStore){activeStore=nextStore;db=readLocalStore(activeStore);}}
function persist(){try{localStorage.setItem(activeStore,JSON.stringify(db));}catch{toast('Не удалось сохранить тестовые данные в этом браузере.');}}
function toast(s){const el=document.createElement('div');el.className='toast';el.textContent=s;$('#toastRegion').append(el);setTimeout(()=>el.remove(),4200);}
function heading(kicker,title,desc,action=''){return `<div class="page-heading"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${action?`<div class="heading-actions">${action}</div>`:''}</div>`;}
function tag(s,cls=''){return `<span class="tag ${cls}">${esc(s)}</span>`;}
function btn(label,attrs='',cls=''){return `<button class="btn ${cls}" ${attrs}>${label}</button>`;}
function scopeLabel(x){return x==='school'?'Школа':x==='district'?'Район':'Весь Бишкек';}
function addNotification(title,detail,type='info'){db.notifications.unshift({id:'NT-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),title,detail,type,createdAt:new Date().toISOString(),read:false});db.notifications=db.notifications.slice(0,40);persist();}
function isFavorite(type,id){return db.favorites.some(x=>x.type===type&&x.id===id);}
function favoriteButton(type,id){const saved=isFavorite(type,id);return `<button class="icon-action ${saved?'is-saved':''}" type="button" data-favorite-type="${esc(type)}" data-favorite-id="${esc(id)}" aria-label="${saved?'Убрать из избранного':'Сохранить в избранное'}" title="${saved?'Убрать из избранного':'Сохранить в избранное'}">${saved?'★':'☆'}</button>`;}
function toggleFavorite(type,id){const i=db.favorites.findIndex(x=>x.type===type&&x.id===id);if(i>=0){db.favorites.splice(i,1);toast('Убрано из избранного.');}else{db.favorites.unshift({type,id,addedAt:new Date().toISOString()});toast('Сохранено в избранное.');}persist();render();}
function favoriteItem(item){if(!item)return '';return item.type==='idea'?db.ideas.find(x=>x.id===item.id):item.type==='project'?db.projects.find(x=>x.id===item.id):item.type==='event'?db.events.find(x=>x.id===item.id):null;}
function updateShell(){
 document.documentElement.lang=state.lang==='KG'?'ky':'ru';
 const p=db.profile,session=window.YntymakCloud?.getSession();
 $('#sidebarName').textContent=p.name||'Гость';
 $('#sidebarMeta').textContent=session?(state.realAdmin?'Администратор':'Тестировщик'):(p.school||'Демо-профиль');
 $('#sidebarAvatar').textContent=initials(p.name);
 $('#topAvatar').textContent=initials(p.name);
 $('#crumb').textContent=state.page==='workspace'?t('workspace'):(pageNames[state.page]||'Ынтымак');
 $('#ideaCount').textContent=db.ideas.filter(x=>x.status==='open').length;
 $('#environmentLabel').textContent=state.realAdmin?'ЫНТЫМАК · ПОДТВЕРЖДЁННЫЙ АДМИНИСТРАТОР':session?'ЫНТЫМАК · АККАУНТ ТЕСТИРОВЩИКА':'ЫНТЫМАК · ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР';
 $('#modeLabel').textContent=state.realAdmin?'Администратор · модули в тестировании':session?'Тестировщик · облачный вход':'Демо-режим';
 $('#authButton').textContent=session?'Аккаунт / профиль':t('login');
 $('#signOutButton').hidden=!session;
 $('#adminNav').hidden=!state.realAdmin;
 $('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));
 $('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;el.textContent=t(key);});
 $('#languageBtn').innerHTML=state.lang==='RU'?'RU <span>·</span> KG':'KG <span>·</span> RU';
}
function home(){
 const kg=state.lang==='KG';
 const t=kg?{
  eyebrow:'БИШКЕК · ОКУУЧУЛАРДЫН ӨЗҮН-ӨЗҮ БАШКАРУУСУ',
  title:'Шаар окуучулар катышканда өзгөрөт.',
  intro:'Ынтымак — Бишкектеги мектеп окуучулары үчүн бирдиктүү мейкиндик. Идея сунушта, команда түз, долбоорлорго жана иш-чараларга катыш.',
  join:'Тестирлөөгө кошулуу',explore:'Мүмкүнчүлүктөрдү көрүү',
  status:'СЫНОО ВЕРСИЯСЫ',statusTitle:'Ынтымакты бирге текшеребиз',
  statusText:'Азыр бул жерде демонстрациялык мисалдар көрсөтүлөт. Жаңы аккаунт «Сыноочу» макамын алат; администратор укуктары өзүнчө дайындалат.',
  facts:[['4','Бишкек району'],['2','тил: RU / KG'],['1','окуучулар платформасы']],
  featuresTitle:'Окуучулар үчүн бирдиктүү мейкиндик',
  featuresIntro:'Мектептеги демилгеден шаардык кызматташууга чейин.',
  features:[
   ['✳','Сунуштар','Мектептин чөйрөсүн жакшыртуу боюнча идеяларды бер жана алардын каралуу абалын көр.','ideas','Сунуштарга өтүү'],
   ['↗','Долбоорлор жана командалар','Долбоор түз, катышууга арыз бер, тапшырмаларды жана команданын ишин уюштур.','projects','Долбоорлорду көрүү'],
   ['▦','Иш-чаралар','Иш-чараларды карап, уюштуруучуга керектүү маалыматтарды гана берип каттал.','events','Календарды ач'],
   ['✧','ЖИ жардамчысы','Иш-чаранын планын, долбоордун паспортун жана эки тилдеги билдирүүлөрдү даярда.','assistant','Жардамчыны ач']
  ],
  pathTitle:'Кантип катышса болот?',
  steps:[['01','Аккаунт түз','Өзүң колдонууга уруксат берилген email менен катталып, почтаңды ырастап кир.'],['02','Долбоорду танда','Өзүңө кызыктуу сунушту, команданы же иш-чараны тап.'],['03','Идеяңды ишке ашыр','Команда менен иштеп, натыйжасын бөлүш.']],
  districtsTitle:'Бишкектин төрт району',
  districts:['Ленин району','Биринчи май району','Октябрь району','Свердлов району'],
  safetyTitle:'Коопсуздук биринчи орунда',
  safetyText:'Башка окуучулардын жеке маалыматтарын, телефон номерлерин, даректерин же документтерин жарыялаба. Кооптуу жагдай болсо, ишенимдүү чоң кишиге кайрыл.',
  catalog:'Мектептердин расмий каталогу ↗',tester:'Тест аккаунтун түзүү'
 }:{
  eyebrow:'БИШКЕК · УЧЕНИЧЕСКОЕ САМОУПРАВЛЕНИЕ',
  title:'Город меняется, когда ученики участвуют.',
  intro:'Ынтымак — единое пространство для школьников Бишкека. Предлагай идеи, собирай команды, участвуй в проектах и школьных событиях.',
  join:'Присоединиться к тестированию',explore:'Посмотреть возможности',
  status:'ТЕСТОВАЯ ВЕРСИЯ',statusTitle:'Создаём Ынтымак вместе',
  statusText:'Сейчас в интерфейсе показаны демонстрационные примеры. Новый аккаунт получает статус «Тестировщик», а права администратора назначаются отдельно.',
  facts:[['4','района Бишкека'],['2','языка: RU / KG'],['1','городская платформа']],
  featuresTitle:'Всё для ученического участия',
  featuresIntro:'От инициативы в своей школе до сотрудничества по всему городу.',
  features:[
   ['✳','Предложения','Предлагай идеи для улучшения школьной среды и отслеживай их рассмотрение.','ideas','Перейти к предложениям'],
   ['↗','Проекты и команды','Создавай проекты, подавай заявки в команды и работай с задачами.','projects','Открыть проекты'],
   ['▦','Мероприятия','Изучай события и регистрируйся, передавая организатору только необходимые данные.','events','Открыть календарь'],
   ['✧','ИИ-помощник','Готовь планы мероприятий, паспорта проектов и объявления на двух языках.','assistant','Открыть помощника']
  ],
  pathTitle:'Как начать участвовать?',
  steps:[['01','Создай аккаунт','Зарегистрируйся с разрешённой для тебя почтой, подтверди адрес и войди.'],['02','Выбери направление','Найди инициативу, проектную команду или мероприятие.'],['03','Воплоти идею','Работай с командой, отмечай задачи и делись результатом.']],
  districtsTitle:'Четыре района Бишкека',
  districts:['Ленинский район','Первомайский район','Октябрьский район','Свердловский район'],
  safetyTitle:'Безопасность — прежде всего',
  safetyText:'Не публикуй чужие персональные данные, телефоны, адреса и документы. При опасной ситуации обратись к взрослому, которому доверяешь.',
  catalog:'Официальный каталог школ ↗',tester:'Создать аккаунт тестировщика'
 };
 return `
 <section class="portal-hero">
  <div class="portal-hero-copy">
   <div class="portal-eyebrow"><span class="portal-pulse"></span>${t.eyebrow}</div>
   <h1>${t.title}</h1>
   <p class="portal-intro">${t.intro}</p>
   <div class="portal-cta">
    ${btn(t.join,'data-action="open-auth"')}
    ${btn(t.explore,'data-page="projects"','btn-outline')}
   </div>
   <div class="portal-trustline"><span>⌁</span> ${kg?'Окуучулардын үнү маанилүү':'Голос каждого ученика имеет значение'}</div>
  </div>
  <div class="portal-hero-visual" aria-hidden="true">
   <div class="portal-ornament portal-ornament-a"></div><div class="portal-ornament portal-ornament-b"></div>
   <div class="portal-emblem"><svg viewBox="0 0 180 180" role="presentation"><path d="M90 7 173 90 90 173 7 90Z"/><path d="M90 28 152 90 90 152 28 90Z"/><path d="M90 49 131 90 90 131 49 90Z"/><path d="M7 90h166M90 7v166"/><circle cx="90" cy="90" r="8"/></svg><strong>Ы</strong></div>
   <div class="portal-visual-caption"><span>БИРГЕ</span><i></i><span>БИШКЕК</span><i></i><span>КЕЛЕЧЕК</span></div>
   <div class="portal-floating-card"><span class="portal-mini-icon">✳</span><span><b>${kg?'Идеядан':'От идеи'}</b><small>${kg?'натыйжага':'к результату'}</small></span><span class="portal-arrow">↗</span></div>
  </div>
 </section>
 <section class="portal-status card">
  <div class="portal-status-mark">i</div><div class="portal-status-copy"><span class="portal-status-kicker">${t.status}</span><strong>${t.statusTitle}</strong><p>${t.statusText}</p></div>
  <button class="btn btn-soft" type="button" data-action="open-auth">${t.tester}</button>
 </section>
 <section class="portal-facts" aria-label="Платформа">
  ${t.facts.map(x=>`<div class="portal-fact"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('')}
 </section>
 <section class="portal-section">
  <div class="portal-section-head"><div><span class="eyebrow">${kg?'МҮМКҮНЧҮЛҮКТӨР':'ВОЗМОЖНОСТИ'}</span><h2>${t.featuresTitle}</h2><p>${t.featuresIntro}</p></div></div>
  <div class="portal-feature-grid">
   ${t.features.map(x=>`<article class="portal-feature card"><div class="portal-feature-icon">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p><button class="portal-link" type="button" data-page="${x[3]}">${x[4]} <span>↗</span></button></article>`).join('')}
  </div>
 </section>
 <section class="portal-section portal-path-section">
  <div class="portal-section-head"><div><span class="eyebrow">${kg?'КАТЫШУУ ЖОЛУ':'ТРИ ПРОСТЫХ ШАГА'}</span><h2>${t.pathTitle}</h2></div></div>
  <div class="portal-steps">${t.steps.map(x=>`<article class="portal-step"><span>${x[0]}</span><div><h3>${x[1]}</h3><p>${x[2]}</p></div></article>`).join('')}</div>
 </section>
 <section class="portal-bottom-grid">
  <div class="card portal-districts"><span class="eyebrow">${kg?'БИШКЕК ШААРЫ':'ТЕРРИТОРИЯ ПРОЕКТА'}</span><h2>${t.districtsTitle}</h2><div class="portal-district-list">${t.districts.map((x,i)=>`<span><i>${String(i+1).padStart(2,'0')}</i>${x}</span>`).join('')}</div><a class="portal-external-link" href="https://edu.e-meria.kg/schools" target="_blank" rel="noopener">${t.catalog}</a></div>
  <div class="portal-safety"><div class="portal-safety-icon">⌑</div><h2>${t.safetyTitle}</h2><p>${t.safetyText}</p><button class="btn btn-outline" type="button" data-page="help">${kg?'Коопсуздук эрежелери':'Правила безопасности'} ↗</button></div>
 </section>
 <section class="portal-final-cta">
  <div><span class="eyebrow">ЫНТЫМАК · БИШКЕК</span><h2>${kg?'Сенин идеяң маанилүү.':'Твоя идея важна.'}</h2><p>${kg?'Кел, мектептердин ортосундагы кызматташууну чогуу өнүктүрөлү.':'Присоединяйся к тестированию и помоги сделать школьное сообщество сильнее.'}</p></div>
  ${btn(t.join,'data-action="open-auth"')}
 </section>`;
}
function ideaCard(x){return `<article class="idea-card"><div class="card-topline">${tag(x.category,'blue')}${tag(statusName(x.status),x.status==='review'?'gold':'')}</div><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><div class="meta-line"><span>${scopeLabel(x.scope)} · ${esc(x.target)}</span><span>${dateLabel(x.created)}</span></div><div class="card-bottom"><span class="small-note">${x.support} откликов · внутреннее обсуждение</span><div class="action-row">${btn('Подробнее','data-view-idea="'+esc(x.id)+'"','btn-outline btn-small')}${favoriteButton('idea',x.id)}${x.status==='open'?(x.supportedByMe?'<button class="btn btn-small btn-soft" disabled>Поддержано</button>':btn('Поддержать','data-support-idea="'+esc(x.id)+'"','btn-soft btn-small')):''}</div></div></article>`;}
function ideas(){const visible=db.ideas.filter(x=>x.status!=='review'||state.realAdmin);return `${heading('ИДЕИ И ОБРАТНАЯ СВЯЗЬ','Предложения сообщества','Внутреннее обсуждение школьных улучшений. Это не юридическая петиция и не официальный канал обращений.',btn('＋ Создать предложение','data-action="new-idea"'))}<div class="notice gold" style="margin-bottom:14px">Можно описывать школьные задачи и предлагать решения. Не добавляй персональные жалобы и сведения о конкретных людях. Поддержка идеи — необязательное мнение, а не юридическая подпись.</div><div class="toolbar"><input class="search-input" id="ideaSearch" placeholder="Поиск по предложениям…"><select class="filter-select" id="ideaScope"><option value="all">Все территории</option><option value="school">Школа</option><option value="district">Район</option><option value="city">Город</option></select><select class="filter-select" id="ideaStatus"><option value="all">Все статусы</option><option value="open">Обсуждается</option><option value="in_progress">В работе</option><option value="accepted">Принято</option></select></div><div class="list-grid" id="ideaList">${visible.map(ideaCard).join('')||'<div class="empty-state">Пока нет доступных предложений. Создай первую идею.</div>'}</div>`;}
function electionCard(e){const stages={draft:['Черновик','gray'],nominations:['Приём заявок','gold'],campaign:['Кампания','blue'],voting:['Голосование',''],closed:['Завершено','gray'],cancelled:['Отменено','red']};const [s,c]=stages[e.stage]||['Подготовка','gray'];const approved=e.candidates.filter(c=>c.status==='approved').length;return `<article class="election-card"><div class="card-topline">${tag(e.scope==='school'?'Школьный уровень':e.scope==='district'?'Районный уровень':'Городской уровень','blue')}${tag(s,c)}</div><h3>${esc(e.title)}</h3><p>${esc(e.description)}</p><div class="meta-line"><span>${esc(e.position)}</span><span>${esc(e.target)}</span></div><div class="metric-line"><span>Кандидатов, допущенных к участию</span><strong>${approved}</strong></div><div class="card-bottom"><span class="small-note">${dateLabel(e.votingStart)} — ${dateLabel(e.votingEnd)} · тестовый сценарий</span>${btn('Открыть','data-view-election="'+esc(e.id)+'"','btn-small')}</div></article>`;}
function elections(){return `${heading('ПРЕДСТАВИТЕЛЬСТВО','Выборы ученического самоуправления','Школьный, районный и городской уровни. Правила допуска и компетенции должны соответствовать положению совета и уставу школы.') }<div class="notice gold" style="margin-bottom:14px">Голосование в этой версии — учебная демонстрация в одном браузере. Оно не обеспечивает тайну голоса и не может использоваться для официальных выборов. Кандидатура подаётся бесплатно; административный допуск к реальным выборам определяется утверждённым положением.</div><div class="list-grid">${db.elections.map(electionCard).join('')||'<div class="empty-state">Пока нет опубликованных выборов.</div>'}</div>`;}
function projectCard(p){const stage={idea:'Идея',team:'Поиск команды',planning:'Планирование',active:'Выполняется',completed:'Завершён'};return `<article class="project-card"><div class="card-topline">${tag(p.category,'blue')}${tag(stage[p.stage]||p.stage,p.stage==='active'?'':'gold')}</div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="meta-line"><span>${esc(p.target)}</span><span>${p.members} участников команды</span></div><div class="card-bottom"><span class="small-note">Автор: ${esc(p.owner)}</span>${btn('Открыть проект','data-view-project="'+esc(p.id)+'"','btn-small btn-outline')}${favoriteButton('project',p.id)}${p.canManage?'<span class="tag blue">Твой проект</span>':p.joinedByMe?'<button class="btn btn-small btn-soft" disabled>Заявка отправлена</button>':btn('В команду','data-join-project="'+esc(p.id)+'"','btn-small btn-soft')}</div></article>`;}
function projects(){return `${heading('ОТ ЗАМЫСЛА К РЕЗУЛЬТАТУ','Проекты и команды','Создавай инициативы, находи участников и дели большой план на небольшие задачи.',btn('＋ Новый проект','data-action="new-project"'))}<div class="notice" style="margin-bottom:14px">Не публикуй личные контакты участников. Для координации используй школьного руководителя проекта или утверждённые каналы связи.</div><div class="list-grid">${db.projects.map(projectCard).join('')||'<div class="empty-state">Пока проектов нет. Создай первый.</div>'}</div>`;}
function eventRow(e){const day=new Date(`${e.date}T12:00:00`).getDate();return `<div class="event-row"><div class="event-datebox">${day}</div><div class="event-row-body"><h3>${esc(e.title)}</h3><p>${dateLabel(e.date)} · ${esc(e.place)}</p><div class="small-note" style="margin-top:6px">${e.registered}/${e.capacity} мест занято</div></div>${favoriteButton('event',e.id)}${btn('Подробнее','data-view-event="'+esc(e.id)+'"','btn-small btn-outline')}${btn('Записаться','data-register-event="'+esc(e.id)+'"','btn-small')}</div>`;}
function events(){
 const openEvents=db.events.filter(e=>e.status==='open').sort((a,b)=>a.date.localeCompare(b.date));
 const categories=[...new Set(openEvents.map(e=>e.category||'Другое'))].sort((a,b)=>a.localeCompare(b,'ru'));
 const categoryOptions=categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
 const cards=openEvents.map(e=>{
  const mine=db.registrations.some(r=>r.eventId===e.id&&r.owner==='local-profile');
  const search=[e.title,e.description,e.place,e.category].join(' ').toLocaleLowerCase();
  return '<article class="event-card" data-event-card data-search="'+esc(search)+'" data-category="'+esc(e.category||'Другое')+'" data-date="'+esc(e.date)+'" data-mine="'+(mine?'yes':'no')+'">'+eventRow(e)+'<p>'+esc(e.description)+'</p></article>';
 }).join('');
 return heading('КАЛЕНДАРЬ И ВОЗМОЖНОСТИ','Мероприятия','Форумы, конкурсы, встречи и волонтёрские программы. Имена участников не показываются в публичной части','<button class="btn btn-outline btn-small" data-page="workspace">Мои регистрации</button>')
 + '<div class="notice gold" style="margin-bottom:14px">В прототипе заявки хранятся локально в этом браузере. Полный список имён доступен только администратору в локальном демонстрационном кабинете; для реальной работы нужны серверные права и проверка доступа организатора.</div>'
 + '<section class="card event-filters" aria-label="Фильтры мероприятий"><div class="toolbar"><input class="search-input" id="eventSearch" type="search" placeholder="Поиск по названию, описанию или месту…" aria-label="Поиск мероприятий"><select class="filter-select" id="eventCategory" aria-label="Категория мероприятия"><option value="all">Все категории</option>'+categoryOptions+'</select><select class="filter-select" id="eventTime" aria-label="Срок мероприятия"><option value="all">Любая дата</option><option value="upcoming">Только предстоящие</option><option value="registered">Мои регистрации</option></select><button class="btn btn-small btn-outline" type="button" data-event-reset>Сбросить</button></div><div class="meta-line"><span id="eventResultCount">'+openEvents.length+' мероприятий</span><span class="small-note">Фильтры работают в этом браузере</span></div></section>'
 + '<div class="stack" id="eventList">'+(cards||'<div class="empty-state">Открытых мероприятий пока нет.</div>')+'</div><div class="empty-state" id="eventNoResults" hidden>По этим условиям мероприятий не найдено. Попробуй изменить фильтры.</div>';
}
function applyEventFilters(){
 const search=($('#eventSearch')?.value||'').trim().toLocaleLowerCase();
 const category=$('#eventCategory')?.value||'all';
 const time=$('#eventTime')?.value||'all';
 const today=new Date();today.setHours(0,0,0,0);
 let visible=0;
 $$('#eventList [data-event-card]').forEach(card=>{
  const date=new Date(card.dataset.date+'T12:00:00');
  const matchSearch=!search||card.dataset.search.includes(search);
  const matchCategory=category==='all'||card.dataset.category===category;
  const matchTime=time==='all'||(time==='upcoming'&&date>=today)||(time==='registered'&&card.dataset.mine==='yes');
  const show=matchSearch&&matchCategory&&matchTime;
  card.hidden=!show;if(show)visible++;
 });
 const count=$('#eventResultCount');if(count)count.textContent=visible+' из '+$$('#eventList [data-event-card]').length+' мероприятий';
 const empty=$('#eventNoResults');if(empty)empty.hidden=visible!==0;
}
function surveys(){return `${heading('МНЕНИЕ СООБЩЕСТВА','Опросы и консультации','Короткие необязательные опросы помогают планировать школьные активности. Это не выборы, не петиции и не юридически значимые решения.') }<div class="stack">${db.surveys.map(s=>{const total=s.votes.reduce((a,b)=>a+b,0);return `<article class="card"><div class="card-topline">${tag('Необязательный опрос','blue')}${tag(s.status==='open'?'Открыт':'Завершён',s.status==='open'?'':'gray')}</div><h3 style="font:800 16px Manrope;margin:10px 0 5px">${esc(s.title)}</h3><p class="card-sub">${esc(s.description)}</p>${s.options.map((o,i)=>{const pct=total?Math.round(s.votes[i]/total*100):0;return `<div style="margin-top:12px"><div class="meta-line" style="justify-content:space-between"><span>${esc(o)}</span><strong>${pct}%</strong></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;}).join('')}<div class="card-bottom"><span class="small-note">${total} ответов · результаты только в демо-браузере</span>${s.status==='open'?btn(s.myChoice===null?'Ответить на опрос':'Ответ сохранён','data-vote-survey="'+esc(s.id)+'"',s.myChoice===null?'btn-small':'btn-small btn-outline'):''}</div></article>`;}).join('')||'<div class="empty-state">Пока нет активных опросов.</div>'}</div>`;}
function news(){return `${heading('ГОРОДСКОЕ СООБЩЕСТВО','Новости и полезные ресурсы','Обновления платформы и ссылки на официальные образовательные источники.') }<div class="home-grid"><section class="card">${db.news.map(n=>`<div class="feed-note"><span class="feed-date">${esc(dateLabel(n.date))}</span><div><strong>${esc(n.title)}</strong><p>${esc(n.text)}</p>${tag(n.category||'Объявление','blue')}</div></div>`).join('')}</section><aside class="stack"><a class="resource-card" href="https://edu.e-meria.kg/schools" target="_blank" rel="noopener"><span class="resource-icon">▦</span><strong>Департамент образования мэрии Бишкека</strong><p>Каталог школ, районных центров, образовательные организации и официальные обновления.</p></a><a class="resource-card" href="https://edu.gov.kg/organizations/8/pages/287/" target="_blank" rel="noopener"><span class="resource-icon">§</span><strong>Закон КР «Об образовании»</strong><p>Права обучающихся и рамки соуправления образовательными организациями.</p></a><a class="resource-card" href="https://cbd.minjust.gov.kg/112665/edition/39974/ru" target="_blank" rel="noopener"><span class="resource-icon">⚖</span><strong>Текст закона в базе Минюста</strong><p>Проверяй актуальную редакцию нормативного акта.</p></a></aside></div>`;}
function assistant(){const hello=state.lang==='KG'?'Салам! Мен Ынтымак — Бишкек мектептериндеги окуучулардын демилгелерине жардам берген санарип жардамчымын.':'Привет! Я Ынтымак — цифровой помощник для школьных инициатив Бишкека. Помогаю превращать идеи в понятные планы, готовить документы и организовывать безопасные мероприятия.';return `${heading('ШКОЛЬНЫЙ ПОМОЩНИК БИШКЕКА','Помощник Ынтымак','Контекст: школьное самоуправление, проекты, события, школьные команды и четыре района Бишкека.') }<div class="assistant-layout"><section class="card chat-card"><div class="chat-head"><div class="ai-orb">✧</div><div><strong>Ынтымак · школьный навигатор</strong><small id="aiModeLabel">${window.YntymakCloud?.hostedAIEnabled()&&window.YntymakCloud?.configured()?'Внешняя модель через защищённую функцию · нужен вход и согласие':'Локальный помощник · без внешней модели'}</small></div></div><div class="chat-log" id="chatLog">${state.chat.length?state.chat.map(m=>`<div class="bubble ${m.who==='user'?'user':'bot'}">${esc(m.text)}</div>`).join(''):`<div class="bubble bot">${esc(hello)}\n\nЯ могу помочь с ученическим советом, планом проекта, школьным мероприятием, нейтральным положением о выборах, внутренним предложением или двуязычным объявлением. Не отправляй персональные данные.</div>`}</div><form id="chatForm" class="chat-form"><input id="chatInput" maxlength="1200" autocomplete="off" placeholder="Опиши задачу без личных данных…" required><button class="btn btn-small" type="submit" ${state.busy?'disabled':''}>Отправить ↗</button></form><p class="lang-hint">История диалога существует только пока открыта эта вкладка и не сохраняется в локальном профиле.</p></section><aside class="stack"><div class="card"><div class="card-title">Готовые инструменты</div><div class="prompt-list"><button class="prompt-button" data-prompt="Составь паспорт школьного проекта: проблема, цель, аудитория, команда, этапы на 4 недели, ресурсы с нулевым бюджетом, риски и показатели результата.">Паспорт проекта на 4 недели</button><button class="prompt-button" data-prompt="Подготовь нейтральный шаблон положения о школьном ученическом совете: цели, компетенции, состав, срок полномочий, порядок выдвижения и выборов, прозрачность, апелляции и согласование с уставом школы.">Шаблон положения ученсовета</button><button class="prompt-button" data-prompt="Составь безопасный план школьного мероприятия: согласования, роли взрослого координатора, доступность, вместимость, регистрация с минимумом данных, план отмены и оценка результата.">План безопасного мероприятия</button><button class="prompt-button" data-prompt="Составь повестку первого заседания ученического совета на 45 минут с решениями, ответственными и сроками.">Повестка заседания совета</button><button class="prompt-button" data-prompt="Помоги написать внутреннее предложение для школы по структуре: проблема, факты без персональных данных, решение, ресурсы, ответственный и критерий успеха.">Конструктор предложения</button><button class="prompt-button" data-prompt="Сделай нейтральный чек-лист организации школьных выборов: положение, допуск, равные условия кандидатов, тайна голосования, наблюдение, подсчёт, публикация итогов и апелляция.">Чек-лист выборов</button><button class="prompt-button" data-prompt="Подготовь двуязычное объявление на русском и кыргызском о школьном мероприятии. Оставь поля для даты, места и контакта взрослого координатора; не выдумывай данные.">Объявление RU + KG</button><button class="prompt-button" data-prompt="Оцени идею школьного проекта по критериям: польза, выполнимость, безопасность, доступность, нулевой бюджет и измеримый результат. Предложи улучшения.">Проверка идеи</button></div></div><div class="card"><div class="card-title">Контекст Бишкека</div><div class="assistant-scope"><span>Ленинский</span><span>Первомайский</span><span>Октябрьский</span><span>Свердловский</span></div><p class="card-sub" style="margin-top:12px">Район профиля: ${esc(distName(db.profile.district)||'не указан')}. Это пользовательский выбор, не подтверждение школы или адреса.</p><p class="card-sub">Официальные сведения о школах проверяй в каталоге Департамента образования. Помощник не выдумывает школьные контакты и расписание.</p><a class="text-action" href="https://edu.e-meria.kg/schools" target="_blank" rel="noopener">Официальный каталог ↗</a></div><div class="notice gold">Внешняя языковая модель выключена по умолчанию. При включении вопрос и ограниченный контекст диалога отправляются через серверную функцию; требуется отдельное согласие. Не передавай чувствительные истории, имена, контакты, документы или пароли.</div></aside></div>`;}
async function loadCloudProfile(){
 if(!window.YntymakCloud?.getSession()){state.cloudProfile=false;activateAccountStore();return;}
 activateAccountStore();
 state.cloudProfile=true;
 try{
  const p=await window.YntymakCloud.getMyProfile();
  if(!p) throw new Error('Профиль аккаунта ещё не создан.');
  if(['ru','ky'].includes(p.preferredLanguage)) state.lang=p.preferredLanguage==='ky'?'KG':'RU';
  db.profile={...db.profile,name:p.displayName||'Участник',school:p.schoolName||'',district:p.districtKey||'',grade:p.gradeLabel||'',accountType:p.accountType||'tester',verified:Boolean(p.schoolId),about:db.profile.source==='cloud'?(db.profile.about||''):'',source:'cloud'};
  persist();
 }catch(err){
  db.profile={...db.profile,name:'Участник',school:'',district:'',grade:'',verified:false,about:db.profile.source==='cloud'?(db.profile.about||''):'',source:'cloud'};
  console.warn('Cloud profile unavailable:',err.message);
  throw err;
 }
}
function profile(){
 const p=db.profile,regs=db.registrations.filter(r=>r.owner==='local-profile');
 const cloudMode=state.cloudProfile&&Boolean(window.YntymakCloud?.getSession());
 const tx=state.lang==='KG'?{
  kicker:'ЖЕКЕ КАБИНЕТИҢ',title:'Менин профилим',
  description:'Кызыгууларыңды жана классыңды көрсөт. «Өзүм жөнүндө» талаасы кызмат ордун ырастабайт жана платформада башкаруу укугун бербейт.',
  schoolNotConfirmed:'Мектеп ырастала элек',pendingSchool:'Азырынча ырасталган эмес',districtPending:'Мектеп ырасталгандан кийин аныкталат',
  noticeCloud:'Мектепти ыйгарым укуктуу, текшерилген өкүл гана бекитет. Аны же районду өз алдынча өзгөртө албайсың.',
  noticeLocal:'Мектепке таандык экениңди ыйгарым укуктуу чоң киши өзүнчө ырастайт. Демо нускага документтерди же жеке маалыматтарды жүктөбө.',
  editProfile:'Профилди өзгөртүү',displayName:'Көрсөтүлүүчү ысым',school:'Мектеп',district:'Район',
  grade:'Класс',gradePlaceholder:'Мисалы, 9-класс',about:'Өзүм жөнүндө / Ишмердигим',
  aboutPlaceholder:'Кызыгууларың, долбоорлоруң жана тажрыйбаң тууралуу жаз…',
  aboutCloudNote:'Бул талаа ушул браузерде гана сакталат, жарыяланбайт жана булутка жөнөтүлбөйт. Жеке байланыш маалыматтарын же башка адамдар тууралуу маалыматтарды жазба.',
  aboutLocalNote:'Бул талаа ушул браузерде гана сакталат. Башка адамдардын аты-жөнүн, байланыш маалыматтарын жана купуя маалыматтарды жазба.',
  cloudHint:'Булуттагы аккаунтта аты, тили жана классы гана синхрондолот. Мектепти текшерилген өкүл дайындайт.',
  localHint:'Бул браузердеги демонстрациялык профиль; өзгөрүүлөр башка колдонуучуларга берилбейт.',
  save:'Сактоо',regs:'Иш-чараларга катталууларым',
  none:'Бул браузерде азырынча катталуулар жок. Катышуучулардын толук тизмеси жалпыга көрсөтүлбөйт.',
  verified:'Мектеп ырасталды',unverified:'Мектеп ырастала элек',testerBadge:'Сыноочу аккаунт',adminBadge:'Ыйгарым укуктуу өкүл',demoBadge:'Демо профиль'
 }:{
  kicker:'ТВОЯ УЧЁТНАЯ ЗАПИСЬ',title:'Мой профиль',
  description:'Укажи интересы и класс. Поле «О себе» не подтверждает должность и не выдаёт административные права.',
  schoolNotConfirmed:'Школа не подтверждена',pendingSchool:'Пока не подтверждена',districtPending:'Определится после подтверждения школы',
  noticeCloud:'Школа назначается только подтверждённым представителем. Самостоятельно изменить её или район нельзя.',
  noticeLocal:'Подтверждение принадлежности к школе выполняется отдельно уполномоченным взрослым координатором. Не прикладывай документы и личные данные в демо.',
  editProfile:'Редактировать профиль',displayName:'Имя для отображения',school:'Школа',district:'Район',
  grade:'Класс',gradePlaceholder:'Например, 9 класс',about:'О себе / Моя деятельность',
  aboutPlaceholder:'Расскажи об интересах, проектах и опыте…',
  aboutCloudNote:'Это поле сохраняется только в этом браузере, не публикуется и не отправляется в облако. Не пиши личные контакты или сведения о других людях.',
  aboutLocalNote:'Поле хранится только в этом браузере. Не пиши ФИО других людей, контакты и закрытую информацию.',
  cloudHint:'В облачном аккаунте синхронизируются только имя, язык и класс. Школу назначает проверенный представитель.',
  localHint:'Это локальный демонстрационный профиль; изменения не передаются другим пользователям.',
  save:'Сохранить профиль',regs:'Мои регистрации на события',
  none:'Личных регистраций в этом браузере пока нет. Полный список участников публично не отображается.',
  verified:'Школа подтверждена',unverified:'Школа не подтверждена',testerBadge:'Аккаунт тестировщика',adminBadge:'Уполномоченный администратор',demoBadge:'Демо-профиль'
 };
 const schoolControl=cloudMode
  ? '<input value="'+esc(p.school||tx.pendingSchool)+'" readonly disabled>'
  : '<input name="school" maxlength="120" value="'+esc(p.school)+'" placeholder="'+esc(tx.school)+'">';
 const districtControl=cloudMode
  ? '<input value="'+esc(distName(p.district)||tx.districtPending)+'" readonly disabled>'
  : '<select name="district">'+DISTRICTS.map(d=>'<option value="'+d.key+'" '+(p.district===d.key?'selected':'')+'>'+esc(d[state.lang==='KG'?'ky':'ru'])+'</option>').join('')+'</select>';
 const isPrivileged=cloudMode&&Boolean(window.YntymakCloud?.isAdmin?.());
 const accountBadge=cloudMode?(isPrivileged?tx.adminBadge:tx.testerBadge):tx.demoBadge;
 return `${heading(tx.kicker,tx.title,tx.description)}
 <div class="profile-grid"><section class="card profile-card"><div class="profile-big-avatar">${esc(initials(p.name))}</div><h2>${esc(p.name)}</h2><p>${esc(p.school||tx.schoolNotConfirmed)}</p>${tag(accountBadge,isPrivileged?'gold':'blue')} ${tag(p.verified?tx.verified:tx.unverified,p.verified?'':'gold')}<div class="notice gold" style="text-align:left;margin-top:16px">${cloudMode?tx.noticeCloud:tx.noticeLocal}</div></section>
 <section class="card"><div class="card-title">${tx.editProfile}</div><form id="profileForm" class="field-grid">
 <div class="field full"><label>${tx.displayName}</label><input name="name" maxlength="70" value="${esc(p.name)}" required></div>
 <div class="field full"><label>${tx.school}</label>${schoolControl}</div>
 <div class="field"><label>${tx.district}</label>${districtControl}</div>
 <div class="field"><label>${tx.grade}</label><input name="grade" maxlength="30" value="${esc(p.grade)}" placeholder="${tx.gradePlaceholder}"></div>
 <div class="field full"><label>${tx.about}</label><textarea name="about" maxlength="700" placeholder="${tx.aboutPlaceholder}">${esc(p.about)}</textarea><small>${cloudMode?tx.aboutCloudNote:tx.aboutLocalNote}</small></div>
 <div class="field full"><small>${cloudMode?tx.cloudHint:tx.localHint}</small></div>
 <div class="field full form-actions"><button class="btn" type="submit">${tx.save}</button></div></form></section></div>
 <div class="section-row"><h2>${tx.regs}</h2></div><div class="card">${regs.length?regs.map(r=>'<div class="metric-line"><span>'+esc(r.eventTitle)+'</span><strong>'+esc(r.status)+'</strong></div>').join(''):'<p class="card-sub">'+tx.none+'</p>'}</div>`;
}
function help(){return `${heading('ПРАВИЛА И ПОДДЕРЖКА','Помощь и безопасность','Платформа предназначена для школьных инициатив и безопасного участия. Она не заменяет официальную помощь или консультацию специалистов.') }<div class="home-grid"><section class="stack"><div class="card"><div class="card-title">Как использовать платформу</div><ul class="rule-list"><li>Пиши уважительно и обсуждай идеи, а не личность человека.</li><li>Не публикуй чужие персональные данные, фотографии документов и контакты.</li><li>Не указывай обвинения против конкретных учеников или сотрудников в публичных разделах.</li><li>Выборы и опросы в демо не являются официальными процедурами.</li><li>Профильная должность не даёт права управлять платформой или видеть закрытые заявки.</li></ul></div><div class="card"><div class="card-title">Школьное самоуправление</div><p class="card-sub">Закон КР «Об образовании» описывает принципы демократизации, автономии и самоуправления образовательных организаций. Вопросы компетенции и порядка выбора органов соуправления определяются законодательством и уставом конкретной школы.</p><a class="text-action" href="https://edu.gov.kg/organizations/8/pages/287/" target="_blank" rel="noopener">Проверить закон на сайте Минпросвещения ↗</a></div></section><aside class="stack"><div class="notice red"><strong>Если ты столкнулся с травлей, угрозами или чувствуешь себя небезопасно</strong><br>Не описывай подробности в публичных предложениях и не отправляй их ИИ. Обратись к родителю или другому взрослому, которому доверяешь, школьному психологу или ответственному сотруднику. При непосредственной опасности попроси взрослого обратиться в экстренные службы.</div><div class="card"><div class="card-title">Официальные ресурсы</div><p class="card-sub">Для сведений о школах и организациях:</p><a class="text-action" href="https://edu.e-meria.kg/schools" target="_blank" rel="noopener">Департамент образования Бишкека ↗</a><p class="card-sub" style="margin-top:13px">Для проверки действующей редакции нормативных актов:</p><a class="text-action" href="https://cbd.minjust.gov.kg/112665/edition/39974/ru" target="_blank" rel="noopener">Централизованный банк данных Минюста ↗</a></div></aside></div>`;}
function admin(){if(!state.realAdmin)return `${heading('ЗАКРЫТЫЙ РАЗДЕЛ','Панель управления','Доступна только учётным записям, которым взрослый владелец проекта отдельно назначил полномочия.') }<div class="notice gold">Подтверждены полномочия этой учётной записи. Назначение Нестерова и других администраторов выполняется отдельно взрослым владельцем в Supabase → SQL Editor; публичной формы выдачи ролей в приложении нет. Содержимое этой версии пока демонстрационное и не является централизованной рабочей панелью.</div><div class="admin-tabs">${['overview','ideas','candidates','events','content'].map(k=>`<button class="admin-tab ${state.adminTab===k?'active':''}" data-admin-tab="${k}">${({overview:'Обзор',ideas:'Предложения',candidates:'Кандидаты',events:'Участники событий',content:'Контент'})[k]}</button>`).join('')}</div>${adminTabContent()}`;}
function adminTabContent(){if(state.adminTab==='overview')return `<div class="stats-grid"><div class="stat-card"><span class="stat-icon">✳</span><div><strong>${db.ideas.filter(x=>x.status==='review').length}</strong><small>На модерации</small></div></div><div class="stat-card"><span class="stat-icon">◈</span><div><strong>${db.elections.length}</strong><small>Выборов</small></div></div><div class="stat-card"><span class="stat-icon">▦</span><div><strong>${db.events.length}</strong><small>Мероприятий</small></div></div><div class="stat-card"><span class="stat-icon">↗</span><div><strong>${db.projects.length}</strong><small>Проектов</small></div></div></div><div class="list-grid"><div class="card"><div class="card-title">Быстрые действия</div><div class="stack">${btn('＋ Создать выборы','data-action="new-election"')}${btn('＋ Создать мероприятие','data-action="new-event"','btn-outline')}${btn('＋ Добавить новость','data-action="new-news"','btn-outline')}${btn('Экспортировать тестовые данные','data-action="export"','btn-soft')}</div></div><div class="card"><div class="card-title">Обязательные проверки перед пилотом</div><ul class="rule-list"><li>Утвердить порядок работы с ученическими советами каждой школы.</li><li>Проверить доступ к спискам участников и профилям через RLS.</li><li>Назначить ответственных взрослых и правила эскалации.</li><li>Не использовать локальный демо-подсчёт для настоящих выборов.</li></ul></div></div>`;
 if(state.adminTab==='ideas')return `<div class="stack">${db.ideas.filter(x=>x.status==='review').map(x=>`<div class="card"><div class="card-topline">${tag('На модерации','gold')}${tag(scopeLabel(x.scope),'blue')}</div><h3>${esc(x.title)}</h3><p class="card-sub">${esc(x.description)}</p><div class="action-row" style="margin-top:12px">${btn('Опубликовать','data-admin-action="publish-idea" data-id="'+esc(x.id)+'"','btn-small')}${btn('Отклонить','data-admin-action="reject-idea" data-id="'+esc(x.id)+'"','btn-outline btn-small')}</div></div>`).join('')||'<div class="empty-state">Новых предложений на модерации нет.</div>'}</div>`;
 if(state.adminTab==='candidates')return `<div class="stack">${db.elections.flatMap(e=>e.candidates.filter(c=>c.status==='pending').map(c=>`<div class="card"><div class="card-title">${esc(e.title)}</div><strong>${esc(c.name)}</strong><p class="card-sub">${esc(c.program)}</p><div class="action-row" style="margin-top:10px">${btn('Допустить','data-admin-action="approve-candidate" data-id="'+esc(e.id)+'" data-candidate="'+esc(c.id)+'"','btn-small')}${btn('Отклонить','data-admin-action="reject-candidate" data-id="'+esc(e.id)+'" data-candidate="'+esc(c.id)+'"','btn-outline btn-small')}</div></div>`)).join('')||'<div class="empty-state">Новых заявок кандидатов нет.</div>'}</div>`;
 if(state.adminTab==='events')return `<div class="stack">${db.events.map(e=>`<div class="card"><div class="card-topline"><strong>${esc(e.title)}</strong>${tag(`${db.registrations.filter(r=>r.eventId===e.id).length} заявок`,'blue')}</div><p class="card-sub">${esc(e.date)} · ${esc(e.place)}</p><button class="btn btn-small" data-roster="${esc(e.id)}">Открыть закрытый список участников</button></div>`).join('')}</div><div class="notice gold" style="margin-top:14px">Демо-список доступен только после проверки администраторской сессии в панели. В реальном пилоте это должно дополнительно ограничиваться правами конкретного организатора события.</div>`;
 return `<div class="list-grid"><div class="card"><div class="card-title">Создать выборы</div><p class="card-sub">Настрой уровень, должность, территории и даты. Утверждённые правила должны быть приложены к реальным выборам.</p>${btn('Настроить выборы','data-action="new-election"')}</div><div class="card"><div class="card-title">Создать мероприятие</div><p class="card-sub">Опубликовать описание, дату, место и лимит мест.</p>${btn('Новое мероприятие','data-action="new-event"')}</div><div class="card"><div class="card-title">Новости</div><p class="card-sub">Публиковать проверенные школьные объявления.</p>${btn('Добавить новость','data-action="new-news"')}</div><div class="card"><div class="card-title">Опросы мнения</div><p class="card-sub">Создавать необязательные консультационные опросы, не являющиеся официальным голосованием.</p>${btn('Создать опрос','data-action="new-poll"')}</div><div class="card"><div class="card-title">Аудит</div><p class="card-sub">История действий в демонстрационном браузере.</p>${db.audit.slice(-8).reverse().map(a=>`<div class="metric-line"><span>${esc(a.text)}</span><small>${esc(a.date)}</small></div>`).join('')||'<span class="small-note">Событий пока нет.</span>'}</div></div>`;}
function workspace(){
 const myRegs=db.registrations.filter(r=>r.owner==='local-profile');
 const myProjects=db.projects.filter(p=>p.owner===db.profile.name||p.createdByMe||p.joinedByMe||p.canManage);
 const myIdeas=db.ideas.filter(i=>i.author===db.profile.name||i.author==='Ты');
 const saved=db.favorites.map(f=>({ref:f,item:favoriteItem(f)})).filter(x=>x.item);
 const unread=db.notifications.filter(n=>!n.read).length;
 const tasks=db.projects.flatMap(p=>(p.tasks||[]).map((task,i)=>({project:p,index:i,task,done:(p.completedTasks||[]).includes(i)})));
 const done=tasks.filter(x=>x.done).length;
 return `${heading('ТВОЁ ПРОСТРАНСТВО','Мой кабинет','Все твои активности, сохранённые материалы и следующие шаги — в одном месте.',btn('＋ Новое предложение','data-action="new-idea"'))}
 <div class="workspace-welcome"><div><span class="hero-kicker">ЛИЧНЫЙ ПРОГРЕСС</span><h2>Привет, ${esc(db.profile.name||'участник')}!</h2><p>Здесь собраны твои локальные действия в этом браузере. Это не подтверждение школьной должности или официального статуса.</p></div><div class="workspace-progress"><strong>${done}/${tasks.length||0}</strong><span>задач выполнено</span><div class="bar"><span style="width:${tasks.length?Math.round(done/tasks.length*100):0}%"></span></div></div></div>
 <div class="stats-grid"><div class="stat-card"><span class="stat-icon">✳</span><div><strong>${myIdeas.length}</strong><small>Мои предложения</small></div></div><div class="stat-card"><span class="stat-icon">↗</span><div><strong>${myProjects.length}</strong><small>Мои проекты и команды</small></div></div><div class="stat-card"><span class="stat-icon">▦</span><div><strong>${myRegs.length}</strong><small>Мои регистрации в демо</small></div></div><div class="stat-card"><span class="stat-icon">★</span><div><strong>${saved.length}</strong><small>Сохранённые материалы</small></div></div></div>
 <div class="workspace-grid"><section class="stack"><div class="card"><div class="section-row"><h2>Мои следующие шаги</h2><span class="tag blue">${tasks.length} задач</span></div>${tasks.length?tasks.slice(0,8).map(x=>`<label class="task-line ${x.done?'task-done':''}"><input type="checkbox" data-task-toggle="${esc(x.project.id)}" data-task-index="${x.index}" ${x.done?'checked':''}><span><strong>${esc(x.task)}</strong><small>${esc(x.project.title)}</small></span></label>`).join(''):'<div class="empty-state">Здесь появятся задачи из твоих проектов. Открой проект и начни с первого шага.</div>'}</div>
 <div class="card"><div class="section-row"><h2>Мои регистрации</h2><button class="text-action" data-page="events">Найти события →</button></div>${myRegs.length?myRegs.map(r=>`<div class="admin-record"><div class="admin-record-copy"><strong>${esc(r.eventTitle)}</strong><small>${esc(r.status||'Демо-регистрация')}</small></div><button class="btn btn-small btn-outline" data-cancel-registration="${esc(r.id)}">Отменить</button></div>`).join(''):'<div class="empty-state">Пока нет регистраций. Выбери интересное мероприятие в календаре.</div>'}</div>
 <div class="card"><div class="section-row"><h2>Сохранённое</h2><span class="tag gold">${saved.length}</span></div>${saved.length?saved.map(({ref,item})=>`<div class="admin-record"><div class="admin-record-copy"><strong>${esc(item.title)}</strong><small>${ref.type==='idea'?'Предложение':ref.type==='project'?'Проект':'Мероприятие'}</small></div><button class="btn btn-small btn-outline" data-open-saved-type="${esc(ref.type)}" data-open-saved-id="${esc(ref.id)}">Открыть</button>${favoriteButton(ref.type,ref.id)}</div>`).join(''):'<div class="empty-state">Нажимай ☆ на карточках, чтобы сохранить полезные материалы здесь.</div>'}</div></section>
 <aside class="stack"><div class="card"><div class="section-row"><h2>Уведомления</h2><span class="tag ${unread?'gold':'gray'}">${unread} новых</span></div>${db.notifications.length?db.notifications.slice(0,8).map(n=>`<div class="feed-note"><span class="feed-date">${new Date(n.createdAt).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'})}</span><div><strong>${esc(n.title)}</strong><p>${esc(n.detail)}</p></div></div>`).join(''):'<div class="empty-state">Здесь будут появляться подтверждения твоих действий и важные напоминания.</div>'}<button class="text-action" data-action="mark-notifications-read">Отметить всё прочитанным</button></div>
 <div class="notice gold"><strong>Твои данные</strong><br>Демо-активность хранится в локальном браузере. Она не синхронизируется между устройствами и может быть потеряна при очистке данных Safari. Не сохраняй здесь чужие персональные сведения.</div>
 <div class="card"><div class="card-title">Быстрый переход</div><div class="prompt-list"><button class="prompt-button" data-page="projects">Найти проект и команду ↗</button><button class="prompt-button" data-page="events">Посмотреть мероприятия ▦</button><button class="prompt-button" data-page="assistant">Спланировать идею с ИИ ✧</button><button class="prompt-button" data-page="profile">Обновить профиль ◎</button></div></div></aside></div>`;
}
function render(){updateShell();const pages={home,workspace,ideas,elections,projects,events,surveys,news,assistant,profile,help,admin};if(state.page==='admin'&&!state.realAdmin)state.page='home';$('#pageContent').innerHTML=(pages[state.page]||home)();if(state.page==='assistant')$('#chatLog').scrollTop=$('#chatLog').scrollHeight;}
function go(p){state.page=p;$('#sidebar').classList.remove('open');render();}
function modal(title,body){$('#modalRoot').innerHTML=`<div class="modal-backdrop" data-backdrop><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body">${body}</div></div></div>`;}
function closeModal(){$('#modalRoot').innerHTML='';}
const districtOptions=()=>DISTRICTS.map(d=>`<option value="${d.key}">${esc(d.ru)}</option>`).join('');
function newIdea(){modal('Новое предложение',`<div class="notice gold" style="margin-bottom:13px">Внутреннее предложение для школьного сообщества. Не добавляй личные данные или обвинения против конкретных людей.</div><form id="ideaForm" class="field-grid"><div class="field full"><label>Короткое название</label><input name="title" minlength="5" maxlength="100" required></div><div class="field full"><label>Что хотелось бы улучшить?</label><textarea name="description" minlength="20" maxlength="900" required placeholder="Опиши проблему и возможное решение"></textarea></div><div class="field"><label>Категория</label><select name="category"><option>Школьная среда</option><option>Образование</option><option>Экология</option><option>Спорт и культура</option><option>Безопасность среды</option><option>Сотрудничество</option></select></div><div class="field"><label>Уровень</label><select name="scope"><option value="school">Моя школа</option><option value="district">Район</option><option value="city">Весь Бишкек</option></select></div><div class="field full"><label>Школа или территория</label><input name="target" maxlength="120" value="${esc(db.profile.school||'')}" required></div><div class="field full form-actions"><button type="button" class="btn btn-outline" data-close-modal>Отмена</button><button class="btn" type="submit">Отправить на модерацию</button></div></form>`);}
function newProject(){modal('Новый проект',`<form id="projectForm" class="field-grid"><div class="field full"><label>Название проекта</label><input name="title" minlength="5" maxlength="100" required></div><div class="field full"><label>Краткое описание и ожидаемый результат</label><textarea name="description" minlength="20" maxlength="900" required></textarea></div><div class="field"><label>Направление</label><select name="category"><option>Образование</option><option>Экология</option><option>Спорт и культура</option><option>Технологии</option><option>Волонтёрство</option></select></div><div class="field"><label>Уровень</label><select name="scope"><option value="school">Моя школа</option><option value="district">Район</option><option value="city">Весь Бишкек</option></select></div><div class="field full"><label>Школа или территория</label><input name="target" value="${esc(db.profile.school)}" maxlength="120" required></div><div class="field full"><label>Первый шаг</label><input name="firstTask" maxlength="140" placeholder="Например, обсудить идею с куратором" required></div><div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Создать проект</button></div></form>`);}
function newElection(){if(!state.realAdmin){toast('Создание выборов доступно только администратору.');return;}modal('Создать выборы',`<div class="notice gold" style="margin-bottom:13px">Бесплатная подача кандидатуры. Перед реальными выборами утверди положение, право выдвижения, круг избирателей, календарь, наблюдение и апелляции.</div><form id="electionForm" class="field-grid"><div class="field full"><label>Название</label><input name="title" maxlength="100" required></div><div class="field"><label>Должность</label><input name="position" maxlength="80" required></div><div class="field"><label>Уровень</label><select name="scope"><option value="school">Школа</option><option value="district">Район</option><option value="city">Город</option></select></div><div class="field"><label>Школа / территория</label><input name="target" maxlength="120" required></div><div class="field"><label>Район (для районного уровня)</label><select name="district"><option value="">Не выбран</option>${districtOptions()}</select></div><div class="field full"><label>Описание и компетенции должности</label><textarea name="description" minlength="20" maxlength="900" required></textarea></div><div class="field"><label>Окончание приёма заявок</label><input name="nominationEnd" type="date" required></div><div class="field"><label>Окончание кампании</label><input name="campaignEnd" type="date" required></div><div class="field"><label>Начало голосования</label><input name="votingStart" type="date" required></div><div class="field"><label>Окончание голосования</label><input name="votingEnd" type="date" required></div><div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Создать в демо</button></div></form>`);}
function newEvent(){if(!state.realAdmin){toast('Создание мероприятий доступно только администратору.');return;}modal('Новое мероприятие',`<form id="eventForm" class="field-grid"><div class="field full"><label>Название</label><input name="title" minlength="5" maxlength="100" required></div><div class="field full"><label>Описание</label><textarea name="description" minlength="15" maxlength="900" required></textarea></div><div class="field"><label>Дата</label><input name="date" type="date" required></div><div class="field"><label>Количество мест</label><input name="capacity" type="number" min="1" max="1000" value="40" required></div><div class="field full"><label>Место / формат</label><input name="place" maxlength="140" required></div><div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Создать</button></div></form>`);}

function newPoll(){if(!state.realAdmin)return;const body='<div class="notice gold">Неофициальный опрос мнения. Не спрашивай персональные или чувствительные сведения.</div><form id="pollForm" class="field-grid"><div class="field full"><label>Вопрос</label><input name="title" minlength="5" maxlength="120" required></div><div class="field full"><label>Пояснение</label><textarea name="description" maxlength="500"></textarea></div><div class="field full"><label>Вариант 1</label><input name="option1" maxlength="100" required></div><div class="field full"><label>Вариант 2</label><input name="option2" maxlength="100" required></div><div class="field full"><label>Вариант 3 (необязательно)</label><input name="option3" maxlength="100"></div><div class="field full"><label>Вариант 4 (необязательно)</label><input name="option4" maxlength="100"></div><div class="field"><label>Дата завершения</label><input name="closesAt" type="date"></div><div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Создать опрос</button></div></form>';modal('Создать опрос мнения',body);}
function newNews(){if(!state.realAdmin)return;modal('Добавить новость',`<form id="newsForm" class="field-grid"><div class="field full"><label>Заголовок</label><input name="title" maxlength="110" required></div><div class="field full"><label>Текст</label><textarea name="text" minlength="15" maxlength="900" required></textarea></div><div class="field"><label>Категория</label><select name="category"><option>Объявление</option><option>Возможности</option><option>Образование</option><option>Платформа</option></select></div><div class="field"><label>Дата</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Опубликовать в демо</button></div></form>`);}
let testerCaptchaToken = '';
let testerTurnstileWidgetId = null;
let testerTurnstileLoadPromise = null;

function disposeTesterCaptcha(){
 if(window.turnstile && testerTurnstileWidgetId!==null){
  try{window.turnstile.remove(testerTurnstileWidgetId);}catch(_error){}
 }
 testerTurnstileWidgetId=null;
 testerCaptchaToken='';
}
function mountTesterCaptcha(){
 const siteKey=String(window.YNTYMAK_CONFIG?.turnstileSiteKey||'').trim();
 const host=document.getElementById('authTurnstile');
 if(!siteKey||!host||!window.turnstile?.render)return;
 disposeTesterCaptcha();
 testerTurnstileWidgetId=window.turnstile.render(host,{
  sitekey:siteKey,
  callback(token){testerCaptchaToken=String(token||'');},
  'expired-callback'(){testerCaptchaToken='';},
  'error-callback'(){testerCaptchaToken='';}
 });
}
function loadTesterCaptcha(){
 const siteKey=String(window.YNTYMAK_CONFIG?.turnstileSiteKey||'').trim();
 if(!siteKey||!document.getElementById('testerTurnstile'))return;
 if(window.turnstile){mountTesterCaptcha();return;}
 if(testerTurnstileLoadPromise)return;
 testerTurnstileLoadPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.defer=true;
  script.onload=()=>{mountTesterCaptcha();resolve();};
  script.onerror=()=>{testerTurnstileLoadPromise=null;reject(new Error('Не удалось загрузить проверку безопасности.'));};
  document.head.appendChild(script);
 });
}

function loginModal(){
 disposeTesterCaptcha();
 const kg=state.lang==='KG';
 const t=kg?{
  title:'Кирүү жана катталуу',
  intro:'Аккаунтка кирүү үчүн электрондук почтаңды жана сырсөзүңдү колдон. Жаңы аккаунт дайыма «Сыноочу» макамын алат.',
  email:'Электрондук почта',password:'Сырсөз',displayName:'Көрсөтүлүүчү ысым',newAccount:'Тест аккаунту',
  privacy:'Бул тесттик версия экенин түшүнөм. Башка окуучулардын жеке маалыматтарын, байланыштарын, документтерин же купуя кайрылууларын киргизбейм.',
  login:'Кирүү',signup:'Тест аккаунтун түзүү',forgot:'Сырсөздү унуттуңбу?',cancel:'Жабуу',passwordHint:'кеминде 8 белги',
  inviteOnly:'Өз алдынча катталуу азырынча жабык. Уюштуруучудан жеке чакыруу ал. Чакырууну ырастап, ушул жерден кирсең, система сага «Сыноочу» профилин түзөт.',
  captcha:'Кирүү, катталуу же сырсөздү калыбына келтирүү үчүн коопсуздук текшерүүсүн бүтүр.',
  admin:'Администратордук укуктар бул жерде тандалбайт. Аларды чоңдорго жооптуу ээси өзүнчө жана жабык тартипте дайындайт.'
 }:{
  title:'Вход и регистрация',
  intro:'Войди с помощью электронной почты и пароля. Каждый новый аккаунт получает только статус «Тестировщик».',
  email:'Электронная почта',password:'Пароль',displayName:'Имя для отображения',newAccount:'Аккаунт тестировщика',
  privacy:'Я понимаю, что это тестовая версия. Я не буду вводить личные данные других учеников, контакты, документы или чувствительные обращения.',
  login:'Войти',signup:'Создать аккаунт тестировщика',forgot:'Забыли пароль?',cancel:'Закрыть',passwordHint:'минимум 8 символов',
  inviteOnly:'Самостоятельная регистрация пока закрыта. Получи персональное приглашение у организатора. После подтверждения приглашения войди здесь — система создаст профиль тестировщика.',
  captcha:'Пройди проверку безопасности перед входом, регистрацией или восстановлением пароля.',
  admin:'Администраторские права здесь не выбираются. Их отдельно и закрытым способом назначает взрослый ответственный владелец проекта.'
 };
 const configured=Boolean(window.YntymakCloud?.configured());
 const authCaptchaEnabled=configured &&
  window.YNTYMAK_CONFIG?.enableAuthCaptcha===true &&
  Boolean(String(window.YNTYMAK_CONFIG?.turnstileSiteKey||'').trim());
 const signupEnabled=authCaptchaEnabled && window.YNTYMAK_CONFIG?.enableSelfServiceSignup===true;
 const notice=configured
  ? '<p class="card-sub">'+esc(t.intro)+'</p>'
  : '<div class="notice gold">Supabase ещё не настроен в этой копии. Сейчас доступны только локальные демонстрационные сценарии.</div>';
 const signupContent=signupEnabled
  ? `
   <form id="signupForm" class="field-grid">
    <div class="field full"><label>${esc(t.displayName)}</label><input name="displayName" maxlength="70" required></div>
    <div class="field full"><label>${esc(t.email)}</label><input name="email" type="email" autocomplete="email" required></div>
    <div class="field full"><label>${esc(t.password)} (${esc(t.passwordHint)})</label><input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div>
    <div class="field full"><label class="lang-hint"><input type="checkbox" name="privacyAck" required> ${esc(t.privacy)}</label></div>
    <div class="field full"><div id="testerTurnstile" aria-label="${esc(t.captcha)}"></div><small>${esc(t.captcha)}</small></div>
    <div class="field full form-actions"><button class="btn" type="submit">${esc(t.signup)}</button></div>
   </form>`
  : '<div class="notice gold">'+esc(t.inviteOnly)+'</div>';
 const body=notice+`
 <form id="loginForm" class="field-grid" style="margin-top:14px">
  ${authCaptchaEnabled?'<div class="field full"><div id="authTurnstile" aria-label="'+esc(t.captcha)+'"></div><small>'+esc(t.captcha)+'</small></div>':''}
  <div class="field full"><label>${esc(t.email)}</label><input name="email" type="email" autocomplete="email" required></div>
  <div class="field full"><label>${esc(t.password)}</label><input name="password" type="password" minlength="8" maxlength="72" autocomplete="current-password" required></div>
  <div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>${esc(t.cancel)}</button><button class="btn" type="submit" ${configured?'':'disabled'}>${esc(t.login)}</button></div>
  <div class="field full"><button class="text-action" type="button" data-password-reset ${configured?'':'disabled'}>${esc(t.forgot)}</button></div>
 </form>
 <div class="section-row"><h2>${esc(t.newAccount)}</h2></div>
 ${signupContent}
 <p class="lang-hint">${esc(t.admin)}</p>`;
 modal(t.title,body);
 if(signupEnabled)loadTesterCaptcha().catch(error=>toast(error.message));
}
function passwordRecoveryModal(){
 const kg=state.lang==='KG';
 const title=kg?'Жаңы сырсөз':'Новый пароль';
 const intro=kg?'Калыбына келтирүү шилтемеси аркылуу кирдиң. Жаңы сырсөздү эки жолу киргиз.':'Ты открыл(а) ссылку восстановления. Укажи новый пароль дважды.';
 const passwordLabel=kg?'Жаңы сырсөз':'Новый пароль';
 const confirmLabel=kg?'Сырсөздү кайтала':'Повтори пароль';
 const saveLabel=kg?'Сактоо':'Сохранить пароль';
 const body='<p class="card-sub">'+esc(intro)+'</p><form id="passwordRecoveryForm" class="field-grid"><div class="field full"><label>'+esc(passwordLabel)+'</label><input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div><div class="field full"><label>'+esc(confirmLabel)+'</label><input name="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div><div class="field full form-actions"><button class="btn" type="submit">'+esc(saveLabel)+'</button></div></form>';
 modal(title,body);
}
function viewElection(id){const e=db.elections.find(x=>x.id===id);if(!e)return;const approved=e.candidates.filter(c=>c.status==='approved');const mine=e.myVote;modal(e.title,`<div class="card-topline">${tag(scopeLabel(e.scope),'blue')}${tag(statusName(e.stage),'gold')}</div><p class="card-sub">${esc(e.description)}</p><div class="meta-line">${esc(e.target)} · ${esc(e.position)}</div><div class="metric-line"><span>Период голосования</span><strong>${dateLabel(e.votingStart)} — ${dateLabel(e.votingEnd)}</strong></div><div class="section-row"><h2>Кандидаты</h2>${e.stage==='nominations'?btn('Подать бесплатную заявку','data-nominate="'+esc(e.id)+'"','btn-small'):''}</div>${approved.map(c=>`<div class="admin-record"><span class="user-avatar">${esc(initials(c.name))}</span><div class="admin-record-copy"><strong>${esc(c.name)}</strong><small>${esc(c.program)}</small></div>${e.stage==='voting'&&!mine?btn('Голосовать','data-cast-vote="'+esc(e.id)+'" data-candidate="'+esc(c.id)+'"','btn-small'):''}</div>`).join('')||'<div class="empty-state">Кандидаты ещё не прошли допуск.</div>'}${mine?'<div class="notice">В этом браузере уже сохранён тестовый голос.</div>':''}<div class="notice gold" style="margin-top:13px">Это локальный тест. Он не гарантирует тайну голоса, уникальность личности или официальную проверку результата. Для настоящего голосования нужна отдельная серверная система.</div>${e.stage==='closed'?`<div class="section-row"><h2>Результаты демо</h2></div>${approved.map(c=>`<div class="metric-line"><span>${esc(c.name)}</span><strong>${c.votes||0}</strong></div>`).join('')}`:''}`);}
function nominate(id){
 const e=db.elections.find(x=>x.id===id);if(!e||e.stage!=='nominations')return;
 modal('Заявка кандидата',`<div class="notice gold" style="margin-bottom:12px">Подача заявки бесплатная. Кандидат должен соответствовать правилам выборов, которые утверждены для своей школы или ученического совета. Это демонстрационный сценарий: не используй реальные персональные данные.</div>
 <form id="candidateForm" data-election="${esc(id)}" class="field-grid">
 <div class="field full"><label>Имя для отображения</label><input name="name" maxlength="70" value="${esc(db.profile.name)}" required></div>
 <div class="field full"><label>Программа кандидата</label><textarea name="program" minlength="30" maxlength="800" placeholder="Какие 2–3 полезных изменения ты предлагаешь?" required></textarea></div>
 <div class="field full"><label class="lang-hint"><input type="checkbox" name="publicNameConsent" required> Я отдельно разрешаю показать моё имя участникам этих учебных выборов.</label></div>
 <div class="field full"><label class="lang-hint"><input type="checkbox" name="publicProgramConsent" required> Я отдельно разрешаю показать мою программу участникам этих учебных выборов.</label></div>
 <div class="field full"><small>В настоящих выборах нужны утверждённые правила публикации и отдельное согласие. Форма здесь сохраняется только в локальном демо.</small></div>
 <div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Отправить на проверку</button></div>
 </form>`);
}
function viewEvent(id){const e=db.events.find(x=>x.id===id);if(!e)return;const mine=db.registrations.some(r=>r.eventId===id&&r.owner==='local-profile');const places=Math.max(0,(e.capacity||0)-(e.registered||0));modal(e.title,`<div class="card-topline">${tag(e.status==='open'?'Регистрация открыта':'Регистрация закрыта',e.status==='open'?'blue':'gray')}${tag(e.category||'Мероприятие','gold')}</div><p class="card-sub">${esc(e.description)}</p><div class="metric-line"><span>Дата</span><strong>${dateLabel(e.date)}</strong></div><div class="metric-line"><span>Место / формат</span><strong>${esc(e.place)}</strong></div><div class="metric-line"><span>Свободные места</span><strong>${places} из ${e.capacity||'—'}</strong></div><div class="notice gold" style="margin-top:12px">В демо-записи используются только вымышленные данные. Публичный список участников не показывается.</div><div class="action-row" style="margin-top:14px">${favoriteButton('event',e.id)}${mine?'<span class="tag blue">Ты уже записан(а)</span>':e.status==='open'&&places>0?btn('Записаться','data-register-event="${esc(e.id)}"'):''}<button class="btn btn-outline" type="button" data-close-modal>Закрыть</button></div>`);}
function registerEvent(id){
 const e=db.events.find(x=>x.id===id);
 if(!e||e.status!=='open'||e.registered>=e.capacity){toast('Регистрация закрыта или мест больше нет.');return;}
 if(db.registrations.some(r=>r.eventId===id&&r.owner==='local-profile')){toast('В этом тестовом браузере ты уже зарегистрирован(а).');return;}
 const cloudMode=e.source==='cloud'&&Boolean(window.YntymakCloud?.eventsEnabled())&&Boolean(window.YntymakCloud?.getSession());
 if(cloudMode){
  const t=state.lang==='KG'?{
   title:'Иш-чарага катталуу',
   info:'Катталууда аккаунттагы көрсөтүлүүчү ысым, ырасталган мектеп (эгер бар болсо) жана класс профилинен алынат. Бул маалыматтарды иш-чаранын уюштуруучусу гана көрө алат.',
   consent:'Бул иш-чараны уюштуруу үчүн профилимдеги көрсөтүлүүчү ысымды, мектепти жана классты ыйгарым укуктуу уюштуруучуга берүүгө макулмун. Бул жалпыга ачык тизме эмес.',
   cancel:'Жокко чыгаруу',submit:'Катталуу'
  }:{
   title:'Регистрация на мероприятие',
   info:'Для регистрации имя для отображения, подтверждённая школа (если она есть) и класс берутся из профиля. Эти сведения доступны только создателю события или уполномоченному представителю в пределах его полномочий.',
   consent:'Я согласен(на) предоставить моё имя для отображения, школу и класс из профиля создателю или уполномоченному организатору именно этого мероприятия. Это не публичный список.',
   cancel:'Отмена',submit:'Зарегистрироваться'
  };
  modal(t.title,`<form id="registrationForm" data-event="${esc(id)}" class="field-grid">
   <div class="notice gold">${t.info}</div>
   <div class="field full"><label class="lang-hint"><input type="checkbox" name="organizerAccessConsent" required> ${t.consent}</label></div>
   <div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>${t.cancel}</button><button class="btn" type="submit">${t.submit}</button></div>
  </form>`);
  return;
 }
 modal('Регистрация на мероприятие',`<form id="registrationForm" data-event="${esc(id)}" class="field-grid">
  <div class="notice gold">Это локальное демо. Используй только вымышленные данные, не указывай настоящие персональные данные школьников.</div>
  <div class="field full"><label>Имя для демо-списка</label><input name="name" maxlength="70" value="${esc(db.profile.name)}" required></div>
  <div class="field full"><label>Школа (демо)</label><input name="school" maxlength="120" value="${esc(db.profile.school)}" required></div>
  <div class="field"><label>Класс (демо)</label><input name="grade" maxlength="30" value="${esc(db.profile.grade)}" required></div>
  <div class="field full form-actions"><button class="btn btn-outline" type="button" data-close-modal>Отмена</button><button class="btn" type="submit">Подать заявку</button></div>
 </form>`);
}
async function adminRoster(id){
 if(!state.realAdmin){toast('Недостаточно прав.');return;}
 const e=db.events.find(x=>x.id===id);if(!e)return;
 if(e.source==='cloud'&&window.YntymakCloud?.eventsEnabled()&&window.YntymakCloud?.getSession()){
  try{
   const rows=await window.YntymakCloud.getEventRoster(id);
   const body=rows.map(r=>`<div class="admin-record"><span class="user-avatar">${esc(initials(r.display_name))}</span><div class="admin-record-copy"><strong>${esc(r.display_name)}</strong><small>${esc(r.school_label||'')} · ${esc(r.grade_label||'')}</small></div><span class="tag blue">Зарегистрирован</span></div>`).join('')||'<div class="empty-state">Заявок пока нет.</div>';
   modal(`Закрытый список · ${e.title}`,body);
  }catch(err){modal('Доступ к списку ограничен',`<div class="notice gold">${esc(err.message||'Сервер не разрешил просмотр списка участников.')}</div><p class="card-sub">Для облачного списка требуется активное полномочие на соответствующую территорию мероприятия. Администратор платформы не получает автоматический доступ к личным данным участников.</p>`);}
  return;
 }
 const rows=db.registrations.filter(r=>r.eventId===id);
 modal(`Закрытый список · ${e.title}`,rows.map(r=>`<div class="admin-record"><span class="user-avatar">${esc(initials(r.name))}</span><div class="admin-record-copy"><strong>${esc(r.name)}</strong><small>${esc(r.school)} · ${esc(r.grade)}</small></div><span class="tag blue">${esc(r.status)}</span></div>`).join('')||'<div class="empty-state">Заявок пока нет.</div>');
}
function viewIdea(id){const x=db.ideas.find(i=>i.id===id);if(!x)return;modal(x.title,`<p>${esc(x.description)}</p><div class="meta-line">${scopeLabel(x.scope)} · ${esc(x.target)} · ${dateLabel(x.created)}</div><div class="metric-line"><span>Статус</span><strong>${statusName(x.status)}</strong></div><div class="metric-line"><span>Отклики сообщества</span><strong>${x.support}</strong></div>${x.response?`<div class="notice" style="margin-top:12px">Ответ ответственного: ${esc(x.response)}</div>`:''}<div class="notice gold" style="margin-top:12px">Внутреннее обсуждение, не юридическое обращение. Для официальных обращений проверь установленные законом требования и обратись к законному представителю или взрослому координатору.</div>`);}
async function viewProject(id){const p=db.projects.find(x=>x.id===id);if(!p)return;let requests=[];let requestError='';if(p.source==='cloud'&&p.canManage&&window.YntymakCloud?.projectsEnabled()&&window.YntymakCloud?.getSession()){try{requests=await window.YntymakCloud.listProjectJoinRequests(p.id);}catch(err){requestError=err.message||'Не удалось загрузить заявки.';}}const requestBlock=p.canManage&&p.source==='cloud'?'<h3 style="font:800 13px Manrope;margin:18px 0 8px">Заявки в команду</h3>'+ (requestError?'<div class="notice gold">'+esc(requestError)+'</div>':requests.map(r=>'<div class="admin-record"><div class="admin-record-copy"><strong>Заявка · '+esc(dateLabel(String(r.created_at).slice(0,10)))+'</strong><small>'+esc(r.message||'Без дополнительного сообщения')+'</small></div><div class="action-row">'+btn('Принять','data-review-join="'+esc(r.id)+'" data-project-id="'+esc(p.id)+'" data-decision="accepted"','btn-small')+btn('Отклонить','data-review-join="'+esc(r.id)+'" data-project-id="'+esc(p.id)+'" data-decision="declined"','btn-small btn-outline')+'</div></div>').join('')||'<p class="card-sub">Новых заявок нет.</p>'):'';
modal(p.title,`<p>${esc(p.description)}</p><div class="meta-line">${esc(p.target)} · ${p.members} участников</div><h3 style="font:800 13px Manrope;margin:18px 0 8px">План команды</h3>${(()=>{const completed=p.completedTasks||[];const pct=p.tasks.length?Math.round(completed.length/p.tasks.length*100):0;return `<div class="task-progress"><div class="meta-line"><strong>Прогресс команды</strong><span>${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>`})()}${p.tasks.map((x,i)=>`<label class="task-line ${(p.completedTasks||[]).includes(i)?'task-done':''}"><input type="checkbox" data-task-toggle="${esc(p.id)}" data-task-index="${i}" ${(p.completedTasks||[]).includes(i)?'checked':''}><span><strong>${i+1}. ${esc(x)}</strong><small>Отметь выполнение шага в своём демо-плане</small></span></label>`).join('')}${requestBlock}<div class="notice" style="margin-top:12px">Организуй встречу с куратором школы до запуска активности, которая затрагивает помещения, бюджет или безопасность.</div>`);}
function hasPersonalData(s){return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?996|0)\s?\d{3}[\s-]?\d{3}[\s-]?\d{3}|\b\d{10,}\b/i.test(s);}
function localAssistant(question){
 const q=question.toLowerCase(); const ky=state.lang==='KG';
 const danger=/(травл|булли|издева|угроз|насили|страшно|опасн|шантаж|оскорб|суицид|самоповреж|вымог|коррупц|преслед|домог)/i.test(q);
 if(danger)return ky?'Эгер өзүңдү коопсуз сезбесең же кимдир бирөө коркутуп/кысым көрсөтүп жатса, бул жерде майда-чүйдөсүн жазба жана коомдук бөлүмгө жарыялаба. Ишенген чоң кишиге, ата-энеңе/мыйзамдуу өкүлүңө же мектеп психологуна кайрыл. Дароо коркунуч болсо, чоң кишиден тез жардам кызматтарына кайрылууну суран. Бул чат шашылыш жардам кызматы эмес.':'Если ситуация связана с травлей, угрозами, насилием, домогательствами, вымогательством или коррупционным давлением, не описывай подробности здесь и не публикуй сведения о людях. Обратись к родителю/законному представителю, доверенному взрослому, школьному психологу или ответственному сотруднику. При непосредственной опасности попроси взрослого обратиться в экстренные службы. Этот чат не является экстренной или защищённой службой сообщений.';
 if(/школ|каталог|адрес|директор|номер школы|список школ|микроучаст|расписан/i.test(q))return 'Для точных названий школ, адресов, районной принадлежности, руководителей и контактов используй официальный каталог Департамента образования мэрии Бишкека: https://edu.e-meria.kg/schools. Демо-версия не подключена к живому реестру. Не буду угадывать номер школы или микроучасток. Бишкек включает четыре района: Ленинский, Первомайский, Октябрьский и Свердловский.';
 if(/закон|самоуправ|совет учен|ученическ.*совет|компетенц|устав/i.test(q))return 'Справочная основа: статья 22 Закона КР «Об образовании» №179 описывает демократизацию, автономию и самоуправление образовательных организаций и допускает создание советов обучающихся для учёта их мнения. Порядок формирования и компетенции определяются законодательством и уставом конкретной школы. Практический шаг: запросить у взрослого координатора действующий устав и проверить, какие решения ученический совет вправе принимать самостоятельно, а какие только предлагать администрации. Источник: https://edu.gov.kg/organizations/8/pages/287/. Это не юридическое заключение.';
 if(/выбор|кандидат|голос|президент школы|предвыбор|допуск/i.test(q))return 'Чек-лист нейтральных школьных выборов:\n1. Сверить должность, срок и полномочия с уставом/положением школы.\n2. Заранее опубликовать одинаковые критерии допуска кандидатов и избирателей.\n3. Сделать бесплатную подачу заявок и понятный срок проверки.\n4. Дать кандидатам равное время и одинаковый формат представления программ.\n5. Назначить взрослого координатора и независимых наблюдателей.\n6. Для настоящего голосования отдельно обеспечить проверку права голоса, защиту от повторного голосования и тайну бюллетеня на сервере.\n7. Опубликовать порядок подсчёта, сроки итогов и апелляций.\nГолосование в браузерном прототипе — только учебная демонстрация, не официальный результат.';
 if(/мероприяти|форум|конкурс|организ|экскурс|поездк|сбор участников/i.test(q))return 'План школьного мероприятия:\n• Цель, возрастная группа, формат и ожидаемый результат.\n• Согласование даты, места и содержания с администрацией школы и взрослым координатором.\n• Ответственные за программу, доступность, сопровождение и связь со взрослыми.\n• Ограничение вместимости и план действий при переносе/отмене.\n• Регистрация только с необходимыми сведениями; не собирай паспортные данные, домашние адреса и лишние контакты.\n• Список участников доступен только уполномоченному организатору; публично показываются агрегаты.\n• После события — короткий отчёт и обратная связь без публикации личных данных.';
 if(/проект|иде|команд|волонт|эколог|клуб|хакатон/i.test(q))return 'Шаблон паспорта проекта:\n1. Проблема — что именно хочется улучшить?\n2. Цель — какой конкретный результат появится?\n3. Польза — кому это поможет?\n4. Команда — роли по задачам, без публикации личных контактов.\n5. План — небольшие этапы на 2–4 недели.\n6. Ресурсы — что уже доступно, что нужно согласовать, как обойтись без бюджета.\n7. Риски и безопасность — что может пойти не так и кто поможет взрослым согласованием.\n8. Метрики — как поймём, что получилось?\nНачни с малого пилота и согласуй использование помещений, денег или оборудования с ответственным взрослым.';
 if(/предлож|обращ|петици|жалоб|подпис/i.test(q))return 'Раздел «Предложения» в Ынтымак — это внутренняя обратная связь школьному сообществу, а не юридическая петиция и не официальный канал обращения. Удобная структура: проблема → проверяемые факты без персональных данных → предлагаемое решение → кому адресовано внутри школы → необходимые ресурсы → ожидаемый результат. Право на официальные обращения и порядок электронной подачи регулируются отдельно; для юридически значимого обращения проверь действующую редакцию на https://cbd.minjust.gov.kg/ и обсуди с законным представителем/взрослым координатором.';
 if(/заседан|повестк|протокол|совещан|встреч/i.test(q))return 'Повестка заседания ученического совета на 45 минут:\n1. Открытие и цель встречи — 5 минут.\n2. Краткий обзор задач и прошлых решений — 5 минут.\n3. Обсуждение не более двух предложений — 15 минут.\n4. Выбор одного небольшого действия и ответственных — 10 минут.\n5. Сроки, необходимые согласования, риски — 5 минут.\n6. Повтор решений вслух и дата следующей встречи — 5 минут.\nПосле встречи запиши решение, ответственного и срок, но не публикуй личные контакты участников.';
 if(/бюджет|смет|денег|стоим|расход/i.test(q))return 'Для школьного проекта с нулевым бюджетом начни с таблицы: ресурс / уже доступен? / кто согласует / безопасная альтернатива без затрат. Используй школьные помещения и оборудование только с разрешения администрации, не собирай деньги с учеников без официального взрослого организатора и утверждённых правил. Сначала проверь бесплатный пилот: 1 команда, 1 задача, 1–2 недели, понятный результат.';
 if(/перевод|кыргыз|кыргызча|орусча|двуязыч/i.test(q))return 'Я могу подготовить черновик на русском и кыргызском в параллельных блоках. Для официальных школьных документов попроси преподавателя или взрослого координатора проверить кыргызскую редакцию: этот прототип не выполняет сертифицированный перевод. Пришли текст без имён и контактов.';
 if(/район|бишкек|городск/i.test(q))return 'Для межшкольной работы используй четыре административных района Бишкека: Ленинский, Первомайский, Октябрьский и Свердловский. Район в личном профиле — выбор пользователя, а не подтверждённая принадлежность школы. Проверяй фактический список и контакты через официальный каталог https://edu.e-meria.kg/schools. Не определяй район школы по догадке.';
 if(/план|чек-лист|шаблон|составь|подготовь|структур|помоги начать/i.test(q))return 'Давай соберём задачу в рабочий план. Укажи только безопасный контекст: что хочешь улучшить, уровень (школа/район/город), какой результат нужен и к какому сроку. Я предложу этапы, ответственных по функциям, согласования, риски и критерии успеха. Не присылай имена, телефоны, адреса, документы или подробности личных конфликтов.';
 return 'Я — школьный помощник Ынтымак для Бишкека. Могу помочь с ученическим советом, планом проекта, внутренним предложением, школьным мероприятием, нейтральными правилами выборов, повесткой заседания, бюджетом с нулевыми затратами и черновиками RU/KG. Для конкретной школы сверяй данные в официальном каталоге: https://edu.e-meria.kg/schools. Напиши, какой результат хочешь получить; не отправляй персональные данные.';
}
async function sendChat(q,forceLocal=false){
 if(!q||state.busy)return;
 if(hasPersonalData(q)){state.chat.push({who:'bot',text:'Похоже, в сообщении есть электронная почта или номер телефона. Удали их и отправь вопрос без персональных данных. Не отправляй сведения о других учениках.'});render();return;}
 const useHosted=!forceLocal&&window.YntymakCloud?.hostedAIEnabled()&&window.YntymakCloud.getSession();
 if(useHosted&&!state.aiConsent){state.pendingQuestion=q;modal('Перед обращением к внешнему ИИ',`<div class="notice gold">Текст вопроса и до 6 последних сообщений диалога будут отправлены из защищённой функции Supabase внешнему поставщику языковой модели. Данные профиля автоматически не отправляются. Обработка может происходить за пределами Кыргызстана. Не отправляй персональные данные, имена, телефоны, адреса, документы, пароли или личные истории. Владелец платформы должен отдельно проверить требования закона о детских данных и трансграничной передаче до включения этой функции. История не сохраняется в профиле приложения.</div><p class="card-sub">Продолжить можно с этим вопросом или получить ответ локального помощника без внешней модели.</p><div class="action-row">${btn('Остаться в локальном режиме','data-ai-local','btn-outline')}${btn('Согласен отправить текст','data-ai-consent')}</div>`);return;}
 const history=state.chat.slice(-6).filter(m=>['user','bot'].includes(m.who)&&typeof m.text==='string'&&m.text.length<=700&&!hasPersonalData(m.text)).map(m=>({role:m.who==='bot'?'assistant':'user',content:m.text}));
 state.chat.push({who:'user',text:q});state.busy=true;render();let answer='';
 try{if(useHosted)answer=await window.YntymakCloud.askHostedAI(q,langCode(),history);else answer=localAssistant(q);}catch(e){answer=localAssistant(q)+'\n\n(Внешняя ИИ-модель сейчас недоступна; дан ответ локального помощника.)';}
 state.chat.push({who:'bot',text:answer});state.busy=false;render();
}
function addAudit(text){db.audit.push({text,date:new Date().toLocaleString('ru-RU')});persist();}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='yntymak-demo-export.json';a.click();URL.revokeObjectURL(a.href);toast('Экспортированы только локальные тестовые данные.');}
// Actions and navigation
$('#pageContent').addEventListener('click',async e=>{
 const resetEvents=e.target.closest('[data-event-reset]');if(resetEvents){$('#eventSearch').value='';$('#eventCategory').value='all';$('#eventTime').value='all';applyEventFilters();return;}
 const p=e.target.closest('[data-page]');if(p){go(p.dataset.page);return;}
 const a=e.target.closest('[data-action]');if(a){const action=a.dataset.action;if(action==='open-auth')loginModal();if(action==='new-idea')newIdea();if(action==='new-project')newProject();if(action==='new-election')newElection();if(action==='new-event')newEvent();if(action==='new-news')newNews();if(action==='new-poll')newPoll();if(action==='export'&&state.realAdmin)exportData();if(action==='mark-notifications-read'){db.notifications.forEach(n=>n.read=true);persist();render();toast('Уведомления отмечены прочитанными.');}return;}
 const fav=e.target.closest('[data-favorite-type]');if(fav){toggleFavorite(fav.dataset.favoriteType,fav.dataset.favoriteId);return;}
 const savedOpen=e.target.closest('[data-open-saved-type]');if(savedOpen){const type=savedOpen.dataset.openSavedType,id=savedOpen.dataset.openSavedId;if(type==='idea')viewIdea(id);if(type==='project')await viewProject(id);if(type==='event')viewEvent(id);return;}
 const cancelReg=e.target.closest('[data-cancel-registration]');if(cancelReg){const i=db.registrations.findIndex(r=>r.id===cancelReg.dataset.cancelRegistration&&r.owner==='local-profile');if(i>=0){const reg=db.registrations[i];db.registrations.splice(i,1);const ev=db.events.find(x=>x.id===reg.eventId);if(ev)ev.registered=Math.max(0,(ev.registered||0)-1);persist();addNotification('Регистрация отменена',`Запись на «${reg.eventTitle}» отменена в локальном демо.`);render();toast('Регистрация отменена.');}return;}
 const markRead=e.target.closest('[data-action="mark-notifications-read"]');if(markRead){db.notifications.forEach(n=>n.read=true);persist();render();toast('Уведомления отмечены прочитанными.');return;}
 const vev=e.target.closest('[data-view-event]');if(vev){viewEvent(vev.dataset.viewEvent);return;}
 const vi=e.target.closest('[data-view-idea]');if(vi){viewIdea(vi.dataset.viewIdea);return;}
 const si=e.target.closest('[data-support-idea]');if(si){const x=db.ideas.find(i=>i.id===si.dataset.supportIdea);if(x){if(x.supportedByMe){toast('Ты уже поддержал(а) эту идею в этом браузере.');return;}x.supportedByMe=true;x.support++;persist();render();toast('Тестовый отклик учтён.');}return;}
 const ve=e.target.closest('[data-view-election]');if(ve){viewElection(ve.dataset.viewElection);return;}
 const vp=e.target.closest('[data-view-project]');if(vp){await viewProject(vp.dataset.viewProject);return;}
 const jp=e.target.closest('[data-join-project]');if(jp){const x=db.projects.find(i=>i.id===jp.dataset.joinProject);if(x){if(x.joinedByMe){toast('Заявка уже отправлена.');return;}if(x.source==='cloud'){if(!window.YntymakCloud?.projectsEnabled()||!window.YntymakCloud?.getSession()){toast('Для заявки войди в аккаунт.');return;}try{await window.YntymakCloud.requestToJoinProject(x.id);x.joinedByMe=true;persist();render();toast('Заявка отправлена владельцу проекта.');}catch(err){toast(err.message||'Не удалось отправить заявку.');}return;}x.joinedByMe=true;x.members++;persist();render();toast('В демо ты добавлен(а) в команду.');}return;}
 const re=e.target.closest('[data-register-event]');if(re){registerEvent(re.dataset.registerEvent);return;}
 const sv=e.target.closest('[data-vote-survey]');if(sv){const poll=db.surveys.find(x=>x.id===sv.dataset.voteSurvey);if(!poll||poll.myChoice!==null){toast('Ответ уже сохранён в этом браузере.');return;}modal(poll.title,`<form id="surveyVoteForm" data-survey="${esc(poll.id)}" class="field-grid">${poll.options.map((o,i)=>`<label class="field"><span><input type="radio" name="choice" value="${i}" required> ${esc(o)}</span></label>`).join('')}<div class="field full form-actions"><button type="button" class="btn btn-outline" data-close-modal>Отмена</button><button class="btn" type="submit">Отправить мнение</button></div></form><p class="lang-hint">Необязательный учебный опрос; не для официальных решений.</p>`);return;}
 const prompt=e.target.closest('[data-prompt]');if(prompt){sendChat(prompt.dataset.prompt);return;}
 const adm=e.target.closest('[data-admin-tab]');if(adm&&state.realAdmin){state.adminTab=adm.dataset.adminTab;render();return;}
 const aa=e.target.closest('[data-admin-action]');if(aa&&state.realAdmin){const id=aa.dataset.id,el=db.ideas.find(x=>x.id===id),election=db.elections.find(x=>x.id===id);if(aa.dataset.adminAction==='publish-idea'&&el)el.status='open';if(aa.dataset.adminAction==='reject-idea'&&el)el.status='rejected';if(['approve-candidate','reject-candidate'].includes(aa.dataset.adminAction)&&election){const c=election.candidates.find(x=>x.id===aa.dataset.candidate);if(c)c.status=aa.dataset.adminAction==='approve-candidate'?'approved':'rejected';}if(aa.dataset.adminAction==='approve-idea'&&el)el.status='open';persist();addAudit(`Действие модерации: ${aa.dataset.adminAction} · ${id}`);render();toast('Демо-статус обновлён.');return;}
 const roster=e.target.closest('[data-roster]');if(roster){await adminRoster(roster.dataset.roster);return;}
 const cast=e.target.closest('[data-cast-vote]');if(cast){const el=db.elections.find(x=>x.id===cast.dataset.castVote);if(!el||el.stage!=='voting'||el.myVote){toast('Голосование закрыто или голос уже сохранён.');return;}const c=el.candidates.find(x=>x.id===cast.dataset.candidate&&x.status==='approved');if(!c)return;el.myVote=c.id;c.votes=(c.votes||0)+1;persist();closeModal();render();toast('Тестовый голос сохранён в этом браузере.');return;}
 const nom=e.target.closest('[data-nominate]');if(nom){nominate(nom.dataset.nominate);return;}
});
$('#modalRoot').addEventListener('click',async e=>{if(e.target.matches('[data-close-modal]')||e.target.matches('[data-backdrop]'))closeModal();const aiOk=e.target.closest('[data-ai-consent]');if(aiOk){state.aiConsent=true;const q=state.pendingQuestion;state.pendingQuestion='';closeModal();sendChat(q);return;}const aiLocal=e.target.closest('[data-ai-local]');if(aiLocal){const q=state.pendingQuestion;state.pendingQuestion='';closeModal();sendChat(q,true);return;}const jr=e.target.closest('[data-review-join]');if(jr){const requestId=jr.dataset.reviewJoin,decision=jr.dataset.decision,projectId=jr.dataset.projectId;try{await window.YntymakCloud.reviewProjectJoinRequest(requestId,decision);const counts=await window.YntymakCloud.getProjectMemberCounts();const project=db.projects.find(x=>x.id===projectId);if(project)project.members=Number(counts.find(x=>x.project_id===projectId)?.member_count||project.members);toast(decision==='accepted'?'Заявка принята, участник добавлен в команду.':'Заявка отклонена.');await viewProject(projectId);}catch(err){toast(err.message||'Не удалось обработать заявку.');}return;}const nm=e.target.closest('[data-nominate]');if(nm){nominate(nm.dataset.nominate);return;}const cast=e.target.closest('[data-cast-vote]');if(cast){const el=db.elections.find(x=>x.id===cast.dataset.castVote);if(!el||el.stage!=='voting'||el.myVote)return;const c=el.candidates.find(x=>x.id===cast.dataset.candidate&&x.status==='approved');if(!c)return;el.myVote=c.id;c.votes=(c.votes||0)+1;persist();closeModal();render();toast('Тестовый голос сохранён локально.');}});
document.addEventListener('submit',async e=>{
 const f=e.target;
 if(f.id==='ideaForm'){
  e.preventDefault();
  const d=new FormData(f);
  const payload={title:d.get('title').trim(),description:d.get('description').trim(),category:d.get('category'),scope:d.get('scope'),target:d.get('target').trim(),district:db.profile.district||''};
  if(window.YntymakCloud?.initiativesEnabled() && window.YntymakCloud?.getSession()){
   try{
    const saved=await window.YntymakCloud.createInitiative(payload);
    db.ideas.unshift({id:saved.id,title:saved.title,description:saved.description,category:saved.category,scope:saved.scope,target:saved.target_label||payload.target,district:saved.district_key||'',status:'review',created:String(saved.created_at).slice(0,10),author:'Ты',support:0,response:'',comments:[],source:'cloud'});
    persist();closeModal();go('ideas');toast('Предложение сохранено в облаке и отправлено на проверку.');
   }catch(err){toast(err.message||'Не удалось отправить предложение в облако.');}
   return;
  }
  db.ideas.unshift({id:'IDEA-'+Date.now(),...payload,district:payload.district,status:'review',created:new Date().toISOString().slice(0,10),author:db.profile.name,support:0,response:'',comments:[]});
  persist();addNotification('Предложение создано','Оно сохранено локально и ожидает учебной модерации.');closeModal();go('ideas');toast('Предложение сохранено только в этом браузере (демо).');
 }
 if(f.id==='projectForm'){
 e.preventDefault();const d=new FormData(f);
 const payload={title:d.get('title').trim(),description:d.get('description').trim(),category:d.get('category'),scope:d.get('scope'),target:d.get('target').trim(),district:db.profile.district||'',firstTask:d.get('firstTask').trim()};
 if(window.YntymakCloud?.projectsEnabled()&&window.YntymakCloud?.getSession()){
  try{await window.YntymakCloud.createProject(payload);db.projects=await window.YntymakCloud.listProjects();persist();closeModal();go('projects');toast('Проект отправлен на модерацию.');}
  catch(err){toast(err.message||'Не удалось сохранить проект в облаке.');}
  return;
 }
 db.projects.unshift({id:'PR-'+Date.now(),...payload,stage:'team',owner:db.profile.name,members:1,created:new Date().toISOString().slice(0,10),tasks:[payload.firstTask,'Согласовать план с куратором','Проверить результат']});
 persist();addNotification('Проект создан','Добавь задачи и отмечай их выполнение в карточке проекта.');closeModal();go('projects');toast('Проект создан только в этом браузере (демо).');
}
 if(f.id==='candidateForm'){e.preventDefault();const d=new FormData(f),el=db.elections.find(x=>x.id===f.dataset.election);if(!el||el.stage!=='nominations')return;if(d.get('publicNameConsent')!=='on'||d.get('publicProgramConsent')!=='on'){toast('Нужно отдельно подтвердить публикацию имени и программы.');return;}el.candidates.push({id:'C-'+Date.now(),name:d.get('name').trim(),program:d.get('program').trim(),publicNameConsent:true,publicProgramConsent:true,publicConsentAt:new Date().toISOString(),status:'pending'});persist();closeModal();render();toast('Заявка кандидата отправлена на проверку. Подача бесплатная.');}
 if(f.id==='registrationForm'){e.preventDefault();const d=new FormData(f),el=db.events.find(x=>x.id===f.dataset.event);if(!el||el.registered>=el.capacity)return;if(el.source==='cloud'&&window.YntymakCloud?.eventsEnabled()&&window.YntymakCloud?.getSession()){try{await window.YntymakCloud.registerForEvent({eventId:el.id,organizerAccessConsent:d.get('organizerAccessConsent')==='on'});db.events=await window.YntymakCloud.listEvents();closeModal();render();toast('Регистрация сохранена. Данные профиля доступны только уполномоченному организатору этого события.');}catch(err){toast(err.message||'Не удалось зарегистрироваться.');}return;}if(db.registrations.some(x=>x.eventId===el.id&&x.owner==='local-profile')){toast('Ты уже зарегистрирован(а) на это событие.');return;}db.registrations.push({id:'REG-'+Date.now(),eventId:el.id,eventTitle:el.title,name:String(d.get('name')||'').trim(),school:String(d.get('school')||'').trim(),grade:String(d.get('grade')||'').trim(),owner:'local-profile',status:'Подтверждена в демо'});el.registered++;persist();addNotification('Регистрация сохранена',`Ты записан(а) на «${el.title}». Регистрация существует только в этом браузере.`);closeModal();render();toast('Заявка зарегистрирована в локальном демо.');}
 if(f.id==='profileForm'){e.preventDefault();const d=new FormData(f);const about=String(d.get('about')||'').trim();if(state.cloudProfile&&window.YntymakCloud?.getSession()){try{const saved=await window.YntymakCloud.updateMyProfile({displayName:String(d.get('name')||'').trim(),gradeLabel:String(d.get('grade')||'').trim(),language:langCode()});db.profile={...db.profile,name:saved.displayName,school:saved.schoolName,district:saved.districtKey,grade:saved.gradeLabel,verified:Boolean(saved.schoolId),about,source:'cloud'};persist();render();toast('Имя и класс синхронизированы. Поле «О себе» осталось только в этом браузере.');}catch(err){toast(err.message||'Не удалось обновить облачный профиль.');}return;}db.profile={...db.profile,name:String(d.get('name')||'').trim(),school:String(d.get('school')||'').trim(),district:String(d.get('district')||''),grade:String(d.get('grade')||'').trim(),about};persist();render();toast('Демонстрационный профиль сохранён только в этом браузере.');}
 if(f.id==='chatForm'){e.preventDefault();const q=$('#chatInput').value.trim();await sendChat(q);}
 if(f.id==='surveyVoteForm'){e.preventDefault();const d=new FormData(f),poll=db.surveys.find(x=>x.id===f.dataset.survey),i=Number(d.get('choice'));if(!poll||poll.myChoice!==null||!Number.isInteger(i)||i<0||i>=poll.votes.length)return;if(poll.source==='cloud'&&window.YntymakCloud?.contentEnabled()){try{await window.YntymakCloud.castPollVote(poll.id,poll.optionIds[i]);db.surveys=await window.YntymakCloud.listPolls();closeModal();render();toast('Ответ принят.');}catch(err){toast(err.message||'Не удалось отправить ответ.');}return;}poll.votes[i]++;poll.myChoice=i;persist();closeModal();render();toast('Тестовый ответ учтён.');}
 if(f.id==='electionForm'){e.preventDefault();if(!state.realAdmin)return;const d=new FormData(f);const dates=['nominationEnd','campaignEnd','votingStart','votingEnd'].map(k=>d.get(k));if(dates.some((v,i)=>i>0&&v<dates[i-1])){toast('Проверь порядок дат: приём заявок → кампания → голосование.');return;}db.elections.unshift({id:'EL-'+Date.now(),title:d.get('title').trim(),position:d.get('position').trim(),scope:d.get('scope'),target:d.get('target').trim(),district:d.get('district'),description:d.get('description').trim(),stage:'nominations',nominationEnd:d.get('nominationEnd'),campaignEnd:d.get('campaignEnd'),votingStart:d.get('votingStart'),votingEnd:d.get('votingEnd'),candidates:[],myVote:null});persist();addAudit(`Созданы выборы: ${d.get('title')}`);closeModal();state.adminTab='content';go('admin');toast('Учебный сценарий выборов создан.');}
 if(f.id==='eventForm'){e.preventDefault();if(!state.realAdmin)return;const d=new FormData(f);const payload={title:d.get('title').trim(),description:d.get('description').trim(),date:d.get('date'),place:d.get('place').trim(),capacity:Number(d.get('capacity')),scope:'city',target:'Бишкек',category:'forum'};if(window.YntymakCloud?.eventsEnabled()&&window.YntymakCloud?.getSession()){try{await window.YntymakCloud.createEvent(payload);db.events=await window.YntymakCloud.listEvents();persist();addAudit(`Создано мероприятие: ${payload.title}`);closeModal();state.adminTab='events';go('admin');toast('Мероприятие опубликовано в облаке.');}catch(err){toast(err.message||'Не удалось создать мероприятие.');}return;}db.events.unshift({id:'EV-'+Date.now(),...payload,registered:0,status:'open'});persist();addAudit(`Создано мероприятие: ${payload.title}`);closeModal();state.adminTab='events';go('admin');toast('Мероприятие создано только в демо.');}
 if(f.id==='pollForm'){e.preventDefault();if(!state.realAdmin)return;const d=new FormData(f),options=[d.get('option1'),d.get('option2'),d.get('option3'),d.get('option4')].map(x=>String(x||'').trim()).filter(Boolean);if(options.length<2||new Set(options.map(x=>x.toLocaleLowerCase())).size!==options.length){toast('Нужно 2–4 неповторяющихся варианта.');return;}const payload={title:String(d.get('title')).trim(),description:String(d.get('description')||'').trim(),options,closesAt:d.get('closesAt')?new Date(d.get('closesAt')+'T23:59:00').toISOString():null};if(window.YntymakCloud?.contentEnabled()&&window.YntymakCloud?.getSession()){try{await window.YntymakCloud.createPoll(payload);db.surveys=await window.YntymakCloud.listPolls();closeModal();go('surveys');toast('Опрос создан в облаке.');}catch(err){toast(err.message||'Не удалось создать опрос.');}return;}db.surveys.unshift({id:'SV-'+Date.now(),title:payload.title,description:payload.description,options:options,votes:options.map(()=>0),myChoice:null,status:'open',source:'local'});persist();addAudit('Создан демонстрационный опрос: '+payload.title);closeModal();go('surveys');toast('Опрос создан только в локальном демо.');}
 if(f.id==='newsForm'){e.preventDefault();if(!state.realAdmin)return;const d=new FormData(f),payload={title:d.get('title').trim(),text:d.get('text').trim(),category:d.get('category')};if(window.YntymakCloud?.contentEnabled()&&window.YntymakCloud?.getSession()){try{await window.YntymakCloud.createNews(payload);db.news=await window.YntymakCloud.listNews();closeModal();go('news');toast('Новость опубликована в облаке.');}catch(err){toast(err.message||'Не удалось опубликовать новость.');}return;}db.news.unshift({id:'N-'+Date.now(),...payload,date:d.get('date')});persist();addAudit(`Опубликована новость: ${payload.title}`);closeModal();go('news');toast('Новость добавлена только в локальный тест.');}
 if(f.id==='passwordRecoveryForm'){
  e.preventDefault();
  const d=new FormData(f),password=String(d.get('password')||''),confirmPassword=String(d.get('confirmPassword')||'');
  if(password!==confirmPassword){toast('Пароли не совпадают.');return;}
  try{
   await window.YntymakCloud.updatePassword(password);
   closeModal();
   window.history.replaceState({},document.title,window.location.pathname);
   toast('Пароль обновлён. Теперь можно войти с новым паролем.');
  }catch(err){toast(err.message||'Не удалось обновить пароль.');}
  return;
 }
 if(f.id==='loginForm'){
  e.preventDefault();
  const d=new FormData(f);
  if(window.YNTYMAK_CONFIG?.enableAuthCaptcha===true&&!testerCaptchaToken){toast('Пройди проверку безопасности перед входом.');return;}
  try{
   const result=await window.YntymakCloud.signIn({
    email:d.get('email').trim(),password:d.get('password'),captchaToken:testerCaptchaToken
   });
   disposeTesterCaptcha();
   state.admin=result.isAdmin;state.realAdmin=result.isAdmin;
   try{await loadCloudProfile();}catch(profileError){console.warn('Cloud profile could not be loaded:',profileError.message);}
   closeModal();render();toast(result.isAdmin?'Вход выполнен. Подтверждены полномочия администратора.':'Вход выполнен. Добро пожаловать, тестировщик!');
  }catch(err){
   toast(err.message||'Не удалось войти.');
   if(window.YNTYMAK_CONFIG?.enableAuthCaptcha===true){disposeTesterCaptcha();loadTesterCaptcha().catch(()=>{});}
  }
 }
 if(f.id==='signupForm'){
  e.preventDefault();
  const d=new FormData(f);
  if(!window.YntymakCloud?.configured()){toast('Сначала настрой Supabase Auth.');return;}
  if(!testerCaptchaToken){toast('Пройди проверку безопасности перед регистрацией.');return;}
  try{
   const result=await window.YntymakCloud.signUp({
    email:d.get('email').trim(),password:d.get('password'),
    displayName:d.get('displayName').trim(),language:langCode(),
    captchaToken:testerCaptchaToken
   });
   state.admin=Boolean(result.isAdmin);state.realAdmin=Boolean(result.isAdmin);
   if(window.YntymakCloud?.getSession()){
    try{await loadCloudProfile();}catch(profileError){console.warn('Cloud profile could not be loaded:',profileError.message);}
   }
   disposeTesterCaptcha();
   closeModal();
   toast(result.emailConfirmationRequired?'Письмо отправлено. Подтверди адрес, затем войди — профиль получит статус тестировщика.':'Аккаунт тестировщика создан. Профиль подготовлен.');
  }catch(err){
   disposeTesterCaptcha();
   toast(err.message||'Не удалось зарегистрироваться.');
   if(document.getElementById('signupForm'))loadTesterCaptcha().catch(()=>{});
  }
 }
});
document.addEventListener('click',async e=>{
 const reset=e.target.closest('[data-password-reset]');
 if(!reset)return;
 const email=$('#loginForm input[name="email"]')?.value.trim()||'';
 if(!email){toast('Сначала укажи электронную почту в форме входа.');$('#loginForm input[name="email"]')?.focus();return;}
 try{
  if(window.YNTYMAK_CONFIG?.enableAuthCaptcha===true&&!testerCaptchaToken){toast('Пройди проверку безопасности перед восстановлением пароля.');return;}\n  await window.YntymakCloud.requestPasswordReset(email,testerCaptchaToken);
  disposeTesterCaptcha();\n  toast('Если аккаунт с таким адресом существует, письмо для восстановления отправлено.');
 }catch(err){toast(err.message||'Не удалось отправить письмо восстановления.');if(window.YNTYMAK_CONFIG?.enableAuthCaptcha===true){disposeTesterCaptcha();loadTesterCaptcha().catch(()=>{});}}
});
window.addEventListener('yntymak:password-recovery',()=>passwordRecoveryModal());
$('#authButton').addEventListener('click',()=>{if(window.YntymakCloud?.getSession()){go('profile');toast('Аккаунт активен.');}else loginModal();});
$('#signOutButton').addEventListener('click',async()=>{try{await window.YntymakCloud?.signOut();}catch(e){toast(e.message);return;}state.admin=false;state.realAdmin=false;state.cloudProfile=false;activateAccountStore();render();toast('Сессия завершена.');});
$('#languageBtn').addEventListener('click',()=>{state.lang=state.lang==='RU'?'KG':'RU';render();});
$('#mobileMenu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#mobileMenu').setAttribute('aria-expanded',String(open));});
document.addEventListener('click',e=>{const p=e.target.closest('[data-page]');if(p&&!$('#pageContent').contains(p))go(p.dataset.page);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
document.addEventListener('change',e=>{const cb=e.target.closest('[data-task-toggle]');if(!cb)return;const p=db.projects.find(x=>x.id===cb.dataset.taskToggle),i=Number(cb.dataset.taskIndex);if(!p||!Number.isInteger(i)||i<0||i>=(p.tasks||[]).length)return;p.completedTasks=Array.isArray(p.completedTasks)?p.completedTasks:[];if(cb.checked&&!p.completedTasks.includes(i))p.completedTasks.push(i);if(!cb.checked)p.completedTasks=p.completedTasks.filter(x=>x!==i);persist();if(cb.closest('#modalRoot')){const pct=p.tasks.length?Math.round(p.completedTasks.length/p.tasks.length*100):0;const bar=$('.task-progress .bar span',$('#modalRoot'));if(bar)bar.style.width=pct+'%';const label=$('.task-progress .meta-line span:last-child',$('#modalRoot'));if(label)label.textContent=pct+'%';cb.closest('.task-line')?.classList.toggle('task-done',cb.checked);}else render();toast(cb.checked?'Шаг отмечен выполненным.':'Отметка снята.');});
$('#pageContent').addEventListener('input',e=>{if(e.target.id==='eventSearch'){applyEventFilters();return;}if(['ideaSearch','ideaScope','ideaStatus'].includes(e.target.id)){const q=($('#ideaSearch')?.value||'').toLowerCase(),scope=$('#ideaScope')?.value||'all',status=$('#ideaStatus')?.value||'all';$$('#ideaList .idea-card').forEach((el,i)=>{const item=db.ideas.filter(x=>x.status!=='review'||state.realAdmin)[i];el.hidden=!(item&&item.title.toLowerCase().includes(q)&&(scope==='all'||item.scope===scope)&&(status==='all'||item.status===status));});}});
$('#pageContent').addEventListener('change',e=>{if(['eventCategory','eventTime'].includes(e.target.id))applyEventFilters();});
if(window.YntymakCloud?.configured()){
 window.YntymakCloud.init().then(async result=>{
  state.admin=!!result.isAdmin;state.realAdmin=!!result.isAdmin;
   if(result.session){try{await loadCloudProfile();}catch(e){console.warn('Cloud profile could not be loaded:',e.message);}}
  if(window.YntymakCloud.initiativesEnabled() && result.session){
   try{db.ideas=await window.YntymakCloud.listInitiatives();}catch(e){console.warn('Cloud initiatives unavailable:',e.message);}
  }
  if(window.YntymakCloud.projectsEnabled() && result.session){
   try{db.projects=await window.YntymakCloud.listProjects();}catch(e){console.warn('Cloud projects unavailable:',e.message);}
  }
  if(window.YntymakCloud.eventsEnabled() && result.session){
   try{db.events=await window.YntymakCloud.listEvents();}catch(e){console.warn('Cloud events unavailable:',e.message);}
  }
  if(window.YntymakCloud.contentEnabled() && result.session){
   try{db.news=await window.YntymakCloud.listNews();db.surveys=await window.YntymakCloud.listPolls();}catch(e){console.warn('Cloud content unavailable:',e.message);}
  }
  render();
 }).catch(e=>console.warn('Supabase initialization:',e.message));
}
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Offline shell registration:',error.message)));
}
render();
})();

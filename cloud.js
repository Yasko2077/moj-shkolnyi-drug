/* Supabase Auth + single-admin verification + optional hosted AI. All authorization must also be enforced by RLS/RPC. */
(() => {
  const cfg = window.YNTYMAK_CONFIG || {};
  let client = null, session = null, authUser = null, isAdmin = false, passwordRecoveryPending = false;
  const configured = () => Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && window.supabase?.createClient);
  function getClient() {
    if (!configured()) return null;
    if (!client) client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }
  async function refresh() {
    const c = getClient();
    if (!c) { session = null; authUser = null; isAdmin = false; return null; }
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    session = data.session || null;
    authUser = session?.user || null;
    return session;
  }
  async function ensureProfile() {
    const c = getClient();
    if (!c || !session?.user) throw new Error('Сначала войди в аккаунт.');
    const meta = session.user.user_metadata || {};
    const { error } = await c.rpc('create_my_profile', {
      p_display_name: meta.display_name || session.user.email?.split('@')[0] || 'Участник',
      p_preferred_language: meta.preferred_language || 'ru',
      p_grade_label: null
    });
    if (error) throw error;
    return true;
  }
  async function checkAdmin() {
    const c = getClient();
    if (!c || !session) { isAdmin = false; return false; }
    const { data, error } = await c.rpc('is_verification_representative');
    if (error) { isAdmin = false; throw error; }
    isAdmin = data === true;
    return isAdmin;
  }
  async function init() {
    const c = getClient();
    if (!c) return { configured: false, session: null, isAdmin: false };
    c.auth.onAuthStateChange((event, next) => {
      session = next || null; authUser = session?.user || null;
      if (!session) isAdmin = false;
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryPending = true;
        window.dispatchEvent(new Event('yntymak:password-recovery'));
      }
    });
    await refresh();
    if (session) {
      try { await ensureProfile(); } catch (e) { console.warn('Profile bootstrap needs migration/configuration:', e.message); }
      try { await checkAdmin(); } catch (e) { console.warn('Admin check failed:', e.message); }
    }
    return { configured: true, session, isAdmin };
  }
  async function signUp({ email, password, displayName, language = 'ru', captchaToken = '' }) {
    const c = getClient(); if (!c) throw new Error('Подключение Supabase ещё не настроено.');
    if (cfg.enableSelfServiceSignup !== true || cfg.enableAuthCaptcha !== true) {
      throw new Error('Самостоятельная регистрация пока закрыта. Попроси организатора прислать персональное приглашение.');
    }
    if (!String(cfg.turnstileSiteKey || '').trim() || !String(captchaToken || '').trim()) {
      throw new Error('Пройди проверку безопасности перед созданием аккаунта.');
    }
    const { data, error } = await c.auth.signUp({
      email, password,
      options: { data: { display_name: displayName, preferred_language: language }, emailRedirectTo: `${location.origin}${location.pathname}`, captchaToken }
    });
    if (error) throw error;
    session = data.session || null; authUser = data.user || null;
    isAdmin = false;
    if (session) {
      try {
        await ensureProfile();
        await checkAdmin();
      } catch (e) {
        throw new Error(`Аккаунт создан, но профиль не подготовлен: ${e.message}. Проверь миграцию профиля.`);
      }
    }
    return { emailConfirmationRequired: !data.session, accountType: 'tester', isAdmin };
  }
  async function signIn({ email, password, captchaToken = '' }) {
    const c = getClient(); if (!c) throw new Error('Настрой Supabase в supabase-config.js.');
    if (cfg.enableAuthCaptcha === true && !String(captchaToken || '').trim()) {
      throw new Error('Пройди проверку безопасности перед входом.');
    }
    const credentials = { email, password };
    if (String(captchaToken || '').trim()) credentials.options = { captchaToken: String(captchaToken).trim() };
    const { data, error } = await c.auth.signInWithPassword(credentials);
    if (error) throw error;
    session = data.session; authUser = data.user;
    await ensureProfile(); await checkAdmin();
    return { user: authUser, isAdmin };
  }
  async function requestPasswordReset(email, captchaToken = '') {
    const c = getClient();
    if (!c) throw new Error('Подключение Supabase ещё не настроено.');
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(cleanEmail)) {
      throw new Error('Укажи корректную электронную почту в форме входа.');
    }
    if (cfg.enableAuthCaptcha === true && !String(captchaToken || '').trim()) {
      throw new Error('Пройди проверку безопасности перед восстановлением пароля.');
    }
    const resetOptions = { redirectTo: `${location.origin}${location.pathname}` };
    if (String(captchaToken || '').trim()) resetOptions.captchaToken = String(captchaToken).trim();
    const { error } = await c.auth.resetPasswordForEmail(cleanEmail, resetOptions);
    if (error) throw error;
    return true;
  }
  async function updatePassword(newPassword) {
    const c = getClient();
    if (!c || !session?.user || !passwordRecoveryPending) {
      throw new Error('Открой ссылку восстановления из письма, прежде чем задавать новый пароль.');
    }
    if (String(newPassword || '').length < 8 || String(newPassword || '').length > 72) {
      throw new Error('Новый пароль должен содержать от 8 до 72 символов.');
    }
    const { error } = await c.auth.updateUser({ password: String(newPassword) });
    if (error) throw error;
    passwordRecoveryPending = false;
    return true;
  }
  async function signOut() {
    const c = getClient(); if (!c) return;
    const { error } = await c.auth.signOut(); if (error) throw error;
    session = null; authUser = null; isAdmin = false;
  }
  async function getMyProfile() {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    let {data,error}=await c.from('profiles')
      .select('display_name,preferred_language,school_id,grade_label,account_type')
      .eq('id',session.user.id).maybeSingle();

    // Backward compatibility while tester_onboarding is not deployed to this database.
    // Missing account_type never grants any privilege; it defaults to the unprivileged tester state.
    if(error && /account_type|column .* does not exist|42703/i.test([error.message,error.details,error.code].filter(Boolean).join(' '))) {
      ({data,error}=await c.from('profiles')
        .select('display_name,preferred_language,school_id,grade_label')
        .eq('id',session.user.id).maybeSingle());
    }
    if(error) throw error;
    if(!data) return null;
    let schoolName='',districtKey='';
    if(data.school_id){
      const {data:school,error:schoolError}=await c.from('schools')
        .select('name,district_key').eq('id',data.school_id).maybeSingle();
      if(schoolError) throw schoolError;
      schoolName=school?.name||'';
      districtKey=school?.district_key||'';
    }
    return {
      displayName:data.display_name||'',
      preferredLanguage:data.preferred_language||'ru',
      schoolId:data.school_id||null,
      schoolName,
      districtKey,
      gradeLabel:data.grade_label||'',
      accountType:data.account_type||'tester'
    };
  }

    async function updateMyProfile({displayName,gradeLabel,language='ru'}) {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    const cleanName=String(displayName||'').trim();
    const cleanGrade=String(gradeLabel||'').trim();
    if(cleanName.length<2||cleanName.length>70||cleanGrade.length>30||!['ru','ky'].includes(language)){
      throw new Error('Проверь имя, класс и язык профиля.');
    }
    const {error}=await c.from('profiles').update({
      display_name:cleanName,
      preferred_language:language,
      grade_label:cleanGrade||null
    }).eq('id',session.user.id);
    if(error) throw error;
    const saved=await getMyProfile();
    if(!saved) throw new Error('Профиль не найден. Повтори вход или обратись к проверяющему представителю.');
    return saved;
  }
  async function listActiveSchools() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт.');
    const {data,error}=await c.from('schools').select('id,name,district_key').eq('is_active',true).order('name',{ascending:true});
    if(error) throw error; return data||[];
  }
  async function assignProfileSchool({userId,schoolId,reason}) {
    const c=getClient(); if(!c||!session||!isAdmin) throw new Error('Назначение школы доступно только подтверждённому представителю.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId||'')) ||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(schoolId||'')) ||
       String(reason||'').trim().length<8 || String(reason||'').trim().length>500) {
      throw new Error('Проверь данные назначения школы.');
    }
    const {error}=await c.rpc('assign_profile_school',{p_user_id:userId,p_school_id:schoolId,p_reason:String(reason).trim()});
    if(error) throw error;
  }
  async function listInitiatives() {
    const c = getClient();
    if (!c || !session) throw new Error('Для просмотра облачных предложений войди в аккаунт.');
    const { data, error } = await c.from('initiatives')
      .select('id,title,description,category,scope,district_key,target_label,status,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map(x => ({
      id: x.id,
      title: x.title,
      description: x.description,
      category: x.category,
      scope: x.scope,
      district: x.district_key || '',
      target: x.target_label || (x.scope === 'city' ? 'Весь Бишкек' : ''),
      status: ({ review: 'review', published: 'open', completed: 'closed', rejected: 'rejected' })[x.status] || 'review',
      created: String(x.created_at).slice(0, 10),
      author: 'Участник',
      support: 0,
      response: '',
      comments: [],
      source: 'cloud'
    }));
  }
  async function createInitiative({ title, description, category, scope, district = '', target = '' }) {
    const c = getClient();
    if (!c || !session?.user) throw new Error('Войди в аккаунт, чтобы отправить предложение.');
    const cleanTitle = String(title || '').trim();
    const cleanDescription = String(description || '').trim();
    if (cleanTitle.length < 5 || cleanTitle.length > 120 || cleanDescription.length < 20 || cleanDescription.length > 1200) {
      throw new Error('Проверь длину названия и описания предложения.');
    }
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?996|0)\s?\d{3}[\s-]?\d{3}[\s-]?\d{3}|\b\d{10,}\b/i.test(cleanTitle + ' ' + cleanDescription)) {
      throw new Error('Не добавляй контактные и личные данные в предложение.');
    }
    if (scope === 'district' && !['lenin','pervomai','oktyabr','sverdlov'].includes(district)) {
      throw new Error('Для районного предложения выбери один из четырёх районов.');
    }
    const { data: profile, error: profileError } = await c.from('profiles').select('school_id').eq('id', session.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (scope === 'school' && !profile?.school_id) throw new Error('Школа в профиле ещё не подтверждена. Пока можно отправить районное или городское предложение.');
    const row = {
      created_by: session.user.id,
      title: cleanTitle,
      description: cleanDescription,
      category: String(category || 'other').slice(0, 60),
      scope: ['school','district','city'].includes(scope) ? scope : 'school',
      district_key: ['lenin','pervomai','oktyabr','sverdlov'].includes(district) ? district : null,
      school_id: profile?.school_id || null,
      target_label: String(target || '').trim().slice(0, 120) || null,
      status: 'review'
    };
    const { data, error } = await c.from('initiatives').insert(row)
      .select('id,title,description,category,scope,district_key,target_label,status,created_at')
      .single();
    if (error) throw error;
    return data;
  }
  async function listProjects() {
    const c = getClient();
    if (!c || !session) throw new Error('Для просмотра проектов войди в аккаунт.');
    const { data, error } = await c.from('student_projects')
      .select('id,title,description,category,scope,target_label,district_key,first_task,status,created_at,created_by')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const {data:memberRows,error:memberError}=await c.rpc('get_project_member_counts');
    if(memberError) throw memberError;
    const memberCounts=new Map((memberRows||[]).map(x=>[x.project_id,Number(x.member_count)]));
    return (data || []).map(p => ({
      id:p.id, title:p.title, description:p.description, category:p.category,
      scope:p.scope, target:p.target_label, district:p.district_key || '',
      stage:p.status === 'completed' ? 'completed' : p.status === 'published' ? 'active' : 'review',
      owner:p.created_by === session.user.id ? 'Ты' : 'Участник',
      members:memberCounts.get(p.id)||0, created:String(p.created_at).slice(0,10),
      tasks:[p.first_task], source:'cloud', canManage:p.created_by === session.user.id
    }));
  }
  async function createProject({ title, description, category, scope, target, district = '', firstTask }) {
    const c = getClient();
    if (!c || !session?.user) throw new Error('Войди в аккаунт, чтобы создать проект.');
    const clean = {
      title:String(title || '').trim(), description:String(description || '').trim(),
      category:String(category || 'Другое').trim().slice(0,60),
      scope:['school','district','city'].includes(scope) ? scope : 'school',
      target_label:String(target || '').trim(), first_task:String(firstTask || '').trim()
    };
    if(clean.title.length<5||clean.title.length>100||clean.description.length<20||clean.description.length>900||clean.target_label.length<2||clean.target_label.length>120||clean.first_task.length<3||clean.first_task.length>140) {
      throw new Error('Проверь обязательные поля и длину текста.');
    }
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?996|0)\s?\d{3}[\s-]?\d{3}[\s-]?\d{3}|\b\d{10,}\b/i.test(Object.values(clean).join(' '))) {
      throw new Error('Не добавляй контакты и личные данные в описание проекта.');
    }
    if(clean.scope==='district'&&!['lenin','pervomai','oktyabr','sverdlov'].includes(district)) throw new Error('Выбери район для районного проекта.');
    const {data,error}=await c.from('student_projects').insert({
      created_by:session.user.id,...clean,
      district_key:['lenin','pervomai','oktyabr','sverdlov'].includes(district)?district:null,
      status:'review'
    }).select('id').single();
    if(error) throw error;
    return data;
  }
  async function requestToJoinProject(projectId, message='') {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт, чтобы отправить заявку.');
    const {data,error}=await c.from('project_join_requests').insert({
      project_id:projectId,user_id:session.user.id,message:String(message||'').trim().slice(0,300),status:'pending'
    }).select('id').single();
    if(error) throw error;
    return data;
  }
  async function reviewProjectJoinRequest(requestId, decision) {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    if(!['accepted','declined'].includes(decision)) throw new Error('Недопустимое решение.');
    const {error}=await c.rpc('review_project_join_request',{p_request_id:requestId,p_decision:decision});
    if(error) throw error;
    return true;
  }
  async function withdrawProjectJoinRequest(requestId) {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    const {error}=await c.rpc('withdraw_project_join_request',{p_request_id:requestId});
    if(error) throw error;
    return true;
  }

  async function getProjectMemberCounts() {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    const {data,error}=await c.rpc('get_project_member_counts');
    if(error) throw error;
    return data||[];
  }

  async function listProjectJoinRequests(projectId) {
    const c=getClient();
    if(!c||!session?.user) throw new Error('Войди в аккаунт.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(projectId||''))) throw new Error('Некорректный идентификатор проекта.');
    const {data,error}=await c.from('project_join_requests').select('id,message,status,created_at').eq('project_id',projectId).eq('status','pending').order('created_at',{ascending:true});
    if(error) throw error;
    return data||[];
  }

  async function listEvents() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт для просмотра мероприятий.');
    const {data,error}=await c.from('events').select('id,event_key,title,is_open,description,event_date,place_label,capacity,scope,target_label,district_key').order('event_date',{ascending:true});
    if(error) throw error;
    const {data:counts,error:countError}=await c.rpc('get_event_registration_counts');
    if(countError) throw countError;
    const countMap=new Map((counts||[]).map(x=>[x.event_id,Number(x.registered_count)]));
    return (data||[]).map(e=>({id:e.id,title:e.title,description:e.description||'',date:e.event_date||'',place:e.place_label||'',capacity:e.capacity||40,registered:countMap.get(e.id)||0,status:e.is_open?'open':'closed',scope:e.scope||'city',target:e.target_label||'Бишкек',category:e.event_key,source:'cloud'}));
  }
  async function createEvent({title,description,date,place,capacity,scope='city',target='Бишкек',district='',category='forum'}) {
    const c=getClient(); if(!c||!session) throw new Error('Нет активной сессии.');
    const {data,error}=await c.rpc('create_platform_event',{p_event_key:category,p_title:title,p_description:description,p_event_date:date,p_place_label:place,p_capacity:Number(capacity),p_scope:scope,p_target_label:target,p_district_key:district||null});
    if(error) throw error; return data;
  }
  async function registerForEvent({eventId,organizerAccessConsent=false}) {
    const c=getClient(); if(!c||!session?.user) throw new Error('Войди в аккаунт, чтобы зарегистрироваться.');
    if(organizerAccessConsent!==true) throw new Error('Нужно согласие на передачу минимальных данных организатору именно этого события.');
    const {data,error}=await c.rpc('register_for_event',{
      p_event_id:eventId,p_organizer_access_consent:organizerAccessConsent
    });
    if(error) throw error; return data;
  }
  async function getEventRoster(eventId) {
    const c=getClient();
    if(!c||!session) throw new Error('Войди в аккаунт.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(eventId||''))) {
      throw new Error('Некорректный идентификатор мероприятия.');
    }
    const {data,error}=await c.rpc('get_event_roster',{p_event_id:eventId});
    if(error) throw error;
    return data||[];
  }
  async function listMyRegistrations() {
    const c=getClient(); if(!c||!session) throw new Error('Нет активной сессии.');
    const {data,error}=await c.from('event_registrations').select('id,event_id,status,created_at,events(title,event_date,place_label)').eq('user_id',session.user.id).order('created_at',{ascending:false});
    if(error) throw error; return data||[];
  }
  async function listNews() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт.');
    const {data,error}=await c.from('news_posts').select('id,title,body,category,published_at').eq('is_published',true).order('published_at',{ascending:false}).limit(50);
    if(error) throw error;
    return (data||[]).map(n=>({id:n.id,title:n.title,text:n.body,category:n.category,date:String(n.published_at).slice(0,10),source:'cloud'}));
  }
  async function createNews({title,text,category}) {
    const c=getClient(); if(!c||!session?.user||!isAdmin) throw new Error('Публикация доступна только подтверждённому администратору.');
    const cleanTitle=String(title||'').trim();
    const cleanBody=String(text||'').trim();
    const cleanCategory=String(category||'Объявление').trim();
    if(cleanTitle.length<5||cleanTitle.length>110||cleanBody.length<15||cleanBody.length>900||cleanCategory.length<2||cleanCategory.length>40) {
      throw new Error('Проверь длину заголовка, текста и категории.');
    }
    const {data,error}=await c.rpc('publish_news_post',{
      p_title:cleanTitle,p_body:cleanBody,p_category:cleanCategory
    });
    if(error) throw error;
    return data;
  }
  async function listPolls() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт.');
    const now=new Date().toISOString();
    const {data,error}=await c.from('community_polls').select('id,title,description,closes_at,is_open,poll_options(id,label,sort_order)').eq('is_open',true).or(`closes_at.is.null,closes_at.gt.${now}`).order('created_at',{ascending:false}).limit(30);
    if(error) throw error;
    const polls=[];
    for(const p of data||[]){
      const {data:results,error:resultError}=await c.rpc('get_poll_results',{p_poll_id:p.id});
      if(resultError) throw resultError;
      const {data:mine,error:mineError}=await c.from('poll_responses').select('option_id').eq('poll_id',p.id).eq('user_id',session.user.id).maybeSingle();
      if(mineError) throw mineError;
      const options=(p.poll_options||[]).sort((a,b)=>a.sort_order-b.sort_order);
      const counts=options.map(o=>Number((results||[]).find(x=>x.option_id===o.id)?.vote_count||0));
      polls.push({id:p.id,title:p.title,description:p.description,options:options.map(o=>o.label),optionIds:options.map(o=>o.id),votes:counts,myChoice:mine?options.findIndex(o=>o.id===mine.option_id):null,status:'open',source:'cloud'});
    }
    return polls;
  }
  async function createPoll({title,description,options,closesAt=null}) {
    const c=getClient(); if(!c||!session||!isAdmin) throw new Error('Создание опроса доступно только проверяющему.');
    const cleanOptions=Array.isArray(options)?options.map(x=>String(x).trim()).filter(Boolean):[];
    const {data,error}=await c.rpc('create_community_poll',{p_title:String(title||'').trim(),p_description:String(description||'').trim(),p_options:cleanOptions,p_closes_at:closesAt||null});
    if(error) throw error; return data;
  }
  async function castPollVote(pollId,optionId) {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт.');
    const {error}=await c.rpc('cast_poll_vote',{p_poll_id:pollId,p_option_id:optionId});
    if(error) throw error;
  }
  function requireElections() {
    const c=getClient();
    if(!cfg.enableCloudElections||!c||!session) throw new Error('Облачный модуль выборов пока не включён.');
    return c;
  }
  async function listElections() {
    const c=requireElections();
    const {data,error}=await c.from('elections').select('id,title,position_label,description,scope,school_id,district_key,rules_text,nominations_open_at,nominations_close_at,campaign_close_at,voting_open_at,voting_close_at,stage').order('created_at',{ascending:false}).limit(100);
    if(error) throw error;
    const out=[];
    for(const e of data||[]) out.push({...e,candidates:await getElectionCandidates(e.id),hasVoted:await getMyElectionReceipt(e.id)});
    return out;
  }
  async function getElectionCandidates(electionId) {
    const c=requireElections();
    const {data,error}=await c.rpc('get_election_public_candidates',{p_election_id:electionId});
    if(error) throw error; return data||[];
  }
  async function reviewElectionObjection(objectionId,decision,resolution) {
    const c=requireElections(); if(!isAdmin) throw new Error('Рассматривать апелляции может только подтверждённый представитель.');
    const {error}=await c.rpc('review_election_objection',{p_objection_id:objectionId,p_decision:decision,p_resolution:resolution});
    if(error) throw error;
  }
  async function getMyElectionReceipt(electionId) {
    const c=requireElections();
    const {data,error}=await c.rpc('get_my_election_receipt',{p_election_id:electionId});
    if(error) throw error; return data===true;
  }
  async function createElection(payload) {
    const c=requireElections(); if(!isAdmin) throw new Error('Создавать выборы может только подтверждённый представитель.');
    const {data,error}=await c.rpc('create_election',{
      p_title:payload.title,p_position_label:payload.positionLabel,p_description:payload.description||'',
      p_scope:payload.scope,p_school_id:payload.schoolId||null,p_district_key:payload.districtKey||null,
      p_rules_text:payload.rulesText,p_nominations_open_at:payload.nominationsOpenAt,
      p_nominations_close_at:payload.nominationsCloseAt,p_campaign_close_at:payload.campaignCloseAt,
      p_voting_open_at:payload.votingOpenAt,p_voting_close_at:payload.votingCloseAt
    });
    if(error) throw error; return data;
  }
  async function setElectionEligibility(electionId,userIds) {
    const c=requireElections(); if(!isAdmin) throw new Error('Управлять списком допуска может только подтверждённый представитель.');
    const {data,error}=await c.rpc('set_election_eligibility',{p_election_id:electionId,p_user_ids:userIds});
    if(error) throw error; return data;
  }
  async function submitElectionCandidate(electionId,program,{publicNameConsent=false,publicProgramConsent=false}={}) {
    const c=requireElections();
    if(publicNameConsent!==true||publicProgramConsent!==true) throw new Error('Для публичной кандидатуры нужны отдельные подтверждения публикации имени и программы.');
    const {data,error}=await c.rpc('submit_election_candidate',{
      p_election_id:electionId,p_program:program,
      p_public_name_consent:publicNameConsent,p_public_program_consent:publicProgramConsent
    });
    if(error) throw error; return data;
  }
  async function listElectionCandidateApplications(electionId) {
    const c=requireElections(); if(!isAdmin) throw new Error('Очередь заявок доступна только подтверждённому представителю.');
    const {data,error}=await c.rpc('list_election_candidate_applications',{p_election_id:electionId});
    if(error) throw error; return data||[];
  }
  async function listElectionObjections(electionId) {
    const c=requireElections(); if(!isAdmin) throw new Error('Очередь возражений доступна только подтверждённому представителю.');
    const {data,error}=await c.rpc('list_election_objections',{p_election_id:electionId});
    if(error) throw error; return data||[];
  }
  async function reviewElectionCandidate(candidateId,decision,note='') {
    const c=requireElections(); if(!isAdmin) throw new Error('Проверка кандидатов доступна только подтверждённому представителю.');
    const {error}=await c.rpc('review_election_candidate',{p_candidate_id:candidateId,p_decision:decision,p_note:note});
    if(error) throw error;
  }
  async function advanceElectionStage(electionId,nextStage,reason) {
    const c=requireElections(); if(!isAdmin) throw new Error('Управлять этапами может только подтверждённый представитель.');
    const {error}=await c.rpc('advance_election_stage',{p_election_id:electionId,p_next_stage:nextStage,p_reason:reason});
    if(error) throw error;
  }
  async function castElectionVote(electionId,candidateId) {
    const c=requireElections();
    const {error}=await c.rpc('cast_election_vote',{p_election_id:electionId,p_candidate_id:candidateId});
    if(error) throw error;
  }
  async function getElectionResults(electionId) {
    const c=requireElections();
    const {data,error}=await c.rpc('get_election_results',{p_election_id:electionId});
    if(error) throw error; return data||[];
  }
  async function submitElectionObjection(electionId,category,description) {
    const c=requireElections();
    const {data,error}=await c.rpc('submit_election_objection',{p_election_id:electionId,p_category:category,p_description:description});
    if(error) throw error; return data;
  }
  async function askHostedAI(message, language = 'ru', history = []) {
    const c = getClient();
    if (!cfg.enableHostedAI || !c || !session) throw new Error('Внешняя ИИ-модель не подключена. Доступен локальный помощник.');
    const safeHistory = Array.isArray(history) ? history.slice(-6).filter(x => x && ['user','assistant'].includes(x.role) && typeof x.content === 'string' && x.content.length <= 700) : [];
    const { data, error } = await c.functions.invoke('yntymak-assistant', { body: { message, language, history: safeHistory } });
    if (error) throw error;
    if (!data?.answer) throw new Error('Помощник пока не вернул ответ.');
    return data.answer;
  }
  window.YntymakCloud = {
    configured, getClient, init, refresh, signUp, signIn, signOut, requestPasswordReset, updatePassword,
    ensureProfile, getMyProfile, updateMyProfile, checkAdmin, listActiveSchools, assignProfileSchool, listInitiatives, createInitiative, listProjects, createProject, requestToJoinProject, listProjectJoinRequests, getProjectMemberCounts, reviewProjectJoinRequest, withdrawProjectJoinRequest, listEvents, createEvent, registerForEvent, getEventRoster, listMyRegistrations, listNews, createNews, listPolls, createPoll, castPollVote, listElections, getElectionCandidates, getMyElectionReceipt, createElection, setElectionEligibility, submitElectionCandidate, listElectionCandidateApplications, listElectionObjections, reviewElectionCandidate, advanceElectionStage, castElectionVote, getElectionResults, submitElectionObjection, reviewElectionObjection, askHostedAI,
    getSession: () => session, getUser: () => authUser,
    isAdmin: () => isAdmin, isPasswordRecovery: () => passwordRecoveryPending, hostedAIEnabled: () => Boolean(cfg.enableHostedAI),
    initiativesEnabled: () => Boolean(cfg.enableCloudInitiatives),
    projectsEnabled: () => Boolean(cfg.enableCloudProjects),
    eventsEnabled: () => Boolean(cfg.enableCloudEvents),
    contentEnabled: () => Boolean(cfg.enableCloudContent),
    electionsEnabled: () => Boolean(cfg.enableCloudElections)
  };
})();

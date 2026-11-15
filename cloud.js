/* Supabase Auth + single-admin verification + optional hosted AI. All authorization must also be enforced by RLS/RPC. */
(() => {
  const cfg = window.YNTYMAK_CONFIG || {};
  let client = null, session = null, authUser = null, isAdmin = false;
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
    await refresh();
    c.auth.onAuthStateChange((_event, next) => {
      session = next || null; authUser = session?.user || null;
      if (!session) isAdmin = false;
    });
    if (session) {
      try { await ensureProfile(); } catch (e) { console.warn('Profile bootstrap needs migration/configuration:', e.message); }
      try { await checkAdmin(); } catch (e) { console.warn('Admin check failed:', e.message); }
    }
    return { configured: true, session, isAdmin };
  }
  async function signUp({ email, password, displayName, language = 'ru' }) {
    const c = getClient(); if (!c) throw new Error('Подключение Supabase ещё не настроено.');
    const { data, error } = await c.auth.signUp({
      email, password,
      options: { data: { display_name: displayName, preferred_language: language }, emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    if (error) throw error;
    session = data.session || null; authUser = data.user || null;
    if (session) {
      try { await ensureProfile(); } catch (e) { throw new Error(`Аккаунт создан, но профиль не подготовлен: ${e.message}. Проверь миграцию профиля.`); }
    }
    return { emailConfirmationRequired: !data.session };
  }
  async function signIn({ email, password }) {
    const c = getClient(); if (!c) throw new Error('Настрой Supabase в supabase-config.js.');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session; authUser = data.user;
    await ensureProfile(); await checkAdmin();
    return { user: authUser, isAdmin };
  }
  async function signOut() {
    const c = getClient(); if (!c) return;
    const { error } = await c.auth.signOut(); if (error) throw error;
    session = null; authUser = null; isAdmin = false;
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
    const { data: profile } = await c.from('profiles').select('school_id').eq('id', session.user.id).maybeSingle();
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
    return (data || []).map(p => ({
      id:p.id, title:p.title, description:p.description, category:p.category,
      scope:p.scope, target:p.target_label, district:p.district_key || '',
      stage:p.status === 'completed' ? 'completed' : p.status === 'published' ? 'active' : 'review',
      owner:p.created_by === session.user.id ? 'Ты' : 'Участник',
      members:1, created:String(p.created_at).slice(0,10),
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
  async function listEvents() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт для просмотра мероприятий.');
    const {data,error}=await c.from('events').select('id,event_key,title,is_open,description,event_date,place_label,capacity,scope,target_label,district_key').order('event_date',{ascending:true});
    if(error) throw error;
    return (data||[]).map(e=>({id:e.id,title:e.title,description:e.description||'',date:e.event_date||'',place:e.place_label||'',capacity:e.capacity||40,registered:0,status:e.is_open?'open':'closed',scope:e.scope||'city',target:e.target_label||'Бишкек',category:e.event_key,source:'cloud'}));
  }
  async function createEvent({title,description,date,place,capacity,scope='city',target='Бишкек',district='',category='forum'}) {
    const c=getClient(); if(!c||!session) throw new Error('Нет активной сессии.');
    const {data,error}=await c.rpc('create_platform_event',{p_event_key:category,p_title:title,p_description:description,p_event_date:date,p_place_label:place,p_capacity:Number(capacity),p_scope:scope,p_target_label:target,p_district_key:district||null});
    if(error) throw error; return data;
  }
  async function registerForEvent({eventId,name,school,grade}) {
    const c=getClient(); if(!c||!session?.user) throw new Error('Войди в аккаунт, чтобы зарегистрироваться.');
    const {data,error}=await c.rpc('register_for_event',{p_event_id:eventId,p_participant_name:name,p_school_label:school,p_grade_label:grade,p_participation_format:'individual',p_team_name:null});
    if(error) throw error; return data;
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
    const row={created_by:session.user.id,title:String(title||'').trim(),body:String(text||'').trim(),category:String(category||'Объявление').trim(),is_published:false};
    if(row.title.length<5||row.title.length>110||row.body.length<15||row.body.length>900) throw new Error('Проверь длину заголовка и текста.');
    const {data,error}=await c.from('news_posts').insert(row).select('id').single();
    if(error) throw error;
    const {error:updateError}=await c.from('news_posts').update({is_published:true}).eq('id',data.id);
    if(updateError) throw updateError;
    return data.id;
  }
  async function listPolls() {
    const c=getClient(); if(!c||!session) throw new Error('Войди в аккаунт.');
    const {data,error}=await c.from('community_polls').select('id,title,description,closes_at,is_open,poll_options(id,label,sort_order)').eq('is_open',true).order('created_at',{ascending:false}).limit(30);
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
    configured, getClient, init, refresh, signUp, signIn, signOut,
    ensureProfile, checkAdmin, listInitiatives, createInitiative, listProjects, createProject, requestToJoinProject, listEvents, createEvent, registerForEvent, listMyRegistrations, listNews, createNews, listPolls, createPoll, castPollVote, askHostedAI,
    getSession: () => session, getUser: () => authUser,
    isAdmin: () => isAdmin, hostedAIEnabled: () => Boolean(cfg.enableHostedAI),
    initiativesEnabled: () => Boolean(cfg.enableCloudInitiatives),
    projectsEnabled: () => Boolean(cfg.enableCloudProjects),
    eventsEnabled: () => Boolean(cfg.enableCloudEvents),
    contentEnabled: () => Boolean(cfg.enableCloudContent)
  };
})();

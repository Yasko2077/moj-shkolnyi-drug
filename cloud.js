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
    const { data, error } = await c.rpc('is_platform_admin');
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
    ensureProfile, checkAdmin, askHostedAI,
    getSession: () => session, getUser: () => authUser,
    isAdmin: () => isAdmin, hostedAIEnabled: () => Boolean(cfg.enableHostedAI)
  };
})();

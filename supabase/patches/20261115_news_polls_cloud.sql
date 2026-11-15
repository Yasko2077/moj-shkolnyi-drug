-- News and non-binding community polls. Additive only; apply after owner review.
create table if not exists public.news_posts(
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 title text not null check(char_length(trim(title)) between 5 and 110),
 body text not null check(char_length(trim(body)) between 15 and 900),
 category text not null check(char_length(trim(category)) between 2 and 40),
 published_at timestamptz not null default now(),
 is_published boolean not null default false
);
create table if not exists public.community_polls(
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 title text not null check(char_length(trim(title)) between 5 and 140),
 description text not null check(char_length(trim(description)) between 10 and 500),
 closes_at timestamptz,
 is_open boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.poll_options(
 id uuid primary key default gen_random_uuid(),
 poll_id uuid not null references public.community_polls(id) on delete cascade,
 label text not null check(char_length(trim(label)) between 1 and 120),
 sort_order integer not null default 0
);
create table if not exists public.poll_responses(
 id uuid primary key default gen_random_uuid(),
 poll_id uuid not null references public.community_polls(id) on delete cascade,
 option_id uuid not null references public.poll_options(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(poll_id,user_id)
);
alter table public.news_posts enable row level security;
alter table public.community_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_responses enable row level security;

drop policy if exists news_posts_read on public.news_posts;
create policy news_posts_read on public.news_posts for select to authenticated using(is_published or public.is_verification_representative());
drop policy if exists news_posts_insert_admin on public.news_posts;
create policy news_posts_insert_admin on public.news_posts for insert to authenticated with check(created_by=(select auth.uid()) and public.is_verification_representative() and is_published=false);
drop policy if exists news_posts_update_admin on public.news_posts;
create policy news_posts_update_admin on public.news_posts for update to authenticated using(public.is_verification_representative()) with check(public.is_verification_representative());

drop policy if exists community_polls_read on public.community_polls;
create policy community_polls_read on public.community_polls for select to authenticated using(is_open or public.is_verification_representative() or created_by=(select auth.uid()));
drop policy if exists community_polls_insert_admin on public.community_polls;
create policy community_polls_insert_admin on public.community_polls for insert to authenticated with check(created_by=(select auth.uid()) and public.is_verification_representative() and is_open=false);
drop policy if exists community_polls_update_admin on public.community_polls;
create policy community_polls_update_admin on public.community_polls for update to authenticated using(public.is_verification_representative()) with check(public.is_verification_representative());

drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select to authenticated using(exists(select 1 from public.community_polls p where p.id=poll_id and (p.is_open or p.created_by=(select auth.uid()) or public.is_verification_representative())));
drop policy if exists poll_options_insert_admin on public.poll_options;
create policy poll_options_insert_admin on public.poll_options for insert to authenticated with check(public.is_verification_representative());
drop policy if exists poll_responses_private_read on public.poll_responses;
create policy poll_responses_private_read on public.poll_responses for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.cast_poll_vote(p_poll_id uuid,p_option_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Войди в аккаунт'; end if;
 if not exists(select 1 from public.community_polls p where p.id=p_poll_id and p.is_open and (p.closes_at is null or p.closes_at>now())) then raise exception 'Опрос закрыт'; end if;
 if not exists(select 1 from public.poll_options o where o.id=p_option_id and o.poll_id=p_poll_id) then raise exception 'Вариант ответа не найден'; end if;
 insert into public.poll_responses(poll_id,option_id,user_id) values(p_poll_id,p_option_id,auth.uid());
end $$;
revoke all on function public.cast_poll_vote(uuid,uuid) from public,anon;
grant execute on function public.cast_poll_vote(uuid,uuid) to authenticated;

create or replace function public.create_community_poll(p_title text,p_description text,p_options text[],p_closes_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $poll$
declare v_poll uuid; v_option text; v_order integer:=0;
begin
 if not public.is_verification_representative() then raise exception 'Недостаточно прав'; end if;
 if char_length(trim(p_title)) not between 5 and 140 or char_length(trim(p_description)) not between 10 and 500 then raise exception 'Проверь заголовок и описание'; end if;
 if coalesce(array_length(p_options,1),0) not between 2 and 6 then raise exception 'Нужно от двух до шести вариантов'; end if;
 if exists(select 1 from unnest(p_options) x where char_length(trim(x)) not between 1 and 120) then raise exception 'Проверь варианты ответа'; end if;
 if p_closes_at is not null and p_closes_at<=now() then raise exception 'Дата закрытия должна быть в будущем'; end if;
 insert into public.community_polls(created_by,title,description,closes_at,is_open)
 values(auth.uid(),trim(p_title),trim(p_description),p_closes_at,false) returning id into v_poll;
 foreach v_option in array p_options loop
  insert into public.poll_options(poll_id,label,sort_order) values(v_poll,trim(v_option),v_order);
  v_order:=v_order+1;
 end loop;
 update public.community_polls set is_open=true where id=v_poll;
 return v_poll;
end $poll$;
revoke all on function public.create_community_poll(text,text,text[],timestamptz) from public,anon;
grant execute on function public.create_community_poll(text,text,text[],timestamptz) to authenticated;

create or replace function public.get_poll_results(p_poll_id uuid)
returns table(option_id uuid,label text,vote_count bigint)
language sql security definer set search_path=public,pg_temp as $$
 select o.id,o.label,count(r.id)
 from public.poll_options o
 left join public.poll_responses r on r.option_id=o.id and r.poll_id=p_poll_id
 where o.poll_id=p_poll_id and exists(select 1 from public.community_polls p where p.id=p_poll_id and (p.is_open or p.created_by=auth.uid() or public.is_verification_representative()))
 group by o.id,o.label,o.sort_order order by o.sort_order
$$;
revoke all on function public.get_poll_results(uuid) from public,anon;
grant execute on function public.get_poll_results(uuid) to authenticated;
grant select on public.news_posts,public.community_polls,public.poll_options to authenticated;
grant insert(created_by,title,body,category,is_published) on public.news_posts to authenticated;
grant update(title,body,category,is_published) on public.news_posts to authenticated;
grant insert(created_by,title,description,closes_at,is_open) on public.community_polls to authenticated;
grant update(title,description,closes_at,is_open) on public.community_polls to authenticated;
grant insert(poll_id,label,sort_order) on public.poll_options to authenticated;
grant select on public.poll_responses to authenticated;
comment on table public.community_polls is 'Non-binding community consultations; not official elections.';
comment on table public.poll_responses is 'Private one-response-per-user poll records; individual choices are not public.';

-- Poll options are created atomically by create_community_poll().
-- Prevent a verifier session from adding/removing choices directly after publication.
revoke all privileges on table public.poll_options from anon, authenticated;
-- The previous patch granted INSERT at column level; revoke those column grants explicitly.
revoke insert (poll_id,label,sort_order)
  on public.poll_options from anon, authenticated;
revoke update (poll_id,label,sort_order)
  on public.poll_options from anon, authenticated;
grant select on public.poll_options to authenticated;

comment on table public.poll_options is
'Poll choices are created only by the create_community_poll SECURITY DEFINER RPC; direct client writes are disabled.';

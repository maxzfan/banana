-- Banana Split set-ups, Going Bananas (tonight), and chats.

create type public.setup_decision as enum ('pending', 'accept', 'pass');
create type public.chat_kind as enum ('setup', 'tonight');
create type public.tonight_audience as enum ('friends', 'ripe', 'bunch');

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  kind public.chat_kind not null,
  title text,
  host_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_chat_idx on public.messages (chat_id, created_at);

-- Decisions are never readable by clients; RPCs expose only what each person may see.
create table public.setups (
  id uuid primary key default gen_random_uuid(),
  matchmaker_id uuid references public.profiles (id) on delete set null,
  person_a uuid not null references public.profiles (id) on delete cascade,
  person_b uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 280),
  a_decision public.setup_decision not null default 'pending',
  b_decision public.setup_decision not null default 'pending',
  chat_id uuid references public.chats (id) on delete set null,
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  check (person_a <> person_b)
);
-- One suggestion per matchmaker per pair, ever, so a retry can't reveal whether someone passed.
create unique index setups_matchmaker_pair_idx on public.setups (matchmaker_id, least(person_a, person_b), greatest(person_a, person_b));

create table public.tonight_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 140),
  audience public.tonight_audience not null default 'friends',
  expires_at timestamptz not null,
  chat_id uuid references public.chats (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tonight_joins (
  post_id uuid not null references public.tonight_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Helpers ------------------------------------------------------------------

create function private.is_chat_member(chat uuid, member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members where chat_id = chat and user_id = member);
$$;

-- Certified Ripe with set-ups switched on.
create function private.is_matchable(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.statuses s join public.profiles p on p.id = s.user_id
    where s.user_id = person and s.status = 'ripe' and s.certified_at is not null and p.setups_enabled
  );
$$;

create function private.can_see_tonight(post_owner uuid, aud public.tonight_audience, viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select post_owner = viewer or (
    private.are_friends(post_owner, viewer) and case aud
      when 'friends' then true
      when 'ripe' then exists (select 1 from public.statuses where user_id = viewer and status = 'ripe')
      when 'bunch' then private.in_bunch(post_owner, viewer)
    end
  );
$$;

-- Set-ups ------------------------------------------------------------------

create function public.setup_candidates()
returns table (id uuid, username text, name text, photo_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username::text, p.name, p.photo_url
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  join public.statuses s on s.user_id = p.id
  where f.state = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
    and private.is_matchable(p.id) and private.can_see_status(p.id, auth.uid())
  order by p.name;
$$;

create function public.suggest_setup(a uuid, b uuid, note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if a = b or me in (a, b) then raise exception 'pick two other people'; end if;
  if not (private.are_friends(me, a) and private.are_friends(me, b)) then
    raise exception 'you can only set up your friends';
  end if;
  if not (private.is_matchable(a) and private.is_matchable(b)
          and private.can_see_status(a, me) and private.can_see_status(b, me)) then
    raise exception 'both people must be Certified Ripe with set-ups on';
  end if;
  if private.is_blocked_between(a, b) then raise exception 'this set-up is not possible'; end if;
  if exists (
    select 1 from public.setups
    where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b)
      and (matchmaker_id = me or matched_at is not null)
  ) then
    raise exception 'you already suggested these two, or they are already matched';
  end if;
  insert into public.setups (matchmaker_id, person_a, person_b, note)
  values (me, a, b, nullif(trim(note), '')) returning id into new_id;
  insert into public.notifications (user_id, kind, actor_id, payload)
  values (a, 'setup_suggested', me, jsonb_build_object('setup_id', new_id)),
         (b, 'setup_suggested', me, jsonb_build_object('setup_id', new_id));
  return new_id;
end;
$$;

-- Prompts for the caller. The other person's decision is never returned; a match shows only once both accept.
create function public.my_setup_prompts()
returns table (setup_id uuid, matchmaker_id uuid, matchmaker_name text, matchmaker_photo_url text,
               other_id uuid, other_name text, other_username text, other_photo_url text, other_bio text,
               note text, my_decision public.setup_decision, matched boolean, chat_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.matchmaker_id, m.name, m.photo_url,
         o.id, o.name, o.username::text, o.photo_url, o.bio,
         s.note,
         case when s.person_a = auth.uid() then s.a_decision else s.b_decision end,
         s.matched_at is not null,
         case when s.matched_at is not null then s.chat_id end,
         s.created_at
  from public.setups s
  join public.profiles o on o.id = case when s.person_a = auth.uid() then s.person_b else s.person_a end
  left join public.profiles m on m.id = s.matchmaker_id
  where auth.uid() in (s.person_a, s.person_b)
    and not private.is_blocked_between(s.person_a, s.person_b)
    and (s.matched_at is not null or (case when s.person_a = auth.uid() then s.a_decision else s.b_decision end) = 'pending')
  order by s.created_at desc;
$$;

create function public.respond_setup(setup uuid, decision public.setup_decision) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.setups;
  new_chat uuid;
begin
  if decision = 'pending' then raise exception 'choose accept or pass'; end if;
  select * into s from public.setups where id = setup for update;
  if s.id is null or me not in (s.person_a, s.person_b) then raise exception 'set-up not found'; end if;
  if s.matched_at is not null then return true; end if;
  if (me = s.person_a and s.a_decision <> 'pending') or (me = s.person_b and s.b_decision <> 'pending') then
    raise exception 'you already answered';
  end if;
  if decision = 'accept' and not private.is_matchable(me) then
    raise exception 'you need to be Certified Ripe with set-ups on';
  end if;
  if me = s.person_a then
    update public.setups set a_decision = decision where id = setup returning * into s;
  else
    update public.setups set b_decision = decision where id = setup returning * into s;
  end if;
  if s.a_decision = 'accept' and s.b_decision = 'accept' and not private.is_blocked_between(s.person_a, s.person_b) then
    -- Already matched through another suggestion: reuse that chat.
    select o.chat_id into new_chat from public.setups o
    where o.id <> s.id and o.matched_at is not null
      and least(o.person_a, o.person_b) = least(s.person_a, s.person_b) and greatest(o.person_a, o.person_b) = greatest(s.person_a, s.person_b)
    limit 1;
    if found then
      update public.setups set matched_at = now(), chat_id = new_chat where id = setup;
      return true;
    end if;
    insert into public.chats (kind) values ('setup') returning id into new_chat;
    insert into public.chat_members (chat_id, user_id) values (new_chat, s.person_a), (new_chat, s.person_b);
    update public.setups set matched_at = now(), chat_id = new_chat where id = setup;
    if s.matchmaker_id is not null then
      update public.profiles set setups_made = setups_made + 1 where id = s.matchmaker_id;
      insert into public.notifications (user_id, kind, actor_id, payload)
      values (s.matchmaker_id, 'setup_success', s.person_a, jsonb_build_object('setup_id', setup, 'other_id', s.person_b));
    end if;
    insert into public.notifications (user_id, kind, actor_id, payload)
    values (s.person_a, 'setup_matched', s.person_b, jsonb_build_object('chat_id', new_chat)),
           (s.person_b, 'setup_matched', s.person_a, jsonb_build_object('chat_id', new_chat));
    return true;
  end if;
  return false;
end;
$$;

-- Matchmaker view: suggestions are "waiting" until matched; passes are never revealed.
create function public.my_matchmaking()
returns table (setup_id uuid, a_name text, b_name text, matched boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, pa.name, pb.name, s.matched_at is not null, s.created_at
  from public.setups s
  join public.profiles pa on pa.id = s.person_a
  join public.profiles pb on pb.id = s.person_b
  where s.matchmaker_id = auth.uid()
  order by s.created_at desc;
$$;

-- Going Bananas ------------------------------------------------------------

-- Client passes its next local 4am so the reset follows the user's timezone.
create function public.set_tonight(note text, audience public.tonight_audience, expires_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  plan_chat uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if expires_at <= now() or expires_at > now() + interval '28 hours' then
    raise exception 'tonight must end within the next day';
  end if;
  -- Editing an active plan keeps its RSVPs and group chat; an expired one starts fresh.
  update public.tonight_posts t set note = nullif(trim(set_tonight.note), ''), audience = set_tonight.audience, expires_at = set_tonight.expires_at
  where t.user_id = me and t.expires_at > now() returning t.id, t.chat_id into new_id, plan_chat;
  if new_id is not null then
    -- A narrower audience drops guests who no longer qualify.
    delete from public.tonight_joins j where j.post_id = new_id and not private.can_see_tonight(me, set_tonight.audience, j.user_id);
    delete from public.chat_members cm where cm.chat_id = plan_chat and cm.user_id <> me
      and not private.can_see_tonight(me, set_tonight.audience, cm.user_id);
  else
    delete from public.tonight_posts where user_id = me;
    insert into public.tonight_posts (user_id, note, audience, expires_at)
    values (me, nullif(trim(note), ''), audience, expires_at) returning id into new_id;
  end if;
  return new_id;
end;
$$;

create function public.clear_tonight() returns void
language sql security definer set search_path = '' as $$
  delete from public.tonight_posts where user_id = auth.uid();
$$;

create function public.tonight_feed()
returns table (post_id uuid, user_id uuid, name text, username text, photo_url text, note text,
               audience public.tonight_audience, expires_at timestamptz, joined boolean, join_count integer, chat_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, p.id, p.name, p.username::text, p.photo_url, t.note,
         case when t.user_id = auth.uid() then t.audience end,
         t.expires_at,
         exists (select 1 from public.tonight_joins j where j.post_id = t.id and j.user_id = auth.uid()),
         (select count(*)::int from public.tonight_joins j where j.post_id = t.id),
         case when private.is_chat_member(t.chat_id, auth.uid()) then t.chat_id end
  from public.tonight_posts t
  join public.profiles p on p.id = t.user_id
  where t.expires_at > now() and private.can_see_tonight(t.user_id, t.audience, auth.uid())
  order by (t.user_id = auth.uid()) desc, t.created_at desc;
$$;

create function public.join_tonight(post uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.tonight_posts;
  owner_name text;
begin
  select * into t from public.tonight_posts where id = post for update;
  if t.id is null or t.expires_at <= now() or not private.can_see_tonight(t.user_id, t.audience, me) then
    raise exception 'this plan is no longer available';
  end if;
  if t.user_id = me then raise exception 'this is your own plan'; end if;
  if t.chat_id is null then
    select name into owner_name from public.profiles where id = t.user_id;
    insert into public.chats (kind, title, host_id) values ('tonight', owner_name || '''s night out', t.user_id) returning id into t.chat_id;
    update public.tonight_posts set chat_id = t.chat_id where id = post;
    insert into public.chat_members (chat_id, user_id) values (t.chat_id, t.user_id);
  end if;
  insert into public.chat_members (chat_id, user_id) values (t.chat_id, me) on conflict do nothing;
  if not exists (select 1 from public.tonight_joins where post_id = post and user_id = me) then
    insert into public.tonight_joins (post_id, user_id) values (post, me);
    insert into public.notifications (user_id, kind, actor_id, payload)
    values (t.user_id, 'tonight_join', me, jsonb_build_object('chat_id', t.chat_id));
  end if;
  return t.chat_id;
end;
$$;

-- Chats --------------------------------------------------------------------

create function public.my_chats()
returns table (chat_id uuid, kind public.chat_kind, title text, members jsonb,
               last_body text, last_at timestamptz, unread integer)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.title,
         (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'photo_url', p.photo_url)), '[]')
            from public.chat_members cm2 join public.profiles p on p.id = cm2.user_id
            where cm2.chat_id = c.id and cm2.user_id <> auth.uid()),
         lm.body, coalesce(lm.created_at, c.created_at),
         (select count(*)::int from public.messages m
            where m.chat_id = c.id and m.created_at > cm.last_read_at and m.sender_id is distinct from auth.uid())
  from public.chat_members cm
  join public.chats c on c.id = cm.chat_id
  left join lateral (select body, created_at from public.messages m where m.chat_id = c.id order by created_at desc limit 1) lm on true
  where cm.user_id = auth.uid()
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

create function public.mark_chat_read(chat uuid) returns void
language sql security definer set search_path = '' as $$
  update public.chat_members set last_read_at = now() where chat_id = chat and user_id = auth.uid();
$$;

create function public.leave_chat(chat uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.chat_members where chat_id = chat and user_id = auth.uid();
$$;

-- Blocking closes any set-up chat between the two people and removes them from each other's Tonight chats.
create function public.handle_block_chats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.chats c
  where c.kind = 'setup'
    and private.is_chat_member(c.id, new.blocker_id) and private.is_chat_member(c.id, new.blocked_id);
  delete from public.chat_members cm using public.chats c
  where cm.chat_id = c.id and c.kind = 'tonight'
    and ((c.host_id = new.blocker_id and cm.user_id = new.blocked_id) or (c.host_id = new.blocked_id and cm.user_id = new.blocker_id));
  delete from public.tonight_joins j using public.tonight_posts t
  where j.post_id = t.id and ((t.user_id = new.blocker_id and j.user_id = new.blocked_id)
                           or (t.user_id = new.blocked_id and j.user_id = new.blocker_id));
  return new;
end;
$$;
create trigger on_block_close_chats after insert on public.blocks
  for each row execute function public.handle_block_chats();

-- Row-level security ------------------------------------------------------

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.setups enable row level security;
alter table public.tonight_posts enable row level security;
alter table public.tonight_joins enable row level security;

create policy "members see chat" on public.chats for select to authenticated
  using (private.is_chat_member(id, auth.uid()));
create policy "members see members" on public.chat_members for select to authenticated
  using (private.is_chat_member(chat_id, auth.uid()));
create policy "members read messages" on public.messages for select to authenticated
  using (private.is_chat_member(chat_id, auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and private.is_chat_member(chat_id, auth.uid()));
-- setups: no client policies; access only through RPCs above.
create policy "tonight visible to chosen audience" on public.tonight_posts for select to authenticated
  using (expires_at > now() and private.can_see_tonight(user_id, audience, auth.uid()));
create policy "see joins on visible posts" on public.tonight_joins for select to authenticated
  using (exists (select 1 from public.tonight_posts t where t.id = post_id));

revoke all on public.chats, public.chat_members, public.messages, public.setups, public.tonight_posts, public.tonight_joins from anon, authenticated;
grant select on public.chats, public.chat_members, public.messages, public.tonight_joins to authenticated;
-- audience is only shown to the host, via tonight_feed().
grant select (id, user_id, note, expires_at, chat_id, created_at) on public.tonight_posts to authenticated;
grant insert (chat_id, sender_id, body) on public.messages to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_invite_preview(text) to anon;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.handle_new_user(), public.handle_block(), public.handle_friendship_change(),
  public.handle_status_change(), public.handle_block_chats() from authenticated;

alter publication supabase_realtime add table public.messages, public.chat_members, public.tonight_posts, public.tonight_joins;

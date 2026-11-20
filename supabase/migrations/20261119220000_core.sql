-- Banana core schema: profiles, statuses, friends, blocks, reports, verification (The Bunch), notifications.

create extension if not exists citext with schema extensions;

create type public.banana_status as enum ('ripe', 'picked', 'bruised', 'peel_sealed');
create type public.status_visibility as enum ('friends', 'bunch', 'private');
create type public.friendship_state as enum ('pending', 'accepted');
create type public.verification_state as enum ('collecting', 'certified', 'expired');
create type public.invite_state as enum ('pending', 'claimed', 'answered', 'revoked');
create type public.survey_answer as enum ('yes', 'no', 'not_sure');

-- Profiles: public identity. Phone stays in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  name text check (char_length(name) between 1 and 50),
  bio text check (char_length(bio) <= 160),
  photo_url text,
  setups_enabled boolean not null default true,
  setups_made integer not null default 0,
  created_at timestamptz not null default now()
);

-- Statuses are separate so row-level security can hide them per viewer.
create table public.statuses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.banana_status not null default 'peel_sealed',
  visibility public.status_visibility not null default 'friends',
  changed_at timestamptz not null default now(),
  certified_at timestamptz
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  state public.friendship_state not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 50),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.banana_status not null check (status <> 'peel_sealed'),
  state public.verification_state not null default 'collecting',
  created_at timestamptz not null default now(),
  certified_at timestamptz,
  expired_at timestamptz
);
create unique index verifications_one_active_idx on public.verifications (user_id) where state <> 'expired';

create table public.validator_invites (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.verifications (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  token text not null unique default replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'),
  validator_id uuid references public.profiles (id) on delete cascade,
  state public.invite_state not null default 'pending',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  revoked_at timestamptz,
  check (validator_id is null or validator_id <> owner_id)
);
create unique index validator_invites_one_per_validator_idx on public.validator_invites (verification_id, validator_id) where validator_id is not null and state <> 'revoked';

create table public.validator_responses (
  invite_id uuid primary key references public.validator_invites (id) on delete cascade,
  answer public.survey_answer not null,
  fun_question text,
  fun_answer text check (char_length(fun_answer) <= 200),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  actor_id uuid references public.profiles (id) on delete cascade,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Helpers -----------------------------------------------------------------
-- Kept out of the API schema so clients cannot probe other people's relationships via RPC.
create schema private;

create function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where state = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create function private.in_bunch(owner uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.validator_invites i
    join public.verifications v on v.id = i.verification_id
    where v.user_id = owner and v.state <> 'expired'
      and i.validator_id = viewer and i.state <> 'revoked'
  );
$$;

create function private.can_see_status(owner uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = viewer or (
    not private.is_blocked_between(owner, viewer) and exists (
      select 1 from public.statuses s
      where s.user_id = owner and (
        (s.visibility = 'friends' and private.are_friends(owner, viewer))
        or (s.visibility = 'bunch' and private.in_bunch(owner, viewer))
      )
    )
  );
$$;

-- New auth user -> empty profile + status row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.statuses (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Blocking removes any friendship and pending invites between the two.
create function public.handle_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  update public.validator_invites set state = 'revoked', revoked_at = coalesce(revoked_at, now())
  where (owner_id = new.blocker_id and validator_id = new.blocked_id)
     or (owner_id = new.blocked_id and validator_id = new.blocker_id);
  return new;
end;
$$;
create trigger on_block_created after insert on public.blocks
  for each row execute function public.handle_block();

-- Friend request notifications.
create function public.handle_friendship_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.state = 'pending' then
    insert into public.notifications (user_id, kind, actor_id) values (new.addressee_id, 'friend_request', new.requester_id);
  elsif tg_op = 'UPDATE' and old.state = 'pending' and new.state = 'accepted' then
    new.responded_at := now();
    insert into public.notifications (user_id, kind, actor_id) values (new.requester_id, 'friend_accepted', new.addressee_id);
  end if;
  return new;
end;
$$;
create trigger on_friendship_insert after insert on public.friendships
  for each row execute function public.handle_friendship_change();
create trigger on_friendship_update before update on public.friendships
  for each row execute function public.handle_friendship_change();

-- Status change -> expire verification, open a re-confirm round with the same validators.
create function public.handle_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_v public.verifications;
  new_v_id uuid;
begin
  if new.status is distinct from old.status then
    new.changed_at := now();
    new.certified_at := null;
    select * into old_v from public.verifications where user_id = new.user_id and state <> 'expired';
    if found then
      update public.verifications set state = 'expired', expired_at = now() where id = old_v.id;
      if new.status <> 'peel_sealed' then
        insert into public.verifications (user_id, status) values (new.user_id, new.status) returning id into new_v_id;
        insert into public.validator_invites (verification_id, owner_id, label, validator_id, state, claimed_at)
          select new_v_id, new.user_id, i.label, i.validator_id, 'claimed', now()
          from public.validator_invites i
          where i.verification_id = old_v.id and i.validator_id is not null and i.state in ('claimed', 'answered');
        insert into public.notifications (user_id, kind, actor_id, payload)
          select i.validator_id, 'reconfirm_request', new.user_id, jsonb_build_object('invite_id', i.id)
          from public.validator_invites i where i.verification_id = new_v_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger on_status_change before update on public.statuses
  for each row execute function public.handle_status_change();

-- RPCs ---------------------------------------------------------------------

-- Start (or add to) the Bunch for the caller's current status. Returns invites with share tokens.
create function public.create_validator_invites(labels text[])
returns setof public.validator_invites
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_status public.banana_status;
  v_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select status into my_status from public.statuses where user_id = me;
  if my_status = 'peel_sealed' then raise exception 'Peel Sealed statuses cannot be verified'; end if;
  select id into v_id from public.verifications where user_id = me and state <> 'expired';
  if v_id is null then
    insert into public.verifications (user_id, status) values (me, my_status) returning id into v_id;
  end if;
  return query
    insert into public.validator_invites (verification_id, owner_id, label)
    select v_id, me, trim(l) from unnest(labels) as l where trim(l) <> ''
    returning *;
end;
$$;

-- Owner removes a validator (only before they answer).
create function public.revoke_validator_invite(invite uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.validator_invites set state = 'revoked', revoked_at = now()
  where id = invite and owner_id = auth.uid() and state <> 'revoked';
  return found;
end;
$$;

-- Add existing friends straight to the Bunch; they get an in-app request (a share link still works too).
create function public.add_friend_validators(friend_ids uuid[])
returns setof public.validator_invites
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_status public.banana_status;
  v_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select status into my_status from public.statuses where user_id = me;
  if my_status = 'peel_sealed' then raise exception 'Peel Sealed statuses cannot be verified'; end if;
  if exists (select 1 from unnest(friend_ids) f where not private.are_friends(me, f)) then
    raise exception 'validators must be your friends';
  end if;
  select id into v_id from public.verifications where user_id = me and state <> 'expired';
  if v_id is null then
    insert into public.verifications (user_id, status) values (me, my_status) returning id into v_id;
  end if;
  return query
    with added as (
      insert into public.validator_invites (verification_id, owner_id, label, validator_id, state, claimed_at)
      select v_id, me, coalesce(p.name, p.username::text, 'Friend'), p.id, 'claimed', now()
      from public.profiles p
      where p.id = any (friend_ids)
        and not exists (select 1 from public.validator_invites i where i.verification_id = v_id and i.validator_id = p.id and i.state <> 'revoked')
      returning *
    ), notified as (
      insert into public.notifications (user_id, kind, actor_id, payload)
      select a.validator_id, 'validator_request', me, jsonb_build_object('invite_id', a.id) from added a
    )
    select * from added;
end;
$$;

-- Public preview for the invite landing page (works signed out).
create function public.get_invite_preview(invite_token text)
returns table (owner_name text, owner_photo_url text, status public.banana_status, valid boolean)
language sql stable security definer set search_path = '' as $$
  select p.name, p.photo_url, v.status,
         (i.state <> 'revoked' and v.state <> 'expired')
  from public.validator_invites i
  join public.verifications v on v.id = i.verification_id
  join public.profiles p on p.id = i.owner_id
  where i.token = invite_token;
$$;

-- Validator claims an invite link. First person to claim it owns it; it also makes them friends.
create function public.claim_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.validator_invites;
  v public.verifications;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into inv from public.validator_invites where token = invite_token for update;
  if not found then raise exception 'invite not found'; end if;
  select * into v from public.verifications where id = inv.verification_id;
  if inv.owner_id = me then raise exception 'you cannot vouch for yourself'; end if;
  if inv.state = 'revoked' or v.state = 'expired' then raise exception 'this invite is no longer active'; end if;
  if private.is_blocked_between(inv.owner_id, me) then raise exception 'this invite is no longer active'; end if;
  if inv.validator_id is not null and inv.validator_id <> me then raise exception 'this invite was already used by someone else'; end if;
  if inv.validator_id is null then
    if exists (select 1 from public.validator_invites where verification_id = inv.verification_id and validator_id = me and state <> 'revoked') then
      raise exception 'you are already in this Bunch';
    end if;
    update public.validator_invites set validator_id = me, state = 'claimed', claimed_at = now() where id = inv.id;
    insert into public.friendships (requester_id, addressee_id, state, responded_at)
      values (inv.owner_id, me, 'accepted', now())
      on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)))
      do update set state = 'accepted', responded_at = now();
    insert into public.notifications (user_id, kind, actor_id) values (inv.owner_id, 'validator_joined', me);
  end if;
  return inv.id;
end;
$$;

-- What a validator sees on the survey.
create function public.get_survey(invite uuid)
returns table (invite_id uuid, owner_id uuid, owner_name text, owner_photo_url text, status public.banana_status, answered boolean, active boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, i.owner_id, p.name, p.photo_url, v.status, i.state = 'answered',
         (i.state in ('claimed', 'answered') and v.state <> 'expired')
  from public.validator_invites i
  join public.verifications v on v.id = i.verification_id
  join public.profiles p on p.id = i.owner_id
  where i.id = invite and i.validator_id = auth.uid();
$$;

create function public.submit_survey(invite uuid, answer public.survey_answer, fun_question text default null, fun_answer text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.validator_invites;
  v public.verifications;
  yes_count integer;
begin
  select * into inv from public.validator_invites where id = invite and validator_id = me for update;
  if not found then raise exception 'invite not found'; end if;
  select * into v from public.verifications where id = inv.verification_id for update;
  if inv.state <> 'claimed' or v.state = 'expired' then raise exception 'this survey is closed'; end if;

  insert into public.validator_responses (invite_id, answer, fun_question, fun_answer)
    values (inv.id, answer, nullif(trim(fun_question), ''), nullif(trim(fun_answer), ''));
  update public.validator_invites set state = 'answered' where id = inv.id;

  select count(distinct i.validator_id) into yes_count
  from public.validator_responses r join public.validator_invites i on i.id = r.invite_id
  where i.verification_id = v.id and r.answer = 'yes';

  if yes_count >= 3 and v.state = 'collecting' then
    update public.verifications set state = 'certified', certified_at = now() where id = v.id;
    update public.statuses set certified_at = now() where user_id = v.user_id;
    insert into public.notifications (user_id, kind) values (v.user_id, 'certified');
  end if;
end;
$$;

-- Owner sees only the aggregate: confirmations so far, never individual answers.
create function public.my_verification_summary()
returns table (verification_id uuid, status public.banana_status, state public.verification_state, confirmations integer, needed integer, certified_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.status, v.state,
    (select count(distinct i.validator_id)::int from public.validator_responses r join public.validator_invites i on i.id = r.invite_id
      where i.verification_id = v.id and r.answer = 'yes'),
    3, v.certified_at
  from public.verifications v
  where v.user_id = auth.uid() and v.state <> 'expired';
$$;

-- Search by username prefix or exact phone number.
create function public.search_users(q text)
returns table (id uuid, username text, name text, photo_url text)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  digits text := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  term text := ltrim(trim(coalesce(q, '')), '@');
begin
  if me is null then raise exception 'not authenticated'; end if;
  if length(digits) >= 7 and q !~ '[a-zA-Z_]' then
    if length(digits) = 10 then digits := '1' || digits; end if;
    return query
      select p.id, p.username::text, p.name, p.photo_url
      from public.profiles p join auth.users u on u.id = p.id
      where u.phone = digits and p.id <> me and p.username is not null
        and not private.is_blocked_between(p.id, me);
  elsif length(term) >= 2 then
    return query
      select p.id, p.username::text, p.name, p.photo_url
      from public.profiles p
      where p.id <> me and p.username is not null
        and (p.username ilike term || '%' or p.name ilike '%' || term || '%')
        and not private.is_blocked_between(p.id, me)
      order by p.username limit 20;
  end if;
end;
$$;

-- Contacts sync: match normalized phone numbers (digits with country code) to Banana users.
create function public.match_contacts(phones text[])
returns table (id uuid, username text, name text, photo_url text, phone text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username::text, p.name, p.photo_url, u.phone::text
  from auth.users u join public.profiles p on p.id = u.id
  where u.phone = any (phones) and p.id <> auth.uid() and p.username is not null
    and not private.is_blocked_between(p.id, auth.uid())
  limit 500;
$$;

-- Friends + their status (null when hidden from the caller).
create function public.friends_with_status()
returns table (friendship_id uuid, id uuid, username text, name text, photo_url text, bio text,
               status public.banana_status, certified_at timestamptz, changed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.id, p.id, p.username::text, p.name, p.photo_url, p.bio,
         case when private.can_see_status(p.id, auth.uid()) then s.status end,
         case when private.can_see_status(p.id, auth.uid()) then s.certified_at end,
         case when private.can_see_status(p.id, auth.uid()) then s.changed_at end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  join public.statuses s on s.user_id = p.id
  where f.state = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  order by s.changed_at desc;
$$;

-- Permanently delete the caller and everything they own (cascades from auth.users).
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Row-level security ------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.statuses enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.verifications enable row level security;
alter table public.validator_invites enable row level security;
alter table public.validator_responses enable row level security;
alter table public.notifications enable row level security;

create policy "profiles readable unless blocked" on public.profiles for select to authenticated
  using (id = auth.uid() or not private.is_blocked_between(id, auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "status visible per owner's choice" on public.statuses for select to authenticated
  using (private.can_see_status(user_id, auth.uid()));
create policy "update own status" on public.statuses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "see own friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "send friend request" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and state = 'pending' and not private.is_blocked_between(requester_id, addressee_id));
create policy "accept friend request" on public.friendships for update to authenticated
  using (addressee_id = auth.uid() and state = 'pending') with check (addressee_id = auth.uid() and state = 'accepted');
create policy "remove friendship" on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "block" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "unblock" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy "file report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "own reports" on public.reports for select to authenticated using (reporter_id = auth.uid());

create policy "own verifications" on public.verifications for select to authenticated using (user_id = auth.uid());

-- Owners see who they invited and who joined; never whether or how they answered.
create policy "owner or validator sees invite" on public.validator_invites for select to authenticated
  using (owner_id = auth.uid() or validator_id = auth.uid());

create policy "validator sees own response" on public.validator_responses for select to authenticated
  using (exists (select 1 from public.validator_invites i where i.id = invite_id and i.validator_id = auth.uid()));

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Column-level grants: clients can only change user-editable fields.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (username, name, bio, photo_url, setups_enabled) on public.profiles to authenticated;
grant update (status, visibility) on public.statuses to authenticated;
grant insert (requester_id, addressee_id), update (state), delete on public.friendships to authenticated;
grant insert (blocker_id, blocked_id), delete on public.blocks to authenticated;
grant insert (reporter_id, target_id, reason, details) on public.reports to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- validator_invites.state is hidden from owners so they can't infer who answered.
revoke select on public.validator_invites from authenticated;
grant select (id, verification_id, owner_id, label, token, validator_id, created_at, claimed_at, revoked_at) on public.validator_invites to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_invite_preview(text) to anon;
revoke execute on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.handle_new_user(), public.handle_block(), public.handle_friendship_change(), public.handle_status_change() from authenticated;

-- Avatars bucket: public read, users write only their own folder.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.friendships, public.statuses, public.notifications;

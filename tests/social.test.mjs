// Banana Split, Going Bananas and chat checks against the local stack.
// Run: supabase db reset && node --test tests/social.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const ok = (r) => { assert.ifError(r.error); return r.data; };

async function signIn(n, username, name) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const phone = `+1555000000${n}`;
  ok(await c.auth.signInWithOtp({ phone }));
  const r = ok(await c.auth.verifyOtp({ phone, token: '123456', type: 'sms' }));
  const id = r.user.id;
  ok(await c.from('profiles').update({ username, name }).eq('id', id));
  return { c, id, name };
}
async function befriend(a, b) {
  const existing = ok(await a.c.from('friendships').select('id').or(`and(requester_id.eq.${a.id},addressee_id.eq.${b.id}),and(requester_id.eq.${b.id},addressee_id.eq.${a.id})`));
  if (existing.length) return;
  ok(await a.c.from('friendships').insert({ requester_id: a.id, addressee_id: b.id }));
  ok(await b.c.from('friendships').update({ state: 'accepted' }).eq('requester_id', a.id).eq('addressee_id', b.id));
}
async function certifyRipe(u, validators) {
  ok(await u.c.from('statuses').update({ status: 'ripe' }).eq('user_id', u.id));
  for (const v of validators) await befriend(u, v);
  ok(await u.c.rpc('add_friend_validators', { friend_ids: validators.map((v) => v.id) }));
  const invites = ok(await u.c.from('validator_invites').select('id, validator_id, verification_id'));
  const summary = ok(await u.c.rpc('my_verification_summary'))[0];
  for (const v of validators) {
    const inv = invites.find((i) => i.validator_id === v.id && i.verification_id === summary.verification_id);
    ok(await v.c.rpc('submit_survey', { invite: inv.id, answer: 'yes' }));
  }
  const s = ok(await u.c.from('statuses').select('certified_at').eq('user_id', u.id).single());
  assert.ok(s.certified_at, `${u.name} certified`);
}

test('banana split, going bananas, chat', async () => {
  const max = await signIn(1, 'max', 'Max');
  const ann = await signIn(2, 'ann', 'Ann');
  const bob = await signIn(3, 'bob', 'Bob');
  const cyd = await signIn(4, 'cyd', 'Cyd');
  const dee = await signIn(5, 'dee', 'Dee');
  const eve = await signIn(6, 'eve', 'Eve');

  // Ann and Bob are Certified Ripe; Cyd is the matchmaker friend of both.
  await certifyRipe(ann, [max, cyd, dee]);
  await certifyRipe(bob, [max, cyd, dee]);

  // Only friends of both, and only Certified Ripe people, can be set up.
  assert.ok((await eve.c.rpc('suggest_setup', { a: ann.id, b: bob.id })).error, 'non-friend cannot suggest');
  assert.ok((await cyd.c.rpc('suggest_setup', { a: ann.id, b: dee.id })).error, 'uncertified cannot be matched');
  assert.ok((await cyd.c.rpc('suggest_setup', { a: ann.id, b: cyd.id })).error, 'cannot set yourself up');
  const cands = ok(await cyd.c.rpc('setup_candidates')).map((x) => x.id).sort();
  assert.deepEqual(cands, [ann.id, bob.id].sort());

  // Set-ups off removes you from the pool.
  ok(await bob.c.from('profiles').update({ setups_enabled: false }).eq('id', bob.id));
  assert.ok((await cyd.c.rpc('suggest_setup', { a: ann.id, b: bob.id })).error, 'setups off');
  ok(await bob.c.from('profiles').update({ setups_enabled: true }).eq('id', bob.id));

  // Pass is never revealed.
  const s1 = ok(await cyd.c.rpc('suggest_setup', { a: ann.id, b: bob.id, note: 'Both love bad puns' }));
  assert.ok((await cyd.c.rpc('suggest_setup', { a: ann.id, b: bob.id })).error, 'no duplicate open set-up');
  assert.ok((await ann.c.from('setups').select('*')).error, 'setups table hidden');
  ok(await ann.c.rpc('respond_setup', { setup: s1, decision: 'pass' }));
  assert.ok((await cyd.c.rpc('suggest_setup', { a: ann.id, b: bob.id })).error, 'retry after a pass is rejected the same way');
  assert.equal(ok(await ann.c.rpc('my_setup_prompts')).length, 0);
  const bobPrompts = ok(await bob.c.rpc('my_setup_prompts'));
  assert.equal(bobPrompts.length, 1);
  assert.equal(bobPrompts[0].matchmaker_name, 'Cyd');
  assert.equal(bobPrompts[0].note, 'Both love bad puns');
  assert.equal(bobPrompts[0].matched, false);
  assert.ok(!('a_decision' in bobPrompts[0]) && !('b_decision' in bobPrompts[0]));
  assert.equal(ok(await bob.c.rpc('respond_setup', { setup: s1, decision: 'accept' })), false);
  assert.equal(ok(await bob.c.rpc('my_setup_prompts')).length, 0, 'answered prompt gone, no reveal');
  const mm = ok(await cyd.c.rpc('my_matchmaking'));
  assert.equal(mm[0].matched, false);
  assert.ok(!('a_decision' in mm[0]));

  // Mutual accept opens a chat and credits the matchmaker. (Max suggests this time; Dee in parallel.)
  const s2 = ok(await max.c.rpc('suggest_setup', { a: ann.id, b: bob.id }));
  const s3 = ok(await dee.c.rpc('suggest_setup', { a: ann.id, b: bob.id }));
  assert.equal(ok(await ann.c.rpc('respond_setup', { setup: s2, decision: 'accept' })), false);
  assert.equal(ok(await bob.c.rpc('respond_setup', { setup: s2, decision: 'accept' })), true);
  const annP = ok(await ann.c.rpc('my_setup_prompts')).find((p) => p.setup_id === s2);
  assert.equal(annP.matched, true);
  assert.ok(annP.chat_id);
  const chatId = annP.chat_id;
  ok(await ann.c.rpc('respond_setup', { setup: s3, decision: 'accept' }));
  assert.equal(ok(await bob.c.rpc('respond_setup', { setup: s3, decision: 'accept' })), true);
  assert.equal(ok(await bob.c.rpc('my_chats')).filter((c) => c.kind === 'setup').length, 1, 'second suggestion reuses the chat');
  const maxProfile = ok(await max.c.from('profiles').select('setups_made').eq('id', max.id).single());
  assert.equal(maxProfile.setups_made, 1);
  const maxNotes = ok(await max.c.from('notifications').select('kind').eq('kind', 'setup_success'));
  assert.equal(maxNotes.length, 1);

  // Chat: members only.
  ok(await ann.c.from('messages').insert({ chat_id: chatId, sender_id: ann.id, body: 'hi bob 🍌' }));
  assert.ok((await max.c.from('messages').insert({ chat_id: chatId, sender_id: max.id, body: 'lurk' })).error, 'non-member cannot post');
  assert.ok((await bob.c.from('messages').insert({ chat_id: chatId, sender_id: ann.id, body: 'spoof' })).error, 'cannot spoof sender');
  assert.equal(ok(await max.c.from('messages').select('*').eq('chat_id', chatId)).length, 0);
  const bobChats = ok(await bob.c.rpc('my_chats'));
  assert.equal(bobChats[0].unread, 1);
  assert.equal(bobChats[0].members[0].name, 'Ann');
  ok(await bob.c.rpc('mark_chat_read', { chat: chatId }));
  assert.equal(ok(await bob.c.rpc('my_chats'))[0].unread, 0);

  // Going Bananas: audience rules.
  await befriend(max, cyd);
  const tomorrow4am = new Date(Date.now() + 6 * 3600e3).toISOString();
  assert.ok((await max.c.rpc('set_tonight', { note: 'x', audience: 'friends', expires_at: new Date(Date.now() + 40 * 3600e3).toISOString() })).error, 'max 28h');
  const post = ok(await max.c.rpc('set_tonight', { note: 'drinks downtown?', audience: 'ripe', expires_at: tomorrow4am }));
  const seen = async (u) => ok(await u.c.rpc('tonight_feed')).some((p) => p.post_id === post);
  assert.equal(await seen(ann), true, 'ripe friend sees it');
  assert.equal(await seen(cyd), false, 'non-ripe friend does not');
  assert.equal(await seen(eve), false, 'non-friend does not');
  assert.ok((await cyd.c.rpc('join_tonight', { post })).error, 'hidden post cannot be joined');

  ok(await max.c.rpc('set_tonight', { note: 'drinks downtown?', audience: 'friends', expires_at: tomorrow4am }));
  const post2 = ok(await max.c.rpc('tonight_feed')).find((p) => p.user_id === max.id).post_id;
  const tChat = ok(await cyd.c.rpc('join_tonight', { post: post2 }));
  assert.equal(ok(await ann.c.rpc('join_tonight', { post: post2 })), tChat, 'same group chat');
  const members = ok(await max.c.from('chat_members').select('user_id').eq('chat_id', tChat)).map((m) => m.user_id).sort();
  assert.deepEqual(members, [max.id, cyd.id, ann.id].sort());
  const feedForCyd = ok(await cyd.c.rpc('tonight_feed')).find((p) => p.post_id === post2);
  assert.equal(feedForCyd.joined, true);
  assert.equal(feedForCyd.join_count, 2);
  assert.equal(feedForCyd.audience, null, 'audience hidden from viewers');
  assert.ok((await cyd.c.from('tonight_posts').select('audience')).error, 'audience column not readable');
  assert.equal(ok(await cyd.c.from('tonight_posts').select('id')).some((p) => p.id === post2), true);

  // Editing the plan keeps RSVPs and the group chat.
  assert.equal(ok(await max.c.rpc('set_tonight', { note: 'drinks at 9', audience: 'friends', expires_at: tomorrow4am })), post2);
  const edited = ok(await cyd.c.rpc('tonight_feed')).find((p) => p.post_id === post2);
  assert.equal(edited.note, 'drinks at 9');
  assert.equal(edited.join_count, 2);
  assert.equal(edited.chat_id, tChat);

  // Narrowing to Ripe friends drops Cyd (not Ripe) from the plan and its chat; Ann stays.
  ok(await max.c.rpc('set_tonight', { note: 'drinks at 9', audience: 'ripe', expires_at: tomorrow4am }));
  const narrowed = ok(await max.c.from('chat_members').select('user_id').eq('chat_id', tChat)).map((m) => m.user_id).sort();
  assert.deepEqual(narrowed, [max.id, ann.id].sort());
  ok(await max.c.rpc('set_tonight', { note: 'drinks at 9', audience: 'friends', expires_at: tomorrow4am }));
  ok(await cyd.c.rpc('join_tonight', { post: post2 }));

  // Bunch-only: Cyd is in Ann's Bunch, Bob is not.
  ok(await ann.c.rpc('set_tonight', { note: null, audience: 'bunch', expires_at: tomorrow4am }));
  await befriend(ann, bob);
  const annPost = ok(await ann.c.rpc('tonight_feed'))[0].post_id;
  assert.equal(ok(await cyd.c.rpc('tonight_feed')).some((p) => p.post_id === annPost), true);
  assert.equal(ok(await bob.c.rpc('tonight_feed')).some((p) => p.post_id === annPost), false);

  // Clearing hides it.
  ok(await max.c.rpc('clear_tonight'));
  assert.equal(ok(await ann.c.rpc('tonight_feed')).some((p) => p.user_id === max.id), false);

  // Blocking closes the set-up chat.
  ok(await ann.c.from('blocks').insert({ blocker_id: ann.id, blocked_id: bob.id }));
  assert.equal(ok(await bob.c.rpc('my_chats')).some((c) => c.chat_id === chatId), false);

  // Blocking the host removes you from their Tonight chat.
  ok(await cyd.c.from('blocks').insert({ blocker_id: cyd.id, blocked_id: max.id }));
  assert.equal(ok(await cyd.c.from('messages').select('id').eq('chat_id', tChat)).length, 0);
  assert.ok((await cyd.c.from('messages').insert({ chat_id: tChat, sender_id: cyd.id, body: 'still here?' })).error);

  // Deleting an account deletes its messages and lets it clean up its avatar.
  ok(await ann.c.from('messages').insert({ chat_id: tChat, sender_id: ann.id, body: 'bye' }));
  ok(await ann.c.storage.from('avatars').upload(`${ann.id}/a.png`, new Blob(['x'], { type: 'image/png' })));
  assert.equal(ok(await ann.c.storage.from('avatars').list(ann.id)).length, 1);
  ok(await ann.c.rpc('delete_account'));
  assert.equal(ok(await max.c.from('messages').select('body').eq('chat_id', tChat)).some((m) => m.body === 'bye'), false);
});

// End-to-end checks of the Supabase schema, policies and RPCs against the local stack.
// Run: supabase db reset && node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

async function signIn(n, username, name) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const phone = `+1555000000${n}`;
  let r = await c.auth.signInWithOtp({ phone });
  assert.ifError(r.error);
  r = await c.auth.verifyOtp({ phone, token: '123456', type: 'sms' });
  assert.ifError(r.error);
  const id = r.data.user.id;
  const up = await c.from('profiles').update({ username, name, bio: `hi I'm ${name}` }).eq('id', id);
  assert.ifError(up.error);
  return { c, id };
}

async function befriend(a, b) {
  let r = await a.c.from('friendships').insert({ requester_id: a.id, addressee_id: b.id });
  assert.ifError(r.error);
  r = await b.c.from('friendships').update({ state: 'accepted' }).eq('requester_id', a.id).eq('addressee_id', b.id).select();
  assert.ifError(r.error);
  assert.equal(r.data.length, 1);
}

const ok = (r) => { assert.ifError(r.error); return r.data; };

test('core loop', async () => {
  const max = await signIn(1, 'max', 'Max');
  const ann = await signIn(2, 'ann', 'Ann');
  const bo = await signIn(3, 'bob', 'Bob');
  const cy = await signIn(4, 'cyd', 'Cyd');
  const dee = await signIn(5, 'dee', 'Dee');

  // Search by username and phone
  assert.equal(ok(await max.c.rpc('search_users', { q: 'an' }))[0].id, ann.id);
  assert.equal(ok(await max.c.rpc('search_users', { q: '@ann' }))[0].id, ann.id);
  assert.ok((await max.c.rpc('are_friends', { a: ann.id, b: bo.id })).error, 'relationship helpers are not exposed');
  assert.ok((await max.c.rpc('is_matchable', { person: ann.id })).error, 'relationship helpers are not exposed');
  assert.equal(ok(await max.c.rpc('search_users', { q: '(555) 000-0002' }))[0].id, ann.id);
  assert.equal(ok(await max.c.rpc('match_contacts', { phones: ['15550000003', '19999999999'] }))[0].id, bo.id);

  // Users can only set their own status
  ok(await max.c.from('statuses').update({ status: 'ripe' }).eq('user_id', max.id));
  const hijack = await ann.c.from('statuses').update({ status: 'picked' }).eq('user_id', max.id).select();
  assert.equal(hijack.data.length, 0);
  const certHack = await max.c.from('statuses').update({ certified_at: new Date().toISOString() }).eq('user_id', max.id);
  assert.ok(certHack.error, 'certified_at must not be client-writable');

  // Status hidden from non-friends, visible to friends
  assert.equal(ok(await ann.c.from('statuses').select().eq('user_id', max.id)).length, 0);
  await befriend(max, ann);
  assert.equal(ok(await ann.c.from('statuses').select().eq('user_id', max.id))[0].status, 'ripe');
  const feed = ok(await ann.c.rpc('friends_with_status'));
  assert.equal(feed[0].status, 'ripe');

  // Private visibility hides from friends
  ok(await max.c.from('statuses').update({ visibility: 'private' }).eq('user_id', max.id));
  assert.equal(ok(await ann.c.rpc('friends_with_status'))[0].status, null);
  ok(await max.c.from('statuses').update({ visibility: 'friends' }).eq('user_id', max.id));

  // The Bunch: create invites, claim, answer
  const invites = ok(await max.c.rpc('create_validator_invites', { labels: ['Ann', 'Bo', 'Cy', 'Dee'] }));
  assert.equal(invites.length, 4);
  const [iAnn, iBo, iCy, iDee] = invites;

  const preview = ok(await createClient(URL, KEY).rpc('get_invite_preview', { invite_token: iBo.token }));
  assert.equal(preview[0].owner_name, 'Max');
  assert.equal(preview[0].valid, true);

  const selfClaim = await max.c.rpc('claim_invite', { invite_token: iAnn.token });
  assert.ok(selfClaim.error);

  const annInvite = ok(await ann.c.rpc('claim_invite', { invite_token: iAnn.token }));
  const boInvite = ok(await bo.c.rpc('claim_invite', { invite_token: iBo.token }));
  const cyInvite = ok(await cy.c.rpc('claim_invite', { invite_token: iCy.token }));
  // A link only works for the first person who claims it
  assert.ok((await dee.c.rpc('claim_invite', { invite_token: iAnn.token })).error);
  // Claiming makes them friends
  assert.equal(ok(await bo.c.from('statuses').select().eq('user_id', max.id))[0].status, 'ripe');

  // Non-validator cannot answer someone else's invite
  assert.ok((await dee.c.rpc('submit_survey', { invite: annInvite, answer: 'yes' })).error);

  ok(await ann.c.rpc('submit_survey', { invite: annInvite, answer: 'yes', fun_question: 'Best quality?', fun_answer: 'Snacks' }));
  assert.ok((await ann.c.rpc('submit_survey', { invite: annInvite, answer: 'no' })).error, 'one answer per validator');
  ok(await bo.c.rpc('submit_survey', { invite: boInvite, answer: 'not_sure' }));
  ok(await cy.c.rpc('submit_survey', { invite: cyInvite, answer: 'yes' }));

  let summary = ok(await max.c.rpc('my_verification_summary'))[0];
  assert.equal(summary.confirmations, 2);
  assert.equal(summary.state, 'collecting');

  // Answering doesn't change what the owner can see about the link
  assert.equal(ok(await max.c.rpc('get_invite_preview', { invite_token: iAnn.token }))[0].valid, true);

  // Owner can never read individual answers or answer state
  assert.equal(ok(await max.c.from('validator_responses').select()).length, 0);
  assert.ok((await max.c.from('validator_invites').select('state')).error);
  assert.equal(ok(await max.c.from('validator_invites').select('id, label, validator_id')).length, 4);

  const deeInvite = ok(await dee.c.rpc('claim_invite', { invite_token: iDee.token }));
  ok(await dee.c.rpc('submit_survey', { invite: deeInvite, answer: 'yes' }));
  summary = ok(await max.c.rpc('my_verification_summary'))[0];
  assert.equal(summary.state, 'certified');
  assert.ok(ok(await ann.c.rpc('friends_with_status'))[0].certified_at, 'friends see Certified badge');

  // Status change expires verification and asks validators to re-confirm
  ok(await max.c.from('statuses').update({ status: 'picked' }).eq('user_id', max.id));
  summary = ok(await max.c.rpc('my_verification_summary'))[0];
  assert.equal(summary.state, 'collecting');
  assert.equal(summary.status, 'picked');
  assert.equal(summary.confirmations, 0);
  assert.equal(ok(await ann.c.rpc('friends_with_status'))[0].certified_at, null);
  const reconfirm = ok(await ann.c.from('notifications').select().eq('kind', 'reconfirm_request'));
  assert.equal(reconfirm.length, 1);
  const survey = ok(await ann.c.rpc('get_survey', { invite: reconfirm[0].payload.invite_id }))[0];
  assert.equal(survey.status, 'picked');
  assert.equal(survey.active, true);

  // Bunch-only visibility
  ok(await max.c.from('statuses').update({ visibility: 'bunch' }).eq('user_id', max.id));
  assert.equal(ok(await ann.c.from('statuses').select().eq('user_id', max.id)).length, 1);

  // Block: removes friendship, hides profile both ways
  ok(await dee.c.from('blocks').insert({ blocker_id: dee.id, blocked_id: max.id }));
  assert.equal(ok(await max.c.from('profiles').select().eq('id', dee.id)).length, 0);
  assert.equal(ok(await dee.c.from('friendships').select()).length, 0);
  assert.equal(ok(await max.c.rpc('search_users', { q: 'dee' })).length, 0);

  // Friends can be added directly; revoke hides them
  const direct = ok(await max.c.rpc('add_friend_validators', { friend_ids: [ann.id] }));
  assert.equal(direct.length, 0, 'already in the Bunch');
  assert.ok((await max.c.rpc('add_friend_validators', { friend_ids: [dee.id] })).error, 'must be friends');
  const deeCurrent = ok(await max.c.from('validator_invites').select('id').eq('validator_id', dee.id).eq('verification_id', summary.verification_id).is('revoked_at', null));
  assert.equal(deeCurrent.length, 0, 'block removes the validator from the Bunch list');
  ok(await ann.c.rpc('submit_survey', { invite: reconfirm[0].payload.invite_id, answer: 'yes' }));
  assert.equal(ok(await max.c.rpc('my_verification_summary'))[0].confirmations, 1);
  const annCurrent = ok(await max.c.from('validator_invites').select('id, validator_id, revoked_at').eq('validator_id', ann.id).eq('verification_id', summary.verification_id).is('revoked_at', null));
  assert.equal(annCurrent.length, 1);
  assert.equal(ok(await max.c.rpc('revoke_validator_invite', { invite: annCurrent[0].id })), true, 'answered invites can be removed too');
  assert.equal(ok(await max.c.rpc('my_verification_summary'))[0].confirmations, 1, 'removing reveals nothing about the answer');
  const readded = ok(await max.c.rpc('add_friend_validators', { friend_ids: [ann.id] }));
  assert.equal(readded.length, 1, 'removed validator can be re-added');
  ok(await ann.c.rpc('submit_survey', { invite: readded[0].id, answer: 'yes' }));
  assert.equal(ok(await max.c.rpc('my_verification_summary'))[0].confirmations, 1, 'one validator counts once');

  // Report
  ok(await ann.c.from('reports').insert({ reporter_id: ann.id, target_id: bo.id, reason: 'spam' }));

  // Delete account removes all data
  ok(await cy.c.rpc('delete_account'));
  assert.equal(ok(await max.c.from('profiles').select().eq('id', cy.id)).length, 0);
});

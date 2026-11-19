// Seeds a local demo: Ann and Bob Certified Ripe; Cyd and Max friends with both. Run after `supabase db reset`.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const ok = (r) => { if (r.error) throw r.error; return r.data; };

async function user(n, username, name, bio) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const phone = `+1555000000${n}`;
  ok(await c.auth.signInWithOtp({ phone }));
  const id = ok(await c.auth.verifyOtp({ phone, token: '123456', type: 'sms' })).user.id;
  ok(await c.from('profiles').update({ username, name, bio }).eq('id', id));
  return { c, id };
}
async function friends(a, b) {
  ok(await a.c.from('friendships').insert({ requester_id: a.id, addressee_id: b.id }));
  ok(await b.c.from('friendships').update({ state: 'accepted' }).eq('requester_id', a.id).eq('addressee_id', b.id));
}
async function certify(u, status, validators) {
  ok(await u.c.from('statuses').update({ status }).eq('user_id', u.id));
  ok(await u.c.rpc('add_friend_validators', { friend_ids: validators.map((v) => v.id) }));
  const s = ok(await u.c.rpc('my_verification_summary'))[0];
  const invites = ok(await u.c.from('validator_invites').select('id, validator_id').eq('verification_id', s.verification_id));
  for (const v of validators) ok(await v.c.rpc('submit_survey', { invite: invites.find((i) => i.validator_id === v.id).id, answer: 'yes' }));
}

const max = await user(1, 'max', 'Max', 'Professional snacker');
const ann = await user(2, 'ann', 'Ann', 'Climber, coffee snob');
const bob = await user(3, 'bob', 'Bob', 'Will cook for puns');
const cyd = await user(4, 'cyd', 'Cyd', 'Serial matchmaker');
const dee = await user(5, 'dee', 'Dee', 'Here for the drama');
for (const [a, b] of [[max, ann], [max, bob], [max, cyd], [max, dee], [cyd, ann], [cyd, bob], [dee, ann], [dee, bob]]) await friends(a, b);
await certify(ann, 'ripe', [max, cyd, dee]);
await certify(bob, 'ripe', [max, cyd, dee]);
ok(await max.c.from('statuses').update({ status: 'ripe' }).eq('user_id', max.id));
console.log('seeded');

export type BananaStatus = 'ripe' | 'picked' | 'bruised' | 'peel_sealed';
export type StatusVisibility = 'friends' | 'bunch' | 'private';

export type Profile = {
  id: string;
  username: string | null;
  name: string | null;
  bio: string | null;
  photo_url: string | null;
  setups_enabled: boolean;
  setups_made: number;
};

export type MyStatus = {
  user_id: string;
  status: BananaStatus;
  visibility: StatusVisibility;
  changed_at: string;
  certified_at: string | null;
};

export type FriendRow = {
  friendship_id: string;
  id: string;
  username: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  status: BananaStatus | null;
  certified_at: string | null;
  changed_at: string | null;
};

export type UserLite = { id: string; username: string; name: string; photo_url: string | null };

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  state: 'pending' | 'accepted';
};

export type Invite = {
  id: string;
  verification_id: string;
  label: string;
  token: string;
  validator_id: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type VerificationSummary = {
  verification_id: string;
  status: BananaStatus;
  state: 'collecting' | 'certified' | 'expired';
  confirmations: number;
  needed: number;
  certified_at: string | null;
};

export type Notification = {
  id: string;
  kind: string;
  actor_id: string | null;
  payload: { invite_id?: string };
  read_at: string | null;
  created_at: string;
};

export type TonightAudience = 'friends' | 'ripe' | 'bunch';

export type TonightPost = {
  post_id: string;
  user_id: string;
  name: string;
  username: string;
  photo_url: string | null;
  note: string | null;
  audience: TonightAudience | null;
  expires_at: string;
  joined: boolean;
  join_count: number;
  chat_id: string | null;
};

export type SetupPrompt = {
  setup_id: string;
  matchmaker_id: string | null;
  matchmaker_name: string | null;
  matchmaker_photo_url: string | null;
  other_id: string;
  other_name: string;
  other_username: string;
  other_photo_url: string | null;
  other_bio: string | null;
  note: string | null;
  my_decision: 'pending' | 'accept' | 'pass';
  matched: boolean;
  chat_id: string | null;
  created_at: string;
};

export type ChatSummary = {
  chat_id: string;
  kind: 'setup' | 'tonight';
  title: string | null;
  members: { id: string; name: string; photo_url: string | null }[];
  last_body: string | null;
  last_at: string;
  unread: number;
};

export type Message = { id: string; chat_id: string; sender_id: string | null; body: string; created_at: string };

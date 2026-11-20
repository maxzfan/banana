import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, ErrorText, Field, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMe } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

async function uploadAvatar(userId: string, uri: string, mimeType?: string | null) {
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const ext = mimeType?.split('/')[1] ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, body, {
    contentType: mimeType ?? 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export function ProfileForm({ submitLabel, onSaved }: { submitLabel: string; onSaved?: () => void }) {
  const { profile, userId, refresh } = useMe();
  const [name, setName] = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [photo, setPhoto] = useState<{ uri: string; mimeType?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  }

  async function save() {
    const cleanUsername = username.trim().replace(/^@/, '');
    if (!name.trim()) return setError('Add your name');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
      return setError('Username: 3–20 letters, numbers or underscores');
    }
    setSaving(true);
    setError(null);
    try {
      const photo_url = photo ? await uploadAvatar(userId, photo.uri, photo.mimeType) : profile?.photo_url;
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim(), username: cleanUsername, bio: bio.trim() || null, photo_url })
        .eq('id', userId);
      if (error) throw error.code === '23505' ? new Error('That username is taken') : error;
      await refresh();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Pressable onPress={pick} style={{ alignSelf: 'center', alignItems: 'center', gap: Spacing.one }}>
        <Avatar uri={photo?.uri ?? profile?.photo_url} name={name || '?'} size={112} />
        <Text variant="small" color="brown">
          {photo || profile?.photo_url ? 'Change photo' : 'Add photo'}
        </Text>
      </Pressable>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Max" maxLength={50} autoComplete="name" />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        placeholder="maxbanana"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={21}
      />
      <Field
        label="Short bio"
        value={bio}
        onChangeText={setBio}
        placeholder="Professional snacker. Ask me about my sourdough."
        multiline
        maxLength={160}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={submitLabel} onPress={save} loading={saving} />
    </View>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { unwrap, useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { ChatSummary, Message } from '@/lib/types';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useMe();
  const theme = useTheme();
  const [body, setBody] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const list = useRef<FlatList<Message>>(null);

  const { data: chat } = useAsync(async () => {
    const chats = await unwrap<ChatSummary[]>(supabase.rpc('my_chats'));
    const msgs = await unwrap<Message[]>(supabase.from('messages').select('*').eq('chat_id', id).order('created_at', { ascending: false }).limit(500));
    setMessages(msgs.reverse());
    supabase.rpc('mark_chat_read', { chat: id }).then();
    return chats.find((c) => c.chat_id === id) ?? null;
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        supabase.rpc('mark_chat_read', { chat: id }).then();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const names = new Map(chat?.members.map((m) => [m.id, m.name]));
  const title = chat ? (chat.kind === 'setup' ? chat.members.map((m) => m.name).join(', ') : (chat.title ?? 'Tonight')) : '';

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody('');
    const { data } = await supabase.from('messages').insert({ chat_id: id, sender_id: userId, body: text }).select().single();
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]));
  }

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1, gap: Spacing.two }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Button title="←" variant="ghost" small onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text variant="subtitle" numberOfLines={1}>{title}</Text>
            <Text variant="caption" color="textSecondary">
              {chat?.kind === 'setup' ? "It's a match! Say hi" : `${(chat?.members.length ?? 0) + 1} going bananas tonight`}
            </Text>
          </View>
        </View>
        <FlatList
          ref={list}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ gap: Spacing.one, paddingVertical: Spacing.two }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text color="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.five }}>No messages yet</Text>}
          renderItem={({ item, index }) => {
            const mine = item.sender_id === userId;
            const showName = !mine && chat?.kind === 'tonight' && messages[index - 1]?.sender_id !== item.sender_id;
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                {showName ? <Text variant="caption" color="textSecondary">{names.get(item.sender_id ?? '') ?? 'Someone'}</Text> : null}
                <View
                  style={{
                    backgroundColor: mine ? Palette.banana : theme.card,
                    borderRadius: Radius.lg,
                    paddingHorizontal: Spacing.three,
                    paddingVertical: Spacing.two,
                    borderWidth: mine ? 0 : 1,
                    borderColor: theme.border,
                  }}>
                  <Text style={{ color: mine ? Palette.ink : theme.text }}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />
        <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Message"
            placeholderTextColor={theme.textSecondary}
            onSubmitEditing={send}
            maxLength={2000}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: Radius.pill,
              borderWidth: 2,
              borderColor: theme.border,
              paddingHorizontal: Spacing.three,
              fontFamily: Fonts.regular,
              fontSize: 16,
              color: theme.text,
              backgroundColor: theme.card,
            }}
          />
          <Button title="Send" small onPress={send} disabled={!body.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

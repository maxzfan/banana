import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'friends', title: 'Friends', icon: 'people' },
  { name: 'bunch', title: 'Bunch', icon: 'ribbon' },
  { name: 'inbox', title: 'Inbox', icon: 'notifications' },
  { name: 'me', title: 'Me', icon: 'person-circle' },
];

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.dark ? theme.primary : theme.brown,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border, borderTopWidth: 2, height: 64 },
        tabBarLabelStyle: { fontFamily: Fonts.semibold, fontSize: 12 },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? t.icon : (`${t.icon}-outline` as IconName)} size={24} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

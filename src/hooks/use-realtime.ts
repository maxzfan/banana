import { useEffect, useLayoutEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

// Calls onChange when any row the user can see in these tables changes.
export function useRealtime(tables: string[], onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  useLayoutEffect(() => {
    cb.current = onChange;
  });
  const key = tables.join(',');

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(`rt:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}

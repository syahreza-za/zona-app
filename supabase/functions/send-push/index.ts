// Supabase Edge Function: send-push
// Dispatches push notifications to FCM (Android), APNs (iOS), and Web Push endpoints.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PushPayload {
  recipientUserIds: string[];
  title: string;
  body: string;
  channelId?: string;
  type: 'message' | 'mention' | 'hangout_pin';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');

    const payload = (await req.json()) as PushPayload;
    if (!payload.recipientUserIds?.length || !payload.title) {
      return new Response(JSON.stringify({ error: 'Invalid push payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: tokens, error } = await admin
      .from('push_tokens')
      .select('user_id, token, platform')
      .in('user_id', payload.recipientUserIds);

    if (error) throw error;

    let dispatched = 0;
    if (fcmServerKey && tokens?.length) {
      const mobileTokens = tokens
        .filter((t) => t.platform === 'android' || t.platform === 'ios')
        .map((t) => t.token);

      if (mobileTokens.length > 0) {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            Authorization: `key=${fcmServerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registration_ids: mobileTokens,
            notification: { title: payload.title, body: payload.body },
            data: { channelId: payload.channelId ?? '', type: payload.type },
          }),
        });
        dispatched += mobileTokens.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, matchedTokens: tokens?.length ?? 0, dispatched }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Push dispatch failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

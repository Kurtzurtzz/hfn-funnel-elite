import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Handshake
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url);
    const leadId = url.searchParams.get("lead_id");
    const targetUrl = url.searchParams.get("url");

    if (leadId && targetUrl) {
      console.log(`[LINK-TRACKER] Click detected from lead ${leadId} to ${targetUrl}`);

      // 1. Get current lead state
      const { data: lead } = await supabase
        .from('hfn_funnel_leads')
        .select('tags, score')
        .eq('id', leadId)
        .single();

      if (lead) {
        // 2. Intelligence: Update Score (+10) and Tags
        const newScore = (lead.score || 0) + 10;
        let newTags = lead.tags || [];
        if (!newTags.includes('🔗 Clicou')) newTags.push('🔗 Clicou');
        if (newScore >= 30 && !newTags.includes('🔥 Quente')) newTags.push('🔥 Quente');

        await supabase.from('hfn_funnel_leads').update({
          score: newScore,
          tags: newTags,
          last_interaction_at: new Date().toISOString()
        }).eq('id', leadId);

        // 3. Log Event to Chat History (Professional Audit)
        await supabase.from('hfn_funnel_chat_logs').insert({
          lead_id: leadId,
          direction: 'inbound',
          message_type: 'link_click',
          content: `🔗 CLIQUE: ${targetUrl}`,
          metadata: { target_url: targetUrl, event: 'link_tracker_v1' }
        });
      }
      
      // 4. Instant Redirect (User doesn't see the delay)
      return new Response(null, {
        status: 302,
        headers: { 
          "Location": targetUrl,
          "Cache-Control": "no-cache"
        }
      });
    }

    return new Response("HFN Link Tracker Protocol // Missing Parameters", { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });

  } catch (error: any) {
    console.error("[HFN-TRACKER] Fatal Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})

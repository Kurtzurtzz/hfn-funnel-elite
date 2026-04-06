import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get Trigger Data from Request
    let targetLeadId: string | null = null;
    try {
      const body = await req.json();
      targetLeadId = body.lead_id;
    } catch (e) {
      // Not a JSON request or empty, continue with bulk processing if needed
    }

    // 2. Process Pending Dispatches
    let query = supabase.from('hfn_pending_dispatches').select('*');
    if (targetLeadId) {
      query = query.eq('lead_id', targetLeadId);
    }

    const { data: pendingLeads, error: pendingError } = await query;

    if (pendingError) throw pendingError

    if (!pendingLeads || pendingLeads.length === 0) {
      return new Response(JSON.stringify({ message: "No pending leads found" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const results = [];

    // 2. Loop and Send
    for (const lead of pendingLeads) {
      try {
        console.log(`[HFN-FLUX] Sending ${lead.message_type} to ${lead.whatsapp}...`)

        // Variable Replacement & Newline Fix
        let messageContent = lead.content
          ?.replace(/\{\{name\}\}/g, lead.name || 'HFN Fan')
          ?.replace(/\{\{prize\}\}/g, 'Bônus de 100%')
          ?.replace(/\{\{link\}\}/g, 'https://helenfightnews.com/resgate')
          ?.replaceAll('\\n', '\n');

        // Build Payload based on message_type
        let requestBody: any = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: lead.whatsapp,
        };

        if (lead.message_type === 'text' || !lead.message_type) {
          requestBody.type = "text";
          requestBody.text = { body: messageContent, preview_url: true };
        } else if (lead.message_type === 'image') {
          requestBody.type = "image";
          requestBody.image = { link: lead.media_url, caption: messageContent };
        } else if (lead.message_type === 'audio') {
          requestBody.type = "audio";
          requestBody.audio = { link: lead.media_url };
        } else if (lead.message_type === 'video') {
          requestBody.type = "video";
          requestBody.video = { link: lead.media_url, caption: messageContent };
        }

        // Call Meta API
        const response = await fetch(
          `https://graph.facebook.com/v22.0/${lead.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lead.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        const metaData = await response.json();

        if (response.ok) {
          // 3. Log to Chat History (Outbound)
          await supabase.from('hfn_funnel_chat_logs').insert({
            lead_id: lead.lead_id,
            direction: 'outbound',
            message_type: lead.message_type,
            content: messageContent,
            media_url: lead.media_url,
            metadata: { meta_id: metaData.messages?.[0]?.id }
          });

          // 4. Update Lead progress
          await supabase
            .from('hfn_funnel_leads')
            .update({
              current_step: lead.next_step,
              last_sent_at: new Date().toISOString()
            })
            .eq('id', lead.lead_id)

          results.push({ lead_id: lead.lead_id, status: 'sent', type: lead.message_type })
        }

      } catch (innerError) {
        console.error(`[HFN-FLUX] Error processing lead ${lead.lead_id}:`, innerError);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

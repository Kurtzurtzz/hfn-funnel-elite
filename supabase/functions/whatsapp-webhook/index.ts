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

  // 1. WhatsApp Verification Handshake
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === "hfn_verify_2026") {
    return new Response(challenge, { status: 200 });
  }

  // 2. Process Incoming Message
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json();
    const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = payload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];

    if (message && contact) {
      const waId = contact.wa_id;
      const name = contact.profile?.name || "HFN Fan";
      const text = message.text?.body || "";

      // Check if lead already exists
      const { data: existingLead } = await supabase
        .from('hfn_funnel_leads')
        .select('*')
        .eq('whatsapp', waId)
        .single();

      let leadId = existingLead?.id;

      if (!existingLead) {
        // [ZAPIER-FEEL]: Create new lead
        const { data: newLead, error: insertError } = await supabase
          .from('hfn_funnel_leads')
          .insert({
            whatsapp: waId,
            name: name,
            current_step: 0,
            status: 'active',
            metadata: { source: 'WhatsApp_Direct', first_message: text }
          })
          .select()
          .single();

        if (insertError) throw insertError;
        leadId = newLead.id;
      }

      // 3. Update Lead State (Mark as Replied)
      if (leadId) {
        await supabase.from('hfn_funnel_leads').update({
          has_replied: true,
          last_interaction_at: new Date().toISOString()
        }).eq('id', leadId);

        // 4. Intelligence: Auto-advance on New Lead or Image Proof
        const currentStep = existingLead?.current_step || 0;
        const { data: nextMsg } = await supabase
          .from('hfn_funnel_messages')
          .select('send_condition')
          .eq('step_number', currentStep + 1)
          .single();

        const isNewLead = !existingLead;
        const isImageProof = message.type === 'image' && nextMsg?.send_condition === 'on_image';

        if (isNewLead || isImageProof) {
          console.log(`[HFN-FLUX] Triggering RPC for lead ${leadId} (Reason: ${isNewLead ? 'New' : 'Image'})...`);
          await supabase.rpc('hfn_send_via_sql', { lead_id: leadId });
        }

        // 4. Log Incoming Message to Chat History
        await supabase.from('hfn_funnel_chat_logs').insert({
          lead_id: leadId,
          direction: 'inbound',
          message_type: message.type || 'text',
          content: text || (message.image ? '[Imagem]' : message.audio ? '[Áudio]' : '[Mídia]'),
          media_url: message.image?.link || message.audio?.link || message.video?.link,
          metadata: { message_id: message.id }
        });
      }
    }

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("[HFN-FLUX] Webhook Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

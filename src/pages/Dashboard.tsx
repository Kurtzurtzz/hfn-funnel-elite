import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Users, Settings, Clock, Send, 
  CheckCircle2, AlertCircle, Play, Pause, Edit2, 
  Zap, ShieldCheck, Mail, Phone, ExternalLink, Save,
  RefreshCw, MousePointer2, ChevronRight
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
interface Lead {
  id: string;
  name: string;
  whatsapp: string;
  current_step: number;
  status: string;
  last_sent_at?: string;
  metadata?: any;
}

interface Message {
  id: string;
  step_number: number;
  content: string;
  delay_minutes: number;
  is_active: boolean;
  message_type: 'text' | 'image' | 'audio' | 'video';
  media_url?: string;
}

interface ChatLog {
  id: string;
  lead_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string;
  media_url?: string;
  created_at: string;
}

interface FunnelSettings {
  id?: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  is_active: boolean;
  phone_number?: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<FunnelSettings>({
    phone_number_id: '',
    business_account_id: '',
    access_token: '',
    is_active: true,
    phone_number: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- DATA FETCHING ---
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: leadsData } = await supabase.from('hfn_funnel_leads').select('*').order('created_at', { ascending: false });
        if (leadsData) setLeads(leadsData);

        const { data: msgsData } = await supabase.from('hfn_funnel_messages').select('*').order('step_number', { ascending: true });
        if (msgsData) setMessages(msgsData);

        const { data: settingsData, error: settingsError } = await supabase.from('hfn_funnel_settings').select('*').limit(1).maybeSingle();
        if (settingsData) setSettings(settingsData);
        else if (settingsError) console.error("Error fetching settings:", settingsError);
      } catch (error) {
        console.error("Error fetching HFN data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    const leadsChannel = supabase.channel('hfn-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hfn_funnel_leads' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as Lead, ...prev]);
          toast.success("Novo lead capturado!");
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hfn_funnel_chat_logs' }, (payload: any) => {
        const newLog = payload.new as ChatLog;
        setChatLogs(prev => [...prev, newLog]);
      })
      .subscribe();

    return () => { supabase.removeChannel(leadsChannel); };
  }, []);

  // MOTOR DE DRIP
  useEffect(() => {
    let interval: any;
    if (settings.is_active) {
      interval = setInterval(() => { processDrip(); }, 30000);
    }
    return () => clearInterval(interval);
  }, [settings.is_active]);

  const processDrip = async () => {
    if (isProcessing) return;
    try {
      const { data: pendingLeads } = await supabase
        .from('hfn_funnel_leads')
        .select('id, whatsapp')
        .eq('status', 'active')
        .lte('next_send_at', new Date().toISOString());

      if (!pendingLeads || pendingLeads.length === 0) return;
      setIsProcessing(true);
      for (const lead of pendingLeads) {
        await supabase.rpc('hfn_send_via_sql', { lead_id: lead.id });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Usamos upsert com a estratégia de garantir apenas uma linha (ID fixo se necessário ou id vindo do state)
      const payload = { ...settings, updated_at: new Date().toISOString() };
      
      // Se não houver ID (primeiro save), o Supabase vai inserir. 
      // Se houver, ele atualiza.
      const { data, error } = await supabase.from('hfn_funnel_settings').upsert(payload).select().single();
      
      if (error) throw error;
      if (data) setSettings(data); // Atualiza o estado com o ID gerado se for o primeiro save
      
      toast.success("Configurações salvas e persistidas!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMessage = async (msg: Message) => {
    try {
      const { error } = await supabase.from('hfn_funnel_messages').update({ ...msg }).eq('id', msg.id);
      if (error) throw error;
      toast.success(`Step ${msg.step_number} atualizado!`);
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="min-h-screen bg-black text-white mobile-safe-padding py-6 md:py-12 font-body">
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 bg-primary flex items-center justify-center font-black italic text-xl skew-x-[-12deg]">HFN</div>
             <h1 className="text-3xl md:text-5xl font-heading font-black italic uppercase tracking-tighter">Funnel Hub</h1>
          </div>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-primary animate-pulse" /> Official HFN Automation
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto">
        <Tabs defaultValue="leads" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-auto flex-wrap justify-center md:justify-start">
              <TabsTrigger value="leads" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all text-white">Leads</TabsTrigger>
              <TabsTrigger value="chat" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all text-white">Monitor</TabsTrigger>
              <TabsTrigger value="sequence" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all text-white">Sequência</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all text-white">Config</TabsTrigger>
            </TabsList>
            <div className="hidden md:flex items-center gap-4 text-zinc-500 text-[10px] font-mono uppercase">
               <span>Total Leads: <span className="text-white">{leads.length}</span></span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <TabsContent value="leads" className="space-y-6">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
                 <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-[10px] uppercase">Lead</TableHead><TableHead className="text-[10px] uppercase text-center">Step</TableHead><TableHead className="text-[10px] uppercase px-6 text-right">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {leads.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-20 text-xs uppercase opacity-40">Aguardando leads...</TableCell></TableRow> : leads.map(lead => (
                        <TableRow key={lead.id} className="border-white/5">
                          <TableCell className="py-4">
                             <div className="font-bold text-white uppercase text-xs">{lead.name || 'Anonymous'}</div>
                             <div className="text-[10px] text-zinc-500">{lead.whatsapp}</div>
                          </TableCell>
                          <TableCell className="text-center font-heading font-black italic text-primary text-xl">{lead.current_step}</TableCell>
                          <TableCell className="text-right px-6"><Badge className="text-[9px] uppercase">{lead.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                 </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="chat">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[500px]">
                  <div className="lg:col-span-1 glass-card overflow-y-auto max-h-[600px]">
                     {leads.map(lead => (
                        <button key={lead.id} onClick={() => setSelectedLead(lead)} className={`w-full p-4 border-b border-white/5 text-left hover:bg-white/5 ${selectedLead?.id === lead.id ? 'bg-primary/10' : ''}`}>
                           <div className="text-xs font-bold uppercase">{lead.name || lead.whatsapp}</div>
                        </button>
                     ))}
                  </div>
                  <div className="lg:col-span-2 glass-card p-6 flex flex-col bg-zinc-900/40 min-h-[400px]">
                     {selectedLead ? (
                        <div className="flex-1 overflow-y-auto space-y-4">
                           {chatLogs.map(log => (
                              <div key={log.id} className={`flex ${log.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                                 <div className={`p-3 text-xs ${log.direction === 'inbound' ? 'bg-zinc-800' : 'bg-primary/20'}`}>{log.content}</div>
                              </div>
                           ))}
                        </div>
                     ) : <div className="h-full flex items-center justify-center opacity-20 uppercase text-[10px]">Selecione um lead</div>}
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="sequence" className="space-y-4">
               {messages.map((msg, idx) => (
                  <Card key={msg.id} className="bg-zinc-900 border-white/5 rounded-none p-6">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="w-8 h-8 border border-primary flex items-center justify-center font-black italic text-primary">{msg.step_number}</div>
                        <Input className="h-8 w-20 text-[10px] bg-zinc-800 border-none" type="number" value={msg.delay_minutes} onChange={(e) => {
                           const n = [...messages]; n[idx].delay_minutes = parseInt(e.target.value); setMessages(n);
                        }} />
                        <span className="text-[10px] uppercase font-mono text-zinc-500">Minutos</span>
                        <Button onClick={() => handleUpdateMessage(msg)} size="sm" className="h-8 px-4 text-[10px] bg-primary rounded-none ml-auto">Salvar</Button>
                     </div>
                     <Textarea value={msg.content} onChange={(e) => {
                        const n = [...messages]; n[idx].content = e.target.value; setMessages(n);
                     }} className="bg-black/40 border-white/5 text-xs h-32 rounded-none" />
                  </Card>
               ))}
            </TabsContent>

            <TabsContent value="settings" className="max-w-2xl mx-auto">
               <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 space-y-6">
                  <div className="text-center border-b border-white/5 pb-6">
                     <h3 className="font-heading italic uppercase text-2xl font-black">Configurações Meta</h3>
                  </div>
                  <div className="space-y-4">
                     <div className="space-y-2">
                        <Label className="text-[10px] uppercase text-zinc-500">WhatsApp Oficial do Bot (DDI+DDD+Número)</Label>
                        <Input value={settings.phone_number || ''} onChange={(e) => setSettings({...settings, phone_number: e.target.value})} placeholder="5521..." className="bg-zinc-800 border-none h-12 rounded-none" />
                     </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label className="text-[10px] uppercase text-zinc-500">Phone Number ID</Label>
                           <Input value={settings.phone_number_id} onChange={(e) => setSettings({...settings, phone_number_id: e.target.value})} className="bg-zinc-800 border-none h-12 rounded-none" />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] uppercase text-zinc-500">WABA ID</Label>
                           <Input value={settings.business_account_id} onChange={(e) => setSettings({...settings, business_account_id: e.target.value})} className="bg-zinc-800 border-none h-12 rounded-none" />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <Label className="text-[10px] uppercase text-zinc-500">Access Token</Label>
                        <Input type="password" value={settings.access_token} onChange={(e) => setSettings({...settings, access_token: e.target.value})} className="bg-zinc-800 border-none h-12 rounded-none" />
                     </div>
                     <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full bg-primary h-14 uppercase font-heading italic font-black rounded-none mt-4">Salvar Configurações</Button>
                  </div>
               </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>
    </div>
  );
}

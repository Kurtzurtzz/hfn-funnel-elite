import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Users, Settings, Clock, Send, 
  CheckCircle2, AlertCircle, Play, Pause, Edit2, 
  Zap, ShieldCheck, Mail, Phone, ExternalLink, Save,
  RefreshCw, MousePointer2, ChevronRight, ShieldAlert, Upload, Loader2
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
  score?: number;
  tags?: string[];
  utm_source?: string;
  is_muted?: boolean;
}

interface Message {
  id: string;
  step_number: number;
  content: string;
  delay_minutes: number;
  is_active: boolean;
  message_type: 'text' | 'image' | 'audio' | 'video';
  media_url?: string;
  send_condition?: string;
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
  lgpd_policy_url?: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const [filterScore, setFilterScore] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<FunnelSettings>({
    phone_number_id: '',
    business_account_id: '',
    access_token: '',
    is_active: true,
    phone_number: '',
    lgpd_policy_url: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessPass, setAccessPass] = useState("");
  const [isUploading, setIsUploading] = useState<string | null>(null); // Armazena o ID da mensagem sendo enviada
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  useEffect(() => {
    const isAuth = localStorage.getItem('hfn_auth') === 'true';
    if (isAuth) setIsAuthenticated(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessPass === 'hfn_secure_2026') {
      setIsAuthenticated(true);
      localStorage.setItem('hfn_auth', 'true');
    } else {
      toast.error("Senha incorreta!");
    }
  };

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
      const { error } = await supabase.from('hfn_funnel_messages').update({ 
        content: msg.content,
        delay_minutes: msg.delay_minutes,
        media_url: msg.media_url,
        send_condition: msg.send_condition || 'always'
      }).eq('id', msg.id);
      if (error) throw error;
      toast.success(`Step ${msg.step_number} atualizado!`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>, msgId: string, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limites básicos
    if (file.size > 10 * 1024 * 1024) return toast.error("Arquivo muito grande (Máx 10MB)");
    
    setIsUploading(msgId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${msgId}-${Math.random()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { data, error } = await supabase.storage
        .from('hfn-media')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('hfn-media')
        .getPublicUrl(filePath);

      const n = [...messages];
      n[idx].media_url = publicUrl;
      
      // Auto-detectar o tipo básico
      if (['mp3', 'wav', 'ogg'].includes(fileExt?.toLowerCase() || '')) {
         n[idx].message_type = 'audio';
      } else if (['jpg', 'jpeg', 'png', 'webp'].includes(fileExt?.toLowerCase() || '')) {
         n[idx].message_type = 'image';
      }

      setMessages(n);
      toast.success("Mídia enviada e vinculada!");
    } catch (err: any) {
      toast.error(`Falha no upload: ${err.message}`);
    } finally {
      setIsUploading(null);
    }
  };

  const handleToggleMute = async (leadId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('hfn_funnel_leads')
        .update({ is_muted: !currentStatus })
        .eq('id', leadId);
      
      if (error) throw error;
      
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, is_muted: !currentStatus } : l));
      if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, is_muted: !currentStatus });
      
      toast.success(!currentStatus ? "Automação pausada para este lead" : "Automação reativada");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSendManualMessage = async () => {
    if (!selectedLead || !replyMessage.trim()) return;
    
    setIsSendingReply(true);
    try {
      // 1. Pegar as configurações atuais (para o token e phone_id)
      const { data: settingsData } = await supabase.from('hfn_funnel_settings').select('*').limit(1).single();
      if (!settingsData) throw new Error("Configurações do WhatsApp não encontradas!");

      // 2. Inserir na fila de despacho
      const { error } = await supabase.from('hfn_pending_dispatches').insert({
        lead_id: selectedLead.id,
        whatsapp: selectedLead.whatsapp,
        content: replyMessage,
        phone_number_id: settingsData.phone_number_id,
        access_token: settingsData.access_token,
        message_type: 'text',
        next_step: selectedLead.current_step,
        name: selectedLead.name
      });

      if (error) throw error;

      // 3. Registrar no log local (otimismo)
      setChatLogs(prev => [...prev, {
        id: Math.random().toString(),
        lead_id: selectedLead.id,
        direction: 'outbound',
        message_type: 'manual_reply',
        content: replyMessage,
        created_at: new Date().toISOString()
      }]);

      setReplyMessage("");
      toast.success("Mensagem na fila de envio!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 bg-hfn-dna bg-no-repeat bg-cover">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-10 w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
             <div className="bg-red-600/20 p-4 rounded-full border border-red-600/30">
                <ShieldAlert className="w-8 h-8 text-red-500" />
             </div>
          </div>
          <h2 className="font-heading italic uppercase text-2xl font-black mb-2">Acesso Restrito</h2>
          <p className="text-[10px] uppercase text-zinc-500 mb-8 font-mono">HFN_SYSTEMS // SECURE_ACCESS</p>
          <form onSubmit={handleLogin} className="space-y-4">
             <Input 
                type="password" 
                placeholder="SENHA DE ACESSO" 
                value={accessPass}
                onChange={(e) => setAccessPass(e.target.value)}
                className="bg-zinc-800/50 border-none h-14 text-center text-xl tracking-[1em] focus:ring-1 focus:ring-primary"
             />
             <Button type="submit" className="w-full h-14 bg-primary uppercase font-heading italic font-black text-lg">ENTRAR</Button>
          </form>
        </motion.div>
      </div>
    );
  }

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
          <div className="p-4 bg-zinc-900/30 border border-white/5 flex flex-wrap items-center gap-6">
            <TabsList className="bg-zinc-900 border border-white/10 p-1">
              <TabsTrigger value="leads" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] px-6 py-2 transition-all">Leads</TabsTrigger>
              <TabsTrigger value="chat" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] px-6 py-2 transition-all">Monitor</TabsTrigger>
              <TabsTrigger value="sequence" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] px-6 py-2 transition-all">Sequência</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] px-6 py-2 transition-all">Config</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-4 border-l border-white/10 pl-6 h-8">
               <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1">
                  <span className="text-[8px] font-mono text-primary uppercase">Filtro_Tag:</span>
                  <input 
                    className="bg-transparent border-none text-[10px] text-zinc-300 focus:ring-0 w-24 outline-none uppercase"
                    placeholder="DIGITE UMA TAG..."
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value.toUpperCase())}
                  />
               </div>
               <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1">
                  <span className="text-[8px] font-mono text-primary uppercase">Score_Gt:</span>
                  <input 
                    type="number"
                    className="bg-transparent border-none text-[10px] text-zinc-300 focus:ring-0 w-12 outline-none"
                    value={filterScore}
                    onChange={(e) => setFilterScore(Number(e.target.value))}
                  />
               </div>
               <div className="flex items-center gap-4 text-zinc-500 text-[10px] font-mono uppercase ml-auto">
                  <span>Filtrados: <span className="text-white">{(leads.filter(l => (!filterTag || l.tags?.includes(filterTag)) && (l.score || 0) >= filterScore)).length}</span></span>
                  <span className="opacity-20">|</span>
                  <span>Total CRM: <span className="text-zinc-400">{leads.length}</span></span>
               </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <TabsContent value="leads" className="space-y-6">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
                 <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-[10px] uppercase">Lead</TableHead><TableHead className="text-[10px] uppercase text-center">Score</TableHead><TableHead className="text-[10px] uppercase text-center">Step</TableHead><TableHead className="text-[10px] uppercase px-6 text-right">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(leads.length === 0) ? <TableRow><TableCell colSpan={4} className="text-center py-20 text-xs uppercase opacity-40">Aguardando leads...</TableCell></TableRow> : leads
                        .filter(l => (!filterTag || l.tags?.includes(filterTag)) && (l.score || 0) >= filterScore)
                        .map(lead => (
                        <TableRow key={lead.id} className="border-white/5">
                          <TableCell className="py-4">
                             <div className="flex items-center gap-2 mb-1">
                                <div className="font-bold text-white uppercase text-xs">{lead.name || 'Anonymous'}</div>
                                {lead.utm_source && <Badge variant="outline" className="text-[8px] bg-white/5 border-none text-zinc-400">{lead.utm_source}</Badge>}
                             </div>
                             <div className="text-[10px] text-zinc-500 mb-2">{lead.whatsapp}</div>
                             <div className="flex flex-wrap gap-1">
                                {lead.tags?.map(tag => (
                                   <span key={tag} className="text-[8px] bg-primary/10 text-primary px-1 font-mono">{tag}</span>
                                ))}
                             </div>
                          </TableCell>
                          <TableCell className="text-center">
                             <div className="bg-zinc-900 w-10 h-10 flex items-center justify-center mx-auto rounded-full border border-white/5">
                                <span className={`text-xs font-bold ${Number(lead.score || 0) > 30 ? 'text-green-500' : 'text-white'}`}>{lead.score || 0}</span>
                             </div>
                          </TableCell>
                          <TableCell className="text-center font-heading font-black italic text-primary text-xl">{lead.current_step}</TableCell>
                          <TableCell className="text-right px-6">
                            <div className="flex flex-col items-end gap-1">
                               <Badge className="text-[9px] uppercase">{lead.status}</Badge>
                               {lead.is_muted && <span className="text-[8px] text-red-500 font-mono uppercase font-bold animate-pulse">MUDO</span>}
                            </div>
                          </TableCell>
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
                        <button key={lead.id} onClick={() => setSelectedLead(lead)} className={`w-full p-4 border-b border-white/5 text-left hover:bg-white/5 transition-all ${selectedLead?.id === lead.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}>
                           <div className="flex justify-between items-start mb-1">
                              <div className="text-xs font-bold uppercase truncate max-w-[120px]">{lead.name || lead.whatsapp}</div>
                              <div className="flex items-center gap-2">
                                 {lead.is_muted ? <Pause className="w-3 h-3 text-red-500" /> : <Zap className="w-3 h-3 text-primary" />}
                                 <div className="text-[10px] font-mono opacity-40">SCP: {lead.score || 0}</div>
                              </div>
                           </div>
                           <div className="flex flex-wrap gap-1">
                              {lead.tags?.slice(0, 2).map(tag => <span key={tag} className="text-[8px] opacity-40 uppercase font-mono">{tag}</span>)}
                           </div>
                        </button>
                      ))}
                  </div>
                  <div className="lg:col-span-2 glass-card p-6 flex flex-col bg-zinc-900/40 min-h-[500px]">
                     {selectedLead ? (
                        <div className="flex flex-col h-full gap-4">
                           <div className="flex items-center justify-between border-b border-white/5 pb-4">
                              <div className="flex flex-col">
                                 <h3 className="text-sm font-bold uppercase">{selectedLead.name || 'HFN Fan'}</h3>
                                 <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase mt-1">
                                    <span>Score: <span className="text-primary">{selectedLead.score || 0}</span></span>
                                    <span className="opacity-20">|</span>
                                    <span>Tags: <span className="text-white">{selectedLead.tags?.join(', ') || 'Sem tags'}</span></span>
                                 </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleToggleMute(selectedLead.id, selectedLead.is_muted || false)}
                                className={`h-8 px-4 text-[10px] font-black italic uppercase rounded-none transition-all ${selectedLead.is_muted ? 'bg-red-600/20 border-red-600/40 text-red-500 hover:bg-red-600/30' : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'}`}
                              >
                                 {selectedLead.is_muted ? <Play className="w-3 h-3 mr-2 text-white" /> : <Pause className="w-3 h-3 mr-2" />}
                                 {selectedLead.is_muted ? 'Ativar Automação' : 'Pausar Automação'}
                              </Button>
                           </div>

                           <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                              {chatLogs
                                .filter(log => log.lead_id === selectedLead.id)
                                .map(log => (
                                 <div key={log.id} className={`flex ${log.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`p-3 text-xs max-w-[80%] flex flex-col gap-2 ${log.direction === 'inbound' ? 'bg-zinc-800 border border-white/5' : 'bg-primary/20 border border-primary/20'}`}>
                                       <div className="flex items-center gap-2 mb-1">
                                          {log.message_type === 'link_click' ? <ExternalLink className="w-3 h-3 text-primary" /> :
                                           log.message_type === 'image' ? <Zap className="w-3 h-3 text-yellow-500 font-bold" /> :
                                           log.direction === 'inbound' ? <MessageSquare className="w-3 h-3 opacity-30" /> : 
                                           <Send className="w-3 h-3 text-primary opacity-50" />}
                                          <span className="text-[8px] font-mono opacity-40 uppercase tracking-widest">{log.message_type}</span>
                                       </div>
                                       <span className="leading-relaxed">{log.content}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>

                           <div className="pt-4 border-t border-white/5 flex gap-2">
                              <Textarea 
                                placeholder="DIGITE SUA RESPOSTA MANUAL..."
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                className="flex-1 min-h-[80px] bg-black/60 border-white/10 rounded-none text-xs focus:ring-1 focus:ring-primary outline-none"
                                onKeyDown={(e) => {
                                   if (e.key === 'Enter' && e.ctrlKey) handleSendManualMessage();
                                }}
                              />
                              <Button 
                                onClick={handleSendManualMessage} 
                                disabled={isSendingReply || !replyMessage.trim()}
                                className="h-auto px-6 bg-primary rounded-none font-heading italic font-black"
                              >
                                 {isSendingReply ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                              </Button>
                           </div>
                        </div>
                     ) : <div className="h-full flex items-center justify-center opacity-20 uppercase text-[10px]">Selecione um lead</div>}
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="sequence" className="space-y-6">
               {/* 🔗 Tracker Generator (ELITE Tool) */}
               <Card className="bg-primary/10 border-primary/30 rounded-none p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><MousePointer2 className="w-20 h-20 rotate-12" /></div>
                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                     <div className="flex-1">
                        <Label className="text-[10px] uppercase font-black italic text-primary flex items-center gap-2 mb-3">
                           <Zap className="w-3 h-3" /> Gerador de Link Rastreado (CTR + Score)
                        </Label>
                        <p className="text-[10px] text-zinc-400 mb-4 font-mono uppercase leading-relaxed">
                           USE EM SUAS MENSAGENS PARA TRACKEAR CLIQUES E MARCAR "LEADS QUENTES" AUTOMATICAMENTE.
                        </p>
                        <div className="flex flex-col md:flex-row gap-4">
                           <div className="flex-1">
                              <Input 
                                 placeholder="URL DE DESTINO (EX: HTTPS://SEUSITE.COM)"
                                 className="bg-black/60 border-white/5 h-12 text-[10px] font-mono rounded-none"
                                 id="destUrl"
                              />
                           </div>
                           <Button 
                              variant="outline" 
                              className="h-12 px-6 border-primary/40 text-primary text-[10px] font-bold rounded-none hover:bg-primary hover:text-white"
                              onClick={() => {
                                 const dest = (document.getElementById('destUrl') as HTMLInputElement).value;
                                 if (!dest) return toast.error("Insira a URL de destino!");
                                 const trackerUrl = `https://ugfeuslfymvjdplkzwpy.supabase.co/functions/v1/hfn-link-tracker?lead_id={{id}}&url=${dest}`;
                                 navigator.clipboard.writeText(trackerUrl);
                                 toast.success("Link com ID DINÂMICO copiado!");
                              }}
                           >
                              GERAR E COPIAR
                           </Button>
                        </div>
                     </div>
                  </div>
               </Card>

               {messages.map((msg, idx) => (
                  <Card key={msg.id} className="bg-zinc-900 border-white/5 rounded-none p-6">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="w-8 h-8 border border-primary flex items-center justify-center font-black italic text-primary">{msg.step_number}</div>
                        <Input className="h-8 w-20 text-[10px] bg-zinc-800 border-none" type="number" value={msg.delay_minutes} onChange={(e) => {
                           const n = [...messages]; n[idx].delay_minutes = parseInt(e.target.value); setMessages(n);
                        }} />
                        <span className="text-[10px] uppercase font-mono text-zinc-500">Minutos</span>
                        <Button onClick={() => handleUpdateMessage(msg)} size="sm" className="h-8 px-4 text-[10px] bg-primary rounded-none ml-auto hover:bg-white hover:text-black transition-colors">Salvar Passo</Button>
                     </div>
                     <div className="space-y-4">
                        <div className="space-y-2">
                           <Label className="text-[9px] uppercase text-zinc-500">Mensagem de Texto</Label>
                           <Textarea 
                              value={msg.content} 
                              onChange={(e) => {
                                 const n = [...messages]; n[idx].content = e.target.value; setMessages(n);
                              }} 
                              className="bg-black/40 border-white/5 text-xs h-32 rounded-none focus:ring-1 focus:ring-primary outline-none" 
                           />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[9px] uppercase text-zinc-500">Condição de Envio</Label>
                           <select 
                              value={msg.send_condition || 'always'} 
                              onChange={(e) => {
                                 const n = [...messages]; n[idx].send_condition = e.target.value; setMessages(n);
                              }}
                              className="w-full bg-black/40 border-white/5 p-3 text-[10px] focus:ring-1 focus:ring-primary outline-none text-white appearance-none cursor-pointer"
                           >
                              <option value="always">🚀 Sempre Enviar (Padrão)</option>
                              <option value="not_replied">⏳ Somente se NÃO respondeu (Remarketing)</option>
                              <option value="replied">✅ Somente se JÁ respondeu</option>
                              <option value="on_image">📷 Aguardar Print/Imagem para Enviar</option>
                           </select>
                        </div>
                        <div className="space-y-2">
                           <div className="flex items-center justify-between">
                              <Label className="text-[9px] uppercase text-zinc-500">Mídia (Áudio/Imagem)</Label>
                              <div className="relative">
                                 <input 
                                    type="file" 
                                    id={`file-${msg.id}`} 
                                    className="hidden" 
                                    accept="audio/*,image/*"
                                    onChange={(e) => handleUploadMedia(e, msg.id, idx)}
                                    disabled={isUploading === msg.id}
                                 />
                                 <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-6 px-3 text-[8px] border-primary/40 text-primary hover:bg-primary hover:text-white rounded-none flex items-center gap-2"
                                    onClick={() => document.getElementById(`file-${msg.id}`)?.click()}
                                    disabled={isUploading === msg.id}
                                 >
                                    {isUploading === msg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                    {isUploading === msg.id ? 'ENVIANDO...' : 'UPLOAD DIRETO'}
                                 </Button>
                              </div>
                           </div>
                           <Input 
                              value={msg.media_url || ''} 
                              onChange={(e) => {
                                 const n = [...messages]; n[idx].media_url = e.target.value; setMessages(n);
                              }} 
                              placeholder="URL da mídia ou use o Upload Direto..."
                              className="bg-black/40 border-white/5 text-[10px] h-10 rounded-none focus:ring-1 focus:ring-primary" 
                           />
                           <p className="text-[8px] text-zinc-600 italic">* Suba o MP3 ou Imagem para hospedar automático no seu Supabase.</p>
                        </div>
                     </div>
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
                        <Input value={settings.phone_number || ''} onChange={(e) => setSettings({...settings, phone_number: e.target.value.replace(/\D/g, '')})} placeholder="5521..." className="bg-zinc-800 border-none h-12 rounded-none" />
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
                     <div className="space-y-2">
                        <Label className="text-[10px] uppercase text-zinc-500">URL da Política de Privacidade (LGPD)</Label>
                        <Input value={settings.lgpd_policy_url || ''} onChange={(e) => setSettings({...settings, lgpd_policy_url: e.target.value})} placeholder="https://..." className="bg-zinc-800 border-none h-12 rounded-none" />
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

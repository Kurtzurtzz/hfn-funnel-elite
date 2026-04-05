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
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<FunnelSettings>({
    phone_number_id: '1104616442727797',
    business_account_id: '1954735401806674',
    access_token: 'EAAW61SoPEb4BRFShT1WodZAAcTS9vrdmvqPKTscV42z0TNdROZB7RstMnorAE5Uq4kQ6Y2yKJZBMsSc4h7BQibjZAgmOdfeRW4dqrHZAKitKGSu6ZBQVGvqpjTZCDZBy1pT2XmF32vDoitUdwqLomfhBFETc2n19bkx5PuULEPVu3sdlZBOOylaH9CpazBCGlasvVswZDZD',
    is_active: true
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
        // Leads
        const { data: leadsData } = await supabase
          .from('hfn_funnel_leads')
          .select('*')
          .order('created_at', { ascending: false });
        if (leadsData) setLeads(leadsData);

        // Messages
        const { data: msgsData } = await supabase
          .from('hfn_funnel_messages')
          .select('*')
          .order('step_number', { ascending: true });
        if (msgsData) setMessages(msgsData);

        // Settings
        const { data: settingsData } = await supabase
          .from('hfn_funnel_settings')
          .select('*')
          .single();
        if (settingsData) setSettings(settingsData);
      } catch (error) {
        console.error("Error fetching HFN data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Listen for realtime updates
    const leadsChannel = supabase.channel('hfn-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hfn_funnel_leads' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as Lead, ...prev]);
          toast.success("Novo lead capturado no funil!");
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hfn_funnel_chat_logs' }, (payload: any) => {
        const newLog = payload.new as ChatLog;
        setChatLogs(prev => [...prev, newLog]);
        if (newLog.direction === 'inbound') {
           toast.info(`Nova mensagem de ${newLog.content.substring(0, 20)}...`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
    };
  }, []);

  // 🤖 MOTOR DE DRIP (Automação de Delays)
  useEffect(() => {
    let interval: any;
    if (settings.is_active) {
      console.log("HFN_MOTOR // Iniciando motor de automação...");
      interval = setInterval(() => {
        processDrip();
      }, 30000); // Verifica a cada 30 segundos
    }
    return () => clearInterval(interval);
  }, [settings.is_active]);

  const processDrip = async () => {
    if (isProcessing) return;
    
    try {
      // Busca leads que já passaram do tempo de receber (next_send_at <= agora)
      const { data: pendingLeads, error } = await supabase
        .from('hfn_funnel_leads')
        .select('id, whatsapp')
        .eq('status', 'active')
        .lte('next_send_at', new Date().toISOString());

      if (error) throw error;
      if (!pendingLeads || pendingLeads.length === 0) return;

      setIsProcessing(true);
      console.log(`HFN_MOTOR // Processando ${pendingLeads.length} mensagens pendentes...`);

      for (const lead of pendingLeads) {
        // Chama a função SQL potente
        const { error: rpcError } = await supabase.rpc('hfn_send_via_sql', { lead_id: lead.id });
        if (rpcError) console.error(`HFN_MOTOR // Erro ao enviar para ${lead.whatsapp}:`, rpcError);
        else console.log(`HFN_MOTOR // Mensagem enviada para: ${lead.whatsapp}`);
      }
    } catch (err) {
      console.error("HFN_MOTOR // Erro crítico no motor:", err);
    } finally {
      setIsProcessing(false);
      // Atualiza a lista de leads após processar
      const { data: leadsData } = await supabase
        .from('hfn_funnel_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (leadsData) setLeads(leadsData);
    }
  };

  useEffect(() => {
    if (selectedLead) {
      const fetchLogs = async () => {
        const { data } = await supabase
          .from('hfn_funnel_chat_logs')
          .select('*')
          .eq('lead_id', selectedLead.id)
          .order('created_at', { ascending: true });
        if (data) setChatLogs(data);
      };
      fetchLogs();
    }
  }, [selectedLead]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('hfn_funnel_settings')
        .upsert({ 
          ...settings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      toast.success("Configurações da Meta API salvas!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMessage = async (msg: Message) => {
    try {
      const { error } = await supabase
        .from('hfn_funnel_messages')
        .update({ 
          content: msg.content, 
          delay_minutes: msg.delay_minutes,
          message_type: msg.message_type,
          media_url: msg.media_url
        })
        .eq('id', msg.id);
      
      if (error) throw error;
      toast.success(`Step ${msg.step_number} atualizado!`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleManualSend = async () => {
    setIsSaving(true);
    toast.info("Processando fila de disparos agora...");
    try {
      await processDrip();
      toast.success("Processamento manual concluído!");
    } catch (err: any) {
      toast.error("Erro no motor: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white mobile-safe-padding py-6 md:py-12 font-body">
      {/* Header HFN */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 bg-primary flex items-center justify-center font-black italic text-xl skew-x-[-12deg] shadow-[0_0_20px_rgba(217,26,26,0.3)]">HFN</div>
             <h1 className="text-3xl md:text-5xl font-heading font-black italic uppercase tracking-tighter">Funnel Hub</h1>
          </div>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-primary animate-pulse" /> Official HFN Automation // Independent Environment
          </p>
        </div>
        <div className="flex gap-4">
           <div className="px-4 py-2 bg-zinc-900 border border-white/10 flex items-center gap-2 rounded-sm">
              <div className={`w-2 h-2 rounded-full ${settings.is_active ? 'bg-success animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Meta_Status: <span className={settings.is_active ? 'text-white' : 'text-zinc-600'}>{settings.is_active ? 'Active' : 'Disconnected'}</span></span>
           </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto">
        <Tabs defaultValue="leads" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-auto flex-wrap justify-center md:justify-start">
              <TabsTrigger value="leads" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all">Leads</TabsTrigger>
              <TabsTrigger value="chat" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all">Monitor</TabsTrigger>
              <TabsTrigger value="sequence" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all">Sequência</TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary uppercase font-heading italic text-[10px] md:text-xs px-4 md:px-6 py-2 transition-all">Config</TabsTrigger>
            </TabsList>
            
            <div className="hidden md:flex items-center gap-4 text-zinc-500 text-[10px] font-mono uppercase">
               <span>Total Leads: <span className="text-white">{leads.length}</span></span>
               <div className="w-[1px] h-3 bg-white/10" />
               <span className="flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Auto_Sync</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Tab: Chat Monitor */}
            <TabsContent value="chat" className="focus-visible:outline-none outline-none">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[500px] lg:min-h-[600px]">
                  {/* Lead List */}
                  <div className="lg:col-span-1 glass-card overflow-hidden flex flex-col">
                     <div className="p-4 bg-zinc-900/80 border-b border-white/10 font-heading italic uppercase text-[10px] font-bold text-zinc-400">Atividade Recente</div>
                     <div className="flex-1 overflow-y-auto">
                        {leads.map(lead => (
                           <button 
                              key={lead.id}
                              onClick={() => setSelectedLead(lead)}
                              className={`w-full p-4 flex items-center gap-3 border-b border-white/5 hover:bg-white/5 transition-all text-left ${selectedLead?.id === lead.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                           >
                              <div className="w-8 h-8 bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-400 italic">HFN</div>
                              <div className="flex-1 truncate">
                                 <div className="text-xs font-bold text-white uppercase">{lead.name || lead.whatsapp}</div>
                                 <div className="text-[9px] text-zinc-500 font-mono italic">Step {lead.current_step} // {lead.status}</div>
                              </div>
                           </button>
                        ))}
                     </div>
                  </div>

                  {/* Chat Window */}
                  <div className="lg:col-span-2 glass-card overflow-hidden flex flex-col bg-zinc-900/40">
                     {selectedLead ? (
                        <>
                           <div className="p-4 bg-zinc-900/80 border-b border-white/10 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                 <h3 className="font-heading italic uppercase text-sm font-bold text-white tracking-widest">{selectedLead.name || selectedLead.whatsapp}</h3>
                              </div>
                              <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-black/40">{selectedLead.whatsapp}</Badge>
                           </div>
                           <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-black/20">
                              {chatLogs.length === 0 ? (
                                 <div className="h-full flex items-center justify-center text-zinc-700 font-mono text-[10px] uppercase">Aguardando interações...</div>
                              ) : chatLogs.map(log => (
                                 <div key={log.id} className={`flex ${log.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[80%] p-3 rounded-none border ${log.direction === 'inbound' ? 'bg-zinc-900 border-white/10' : 'bg-primary/10 border-primary/20'}`}>
                                       <div className="text-[10px] leading-relaxed text-zinc-300 font-body">{log.content}</div>
                                       {log.media_url && (
                                          <div className="mt-2 pt-2 border-t border-white/5">
                                             <a href={log.media_url} target="_blank" className="text-[8px] uppercase font-mono text-primary flex items-center gap-1 hover:underline">
                                                <ExternalLink className="w-2 h-2" /> Ver Anexo [{log.message_type}]
                                             </a>
                                          </div>
                                       )}
                                       <div className="text-[7px] font-mono text-zinc-600 mt-2 uppercase tracking-tighter">{new Date(log.created_at).toLocaleTimeString()}</div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                           <div className="p-4 bg-zinc-900/60 border-t border-white/10">
                              <div className="flex items-center gap-3 px-4 py-2 border border-white/5 bg-black/40 italic text-[10px] text-zinc-500 font-mono">
                                 <AlertCircle className="w-3 h-3 text-primary" /> O bot está controlando esta conversa.
                              </div>
                           </div>
                        </>
                     ) : (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                           <MessageSquare className="w-12 h-12 text-zinc-800" />
                           <p className="text-zinc-600 font-mono text-xs uppercase tracking-[0.2em]">Selecione um lead para monitorar</p>
                        </div>
                     )}
                  </div>
               </div>
            </TabsContent>

            {/* Tab: Leads */}
            <TabsContent value="leads" className="space-y-6 focus-visible:outline-none outline-none">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card overflow-hidden"
              >
                 <div className="bg-zinc-900/80 p-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-heading italic uppercase text-sm font-bold flex items-center gap-2 text-primary">
                       <Users className="w-4 h-4" /> Monitoramento de Fluxo HFN
                    </h3>
                    <Button variant="ghost" size="sm" className="text-[10px] uppercase font-mono text-zinc-500 hover:text-white flex items-center gap-2">
                       Exportar CSV <ChevronRight className="w-3 h-3" />
                    </Button>
                 </div>
                 <div className="overflow-x-auto min-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Lead Info</TableHead>
                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">WhatsApp</TableHead>
                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase text-center">Step</TableHead>
                        <TableHead className="text-zinc-500 font-mono text-[10px] uppercase">Status</TableHead>
                        <TableHead className="text-zinc-400 font-mono text-[10px] uppercase text-right px-6">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                         <TableRow><TableCell colSpan={5} className="text-center py-20 text-zinc-600 font-mono uppercase text-xs animate-pulse">Consultando Banco de Dados [HFN_SYSTEMS]...</TableCell></TableRow>
                      ) : leads.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-20 text-zinc-600 font-mono uppercase text-xs">Nenhum lead capturado ainda. O funil está aguardando tráfego.</TableCell></TableRow>
                      ) : leads.map(lead => (
                        <TableRow key={lead.id} className="border-white/5 hover:bg-white/5 transition-colors">
                          <TableCell className="py-4">
                             <div className="font-bold text-white uppercase text-xs">{lead.name || 'Anonymous'}</div>
                             <div className="text-[10px] text-zinc-500 italic truncate max-w-[200px]">
                               {lead.metadata?.prize ? `Prêmio: ${lead.metadata.prize}` : lead.metadata?.source || 'Orgânico'}
                             </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-zinc-300">
                             <a href={`https://wa.me/${lead.whatsapp}`} target="_blank" className="hover:text-primary transition-colors flex items-center gap-2">
                               {lead.whatsapp} <ExternalLink className="w-3 h-3 opacity-30" />
                             </a>
                          </TableCell>
                          <TableCell className="text-center">
                             <div className="inline-flex items-center justify-center w-8 h-8 rounded-none border border-primary/20 font-heading font-black italic text-lg text-primary bg-primary/5">
                               {lead.current_step}
                             </div>
                          </TableCell>
                          <TableCell>
                             <Badge variant="outline" className={`text-[9px] uppercase tracking-widest px-2 py-0 h-5 border-white/10 rounded-none ${
                               lead.status === 'completed' ? 'bg-success/10 text-success border-success/30' : 
                               lead.status === 'active' ? 'bg-primary/10 text-primary border-primary/30' : 'text-zinc-500'
                             }`}>
                               {lead.status}
                             </Badge>
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setSelectedLead(lead);
                                setActiveTab('chat');
                              }}
                              className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary group"
                            >
                              <MessageSquare className="w-4 h-4 transition-transform group-active:scale-90" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                 </div>
              </motion.div>
            </TabsContent>

            {/* Tab: Sequence */}
            <TabsContent value="sequence" className="grid lg:grid-cols-2 gap-8 focus-visible:outline-none outline-none">
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                 {messages.map((msg, idx) => (
                    <Card key={msg.id} className="bg-zinc-900/60 border-white/5 rounded-none overflow-hidden group shadow-xl">
                       <div className="p-6 relative">
                          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity italic font-mono text-[10px] text-primary">STEP_0{msg.step_number}</div>
                          <div className="flex items-center gap-3 mb-6">
                             <div className="w-10 h-10 border-2 border-primary flex items-center justify-center font-heading font-black italic text-primary bg-primary/5 skew-x-[-12deg]">
                               {msg.step_number}
                             </div>
                             <div>
                                <h4 className="text-sm font-heading italic uppercase font-bold text-white tracking-tight">Ponto de Contato Automatizado</h4>
                                <div className="flex items-center gap-3 mt-1">
                                   <p className="text-[9px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> Delay: {msg.delay_minutes} min
                                   </p>
                                   <div className="w-1 h-1 rounded-full bg-zinc-800" />
                                   <p className="text-[9px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                                      <Play className="w-2 h-2 text-success" /> Ativo
                                   </p>
                                </div>
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                             <div className="relative">
                                 <select 
                                    value={msg.message_type} 
                                    onChange={(e) => {
                                      const newMsgs = [...messages];
                                      newMsgs[idx].message_type = e.target.value as any;
                                      setMessages(newMsgs);
                                    }}
                                    className="bg-zinc-900 border-white/5 text-[10px] font-mono text-zinc-400 px-2 py-1 outline-none mb-2"
                                 >
                                    <option value="text">TEXTO</option>
                                    <option value="image">IMAGEM + TEXTO</option>
                                    <option value="audio">ÁUDIO (VOICE)</option>
                                    <option value="video">VÍDEO + TEXTO</option>
                                 </select>
                                 <Textarea 
                                   value={msg.content} 
                                   onChange={(e) => {
                                     const newMsgs = [...messages];
                                     newMsgs[idx].content = e.target.value;
                                     setMessages(newMsgs);
                                   }}
                                   placeholder="Conteúdo da mensagem..."
                                   className="bg-black/60 border-white/5 text-xs font-mono text-zinc-300 min-h-[140px] rounded-none focus-visible:ring-primary/40 focus-visible:border-primary/40 leading-relaxed" 
                                 />
                                 {msg.message_type !== 'text' && (
                                    <Input 
                                       value={msg.media_url || ''}
                                       onChange={(e) => {
                                          const newMsgs = [...messages];
                                          newMsgs[idx].media_url = e.target.value;
                                          setMessages(newMsgs);
                                       }}
                                       placeholder="URL da Mídia (Supabase Storage / Public Link)"
                                       className="mt-2 bg-black/40 border-white/5 text-[10px] font-mono h-8 rounded-none"
                                    />
                                 )}
                               <div className="absolute bottom-2 right-2 text-[8px] font-mono text-zinc-700 uppercase tracking-widest">Marked_Down_Enabled</div>
                             </div>
                             
                             <div className="flex items-center gap-4">
                                <div className="flex-1 flex items-center gap-2 bg-black/40 px-3 py-2 border border-white/5">
                                   <Label className="text-[8px] uppercase font-mono text-zinc-600 mt-1">Delay (Min)</Label>
                                   <Input 
                                      type="number" 
                                      value={msg.delay_minutes} 
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        const newMsgs = [...messages];
                                        newMsgs[idx].delay_minutes = parseInt(e.target.value);
                                        setMessages(newMsgs);
                                      }}
                                      className="h-6 w-16 bg-transparent border-none text-[10px] font-mono text-white focus-visible:ring-0" 
                                   />
                                </div>
                                <Button 
                                  onClick={() => handleUpdateMessage(msg)}
                                  size="sm" 
                                  className="h-8 px-6 text-[10px] uppercase font-bold bg-primary hover:bg-primary/80 rounded-none shadow-[0_4px_12px_rgba(217,26,26,0.2)]"
                                >
                                   Salvar Alterações
                                </Button>
                             </div>
                          </div>
                       </div>
                    </Card>
                 ))}
                 
                 <Button variant="outline" className="w-full border-dashed border-white/10 bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 hover:border-white/20 h-24 uppercase font-heading italic text-xs transition-all rounded-none">
                    + Adicionar Novo Ponto no Funil
                 </Button>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                 <div className="glass-card p-8 h-fit lg:sticky lg:top-8 bg-zinc-900/60 shadow-2xl">
                    <div className="flex items-center gap-3 mb-8">
                       <Zap className="w-6 h-6 text-primary fill-primary/20" />
                       <h3 className="font-heading italic uppercase font-black text-2xl tracking-tighter">Motor de Automação</h3>
                    </div>
                    
                    <div className="space-y-8 text-zinc-400 text-sm">
                       <div className="relative pl-6 py-2">
                          <div className="absolute left-0 top-0 w-1 h-full bg-primary" />
                          <p className="leading-relaxed font-medium">Os leads da <span className="text-white italic">Roleta HFN</span> são injetados aqui via Supabase Realtime.</p>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 bg-black/50 border border-white/5 space-y-2 group hover:border-primary/30 transition-colors">
                             <span className="text-[9px] uppercase font-mono tracking-[0.2em] text-zinc-500 block">Leads_Total</span>
                             <span className="text-3xl font-heading font-black italic text-white group-hover:text-primary transition-colors">{leads.length}</span>
                          </div>
                          <div className="p-6 bg-black/50 border border-white/5 space-y-2 group hover:border-success/30 transition-colors">
                             <span className="text-[9px] uppercase font-mono tracking-[0.2em] text-zinc-500 block">Conv_Rate</span>
                             <span className="text-3xl font-heading font-black italic text-success">14.2%</span>
                          </div>
                       </div>

                       <div className="space-y-3 pt-4">
                          <Button 
                             onClick={handleManualSend}
                             disabled={isSaving}
                             className="w-full h-14 bg-zinc-800 border border-white/10 hover:bg-zinc-700 text-xs font-heading italic uppercase font-bold tracking-widest flex items-center justify-center gap-2 transition-all rounded-none"
                          >
                             {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-primary" />}
                             Simular Envio [WPP_TEST_LAB]
                          </Button>
                          <p className="text-[9px] font-mono text-zinc-600 text-center uppercase tracking-widest">O teste usa as credenciais salvas em 'Configuração'</p>
                       </div>
                    </div>
                 </div>
              </motion.div>
            </TabsContent>

            {/* Tab: Settings */}
            <TabsContent value="settings" className="max-w-2xl mx-auto focus-visible:outline-none outline-none">
              <motion.div 
                 initial={{ opacity: 0, scale: 0.98 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="glass-card p-10 space-y-10 bg-zinc-900/60 shadow-2xl relative overflow-hidden"
              >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[80px] -mr-16 -mt-16" />
                 
                 <div className="text-center relative z-10">
                    <div className="w-16 h-16 bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-6 skew-x-[-6deg]">
                       <Settings className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="font-heading italic uppercase text-3xl font-black tracking-tighter">Meta API Gateway</h3>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.4em] mt-3">Infraestrutura Oficial HFN // WhatsApp Cloud API</p>
                 </div>
                 
                 <div className="space-y-8 relative z-10">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                         <Label className="text-[9px] uppercase font-mono tracking-widest text-zinc-500 flex items-center gap-2">
                           Phone Number ID <ShieldCheck className="w-3 h-3 text-success" />
                         </Label>
                         <Input 
                            value={settings.phone_number_id}
                            onChange={(e) => setSettings({...settings, phone_number_id: e.target.value})}
                            placeholder="Ex: 5029384756..." 
                            className="bg-black/60 border-white/5 font-mono text-xs h-12 rounded-none focus-visible:ring-primary/40" 
                         />
                      </div>
                      <div className="space-y-2">
                         <Label className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">Business Account ID</Label>
                         <Input 
                            value={settings.business_account_id}
                            onChange={(e) => setSettings({...settings, business_account_id: e.target.value})}
                            placeholder="Ex: 19547354..." 
                            className="bg-black/60 border-white/5 font-mono text-xs h-12 rounded-none focus-visible:ring-primary/40" 
                         />
                      </div>
                    </div>

                    <div className="space-y-2">
                       <Label className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">Access Token (Permanente Recomendado)</Label>
                       <div className="relative">
                          <Input 
                             type="password" 
                             value={settings.access_token}
                             onChange={(e) => setSettings({...settings, access_token: e.target.value})}
                             placeholder="EAAB..." 
                             className="bg-black/60 border-white/5 font-mono text-xs h-12 rounded-none focus-visible:ring-primary/40 pr-10" 
                          />
                          <Badge variant="outline" className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] bg-primary/20 border-primary/40 text-primary">V22.0</Badge>
                       </div>
                    </div>

                    <div className="pt-6 flex flex-col gap-4">
                       <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20">
                          <div className={`w-3 h-3 rounded-full ${settings.is_active ? 'bg-success' : 'bg-primary'} ${isProcessing ? 'animate-bounce' : 'animate-pulse'}`} />
                          <div className="flex-1">
                             <p className="text-[10px] font-bold uppercase italic text-white">Status do Motor: {settings.is_active ? (isProcessing ? 'Processando Fila...' : 'Ativo e Monitorando') : 'Pausado'}</p>
                             <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">{isProcessing ? 'Enviando mensagens pendentes via SQL RPC' : 'Aguardando horários de agendamento...'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                             <Label className="text-[8px] font-mono text-zinc-500 uppercase">OFF</Label>
                             <div 
                                onClick={() => setSettings({...settings, is_active: !settings.is_active})}
                                className={`w-10 h-5 border border-white/10 cursor-pointer p-1 transition-all ${settings.is_active ? 'bg-success/20 border-success/40' : 'bg-zinc-900'}`}
                             >
                                <div className={`w-3 h-3 transition-all ${settings.is_active ? 'bg-success translate-x-5' : 'bg-zinc-600 translate-x-0'}`} />
                             </div>
                             <Label className="text-[8px] font-mono text-zinc-500 uppercase">ON</Label>
                          </div>
                       </div>
                       
                       <Button 
                         onClick={handleSaveSettings}
                         disabled={isSaving}
                         className="w-full bg-primary hover:bg-primary/80 text-white uppercase font-heading italic font-black text-sm h-14 rounded-none shadow-[0_10px_30px_rgba(217,26,26,0.3)] transition-all flex items-center justify-center gap-3"
                       >
                          {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          Salvar e Validar Infraestrutura
                       </Button>
                    </div>
                 </div>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>
    </div>
  );
}

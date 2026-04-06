import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  ChevronRight, 
  Zap, 
  MessageCircle, 
  Award, 
  Target,
  Users,
  Trophy,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export default function PublicFunnel() {
  const [utmParams, setUtmParams] = useState({ s: '', m: '', c: '', co: '' });
  const [acceptedLgpd, setAcceptedLgpd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prize, setPrize] = useState('Bônus de 100% + Tips VIP');
  const [botPhone, setBotPhone] = useState('5521986747506'); // Default fallback

  // Simulated live winners for urgency
  const [lastWinner, setLastWinner] = useState({ name: 'Marcos R.', prize: 'R$ 50 via PIX' });
  
  useEffect(() => {
    const winners = [
      { name: 'Ricardo S.', prize: 'Aposta Grátis UFC' },
      { name: 'Ana P.', prize: 'Bônus Dobrado' },
      { name: 'Lucas M.', prize: 'Acesso VIP' },
      { name: 'Julia B.', prize: 'Cashback 20%' }
    ];
    
    const interval = setInterval(() => {
      const random = winners[Math.floor(Math.random() * winners.length)];
      setLastWinner(random);
    }, 5000);
    
    const fetchSettings = async () => {
      const { data } = await supabase.from('hfn_funnel_settings').select('phone_number').limit(1).single();
      if (data?.phone_number) setBotPhone(data.phone_number.replace(/\D/g, ''));
    };

    const captureUtms = () => {
      const params = new URLSearchParams(window.location.search);
      setUtmParams({
        s: params.get('utm_source') || 'direto',
        m: params.get('utm_medium') || 'nenhum',
        c: params.get('utm_campaign') || 'organico',
        co: params.get('utm_content') || 'v3'
      });
    };
    
    fetchSettings();
    captureUtms();
    return () => clearInterval(interval);
  }, []);

  const handleClaim = async () => {
    if (!acceptedLgpd) {
      toast.error("Por favor, aceite os termos de uso (LGPD).");
      return;
    }

    setIsSubmitting(true);
    try {
      toast.success("Acesso liberado! Abrindo seu WhatsApp...");

      const ref = `[REF:${utmParams.s}|${utmParams.m}|${utmParams.c}|${utmParams.co}]`;
      const message = encodeURIComponent(`Oi Helen! Acabei de garantir meu acesso no site e quero meu ${prize}! ${ref}`);
      const waLink = `https://wa.me/${botPhone}?text=${message}`;
      
      setTimeout(() => {
        window.location.href = waLink;
      }, 1200);

    } catch (err: any) {
      console.error(err);
      toast.error(`Erro: ${err.message || 'Erro ao processar. Tente novamente.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-body selection:bg-primary overflow-x-hidden">
      {/* Background HQ Image Overlay */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-40 md:opacity-60">
         <img 
            src="/helen_hq.png" 
            alt="Helen Maciel" 
            className="w-full h-full object-cover scale-110 md:scale-100 object-top md:object-center"
         />
         <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-transparent to-[#0A0A0A]" />
         <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-transparent to-[#0A0A0A]" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center mobile-safe-padding py-12 md:py-20">
        
        {/* Header Label */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col items-center w-full max-w-3xl"
        >
           <div className="flex items-center gap-2 px-3 py-1 bg-primary/20 border border-primary/40 text-primary text-[10px] font-black italic uppercase tracking-[0.3em] mb-4 skew-x-[-12deg]">
              <ShieldCheck className="w-3 h-3" /> Verificado por HFN_SYSTEMS
           </div>
           <h1 className="font-heading font-black italic uppercase tracking-tighter text-center leading-[0.9] md:leading-tight">
              Bem-vindo à <span className="text-primary drop-shadow-[0_0_15px_rgba(217,26,26,0.5)]">HFN</span> Elite
           </h1>
           <p className="text-zinc-500 font-mono text-[10px] md:text-xs uppercase tracking-[0.2em] mt-6 text-center max-w-[280px] md:max-w-none">
              Acesso exclusivo via <span className="text-white">Instagram</span> // Estratégias UFC 2026
           </p>
        </motion.div>

        {/* Capture Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-md glass-card p-8 md:p-10 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
           {/* Decorative Border */}
           <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary/40 -translate-x-2 -translate-y-2" />
           <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary/40 translate-x-2 translate-y-2" />
           
           <div className="mb-8 text-center">
              <h2 className="text-xl font-heading font-bold italic uppercase mb-2">Liberação Imediata</h2>
           </div>

           <div className="space-y-8">
              <div className="bg-primary/5 border border-primary/10 p-6 text-center space-y-4">
                 <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                        <Zap className="w-8 h-8 text-primary" />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] uppercase font-mono tracking-widest text-primary font-bold">Protocolo de Elite HFN</p>
                    <h3 className="text-sm font-bold text-white uppercase italic">Sua vaga está pré-aprovada!</h3>
                 </div>
              </div>

              <div className="flex items-start gap-4 p-4 border border-white/5 bg-black/20 hover:bg-black/40 transition-all cursor-pointer group" onClick={() => setAcceptedLgpd(!acceptedLgpd)}>
                 <div className={`mt-1 w-5 h-5 border flex items-center justify-center transition-all ${acceptedLgpd ? 'bg-primary border-primary' : 'border-white/20'}`}>
                    {acceptedLgpd && <ShieldCheck className="w-3 h-3 text-white" />}
                 </div>
                 <div className="flex-1 space-y-1">
                    <p className="text-[10px] uppercase font-bold text-white leading-tight">Concordo com os termos e política de privacidade (LGPD)</p>
                    <p className="text-[8px] text-zinc-500 uppercase font-mono">HFN_SYSTEMS // SECURE_PROTOCOL_PROTECTED</p>
                 </div>
              </div>

              <Button 
                onClick={handleClaim}
                disabled={isSubmitting}
                className={`w-full h-20 font-heading font-black italic uppercase text-lg rounded-none shadow-[0_15px_40px_rgba(217,26,26,0.5)] transition-all group overflow-hidden relative ${!acceptedLgpd && 'opacity-50 grayscale'}`}
                style={{ backgroundColor: '#D91A1A' }}
              >
                 <AnimatePresence mode="wait">
                   {isSubmitting ? (
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2"
                     >
                        <Zap className="w-5 h-5 animate-spin" /> Processando...
                     </motion.div>
                   ) : (
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2 group-hover:scale-105 transition-transform"
                     >
                        Resgatar Meu Acesso <ArrowRight className="w-5 h-5" />
                     </motion.div>
                   )}
                 </AnimatePresence>
              </Button>
           </div>

           {/* Security Stamp */}
           <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-6 opacity-40 grayscale">
              <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest">
                 <ShieldCheck className="w-3 h-3" /> SSL_SECURE
              </div>
              <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest">
                 <Users className="w-3 h-3" /> +1.2k Ativos
              </div>
              <div className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest">
                 <Target className="w-3 h-3" /> 100% Oficial
              </div>
           </div>
        </motion.div>

        {/* Live Winners Ticker */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 w-full max-w-md"
        >
           <div className="bg-zinc-900/40 backdrop-blur-sm border border-white/5 p-4 flex items-center gap-4 group">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                 <Trophy className="w-4 h-4 text-success animate-bounce" />
              </div>
              <div className="flex-1 overflow-hidden">
                 <AnimatePresence mode="wait">
                    <motion.div 
                       key={lastWinner.name}
                       initial={{ y: 20, opacity: 0 }}
                       animate={{ y: 0, opacity: 1 }}
                       exit={{ y: -20, opacity: 0 }}
                       className="text-[10px] font-mono uppercase tracking-widest"
                    >
                       <span className="text-white font-bold">{lastWinner.name}</span> acabou de ganhar: <span className="text-success">{lastWinner.prize}</span>
                    </motion.div>
                 </AnimatePresence>
                 <div className="text-[8px] text-zinc-600 uppercase mt-1">Live_Stats // Just Now</div>
              </div>
              <Badge variant="outline" className="text-[8px] text-success border-success/30 px-2 rounded-none animate-pulse">LIVE</Badge>
           </div>
        </motion.div>

        {/* Footer */}
        <footer className="mt-auto py-8 text-center opacity-20">
           <p className="text-[8px] font-mono uppercase tracking-[0.5em]">HFN_SYSTEMS // PROTOCOL_V2 // 2026</p>
        </footer>
      </main>
    </div>
  );
}

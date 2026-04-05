import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("HFN_SYSTEMS // ALERTA: Credenciais do Supabase não encontradas no .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// assets/js/supabase-client.js
const SUPABASE_URL = 'https://tvgeycizgzdmaxgzlcpb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rUH2xv7iyYnT4Ola3CwqtA_jdgbtJYR';

if (typeof supabase === 'undefined') {
  console.error('[supabase-client.js] CDN Supabase non chargé');
  throw new Error('Supabase CDN indisponible');
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
console.log('[supabase-client.js] Client initialisé');

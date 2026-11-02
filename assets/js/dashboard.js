// frontend/assets/js/dashboard.js
// Version qui affiche immédiatement puis charge les données.

// ============================================================
// AFFICHAGE IMMÉDIAT (avant tout chargement)
// ============================================================
(function afficherImmediatement() {
  const loading = document.getElementById('dashboard-loading');
  const content = document.getElementById('dashboard-content');
  const errorEl = document.getElementById('dashboard-error');
  
  if (loading) loading.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  if (content) content.style.display = 'block';
  
  console.log('[DASH] Affichage immédiat OK');
  
  const diagEl = document.getElementById('diag');
  if (diagEl) {
    diagEl.innerHTML = '<div style="color:#0f0">✅ Affichage immédiat</div>';
  }
})();

// ============================================================
// CHARGEMENT DES DONNÉES (progressive)
// ============================================================
(async function chargerDonnees() {
  function diag(msg, ok) {
    const d = document.getElementById('diag');
    if (d) {
      const line = document.createElement('div');
      line.textContent = (ok === true ? '✅ ' : ok === false ? '❌ ' : '→ ') + msg;
      line.style.color = ok === false ? '#f88' : ok === true ? '#0f0' : '#fff';
      d.appendChild(line);
    }
    console.log('[DASH]', msg);
  }
  
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  
  function getInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  
  function formatFCFA(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' F';
  }
  
  // ============================================================
  // CHARGEMENT
  // ============================================================
  try {
    if (typeof supabaseClient === 'undefined') {
      diag('supabaseClient non chargé', false);
      return;
    }
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      window.location.replace('/connexion.html');
      return;
    }
    
    const user = session.user;
    diag('Session : ' + user.email, true);
    
    // Charger profil
    let profile = null;
    try {
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, full_name, phone, role, referral_code')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
      diag('Profil : ' + (profile?.full_name || 'sans nom'), true);
    } catch (e) {
      diag('Profil erreur : ' + e.message, false);
    }
    
    // Afficher profil
    const fullName = (profile && profile.full_name) || 'Utilisateur';
    setText('user-fullname', fullName);
    setText('user-email', user.email || '—');
    setText('user-initials', getInitials(fullName));
    
    if (profile && profile.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'flex';
    }
    
    // Abonnement
    let subStatus = 'Aucun abonnement';
    let subDetails = 'Souscris pour accéder aux coupons premium';
    let subClass = '';
    try {
      const { data: subs } = await supabaseClient
        .from('subscriptions')
        .select('expires_at, plan_code, status')
        .eq('user_id', user.id)
        .order('expires_at', { ascending: false })
        .limit(1);
      
      if (subs && subs.length > 0) {
        const sub = subs[0];
        const exp = new Date(sub.expires_at);
        const now = new Date();
        if (sub.status === 'active' && exp > now) {
          const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
          subStatus = '✅ Abonnement actif';
          subDetails = `Expire le ${exp.toLocaleDateString('fr-FR')} · ${daysLeft}j restant${daysLeft > 1 ? 's' : ''}`;
          subClass = 'active';
        } else {
          subStatus = '⏱️ Abonnement expiré';
          subDetails = `Expiré le ${exp.toLocaleDateString('fr-FR')}`;
          subClass = 'expired';
        }
      }
      diag('Abonnement chargé', true);
    } catch (e) {
      diag('Abonnement erreur : ' + e.message, false);
    }
    
    const subEl = document.getElementById('subscription-status');
    if (subEl) {
      subEl.textContent = subStatus;
      subEl.className = 'sub-status ' + subClass;
    }
    setText('subscription-details', subDetails);
    
    // Code parrainage
    const code = (profile && profile.referral_code) || '';
    if (code) {
      setText('ref-code-display', code);
      const linkInput = document.getElementById('ref-link-display');
      if (linkInput) linkInput.value = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(code)}`;
      diag('Code parrainage : ' + code, true);
    }
    
    // Stats parrainage
    try {
      const { data: stats } = await supabaseClient.rpc('get_my_referral_stats');
      if (stats) {
        setText('stat-referred-count', stats.referred_count || 0);
        setText('stat-pending', formatFCFA(stats.pending_amount));
        setText('stat-paid', formatFCFA(stats.paid_amount));
        setText('stat-total', formatFCFA(stats.total_amount));
        setText('stat-paid-2', formatFCFA(stats.paid_amount));
        setText('stat-pending-2', formatFCFA(stats.pending_amount));
        setText('filleuls-count', stats.referred_count || 0);
        diag('Stats parrainage OK', true);
      }
    } catch (e) {
      diag('Stats parrainage erreur : ' + e.message, false);
    }
    
    // Stats retrait
    try {
      const { data: stats } = await supabaseClient.rpc('get_my_withdrawal_stats');
      if (stats) {
        window.currentWithdrawalStats = stats;
        setText('available-balance', formatFCFA(stats.available_balance || 0));
        diag('Stats retrait OK', true);
      }
    } catch (e) {
      diag('Stats retrait erreur : ' + e.message, false);
    }
    
    // Pré-remplir téléphone
    if (profile && profile.phone) {
      const wdPhone = document.getElementById('wd-phone');
      if (wdPhone) wdPhone.value = profile.phone;
    }
    
    diag('=== CHARGEMENT TERMINÉ ===', true);
    
    // Masquer la barre de diag après 3 sec
    setTimeout(() => {
      const d = document.getElementById('diag');
      if (d) d.style.display = 'none';
    }, 3000);
    
  } catch (e) {
    diag('ERREUR FATALE : ' + e.message, false);
  }
})();

// ============================================================
// MODALE RETRAIT
// ============================================================
function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (!modal) return;
  const available = window.currentWithdrawalStats?.available_balance || 0;
  const wdAvailable = document.getElementById('wd-available');
  if (wdAvailable) wdAvailable.textContent = (available).toLocaleString('fr-FR') + ' F';
  
  if (available < 500) {
    const toast = document.getElementById('toast-copy');
    if (toast) {
      toast.textContent = 'Solde insuffisant (min 500 F)';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
    return;
  }
  modal.classList.add('active');
}

function closeWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.classList.remove('active');
}

// Attacher les boutons
document.addEventListener('DOMContentLoaded', () => {
  const wdReqBtn = document.getElementById('request-withdraw-btn');
  if (wdReqBtn) wdReqBtn.addEventListener('click', openWithdrawModal);
  const wdCancelBtn = document.getElementById('wd-cancel');
  if (wdCancelBtn) wdCancelBtn.addEventListener('click', closeWithdrawModal);
  const wdModal = document.getElementById('withdraw-modal');
  if (wdModal) wdModal.addEventListener('click', (e) => {
    if (e.target.id === 'withdraw-modal') closeWithdrawModal();
  });
  
  // Boutons copier
  const copyCodeBtn = document.getElementById('copy-code-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      const code = document.getElementById('ref-code-display')?.textContent || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        const toast = document.getElementById('toast-copy');
        if (toast) {
          toast.textContent = '✅ Code copié !';
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2500);
        }
      } catch (e) {}
    });
  }
  
  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      const input = document.getElementById('ref-link-display');
      if (!input) return;
      try {
        await navigator.clipboard.writeText(input.value);
        const toast = document.getElementById('toast-copy');
        if (toast) {
          toast.textContent = '✅ Lien copié !';
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2500);
        }
      } catch (e) {}
    });
  }
});

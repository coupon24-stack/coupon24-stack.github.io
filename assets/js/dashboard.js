// frontend/assets/js/dashboard.js
// Version finale — affichage immédiat, logs console uniquement.

// ============================================================
// LOGS CONSOLE (pas d'affichage visuel)
// ============================================================
function diag(msg, ok) {
  const prefix = ok === true ? '✅' : ok === false ? '❌' : '→';
  console.log('[DASH]', prefix, msg);
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

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

let toastTimeout;
function showToast(message) {
  const toast = document.getElementById('toast-copy');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// CHARGEMENT DES DONNÉES (le contenu est déjà visible)
// ============================================================
(async function chargerDonnees() {
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

    // Profil
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
      if (linkInput) {
        linkInput.value = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(code)}`;
      }
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

    if (profile && profile.phone) {
      const wdPhone = document.getElementById('wd-phone');
      if (wdPhone) wdPhone.value = profile.phone;
    }

    diag('=== CHARGEMENT TERMINÉ ===', true);

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
  if (wdAvailable) wdAvailable.textContent = formatFCFA(available);

  if (available < 500) {
    showToast('Solde insuffisant (min 500 F)');
    return;
  }
  const amountInput = document.getElementById('wd-amount');
  if (amountInput) amountInput.value = '';
  modal.classList.add('active');
}

function closeWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.classList.remove('active');
}

async function confirmWithdrawal() {
  const amountEl = document.getElementById('wd-amount');
  const methodEl = document.getElementById('wd-method');
  const phoneEl = document.getElementById('wd-phone');

  const amount = parseFloat(amountEl.value);
  const method = methodEl.value;
  const phone = phoneEl.value.trim();

  if (!amount || amount < 500) return showToast('Minimum 500 FCFA');
  if (!phone || phone.length < 8) return showToast('Numéro invalide');
  if (amount > (window.currentWithdrawalStats?.available_balance || 0)) return showToast('Solde insuffisant');

  const btn = document.getElementById('wd-confirm');
  btn.disabled = true;
  btn.textContent = 'Envoi...';

  try {
    const { error } = await supabaseClient.rpc('request_withdrawal', {
      p_amount: amount,
      p_payment_method: method,
      p_payment_phone: phone
    });
    if (error) throw error;
    showToast('✅ Demande envoyée ! Versement sous 48h.');
    closeWithdrawModal();
    // Recharger
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    console.error('[withdrawal]', err);
    showToast('Erreur : ' + (err.message || 'impossible'));
    btn.disabled = false;
    btn.textContent = 'Confirmer';
  }
}

// ============================================================
// INIT — Attacher les boutons
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const wdReqBtn = document.getElementById('request-withdraw-btn');
  if (wdReqBtn) wdReqBtn.addEventListener('click', openWithdrawModal);
  const wdCancelBtn = document.getElementById('wd-cancel');
  if (wdCancelBtn) wdCancelBtn.addEventListener('click', closeWithdrawModal);
  const wdConfirmBtn = document.getElementById('wd-confirm');
  if (wdConfirmBtn) wdConfirmBtn.addEventListener('click', confirmWithdrawal);
  const wdModal = document.getElementById('withdraw-modal');
  if (wdModal) wdModal.addEventListener('click', (e) => {
    if (e.target.id === 'withdraw-modal') closeWithdrawModal();
  });

  // Boutons copier
  const copyCodeBtn = document.getElementById('copy-code-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      const code = document.getElementById('ref-code-display')?.textContent || '';
      if (!code || code === '—') return;
      if (await copyText(code)) showToast('✅ Code copié !');
    });
  }

  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      const input = document.getElementById('ref-link-display');
      if (!input) return;
      if (await copyText(input.value)) showToast('✅ Lien copié !');
    });
  }
});

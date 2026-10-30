// frontend/assets/js/dashboard.js
// Version compatible avec le tableau de bord "fintech pro".

let currentWithdrawalStats = null;

// ============================================================
// AFFICHAGE DES ERREURS
// ============================================================
function showError(msg) {
  const el = document.getElementById('dashboard-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
  const loading = document.getElementById('dashboard-loading');
  if (loading) loading.style.display = 'none';
  console.error('[dashboard]', msg);
}

// ============================================================
// CHARGEMENT PRINCIPAL
// ============================================================
async function loadDashboardRoutine() {
  const loadingEl = document.getElementById('dashboard-loading');
  const contentEl = document.getElementById('dashboard-content');
  const errorEl = document.getElementById('dashboard-error');

  try {
    // 1. Vérifier que supabaseClient est chargé
    if (typeof supabaseClient === 'undefined') {
      throw new Error('supabaseClient non chargé. Vérifie /assets/js/supabase-client.js');
    }

    // 2. Récupérer la session
    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr) throw new Error('Session error: ' + sessionErr.message);
    if (!session) {
      window.location.replace('/connexion.html');
      return;
    }

    const user = session.user;

    // 3. Récupérer le profil
    let profile = null;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, phone, role, created_at, referral_code')
        .eq('id', user.id)
        .maybeSingle();
      if (!error) profile = data;
    } catch (e) {
      console.warn('[dashboard] profil:', e);
    }

    // 4. Remplir le profil
    const fullName = (profile && profile.full_name) || 'Utilisateur';
    setText('user-fullname', fullName);
    setText('user-email', user.email || '—');
    setText('user-initials', getInitials(fullName));

    if (profile && profile.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'flex';
    }

    // 5. Récupérer l'abonnement
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
        const expiresAt = new Date(sub.expires_at);
        const now = new Date();
        if (sub.status === 'active' && expiresAt > now) {
          const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
          subStatus = '✅ Abonnement actif';
          subDetails = `Expire le ${expiresAt.toLocaleDateString('fr-FR')} · ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`;
          subClass = 'active';
        } else {
          subStatus = '⏱️ Abonnement expiré';
          subDetails = `Expiré le ${expiresAt.toLocaleDateString('fr-FR')}`;
          subClass = 'expired';
        }
      }
    } catch (e) {
      console.warn('[dashboard] subs:', e);
    }

    const subStatusEl = document.getElementById('subscription-status');
    if (subStatusEl) {
      subStatusEl.textContent = subStatus;
      subStatusEl.className = 'sub-status ' + subClass;
    }
    setText('subscription-details', subDetails);

    // 6. Code et lien de parrainage
    const referralCode = (profile && profile.referral_code) || '';
    if (referralCode) {
      setText('ref-code-display', referralCode);
      const linkInput = document.getElementById('ref-link-display');
      if (linkInput) {
        linkInput.value = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(referralCode)}`;
      }
    } else {
      setText('ref-code-display', 'Non disponible');
    }

    // Boutons copier
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn && referralCode) {
      copyCodeBtn.addEventListener('click', async () => {
        if (await copyText(referralCode)) showToast('✅ Code copié !');
      });
    }
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        const input = document.getElementById('ref-link-display');
        if (input && await copyText(input.value)) showToast('✅ Lien copié !');
      });
    }

    // 7. Stats de parrainage (avec fallback si fonction manque)
    try {
      const { data: stats, error } = await supabaseClient.rpc('get_my_referral_stats');
      if (!error && stats) {
        setText('stat-referred-count', stats.referred_count || 0);
        setText('stat-pending', formatFCFA(stats.pending_amount));
        setText('stat-paid', formatFCFA(stats.paid_amount));
        setText('stat-total', formatFCFA(stats.total_amount));
        setText('stat-paid-2', formatFCFA(stats.paid_amount));
        setText('stat-pending-2', formatFCFA(stats.pending_amount));
        setText('filleuls-count', stats.referred_count || 0);
      }
    } catch (e) {
      console.warn('[dashboard] stats:', e);
    }

    // 8. Stats de retrait (avec fallback)
    try {
      const { data: stats, error } = await supabaseClient.rpc('get_my_withdrawal_stats');
      if (!error && stats) {
        currentWithdrawalStats = stats;
        const available = stats.available_balance || 0;
        const pending = stats.pending_withdrawals || 0;
        setText('available-balance', formatFCFA(available));
        if (pending > 0) {
          const pendEl = document.getElementById('pending-withdraw-info');
          const pendText = document.getElementById('pending-withdraw-text');
          if (pendEl) pendEl.style.display = 'block';
          if (pendText) pendText.textContent = formatFCFA(pending);
        }
      }
    } catch (e) {
      console.warn('[dashboard] withdrawal stats:', e);
    }

    // 9. Pré-remplir le téléphone pour le retrait
    if (profile && profile.phone) {
      const wdPhone = document.getElementById('wd-phone');
      if (wdPhone) wdPhone.value = profile.phone;
    }

    // 10. Afficher le contenu
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) {
      contentEl.classList.remove('hidden');
      contentEl.style.display = 'block';
    }

  } catch (error) {
    console.error('[dashboard] erreur fatale:', error);
    showError('Erreur : ' + (error.message || 'Impossible de charger le tableau de bord.'));
  }
}

// ============================================================
// MODALE RETRAIT
// ============================================================
function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (!modal) return;
  const available = currentWithdrawalStats?.available_balance || 0;
  setText('wd-available', formatFCFA(available));
  if (available < 500) {
    showToast('Solde insuffisant. Minimum 500 FCFA');
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
  const amount = parseFloat(document.getElementById('wd-amount').value);
  const method = document.getElementById('wd-method').value;
  const phone = document.getElementById('wd-phone').value.trim();

  if (!amount || amount < 500) return showToast('Minimum 500 FCFA');
  if (!phone || phone.length < 8) return showToast('Numéro invalide');
  if (amount > (currentWithdrawalStats?.available_balance || 0)) return showToast('Solde insuffisant');

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
    await loadDashboardRoutine();
  } catch (err) {
    console.error('[withdrawal]', err);
    showToast('Erreur : ' + (err.message || 'impossible'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmer';
  }
}

// ============================================================
// HELPERS
// ============================================================
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
  } catch (e) { console.warn('[clipboard]', e); }
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
// INIT
// ============================================================
(async function init() {
  await loadDashboardRoutine();

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
})();

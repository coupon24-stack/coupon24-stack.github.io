// frontend/assets/js/dashboard.js
// Version avec diagnostic étape par étape.

let currentWithdrawalStats = null;

// Barre de debug
function dbg(msg) {
  console.log('[DBG]', msg);
  const bar = document.getElementById('debug-bar');
  if (bar) {
    bar.classList.add('show');
    bar.innerHTML += '<div>→ ' + msg + '</div>';
  }
}

function dbgErr(msg) {
  console.error('[ERR]', msg);
  const bar = document.getElementById('debug-bar');
  if (bar) {
    bar.classList.add('show');
    bar.innerHTML += '<div style="color:#FFD7D7;">❌ ' + msg + '</div>';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
  else dbg('⚠️ Element #' + id + ' introuvable');
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
// CHARGEMENT PRINCIPAL
// ============================================================
async function loadDashboardRoutine() {
  const loadingEl = document.getElementById('dashboard-loading');
  const contentEl = document.getElementById('dashboard-content');
  const errorEl = document.getElementById('dashboard-error');

  try {
    dbg('1. Démarrage');

    // Vérif supabaseClient
    if (typeof supabaseClient === 'undefined') {
      throw new Error('supabaseClient non défini');
    }
    dbg('2. supabaseClient OK');

    // Session
    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr) throw new Error('Session: ' + sessionErr.message);
    if (!session) {
      dbg('3. Pas de session → redirection');
      window.location.replace('/connexion.html');
      return;
    }
    dbg('3. Session OK: ' + session.user.email);

    const user = session.user;

    // Profil
    let profile = null;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, phone, role, created_at, referral_code')
        .eq('id', user.id)
        .maybeSingle();
      if (error) dbg('4. Erreur profil: ' + error.message);
      else { profile = data; dbg('4. Profil chargé: ' + (profile ? profile.full_name : 'null')); }
    } catch (e) {
      dbg('4. Exception profil: ' + e.message);
    }

    // Afficher profil
    const fullName = (profile && profile.full_name) || 'Utilisateur';
    setText('user-fullname', fullName);
    setText('user-email', user.email || '—');
    setText('user-initials', getInitials(fullName));
    dbg('5. Profil affiché');

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
    } catch (e) {
      dbg('6. Exception abonnement: ' + e.message);
    }
    const subEl = document.getElementById('subscription-status');
    if (subEl) {
      subEl.textContent = subStatus;
      subEl.className = 'sub-status ' + subClass;
    }
    setText('subscription-details', subDetails);
    dbg('6. Abonnement affiché');

    // Parrainage
    const code = (profile && profile.referral_code) || '';
    if (code) {
      setText('ref-code-display', code);
      const linkInput = document.getElementById('ref-link-display');
      if (linkInput) linkInput.value = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(code)}`;
      dbg('7. Code parrainage: ' + code);
    } else {
      setText('ref-code-display', 'Indisponible');
      dbg('7. ⚠️ Pas de code parrainage');
    }

    // Boutons copier
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn && code) {
      copyCodeBtn.addEventListener('click', async () => {
        if (await copyText(code)) showToast('✅ Code copié !');
      });
    }
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        const input = document.getElementById('ref-link-display');
        if (input && await copyText(input.value)) showToast('✅ Lien copié !');
      });
    }
    dbg('8. Boutons copier attachés');

    // Stats parrainage
    try {
      const { data: stats, error } = await supabaseClient.rpc('get_my_referral_stats');
      if (error) dbg('9. Erreur stats: ' + error.message);
      else if (stats) {
        setText('stat-referred-count', stats.referred_count || 0);
        setText('stat-pending', formatFCFA(stats.pending_amount));
        setText('stat-paid', formatFCFA(stats.paid_amount));
        setText('stat-total', formatFCFA(stats.total_amount));
        setText('stat-paid-2', formatFCFA(stats.paid_amount));
        setText('stat-pending-2', formatFCFA(stats.pending_amount));
        setText('filleuls-count', stats.referred_count || 0);
        dbg('9. Stats OK');
      }
    } catch (e) {
      dbg('9. Exception stats: ' + e.message);
    }

    // Stats retrait
    try {
      const { data: stats, error } = await supabaseClient.rpc('get_my_withdrawal_stats');
      if (error) dbg('10. Erreur withdrawal stats: ' + error.message);
      else if (stats) {
        currentWithdrawalStats = stats;
        setText('available-balance', formatFCFA(stats.available_balance || 0));
        if ((stats.pending_withdrawals || 0) > 0) {
          const pendEl = document.getElementById('pending-withdraw-info');
          const pendText = document.getElementById('pending-withdraw-text');
          if (pendEl) pendEl.style.display = 'block';
          if (pendText) pendText.textContent = formatFCFA(stats.pending_withdrawals);
        }
        dbg('10. Withdrawal stats OK');
      }
    } catch (e) {
      dbg('10. Exception withdrawal stats: ' + e.message);
    }

    // Téléphone pour retrait
    if (profile && profile.phone) {
      const wdPhone = document.getElementById('wd-phone');
      if (wdPhone) wdPhone.value = profile.phone;
    }

    dbg('11. Affichage final...');

    // AFFICHER
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) {
      contentEl.style.display = 'block';
      dbg('12. ✅ Contenu affiché !');
    } else {
      dbgErr('❌ #dashboard-content introuvable');
    }

  } catch (error) {
    console.error('[dashboard] erreur fatale:', error);
    dbgErr('FATAL: ' + (error.message || error));
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = 'Erreur : ' + (error.message || 'inconnue');
      errorEl.style.display = 'block';
    }
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
    showToast('✅ Demande envoyée !');
    closeWithdrawModal();
    await loadDashboardRoutine();
  } catch (err) {
    showToast('Erreur : ' + (err.message || 'inconnue'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmer';
  }
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  dbg('0. Init');
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

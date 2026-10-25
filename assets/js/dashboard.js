// frontend/assets/js/dashboard.js
// Charge et affiche les données du profil + le programme de parrainage + les retraits.

let currentWithdrawalStats = null;

async function loadDashboardRoutine() {
  const loadingEl = document.getElementById('dashboard-loading');
  const contentEl = document.getElementById('dashboard-content');
  const errorEl = document.getElementById('dashboard-error');

  try {
    if (typeof supabaseClient === 'undefined') throw new Error("supabaseClient non chargé.");

    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !session) { window.location.replace('/connexion.html'); return; }

    const user = session.user;

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, phone, role, created_at, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) console.error('[dashboard] profil:', profileError);

    let subStatus = 'Aucun abonnement actif';
    let subDetails = 'Souscris à un abonnement pour accéder aux coupons premium.';
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
        } else {
          subStatus = '⏱️ Abonnement expiré';
          subDetails = `Expiré le ${expiresAt.toLocaleDateString('fr-FR')}. Renouvelle pour retrouver l'accès.`;
        }
      }
    } catch (e) { console.warn('[dashboard] subscriptions:', e); }

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const fullName = (profile && profile.full_name) || 'Utilisateur';
    setText('user-fullname', fullName);
    setText('user-email', user.email || '—');
    setText('user-phone', (profile && profile.phone) || 'Non renseigné');
    setText('user-role', profile && profile.role === 'admin' ? 'Administrateur' : 'Membre');
    setText('user-initials', getInitials(fullName));
    setText('subscription-status', subStatus);
    setText('subscription-details', subDetails);

    if (profile && profile.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'flex';
    }

    // PARRAINAGE
    const referralCode = (profile && profile.referral_code) || '';
    const refDisplay = document.getElementById('ref-code-display');
    const refLinkInput = document.getElementById('ref-link-display');
    if (refDisplay && referralCode) refDisplay.textContent = referralCode;
    if (refLinkInput && referralCode) {
      refLinkInput.value = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(referralCode)}`;
    }

    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', async () => {
        if (!referralCode) return;
        if (await copyText(referralCode)) showToast('✅ Code copié !');
      });
    }
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn && refLinkInput) {
      copyLinkBtn.addEventListener('click', async () => {
        if (await copyText(refLinkInput.value)) showToast('✅ Lien copié !');
      });
    }

    try {
      const { data: stats, error: statsErr } = await supabaseClient.rpc('get_my_referral_stats');
      if (!statsErr && stats) {
        setText('stat-referred-count', stats.referred_count || 0);
        setText('stat-pending', formatFCFA(stats.pending_amount));
        setText('stat-paid', formatFCFA(stats.paid_amount));
        setText('stat-total', formatFCFA(stats.total_amount));
      }
    } catch (e) { console.warn('[dashboard] stats:', e); }

    try {
      const { data: filleuls } = await supabaseClient.rpc('get_my_referrals');
      const container = document.getElementById('filleuls-container');
      const countEl = document.getElementById('filleuls-count');
      if (countEl) countEl.textContent = (filleuls || []).length;
      if (container) {
        if (!filleuls || filleuls.length === 0) {
          container.innerHTML = `<div class="empty-filleuls">Tu n'as encore parrainé personne.<br />Partage ton code ou ton lien pour commencer à gagner !</div>`;
        } else {
          container.innerHTML = `
            <div class="filleuls-table-wrapper">
              <table class="filleuls-table">
                <thead>
                  <tr><th>Nom</th><th>Inscription</th><th>Statut</th><th style="text-align:right;">Commission</th></tr>
                </thead>
                <tbody>
                  ${filleuls.map(f => `
                    <tr>
                      <td data-label="Nom"><strong>${escapeHtml(f.full_name)}</strong></td>
                      <td data-label="Inscription">${formatDateFR(f.created_at)}</td>
                      <td data-label="Statut"><span class="${f.has_active_sub ? 'badge-active' : 'badge-inactive'}">${f.has_active_sub ? 'Actif' : 'Sans abo'}</span></td>
                      <td data-label="Commission" style="text-align:right;font-weight:700;color:var(--green);">${formatFCFA(f.total_commission)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`;
        }
      }
    } catch (e) { console.warn('[dashboard] filleuls:', e); }

    // RETRAITS
    await loadWithdrawalStats();

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

  } catch (error) {
    console.error('[dashboard] erreur fatale:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = 'Erreur : ' + (error.message || 'impossible de charger.');
      errorEl.style.display = 'block';
    }
  }
}

// ============================================================
// RETRAIT
// ============================================================
async function loadWithdrawalStats() {
  try {
    const { data: stats, error } = await supabaseClient.rpc('get_my_withdrawal_stats');
    if (error) throw error;
    currentWithdrawalStats = stats;

    const available = stats?.available_balance || 0;
    const pending = stats?.pending_withdrawals || 0;

    const balEl = document.getElementById('available-balance');
    if (balEl) balEl.textContent = formatFCFA(available);

    const pendEl = document.getElementById('pending-withdraw-info');
    const pendText = document.getElementById('pending-withdraw-text');
    if (pending > 0 && pendEl && pendText) {
      pendEl.style.display = 'block';
      pendText.textContent = `Retrait en attente : ${formatFCFA(pending)}`;
    } else if (pendEl) {
      pendEl.style.display = 'none';
    }

    // Pré-remplir téléphone
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('phone')
        .eq('id', session.user.id)
        .maybeSingle();
      const wdPhone = document.getElementById('wd-phone');
      if (wdPhone && profile?.phone && !wdPhone.value) wdPhone.value = profile.phone;
    }
  } catch (e) { console.warn('[withdrawal stats]', e); }
}

function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (!modal) return;
  const available = currentWithdrawalStats?.available_balance || 0;
  const wdAvailable = document.getElementById('wd-available');
  if (wdAvailable) wdAvailable.textContent = formatFCFA(available);
  if (available < 500) {
    showToast('Solde insuffisant. Minimum de retrait : 500 FCFA');
    return;
  }
  document.getElementById('wd-amount').value = '';
  modal.classList.add('active');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal')?.classList.remove('active');
}

async function confirmWithdrawal() {
  const amount = parseFloat(document.getElementById('wd-amount').value);
  const method = document.getElementById('wd-method').value;
  const phone = document.getElementById('wd-phone').value.trim();

  if (!amount || amount < 500) return showToast('Montant minimum : 500 FCFA');
  if (!phone || phone.length < 8) return showToast('Numéro de téléphone invalide');
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
    await loadWithdrawalStats();
  } catch (err) {
    console.error('[withdrawal]', err);
    showToast('Erreur : ' + (err.message || 'impossible'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmer la demande';
  }
}

// ============================================================
// HELPERS
// ============================================================
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

function formatDateFR(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
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

  const _wdReqBtn = document.getElementById('request-withdraw-btn');
  if (_wdReqBtn) _wdReqBtn.addEventListener('click', openWithdrawModal);
  const _wdCancelBtn = document.getElementById('wd-cancel');
  if (_wdCancelBtn) _wdCancelBtn.addEventListener('click', closeWithdrawModal);
  const _wdConfirmBtn = document.getElementById('wd-confirm');
  if (_wdConfirmBtn) _wdConfirmBtn.addEventListener('click', confirmWithdrawal);
  const _wdModal = document.getElementById('withdraw-modal');
  if (_wdModal) _wdModal.addEventListener('click', (e) => {
    if (e.target.id === 'withdraw-modal') closeWithdrawModal();
  });

  // Déconnexion
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = '/index.html';
    });
  }
})();

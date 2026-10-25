// frontend/assets/js/dashboard.js
// Charge et affiche les données du profil + le programme de parrainage.

(async function loadDashboard() {
  const loadingEl = document.getElementById('dashboard-loading');
  const contentEl = document.getElementById('dashboard-content');
  const errorEl = document.getElementById('dashboard-error');

  try {
    if (typeof supabaseClient === 'undefined') {
      throw new Error("supabaseClient non chargé.");
    }

    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !session) {
      window.location.replace('/connexion.html');
      return;
    }

    const user = session.user;

    // Profil
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, phone, role, created_at, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) console.error('[dashboard] profil:', profileError);

    // Abonnement
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
    } catch (e) {
      console.warn('[dashboard] subscriptions:', e);
    }

    // Remplir la section profil
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
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

    // ============================================================
    // SECTION PARRAINAGE
    // ============================================================
    const referralCode = (profile && profile.referral_code) || '';
    const refDisplay = document.getElementById('ref-code-display');
    const refLinkInput = document.getElementById('ref-link-display');

    if (refDisplay && referralCode) {
      refDisplay.textContent = referralCode;
    }
    if (refLinkInput && referralCode) {
      const shareUrl = `${window.location.origin}/inscription.html?ref=${encodeURIComponent(referralCode)}`;
      refLinkInput.value = shareUrl;
    }

    // Bouton copier code
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', async () => {
        if (!referralCode) return;
        const ok = await copyText(referralCode);
        if (ok) showToast('✅ Code copié !');
      });
    }

    // Bouton copier lien
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn && refLinkInput) {
      copyLinkBtn.addEventListener('click', async () => {
        const ok = await copyText(refLinkInput.value);
        if (ok) showToast('✅ Lien copié !');
      });
    }

    // Stats
    try {
      const { data: stats, error: statsErr } = await supabaseClient.rpc('get_my_referral_stats');
      if (!statsErr && stats) {
        setText('stat-referred-count', stats.referred_count || 0);
        setText('stat-pending', formatFCFA(stats.pending_amount));
        setText('stat-paid', formatFCFA(stats.paid_amount));
        setText('stat-total', formatFCFA(stats.total_amount));
      }
    } catch (e) { console.warn('[dashboard] stats:', e); }

    // Filleuls
    try {
      const { data: filleuls, error: filleulsErr } = await supabaseClient.rpc('get_my_referrals');
      const container = document.getElementById('filleuls-container');
      const countEl = document.getElementById('filleuls-count');

      if (!filleulsErr && filleuls) {
        if (countEl) countEl.textContent = filleuls.length;
        if (container) {
          if (filleuls.length === 0) {
            container.innerHTML = `
              <div class="empty-filleuls">
                Tu n'as encore parrainé personne.<br />
                Partage ton code ou ton lien pour commencer à gagner !
              </div>`;
          } else {
            container.innerHTML = `
              <table class="filleuls-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Inscription</th>
                    <th>Statut abonnement</th>
                    <th style="text-align:right;">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  ${filleuls.map(f => `
                    <tr>
                      <td data-label="Nom"><strong>${escapeHtml(f.full_name)}</strong></td>
                      <td data-label="Inscription">${formatDateFR(f.created_at)}</td>
                      <td data-label="Statut">
                        <span class="${f.has_active_sub ? 'badge-active' : 'badge-inactive'}">
                          ${f.has_active_sub ? 'Actif' : 'Sans abo'}
                        </span>
                      </td>
                      <td data-label="Commission" style="text-align:right;font-weight:700;color:var(--green);">
                        ${formatFCFA(f.total_commission)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          }
        }
      }
    } catch (e) { console.warn('[dashboard] filleuls:', e); }

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
})();

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
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
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

// Déconnexion
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = '/index.html';
    });
  }
});

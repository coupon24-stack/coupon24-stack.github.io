// frontend/assets/js/admin-common.js
// Helpers partagés et protection des pages admin.
// À inclure APRÈS supabase-client.js sur chaque page admin.

// ============================================================
// PROTECTION : vérifie que l'utilisateur est admin
// ============================================================
async function requireAdmin() {
  try {
    if (typeof supabaseClient === 'undefined') {
      console.error('[admin] supabaseClient non chargé');
      window.location.replace('/connexion.html');
      return null;
    }

    // 1. Session active ?
    const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !session) {
      window.location.replace('/connexion.html');
      return null;
    }

    // 2. Rôle admin ?
    const { data: profile, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', session.user.id)
      .single();

    if (profileErr || !profile || profile.role !== 'admin') {
      console.warn('[admin] Accès refusé — rôle:', profile ? profile.role : 'inconnu');
      window.location.replace('/tableau-de-bord.html?error=forbidden');
      return null;
    }

    // 3. Afficher le nom dans la navbar
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = profile.full_name || session.user.email;

    return { session, profile };
  } catch (err) {
    console.error('[admin] erreur requireAdmin:', err);
    window.location.replace('/connexion.html');
    return null;
  }
}

// ============================================================
// TOASTS (notifications flottantes)
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// ALERTES INLINE
// ============================================================
function showAlert(message, type = 'error', targetId = 'page-alert') {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
}
function hideAlert(targetId = 'page-alert') {
  const el = document.getElementById(targetId);
  if (el) el.className = 'alert';
}

// ============================================================
// FORMATAGE
// ============================================================
function formatDateFR(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTimeFR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// ============================================================
// DÉCONNEXION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Se déconnecter ?')) return;
      await supabaseClient.auth.signOut();
      window.location.href = '/index.html';
    });
  }
});

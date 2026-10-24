// frontend/assets/js/dashboard.js
// Charge et affiche les données du profil utilisateur connecté.

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

    // Charger le profil
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, phone, role, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[dashboard] erreur profil:', profileError);
    }

    // Charger l'abonnement actif (si la table existe)
    let subStatus = 'Aucun abonnement actif';
    let subDetails = 'Souscris à un abonnement pour accéder aux coupons premium.';
    let hasActiveSub = false;

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
          hasActiveSub = true;
          const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
          subStatus = '✅ Abonnement actif';
          subDetails = `Expire le ${expiresAt.toLocaleDateString('fr-FR')} · ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`;
        } else {
          subStatus = '⏱️ Abonnement expiré';
          subDetails = `Expiré le ${expiresAt.toLocaleDateString('fr-FR')}. Renouvelle pour retrouver l'accès.`;
        }
      }
    } catch (e) {
      console.warn('[dashboard] subscriptions non disponibles:', e);
    }

    // Remplir les champs
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const fullName = (profile && profile.full_name) || 'Utilisateur';
    const initials = getInitials(fullName);

    setText('user-fullname', fullName);
    setText('user-email', user.email || '—');
    setText('user-phone', (profile && profile.phone) || 'Non renseigné');
    setText('user-role', profile && profile.role === 'admin' ? 'Administrateur' : 'Membre');
    setText('user-initials', initials);
    setText('subscription-status', subStatus);
    setText('subscription-details', subDetails);

    // Afficher le lien admin si admin
    if (profile && profile.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'flex';
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

  } catch (error) {
    console.error('[dashboard] erreur fatale:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = 'Erreur : ' + (error.message || 'impossible de charger ton profil.');
      errorEl.style.display = 'block';
    }
  }
})();

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

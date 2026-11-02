// frontend/assets/js/auth-guard.js
// Protège les pages privées : redirige vers /connexion.html si non connecté.

(async function protectPage() {
  if (typeof supabaseClient === 'undefined') {
    console.error('[auth-guard] supabaseClient non chargé');
    window.location.replace('/connexion.html');
    return;
  }

  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (error || !session) {
    try {
      sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
    } catch (e) {}
    window.location.replace('/connexion.html');
    return;
  }

  // Session active : exposer globalement pour les autres scripts
  window.currentSession = session;
  console.log('[auth-guard] session active pour', session.user.email);

  // Écouter les déconnexions
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.replace('/connexion.html');
    }
  });
})();

// frontend/assets/js/auth.js
// Authentification avec support du parrainage.

function showAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.className = `alert alert-${type}`;
  box.style.display = 'block';
}
function hideAlert() {
  const box = document.getElementById('alert-box');
  if (box) box.style.display = 'none';
}
function setLoading(isLoading) {
  const btn = document.getElementById('submit-btn');
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Chargement...' : btn.dataset.originalText;
}
function isValidIvorianPhone(phone) {
  const cleaned = phone.replace(/[\s-]/g, '');
  return /^\+225\d{8,10}$/.test(cleaned);
}

function getRedirectUrl(defaultUrl = '/tableau-de-bord.html') {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (!redirect) return defaultUrl;
  try { return decodeURIComponent(redirect); } catch (e) { return defaultUrl; }
}

// ============================================================
// VÉRIFICATION DU CODE DE PARRAINAGE (temps réel)
// ============================================================
async function checkReferralCode(code) {
  if (!code || code.length < 5) return null;
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('referral_code', code.toUpperCase())
      .maybeSingle();
    if (error || !data) return null;
    return data.full_name || 'un membre';
  } catch (e) {
    console.warn('[referral check]', e);
    return null;
  }
}

// Pré-remplir le code depuis l'URL ?ref=XXX
function initReferralFromUrl() {
  const input = document.getElementById('referral_code');
  if (!input) return;

  const params = new URLSearchParams(window.location.search);
  const refFromUrl = params.get('ref');
  if (refFromUrl) {
    input.value = refFromUrl.toUpperCase();
    // Déclencher la vérification
    input.dispatchEvent(new Event('input'));
  }
}

// ============================================================
// INSCRIPTION
// ============================================================
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.dataset.originalText = submitBtn.textContent;

  // Pré-remplir depuis l'URL
  initReferralFromUrl();

  // Vérification temps réel du code de parrainage
  const referralInput = document.getElementById('referral_code');
  const referralFeedback = document.getElementById('referral-feedback');
  let referralTimeout;

  referralInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    clearTimeout(referralTimeout);

    const code = e.target.value.trim();
    if (!referralFeedback) return;

    if (!code) {
      referralFeedback.className = 'referral-feedback';
      referralFeedback.textContent = '';
      return;
    }

    if (code.length < 5) {
      referralFeedback.className = 'referral-feedback';
      referralFeedback.textContent = '';
      return;
    }

    referralTimeout = setTimeout(async () => {
      const name = await checkReferralCode(code);
      if (name) {
        referralFeedback.className = 'referral-feedback valid';
        referralFeedback.textContent = `✅ Parrain : ${name}`;
      } else {
        referralFeedback.className = 'referral-feedback invalid';
        referralFeedback.textContent = `❌ Code invalide`;
      }
    }, 500);
  });

  // Soumission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const fullName = document.getElementById('full_name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;
    const referralCode = (document.getElementById('referral_code')?.value || '').trim().toUpperCase();

    if (!fullName || !email || !phone || !password) {
      return showAlert('Veuillez remplir tous les champs.');
    }
    if (!isValidIvorianPhone(phone)) {
      return showAlert('Numéro de téléphone invalide. Utilisez +225 suivi de 8 à 10 chiffres.');
    }
    if (password.length < 8) {
      return showAlert('Le mot de passe doit contenir au moins 8 caractères.');
    }
    if (password !== confirmPassword) {
      return showAlert('Les deux mots de passe ne correspondent pas.');
    }

    // Valider le code de parrainage s'il est renseigné
    if (referralCode) {
      const referrerName = await checkReferralCode(referralCode);
      if (!referrerName) {
        return showAlert('Le code de parrainage est invalide. Vérifie-le ou laisse vide.');
      }
    }

    setLoading(true);

    try {
      const metadata = { full_name: fullName, phone };
      if (referralCode) metadata.referral_code_used = referralCode;

      const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: metadata }
      });

      if (authError) throw authError;

      const target = getRedirectUrl();

      if (authData.session) {
        const msg = referralCode
          ? 'Compte créé ! Ton bonus de parrainage sera appliqué à ton premier abonnement. Redirection...'
          : 'Compte créé ! Redirection...';
        showAlert(msg, 'success');
        setTimeout(() => { window.location.href = target; }, 2000);
      } else {
        showAlert('Compte créé ! Vérifie ta boîte mail pour confirmer, puis connecte-toi.', 'success');
        signupForm.reset();
      }
    } catch (error) {
      console.error('Erreur inscription:', error);
      if (error.message && error.message.includes('already registered')) {
        showAlert('Un compte existe déjà avec cet email.');
      } else if (error.message && error.message.includes('Password')) {
        showAlert('Le mot de passe est trop faible.');
      } else {
        showAlert('Erreur : ' + (error.message || 'réessaie plus tard.'));
      }
    } finally {
      setLoading(false);
    }
  });
}

// ============================================================
// CONNEXION
// ============================================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.dataset.originalText = submitBtn.textContent;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      return showAlert('Veuillez saisir votre email et votre mot de passe.');
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const target = getRedirectUrl();
      showAlert('Connexion réussie ! Redirection...', 'success');
      setTimeout(() => { window.location.href = target; }, 1000);
    } catch (error) {
      console.error('Erreur connexion:', error);
      showAlert('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  });
}

// ============================================================
// MOT DE PASSE OUBLIÉ
// ============================================================
const forgotForm = document.getElementById('forgot-password-form');
if (forgotForm) {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.dataset.originalText = submitBtn.textContent;

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const email = document.getElementById('email').value.trim();
    if (!email) return showAlert('Veuillez saisir votre adresse email.');

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe.html`,
      });
      if (error) throw error;
      showAlert('Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.', 'success');
      forgotForm.reset();
    } catch (error) {
      showAlert('Impossible d\'envoyer l\'email pour le moment.');
    } finally {
      setLoading(false);
    }
  });
}

// ============================================================
// RÉINITIALISATION
// ============================================================
const resetForm = document.getElementById('reset-password-form');
if (resetForm) {
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.dataset.originalText = submitBtn.textContent;

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const newPassword = document.getElementById('new_password').value;
    const confirmNew = document.getElementById('confirm_new_password').value;
    if (newPassword.length < 8) return showAlert('Le mot de passe doit contenir au moins 8 caractères.');
    if (newPassword !== confirmNew) return showAlert('Les deux mots de passe ne correspondent pas.');

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showAlert('Mot de passe mis à jour ! Redirection...', 'success');
      setTimeout(() => { window.location.href = '/connexion.html'; }, 2000);
    } catch (error) {
      showAlert('Le lien est peut-être expiré. Refais une demande.');
    } finally {
      setLoading(false);
    }
  });
}

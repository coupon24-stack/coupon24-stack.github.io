// frontend/assets/js/admin-utilisateurs.js
// Gestion des utilisateurs : liste, activation et annulation d'abonnement avec parrainage.

let allUsers = [];
let currentUserId = null;
let currentUserName = null;
let currentUserEmail = null;
let currentReferrer = null;
let currentSubscription = null;

const PLAN_PRICES = { '7j': 1500, '30j': 5000, 'annuel': 45000 };
const BONUS_DAYS = { '7j': 3, '30j': 7, 'annuel': 30 };
const COMMISSION_RATE = 0.20;

// ============================================================
// CHARGEMENT
// ============================================================
async function loadUsers() {
  const loading = document.getElementById('loading');
  const tbody = document.getElementById('users-body');
  const empty = document.getElementById('empty');

  if (loading) loading.style.display = 'flex';
  if (tbody) tbody.innerHTML = '';
  if (empty) empty.style.display = 'none';

  try {
    const { data, error } = await supabaseClient.rpc('admin_list_users');
    if (error) throw error;

    allUsers = data || [];
    if (loading) loading.style.display = 'none';
    renderUsers();
  } catch (err) {
    console.error('[utilisateurs] erreur:', err);
    if (loading) loading.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;background:#FED7D7;color:#9B2C2C;">Erreur : ${escapeHtml(err.message || 'inconnue')}</td></tr>`;
    }
  }
}

// ============================================================
// RENDU
// ============================================================
function renderUsers() {
  const tbody = document.getElementById('users-body');
  const empty = document.getElementById('empty');
  const search = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const filterSub = document.getElementById('filter-subscription')?.value || '';

  let filtered = allUsers;

  if (search) {
    filtered = filtered.filter(u =>
      (u.full_name || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.phone || '').toLowerCase().includes(search)
    );
  }
  if (filterSub) {
    filtered = filtered.filter(u => u.subscription_status === filterSub);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = filtered.map(u => {
    const subLabel = u.subscription_status === 'active' ? 'Actif'
                  : u.subscription_status === 'expired' ? 'Expiré'
                  : 'Aucun';
    const subInfo = u.subscription_expires_at
      ? `<br /><span style="font-size:0.72rem;color:var(--gray-text);">→ ${formatDateFR(u.subscription_expires_at)}</span>`
      : '';
    const roleLabel = u.role === 'admin' ? 'Admin' : 'Membre';
    const roleBadge = u.role === 'admin' ? 'badge-admin' : 'badge-none';

    const cancelBtn = u.subscription_status === 'active'
      ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${u.id}">Annuler abo.</button>`
      : '';

    return `
      <tr>
        <td data-label="Nom"><strong>${escapeHtml(u.full_name) || '—'}</strong></td>
        <td data-label="Email">${escapeHtml(u.email)}</td>
        <td data-label="Téléphone">${escapeHtml(u.phone) || '—'}</td>
        <td data-label="Inscription">${formatDateFR(u.created_at)}</td>
        <td data-label="Rôle"><span class="badge ${roleBadge}">${roleLabel}</span></td>
        <td data-label="Abonnement">
          <span class="badge badge-${u.subscription_status}">${subLabel}</span>
          ${subInfo}
        </td>
        <td data-label="Actions">
          <div class="user-actions">
            <button class="btn btn-primary btn-sm" data-action="activate" data-id="${u.id}">Activer abo.</button>
            ${cancelBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'activate') openActivationModal(id);
      if (action === 'cancel') openCancelModal(id);
    });
  });
}

// ============================================================
// MODALE ACTIVATION
// ============================================================
async function openActivationModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  currentUserId = userId;
  currentUserName = user.full_name || 'Utilisateur';
  currentUserEmail = user.email;
  currentReferrer = null;

  document.getElementById('modal-user-name').textContent = currentUserName;
  document.getElementById('modal-user-email').textContent = user.email;
  document.getElementById('modal-plan').value = '30j';
  document.getElementById('modal-days').value = '';
  document.getElementById('modal-amount').value = '5000';
  document.getElementById('modal-note').value = '';

  // Cacher les encadrés par défaut
  document.getElementById('referral-info').style.display = 'none';
  document.getElementById('commission-preview').classList.add('hidden');
  updateCommissionPreview();

  // Charger les infos de parrainage
  try {
    const { data: refData, error } = await supabaseClient.rpc('get_referrer_info', { p_user_id: userId });
    if (!error && refData) {
      currentReferrer = refData;
      const refBox = document.getElementById('referral-info');
      const refName = document.getElementById('ref-name');
      const refBonus = document.getElementById('ref-bonus');

      refName.textContent = `${refData.referrer_name} (${refData.referrer_code})`;
      refBox.style.display = 'block';

      const isFirst = refData.is_first_subscription;
      const alreadyApplied = refData.bonus_already_applied;

      if (isFirst && !alreadyApplied) {
        refBonus.textContent = `🎁 Bonus disponible : +${BONUS_DAYS['30j']} jours (selon formule)`;
        refBonus.className = 'ref-bonus';
      } else if (alreadyApplied) {
        refBonus.textContent = `✓ Bonus de parrainage déjà utilisé`;
        refBonus.className = 'ref-bonus used';
      } else {
        refBonus.textContent = `✓ Bonus déjà consommé (renouvellement)`;
        refBonus.className = 'ref-bonus used';
      }
    }
  } catch (e) {
    console.warn('[referral info]', e);
  }

  document.getElementById('sub-modal').classList.add('active');
}

function updateReferralBonusLabel(planCode) {
  if (!currentReferrer) return;
  const refBonus = document.getElementById('ref-bonus');
  if (!refBonus) return;
  const isFirst = currentReferrer.is_first_subscription;
  const alreadyApplied = currentReferrer.bonus_already_applied;
  if (isFirst && !alreadyApplied) {
    refBonus.textContent = `🎁 Bonus disponible : +${BONUS_DAYS[planCode]} jours`;
    refBonus.className = 'ref-bonus';
  }
}

function updateCommissionPreview() {
  const amount = parseFloat(document.getElementById('modal-amount')?.value) || 0;
  const preview = document.getElementById('commission-preview');
  const valueEl = document.getElementById('comm-value');

  if (!currentReferrer || amount <= 0) {
    preview.classList.add('hidden');
    return;
  }

  const commission = Math.round(amount * COMMISSION_RATE * 100) / 100;
  valueEl.textContent = `${commission.toLocaleString('fr-FR')} FCFA`;
  preview.classList.remove('hidden');
}

function closeActivationModal() {
  document.getElementById('sub-modal').classList.remove('active');
  currentUserId = null;
  currentReferrer = null;
}

async function confirmActivation() {
  if (!currentUserId) return;

  const planSelect = document.getElementById('modal-plan');
  const selectedOption = planSelect.options[planSelect.selectedIndex];
  const planCode = planSelect.value;
  const planDays = parseInt(selectedOption.dataset.days);
  const customDays = document.getElementById('modal-days').value.trim();
  const days = customDays ? parseInt(customDays) : planDays;
  const amount = parseFloat(document.getElementById('modal-amount').value) || 0;
  const note = document.getElementById('modal-note').value.trim();

  if (!days || days <= 0) {
    showToast('Durée invalide', 'error');
    return;
  }

  const btn = document.getElementById('modal-confirm');
  btn.disabled = true;
  btn.textContent = 'Activation...';

  try {
    const { error } = await supabaseClient.rpc('admin_activate_subscription', {
      p_user_id: currentUserId,
      p_plan_code: planCode,
      p_days: days,
      p_amount: amount,
    });
    if (error) throw error;

    if (note) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        await supabaseClient.from('admin_actions').insert({
          admin_id: user.id,
          action: 'manual_subscription_note',
          target_type: 'user',
          target_id: currentUserId,
          details: { note, days, plan: planCode, amount },
        });
      } catch (e) { console.warn('[note]', e); }
    }

    let successMsg = `Abonnement de ${days} jours activé pour ${currentUserName}`;
    if (currentReferrer && currentReferrer.is_first_subscription && !currentReferrer.bonus_already_applied) {
      successMsg += ` (+${BONUS_DAYS[planCode]}j bonus parrainage)`;
    }
    if (amount > 0 && currentReferrer) {
      successMsg += `. Commission ${Math.round(amount * COMMISSION_RATE)} FCFA en attente.`;
    }

    showToast(successMsg, 'success', 6000);
    closeActivationModal();
    loadUsers();
  } catch (err) {
    console.error('[confirmActivation]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmer l'activation";
  }
}

// ============================================================
// MODALE ANNULATION
// ============================================================
async function openCancelModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  currentUserId = userId;
  currentUserName = user.full_name || 'Utilisateur';
  currentUserEmail = user.email;

  document.getElementById('cancel-user-name').textContent = currentUserName;
  document.getElementById('cancel-user-email').textContent = user.email;
  document.getElementById('cancel-reason').value = 'Erreur de paiement';
  document.getElementById('cancel-note').value = '';
  document.getElementById('cancel-refund').value = '';

  const infoText = document.getElementById('cancel-info-text');
  infoText.textContent = 'Chargement…';

  try {
    const { data: subs, error } = await supabaseClient
      .from('subscriptions')
      .select('id, plan_code, starts_at, expires_at, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!subs || subs.length === 0) {
      infoText.textContent = 'Aucun abonnement actif trouvé.';
      currentSubscription = null;
    } else {
      currentSubscription = subs[0];
      const exp = new Date(currentSubscription.expires_at);
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));

      infoText.innerHTML = `
        Formule : <strong>${currentSubscription.plan_code}</strong><br />
        Expire le : <strong>${exp.toLocaleDateString('fr-FR')}</strong><br />
        Jours restants : <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong>
      `;

      const suggestedPrice = PLAN_PRICES[currentSubscription.plan_code] || '';
      if (suggestedPrice) {
        document.getElementById('cancel-refund').value = suggestedPrice;
      }
    }

    document.getElementById('cancel-modal').classList.add('active');
  } catch (err) {
    console.error('[openCancelModal]', err);
    showToast('Erreur chargement abonnement : ' + err.message, 'error');
  }
}

function closeCancelModal() {
  document.getElementById('cancel-modal').classList.remove('active');
  currentUserId = null;
  currentSubscription = null;
}

async function confirmCancel() {
  if (!currentUserId) return;

  const reason = document.getElementById('cancel-reason').value;
  const note = document.getElementById('cancel-note').value.trim();
  const refundStr = document.getElementById('cancel-refund').value.trim();
  const refundAmount = refundStr ? parseFloat(refundStr) : null;

  if (!reason) {
    showToast('Le motif est obligatoire', 'error');
    return;
  }

  const reasonText = note ? `${reason} — ${note}` : reason;

  const btn = document.getElementById('cancel-confirm');
  btn.disabled = true;
  btn.textContent = 'Annulation...';

  try {
    const { error } = await supabaseClient.rpc('admin_cancel_subscription', {
      p_user_id: currentUserId,
      p_reason: reasonText,
      p_refund_amount: refundAmount,
    });
    if (error) throw error;

    let msg = `Abonnement annulé pour ${currentUserName}.`;
    if (refundAmount && refundAmount > 0) {
      msg += ` ⚠️ N'oublie pas de rembourser ${refundAmount} FCFA via Wave/Orange Money.`;
    }

    showToast(msg, 'success', 6000);
    closeCancelModal();
    loadUsers();
  } catch (err) {
    console.error('[confirmCancel]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmer l'annulation";
  }
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  let searchTimeout;
  document.getElementById('search-input')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderUsers, 250);
  });
  document.getElementById('filter-subscription')?.addEventListener('change', renderUsers);

  // Modale activation
  document.getElementById('modal-cancel')?.addEventListener('click', closeActivationModal);
  document.getElementById('modal-confirm')?.addEventListener('click', confirmActivation);
  document.getElementById('sub-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'sub-modal') closeActivationModal();
  });

  // Écouteurs pour mise à jour dynamique
  document.getElementById('modal-plan')?.addEventListener('change', (e) => {
    const planCode = e.target.value;
    const price = PLAN_PRICES[planCode];
    const amountInput = document.getElementById('modal-amount');
    if (amountInput && price) amountInput.value = price;
    updateReferralBonusLabel(planCode);
    updateCommissionPreview();
  });
  document.getElementById('modal-amount')?.addEventListener('input', updateCommissionPreview);

  // Modale annulation
  document.getElementById('cancel-dismiss')?.addEventListener('click', closeCancelModal);
  document.getElementById('cancel-confirm')?.addEventListener('click', confirmCancel);
  document.getElementById('cancel-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'cancel-modal') closeCancelModal();
  });

  loadUsers();
})();

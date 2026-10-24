// frontend/assets/js/admin-utilisateurs.js
// Gestion des utilisateurs : liste, recherche, activation manuelle d'abonnement.

let allUsers = [];
let currentUserId = null;
let currentUserName = null;
let currentUserEmail = null;

// ============================================================
// CHARGEMENT DES UTILISATEURS
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
// RENDU FILTRÉ
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
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attacher les listeners
  tbody.querySelectorAll('button[data-action="activate"]').forEach(btn => {
    btn.addEventListener('click', () => openSubscriptionModal(btn.dataset.id));
  });
}

// ============================================================
// MODALE D'ACTIVATION
// ============================================================
function openSubscriptionModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  currentUserId = userId;
  currentUserName = user.full_name || 'Utilisateur';
  currentUserEmail = user.email;

  document.getElementById('modal-user-name').textContent = currentUserName;
  document.getElementById('modal-user-email').textContent = user.email;
  document.getElementById('modal-plan').value = '30j';
  document.getElementById('modal-days').value = '';
  document.getElementById('modal-note').value = '';

  document.getElementById('sub-modal').classList.add('active');
}

function closeSubscriptionModal() {
  document.getElementById('sub-modal').classList.remove('active');
  currentUserId = null;
}

async function confirmSubscription() {
  if (!currentUserId) return;

  const planSelect = document.getElementById('modal-plan');
  const selectedOption = planSelect.options[planSelect.selectedIndex];
  const planCode = planSelect.value;
  const planDays = parseInt(selectedOption.dataset.days);
  const customDays = document.getElementById('modal-days').value.trim();
  const days = customDays ? parseInt(customDays) : planDays;
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
    });

    if (error) throw error;

    // Log la note dans admin_actions si fournie
    if (note) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        await supabaseClient.from('admin_actions').insert({
          admin_id: user.id,
          action: 'manual_subscription_note',
          target_type: 'user',
          target_id: currentUserId,
          details: { note, days, plan: planCode },
        });
      } catch (e) { console.warn('[note]', e); }
    }

    showToast(`Abonnement de ${days} jours activé pour ${currentUserName}`, 'success');
    closeSubscriptionModal();
    loadUsers();
  } catch (err) {
    console.error('[confirmSubscription]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmer l'activation";
  }
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  // Filtres
  let searchTimeout;
  document.getElementById('search-input')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderUsers, 250);
  });
  document.getElementById('filter-subscription')?.addEventListener('change', renderUsers);

  // Modale
  document.getElementById('modal-cancel')?.addEventListener('click', closeSubscriptionModal);
  document.getElementById('modal-confirm')?.addEventListener('click', confirmSubscription);
  document.getElementById('sub-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'sub-modal') closeSubscriptionModal();
  });

  loadUsers();
})();

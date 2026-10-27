// frontend/assets/js/admin-retraits.js
// Gestion des demandes de retrait — workflow en 2 étapes (valider → payer).

let allWithdrawals = [];
let currentWd = null;

const METHOD_LABELS = { wave: 'Wave', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money' };
const STATUS_LABELS = { pending: '⏳ En attente', approved: '🔄 En cours', paid: '✅ Payée', rejected: '❌ Rejetée' };
const STATUS_BADGES = { pending: 'badge-en_cours', approved: 'badge-en_cours', paid: 'badge-active', rejected: 'badge-none' };

async function loadWithdrawals() {
  const loading = document.getElementById('loading');
  const tbody = document.getElementById('withdrawals-body');
  const content = document.getElementById('content');
  if (loading) loading.style.display = 'flex';
  if (tbody) tbody.innerHTML = '';

  try {
    const { data: stats } = await supabaseClient.rpc('admin_withdrawal_stats');
    if (stats) {
      const cards = [
        { label: 'En attente', value: formatFCFA(stats.pending_amount), desc: `${stats.pending_count} demande(s)`, icon: '⏳', accent: 'accent-gold' },
        { label: 'Payé', value: formatFCFA(stats.paid_amount), desc: `${stats.paid_count} versement(s)`, icon: '✅', accent: 'accent-green' },
        { label: 'Rejeté', value: stats.rejected_count, desc: 'Demande(s) rejetée(s)', icon: '❌', accent: 'accent-red' },
      ];
      document.getElementById('stats-grid').innerHTML = cards.map(c => `
        <div class="stat-card ${c.accent}">
          <div class="stat-icon">${c.icon}</div>
          <div class="stat-label">${c.label}</div>
          <div class="stat-value">${c.value}</div>
          <div class="stat-desc">${c.desc}</div>
        </div>
      `).join('');
    }

    const { data, error } = await supabaseClient.rpc('admin_list_withdrawals', { p_status: null });
    if (error) throw error;

    allWithdrawals = data || [];
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
    renderWithdrawals();
  } catch (err) {
    console.error('[withdrawals]', err);
    if (loading) loading.style.display = 'none';
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;background:#FED7D7;color:#9B2C2C;">Erreur : ${escapeHtml(err.message || 'inconnue')}</td></tr>`;
  }
}

function renderWithdrawals() {
  const tbody = document.getElementById('withdrawals-body');
  const empty = document.getElementById('empty');
  const search = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const filterStatus = document.getElementById('filter-status')?.value || '';

  let filtered = allWithdrawals;
  if (search) filtered = filtered.filter(w => (w.user_name || '').toLowerCase().includes(search) || (w.user_email || '').toLowerCase().includes(search));
  if (filterStatus) filtered = filtered.filter(w => w.status === filterStatus);

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = filtered.map(w => {
    // Boutons selon le statut
    let actions = '';
    if (w.status === 'pending') {
      actions = `
        <button class="btn btn-primary btn-sm btn-validate" data-process="${w.id}">✅ Valider</button>
        <button class="btn btn-danger btn-sm" data-reject="${w.id}">❌ Rejeter</button>
      `;
    } else if (w.status === 'approved') {
      actions = `
        <button class="btn btn-pay btn-sm" data-process="${w.id}">💰 Marquer payé</button>
      `;
    } else {
      actions = '<span style="color:var(--gray-text);font-size:0.85rem;">—</span>';
    }

    return `
      <tr>
        <td data-label="Utilisateur">
          <strong>${escapeHtml(w.user_name) || '—'}</strong>
          <div style="font-size:0.78rem;color:var(--gray-text);">${escapeHtml(w.user_email)}</div>
        </td>
        <td data-label="Montant"><strong style="color:var(--green);font-family:Poppins;">${formatFCFA(w.amount)}</strong></td>
        <td data-label="Moyen"><span class="badge badge-none">${METHOD_LABELS[w.payment_method] || w.payment_method}</span></td>
        <td data-label="Numéro">${escapeHtml(w.payment_phone)}</td>
        <td data-label="Date">${formatDateFR(w.requested_at)}</td>
        <td data-label="Statut"><span class="badge ${STATUS_BADGES[w.status]}">${STATUS_LABELS[w.status]}</span></td>
        <td data-label="Action" style="text-align:right;">
          <div class="user-actions">${actions}</div>
        </td>
      </tr>
    `;
  }).join('');

  // Listeners
  tbody.querySelectorAll('button[data-process]').forEach(btn => {
    btn.addEventListener('click', () => openProcessModal(btn.dataset.process));
  });
  tbody.querySelectorAll('button[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => quickReject(btn.dataset.reject));
  });
}

function openProcessModal(id) {
  const w = allWithdrawals.find(x => x.id === id);
  if (!w) return;
  currentWd = w;

  // Adapter le titre et l'action selon le statut actuel
  const modalTitle = document.getElementById('modal-title');
  const actionSelect = document.getElementById('wd-action');

  if (w.status === 'pending') {
    modalTitle.textContent = '✅ Valider la demande';
    actionSelect.value = 'approved';
    // Cacher l'option "approved" (déjà sélectionnée) et "rejected" (utiliser le bouton rejeter)
    actionSelect.innerHTML = `
      <option value="approved">🔄 Valider (je vais effectuer le versement)</option>
      <option value="paid">✅ Marquer directement comme payée</option>
    `;
  } else if (w.status === 'approved') {
    modalTitle.textContent = '💰 Marquer comme payée';
    actionSelect.value = 'paid';
    actionSelect.innerHTML = `
      <option value="paid">✅ Payée (versement effectué)</option>
    `;
  }

  document.getElementById('wd-user').textContent = w.user_name || 'Utilisateur';
  document.getElementById('wd-contact').innerHTML = `${escapeHtml(w.user_email)}<br />${escapeHtml(w.user_phone || '—')}`;
  document.getElementById('wd-amount').textContent = formatFCFA(w.amount);
  document.getElementById('wd-method-info').innerHTML = `Vers <strong>${METHOD_LABELS[w.payment_method]}</strong> au <strong>${escapeHtml(w.payment_phone)}</strong>`;
  document.getElementById('wd-note').value = '';

  document.getElementById('wd-modal').classList.add('active');
}

function closeProcessModal() {
  document.getElementById('wd-modal').classList.remove('active');
  currentWd = null;
}

async function confirmProcess() {
  if (!currentWd) return;
  const action = document.getElementById('wd-action').value;
  const note = document.getElementById('wd-note').value.trim();

  let confirmMsg = '';
  if (action === 'approved') {
    confirmMsg = `Valider la demande de ${formatFCFA(currentWd.amount)} à ${currentWd.user_name} ?\n\nL'utilisateur verra "En cours de versement". Tu pourras ensuite marquer comme payée après avoir fait le versement.`;
  } else if (action === 'paid') {
    confirmMsg = `Confirmer que tu as effectivement versé ${formatFCFA(currentWd.amount)} à ${currentWd.user_name} via ${METHOD_LABELS[currentWd.payment_method]} ?\n\n⚠️ Les commissions associées seront automatiquement marquées comme payées.`;
  }

  if (confirmMsg && !confirm(confirmMsg)) return;

  const btn = document.getElementById('wd-confirm');
  btn.disabled = true;
  btn.textContent = 'Traitement...';

  try {
    const { error } = await supabaseClient.rpc('admin_process_withdrawal', {
      p_withdrawal_id: currentWd.id,
      p_new_status: action,
      p_note: note || null
    });
    if (error) throw error;

    let successMsg = '';
    if (action === 'approved') successMsg = '✅ Demande validée. Effectue le versement puis marque comme payée.';
    else if (action === 'paid') successMsg = '💰 Versement enregistré. Commissions soldées.';
    else successMsg = '❌ Demande rejetée.';

    showToast(successMsg, 'success', 5000);
    closeProcessModal();
    loadWithdrawals();
  } catch (err) {
    console.error('[process]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmer';
  }
}

async function quickReject(id) {
  const w = allWithdrawals.find(x => x.id === id);
  if (!w) return;

  const reason = prompt(
    `Rejeter la demande de ${formatFCFA(w.amount)} à ${w.user_name} ?\n\nMotif du rejet (obligatoire) :`,
    ''
  );
  if (reason === null) return; // Annulé
  if (!reason.trim()) {
    showToast('Motif obligatoire pour rejeter', 'error');
    return;
  }

  try {
    const { error } = await supabaseClient.rpc('admin_process_withdrawal', {
      p_withdrawal_id: id,
      p_new_status: 'rejected',
      p_note: reason.trim()
    });
    if (error) throw error;
    showToast('❌ Demande rejetée', 'success');
    loadWithdrawals();
  } catch (err) {
    console.error('[reject]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  }
}

function formatFCFA(amount) {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' F';
}

(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  let searchTimeout;
  document.getElementById('search-input')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderWithdrawals, 250);
  });
  document.getElementById('filter-status')?.addEventListener('change', renderWithdrawals);

  document.getElementById('wd-cancel')?.addEventListener('click', closeProcessModal);
  document.getElementById('wd-confirm')?.addEventListener('click', confirmProcess);
  document.getElementById('wd-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'wd-modal') closeProcessModal();
  });

  loadWithdrawals();
})();

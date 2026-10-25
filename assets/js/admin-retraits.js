// frontend/assets/js/admin-retraits.js
// Gestion des demandes de retrait (admin).

let allWithdrawals = [];
let currentWd = null;

const METHOD_LABELS = { wave: 'Wave', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money' };
const STATUS_LABELS = { pending: '⏳ En attente', approved: '🔄 Approuvée', paid: '✅ Payée', rejected: '❌ Rejetée' };
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

  tbody.innerHTML = filtered.map(w => `
    <tr>
      <td data-label="Utilisateur">
        <strong>${escapeHtml(w.user_name) || '—'}</strong>
        <div style="font-size:0.78rem;color:var(--gray-text);">${escapeHtml(w.user_email)}</div>
      </td>
      <td data-label="Montant"><strong style="color:var(--green);font-family:Poppins;">${formatFCFA(w.amount)}</strong></td>
      <td data-label="Moyen"><span class="wd-method-badge">${METHOD_LABELS[w.payment_method] || w.payment_method}</span></td>
      <td data-label="Numéro">${escapeHtml(w.payment_phone)}</td>
      <td data-label="Date">${formatDateFR(w.requested_at)}</td>
      <td data-label="Statut"><span class="badge ${STATUS_BADGES[w.status]}">${STATUS_LABELS[w.status]}</span></td>
      <td data-label="Action" style="text-align:right;">
        ${w.status === 'pending' || w.status === 'approved'
          ? `<button class="btn btn-primary btn-sm" data-process="${w.id}">Traiter</button>`
          : '<span style="color:var(--gray-text);font-size:0.85rem;">—</span>'}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('button[data-process]').forEach(btn => {
    btn.addEventListener('click', () => openProcessModal(btn.dataset.process));
  });
}

function openProcessModal(id) {
  const w = allWithdrawals.find(x => x.id === id);
  if (!w) return;
  currentWd = w;
  document.getElementById('wd-user').textContent = w.user_name || 'Utilisateur';
  document.getElementById('wd-contact').innerHTML = `${escapeHtml(w.user_email)}<br />${escapeHtml(w.user_phone || '—')}`;
  document.getElementById('wd-amount').textContent = formatFCFA(w.amount);
  document.getElementById('wd-method-info').innerHTML = `Vers <strong>${METHOD_LABELS[w.payment_method]}</strong> au <strong>${escapeHtml(w.payment_phone)}</strong>`;
  document.getElementById('wd-new-status').value = 'paid';
  document.getElementById('wd-note').value = '';
  document.getElementById('wd-modal').classList.add('active');
}

function closeProcessModal() {
  document.getElementById('wd-modal').classList.remove('active');
  currentWd = null;
}

async function confirmProcess() {
  if (!currentWd) return;
  const newStatus = document.getElementById('wd-new-status').value;
  const note = document.getElementById('wd-note').value.trim();

  if (newStatus === 'paid') {
    const ok = confirm(`Confirmer que tu as effectivement versé ${formatFCFA(currentWd.amount)} à ${currentWd.user_name} ?\n\n⚠️ Assure-toi d'avoir fait le versement sur ${METHOD_LABELS[currentWd.payment_method]} AVANT de confirmer.`);
    if (!ok) return;
  }

  const btn = document.getElementById('wd-confirm');
  btn.disabled = true;
  btn.textContent = 'Traitement...';

  try {
    const { error } = await supabaseClient.rpc('admin_process_withdrawal', {
      p_withdrawal_id: currentWd.id,
      p_new_status: newStatus,
      p_note: note || null
    });
    if (error) throw error;
    showToast('✅ Demande traitée', 'success', 4000);
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

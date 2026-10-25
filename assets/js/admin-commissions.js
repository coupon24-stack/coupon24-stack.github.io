// frontend/assets/js/admin-commissions.js
// Gestion des commissions de parrainage (admin).

let allCommissions = [];

async function loadCommissions() {
  const loading = document.getElementById('loading');
  const tbody = document.getElementById('commissions-body');
  const content = document.getElementById('content');

  if (loading) loading.style.display = 'flex';
  if (tbody) tbody.innerHTML = '';

  try {
    // Stats
    const { data: stats, error: statsErr } = await supabaseClient.rpc('admin_commission_stats');
    if (!statsErr && stats) {
      const cards = [
        { label: 'À payer', value: formatFCFA(stats.total_pending), desc: `${stats.count_pending} commission(s) en attente`, icon: '⏳', accent: 'accent-gold' },
        { label: 'Déjà payé', value: formatFCFA(stats.total_paid), desc: `${stats.count_paid} commission(s) versée(s)`, icon: '✅', accent: 'accent-green' },
        { label: 'Parrains actifs', value: stats.referrers_count || 0, desc: 'Parrains ayant généré au moins 1 commission', icon: '👥', accent: 'accent-blue' },
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

    // Liste
    const { data, error } = await supabaseClient.rpc('admin_list_commissions', { p_status: null });
    if (error) throw error;

    allCommissions = data || [];
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    renderCommissions();
  } catch (err) {
    console.error('[commissions]', err);
    if (loading) loading.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;background:#FED7D7;color:#9B2C2C;">Erreur : ${escapeHtml(err.message || 'inconnue')}</td></tr>`;
    }
  }
}

function renderCommissions() {
  const tbody = document.getElementById('commissions-body');
  const empty = document.getElementById('empty');
  const search = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const filterStatus = document.getElementById('filter-status')?.value || '';

  let filtered = allCommissions;

  if (search) {
    filtered = filtered.filter(c =>
      (c.referrer_name || '').toLowerCase().includes(search) ||
      (c.referrer_email || '').toLowerCase().includes(search) ||
      (c.referred_name || '').toLowerCase().includes(search) ||
      (c.referred_email || '').toLowerCase().includes(search)
    );
  }
  if (filterStatus) {
    filtered = filtered.filter(c => c.status === filterStatus);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const statusLabels = { pending: '⏳ À payer', paid: '✅ Payée', cancelled: '⊘ Annulée' };
  const statusBadges = { pending: 'badge-en_cours', paid: 'badge-active', cancelled: 'badge-none' };

  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td data-label="Parrain">
        <strong>${escapeHtml(c.referrer_name) || '—'}</strong>
        <div class="referrer-cell">${escapeHtml(c.referrer_email)}</div>
      </td>
      <td data-label="Filleul">
        <strong>${escapeHtml(c.referred_name) || '—'}</strong>
        <div class="referrer-cell">${escapeHtml(c.referred_email)}</div>
      </td>
      <td data-label="Formule">
        <span class="badge badge-${c.plan_code === 'annuel' ? 'premium' : 'gratuit'}">${escapeHtml(c.plan_code)}</span>
      </td>
      <td data-label="Montant payé">${formatFCFA(c.amount_paid)}</td>
      <td data-label="Commission"><span class="commission-amount">${formatFCFA(c.commission_amount)}</span></td>
      <td data-label="Statut"><span class="badge ${statusBadges[c.status] || 'badge-none'}">${statusLabels[c.status] || c.status}</span></td>
      <td data-label="Date">${formatDateFR(c.created_at)}</td>
      <td data-label="Action" style="text-align:right;">
        ${c.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-mark="${c.id}" data-amount="${c.commission_amount}" data-name="${escapeAttr(c.referrer_name)}">Marquer payée</button>` : '<span style="color:var(--gray-text);font-size:0.85rem;">—</span>'}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('button[data-mark]').forEach(btn => {
    btn.addEventListener('click', () => markPaid(btn.dataset.mark, btn.dataset.amount, btn.dataset.name));
  });
}

async function markPaid(id, amount, name) {
  const amountStr = formatFCFA(amount);
  const ok = confirm(
    `Marquer la commission de ${amountStr} comme payée à ${name} ?\n\n` +
    `⚠️ Assure-toi d'avoir effectivement versé ${amountStr} au parrain via Wave/Orange Money AVANT de confirmer.`
  );
  if (!ok) return;

  try {
    const { error } = await supabaseClient.rpc('admin_mark_commission_paid', { p_commission_id: id });
    if (error) throw error;
    showToast(`✅ Commission de ${amountStr} marquée comme payée`, 'success', 5000);
    loadCommissions();
  } catch (err) {
    console.error('[markPaid]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  }
}

// Helpers
function formatFCFA(amount) {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' F';
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// Init
(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  let searchTimeout;
  document.getElementById('search-input')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderCommissions, 250);
  });
  document.getElementById('filter-status')?.addEventListener('change', renderCommissions);

  loadCommissions();
})();

// frontend/assets/js/admin-resultats.js
// Mise à jour des résultats des matchs pour un coupon donné.

let coupons = [];
let currentCouponId = null;
let currentCoupon = null;
let currentSelections = [];

const RESULT_LABELS = {
  en_attente: '⏳ En attente',
  gagnee: '✅ Gagnée',
  perdue: '❌ Perdue',
  annulee: '⊘ Annulée'
};

// ============================================================
// CHARGEMENT DES COUPONS
// ============================================================
async function loadCoupons() {
  const loading = document.getElementById('loading');
  const layout = document.getElementById('layout');
  const list = document.getElementById('coupon-list');

  if (loading) loading.style.display = 'flex';
  if (layout) layout.style.display = 'none';

  try {
    const { data, error } = await supabaseClient
      .from('coupons')
      .select('id, title, category, status, publication_date, matches_date')
      .in('status', ['disponible', 'en_cours', 'termine'])
      .order('publication_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    coupons = data || [];

    if (loading) loading.style.display = 'none';
    if (layout) layout.style.display = 'grid';

    if (coupons.length === 0) {
      if (list) list.innerHTML = `<p style="text-align:center;color:var(--gray-text);padding:20px;font-size:0.85rem;">Aucun coupon publié.</p>`;
      return;
    }

    renderCouponList();
  } catch (err) {
    console.error('[resultats] erreur chargement:', err);
    if (loading) loading.style.display = 'none';
    showAlert('Erreur : ' + (err.message || 'inconnue'));
  }
}

function renderCouponList() {
  const list = document.getElementById('coupon-list');
  if (!list) return;

  const statusLabels = { disponible: 'Dispo', en_cours: 'En cours', termine: 'Terminé' };

  list.innerHTML = coupons.map(c => `
    <div class="coupon-item ${c.id === currentCouponId ? 'active' : ''}" data-id="${c.id}">
      <div class="ci-title">${escapeHtml(c.title)}</div>
      <div class="ci-meta">
        <span class="badge badge-${c.category}" style="font-size:0.65rem;padding:2px 8px;">${c.category}</span>
        <span class="badge badge-${c.status}" style="font-size:0.65rem;padding:2px 8px;">${statusLabels[c.status] || c.status}</span>
        <span>${formatDateFR(c.publication_date)}</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.coupon-item').forEach(el => {
    el.addEventListener('click', () => selectCoupon(el.dataset.id));
  });
}

// ============================================================
// SÉLECTION D'UN COUPON
// ============================================================
async function selectCoupon(couponId) {
  currentCouponId = couponId;
  currentCoupon = coupons.find(c => c.id === couponId) || null;

  // Rafraîchir la liste pour l'état actif
  renderCouponList();

  const panelEmpty = document.getElementById('panel-empty');
  const panelContent = document.getElementById('panel-content');
  const panelTitle = document.getElementById('panel-title');
  const panelBadges = document.getElementById('panel-badges');
  const panelSels = document.getElementById('panel-selections');

  if (panelEmpty) panelEmpty.style.display = 'none';
  if (panelContent) panelContent.style.display = 'block';
  if (panelTitle) panelTitle.textContent = 'Chargement...';
  if (panelBadges) panelBadges.innerHTML = '';
  if (panelSels) panelSels.innerHTML = '';

  try {
    const { data: sels, error } = await supabaseClient
      .from('selections')
      .select('*')
      .eq('coupon_id', couponId)
      .order('match_order', { ascending: true });

    if (error) throw error;
    currentSelections = sels || [];

    if (!currentCoupon) return;

    if (panelTitle) panelTitle.textContent = currentCoupon.title;

    const statusLabels = { disponible: 'Disponible', en_cours: 'En cours', termine: 'Terminé' };
    if (panelBadges) {
      panelBadges.innerHTML = `
        <span class="badge badge-${currentCoupon.category}">${currentCoupon.category}</span>
        <span class="badge badge-${currentCoupon.status}">${statusLabels[currentCoupon.status] || currentCoupon.status}</span>
        <span class="badge badge-none">${currentSelections.length} match${currentSelections.length > 1 ? 's' : ''}</span>
      `;
    }

    renderSelections();
  } catch (err) {
    console.error('[resultats] erreur sélections:', err);
    if (panelTitle) panelTitle.textContent = 'Erreur de chargement';
    showToast('Impossible de charger les matchs', 'error');
  }
}

// ============================================================
// RENDU DES SÉLECTIONS
// ============================================================
function renderSelections() {
  const tbody = document.getElementById('panel-selections');
  if (!tbody) return;

  if (currentSelections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--gray-text);">Aucun match dans ce coupon.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentSelections.map((s, i) => {
    const buttons = ['en_attente', 'gagnee', 'perdue', 'annulee'].map(r => `
      <button type="button" class="result-btn result-${r} ${s.result === r ? 'active' : ''}" data-index="${i}" data-result="${r}">
        ${RESULT_LABELS[r]}
      </button>
    `).join('');

    return `
      <tr>
        <td data-label="Match">
          <span class="match-teams">${escapeHtml(s.home_team)} vs ${escapeHtml(s.away_team)}</span>
          <span class="match-comp">${escapeHtml(s.competition) || '—'} · ${formatDateTimeFR(s.match_date)}</span>
        </td>
        <td data-label="Pronostic">
          <span class="prediction-badge">${escapeHtml(s.prediction)}</span>
          ${s.odds ? `<div style="font-size:0.78rem;color:var(--gray-text);margin-top:4px;">Cote : ${s.odds}</div>` : ''}
        </td>
        <td data-label="Résultat">
          <div class="result-buttons">${buttons}</div>
        </td>
      </tr>
    `;
  }).join('');

  // Attacher les listeners
  tbody.querySelectorAll('button.result-btn').forEach(btn => {
    btn.addEventListener('click', () => changeResult(
      parseInt(btn.dataset.index),
      btn.dataset.result
    ));
  });
}

function changeResult(index, newResult) {
  if (!currentSelections[index]) return;
  currentSelections[index].result = newResult;
  renderSelections();
}

// ============================================================
// SAUVEGARDE
// ============================================================
async function saveResults() {
  if (!currentCouponId || currentSelections.length === 0) return;

  const saveBtn = document.getElementById('save-results-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement...'; }

  try {
    // Mise à jour sélection par sélection
    for (const s of currentSelections) {
      const { error } = await supabaseClient
        .from('selections')
        .update({ result: s.result })
        .eq('id', s.id);
      if (error) throw error;
    }

    // Déterminer le nouveau statut du coupon
    const allResolved = currentSelections.every(s => s.result !== 'en_attente');
    const hasLost = currentSelections.some(s => s.result === 'perdue');
    const hasWin = currentSelections.some(s => s.result === 'gagnee');

    let newStatus = currentCoupon.status;
    if (allResolved) {
      newStatus = 'termine'; // Tous les matchs joués → coupon terminé
    } else if (hasWin || hasLost) {
      newStatus = 'en_cours'; // Certains matchs joués → en cours
    }

    if (newStatus !== currentCoupon.status) {
      const { error: e2 } = await supabaseClient
        .from('coupons')
        .update({ status: newStatus })
        .eq('id', currentCouponId);
      if (e2) throw e2;

      currentCoupon.status = newStatus;
      // Rafraîchir la liste
      const idx = coupons.findIndex(c => c.id === currentCouponId);
      if (idx !== -1) coupons[idx].status = newStatus;
      renderCouponList();
    }

    // Journal d'audit
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient.from('admin_actions').insert({
        admin_id: user.id,
        action: 'update_results',
        target_type: 'coupon',
        target_id: currentCouponId,
        details: {
          title: currentCoupon.title,
          results: currentSelections.map(s => ({ id: s.id, result: s.result })),
          new_status: newStatus
        }
      });
    } catch (e) { console.warn('[audit]', e); }

    showToast('Résultats enregistrés', 'success');
  } catch (err) {
    console.error('[saveResults]', err);
    showToast('Erreur : ' + (err.message || 'inconnue'), 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer les résultats'; }
  }
}

async function resetAll() {
  if (!currentCouponId) return;
  if (!confirm('Remettre tous les matchs en attente ?')) return;

  currentSelections.forEach(s => { s.result = 'en_attente'; });
  renderSelections();
  await saveResults();
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  document.getElementById('save-results-btn')?.addEventListener('click', saveResults);
  document.getElementById('reset-btn')?.addEventListener('click', resetAll);

  loadCoupons();
})();

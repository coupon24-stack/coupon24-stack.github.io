// frontend/assets/js/coupon-detail.js
// Charge et affiche un coupon. Si verrouillé, ne tente pas de charger les sélections.

(async function init() {
  const loading = document.getElementById('loading');
  const container = document.getElementById('coupon-container');
  const errorBox = document.getElementById('error-box');

  const params = new URLSearchParams(window.location.search);
  const couponId = params.get('id');

  if (!couponId) {
    showError('Aucun coupon spécifié dans l\'URL.');
    return;
  }

  try {
    if (typeof supabaseClient === 'undefined') {
      throw new Error('supabaseClient non chargé.');
    }

    // 1. Charger les métadonnées (vue publique, jamais de pronostics dedans)
    const { data: meta, error: metaError } = await supabaseClient
      .from('coupons_list')
      .select('*')
      .eq('id', couponId)
      .maybeSingle();

    if (metaError) throw metaError;
    if (!meta) {
      showError('Ce coupon est introuvable ou a été archivé.');
      return;
    }

    document.title = `${meta.title} — COUPON24`;
    const breadcrumb = document.getElementById('breadcrumb-title');
    if (breadcrumb) breadcrumb.textContent = meta.title;

    // 2. Si verrouillé → panneau de verrouillage, AUCUNE requête sur selections
    if (meta.is_locked) {
      if (loading) loading.style.display = 'none';
      if (container) {
        container.style.display = 'block';
        container.innerHTML = renderCouponHeader(meta) + renderLockedPanel();
      }
      return;
    }

    // 3. Sinon, charger les sélections (RLS autorise l'accès)
    const { data: selections, error: selError } = await supabaseClient
      .from('selections')
      .select('*')
      .eq('coupon_id', couponId)
      .order('match_order', { ascending: true });

    if (selError) throw selError;

    if (loading) loading.style.display = 'none';
    if (container) {
      container.style.display = 'block';
      container.innerHTML = renderCouponHeader(meta) + renderSelections(selections || [], meta);
    }

  } catch (err) {
    console.error('[coupon-detail] erreur:', err);
    showError('Impossible de charger ce coupon. ' + (err.message || 'Réessaie plus tard.'));
  }

  function showError(msg) {
    if (loading) loading.style.display = 'none';
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }
  }
})();

function renderCouponHeader(c) {
  const datePub = formatDate(c.publication_date);
  const dateMatch = formatDate(c.matches_date);
  const bg = c.cover_image ? `background-image:url('${escapeAttr(c.cover_image)}');` : '';
  const catBadge = c.category === 'gratuit'
    ? '<span class="badge badge-gratuit">Gratuit</span>'
    : '<span class="badge badge-premium">Premium</span>';
  const statusLabels = { disponible: 'Disponible', en_cours: 'En cours', termine: 'Terminé' };
  const oddsDisplay = c.is_locked ? '🔒' : (c.total_odds ?? '—');

  return `
    <div class="coupon-header">
      <div class="coupon-hero" style="${bg}">
        <div class="coupon-hero-content">
          <div class="coupon-badges">
            ${catBadge}
            <span class="badge badge-status">${statusLabels[c.status] || c.status}</span>
          </div>
          <h1>${escapeHtml(c.title)}</h1>
        </div>
      </div>
      <div class="coupon-meta-block">
        <div class="meta-item">
          <div class="label">Publication</div>
          <div class="value">${datePub}</div>
        </div>
        <div class="meta-item">
          <div class="label">Matchs</div>
          <div class="value">${dateMatch}</div>
        </div>
        <div class="meta-item">
          <div class="label">Type</div>
          <div class="value">${escapeHtml(c.type)}</div>
        </div>
        <div class="meta-item">
          <div class="label">Nombre de matchs</div>
          <div class="value">${c.matches_count || 0}</div>
        </div>
        <div class="meta-item">
          <div class="label">Cote totale</div>
          <div class="value highlight">${oddsDisplay}</div>
        </div>
      </div>
    </div>
  `;
}

function renderLockedPanel() {
  return `
    <div class="card locked-panel">
      <div class="locked-icon">🔒</div>
      <h2>Coupon premium</h2>
      <p>Ce coupon est réservé aux abonnés COUPON24. Souscris à une formule pour accéder aux pronostics et aux analyses détaillées.</p>
      <div class="locked-cta">
        <a href="/abonnements.html" class="btn btn-primary">Voir les abonnements</a>
        <a href="/connexion.html" class="btn btn-outline">Se connecter</a>
      </div>
    </div>
  `;
}

function renderSelections(selections, coupon) {
  if (!selections || selections.length === 0) {
    return `<div class="card"><p style="text-align:center;color:var(--gray-text);">Aucune sélection renseignée pour ce coupon.</p></div>`;
  }

  const rows = selections.map(s => {
    const resultLabel = {
      en_attente: 'En attente',
      gagnee: 'Gagnée',
      perdue: 'Perdue',
      annulee: 'Annulée',
    }[s.result] || s.result;

    return `
      <tr>
        <td>
          <span class="match-teams">${escapeHtml(s.home_team)} vs ${escapeHtml(s.away_team)}</span>
          <span class="match-comp">${escapeHtml(s.competition)} — ${formatDateTime(s.match_date)}</span>
        </td>
        <td>${escapeHtml(s.market)}</td>
        <td>
          <span class="prediction-badge">${escapeHtml(s.prediction)}</span>
          <span class="result-badge result-${s.result}">${resultLabel}</span>
        </td>
        <td>${s.odds ?? '—'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card">
      <h2>🎯 Sélections (${selections.length})</h2>
      <table class="selections-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Marché</th>
            <th>Pronostic</th>
            <th>Cote</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${coupon.total_odds ? `
        <div class="total-odds-box">
          <span class="label">Cote totale du coupon</span>
          <span class="value">${coupon.total_odds}</span>
        </div>
      ` : ''}
    </div>
  `;
}

// Helpers
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

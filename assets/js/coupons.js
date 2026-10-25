// frontend/assets/js/coupons.js
// Chargement et affichage des coupons depuis la vue coupons_list.
// Impose l'authentification pour voir le détail d'un coupon.

const state = {
  page: 1,
  pageSize: 9,
  filters: { search: '', category: '', status: '' },
  total: 0,
  isAuthenticated: false,
};

async function loadCoupons() {
  const grid = document.getElementById('coupons-grid');
  const loading = document.getElementById('loading');
  const empty = document.getElementById('empty');
  const pagination = document.getElementById('pagination');

  if (loading) loading.style.display = 'flex';
  if (grid) grid.innerHTML = '';
  if (empty) empty.style.display = 'none';
  if (pagination) pagination.innerHTML = '';

  try {
    if (typeof supabaseClient === 'undefined') {
      throw new Error('supabaseClient non chargé.');
    }

    // Vérifier l'authentification AVANT de charger les coupons
    const { data: { session } } = await supabaseClient.auth.getSession();
    state.isAuthenticated = !!session;

    let query = supabaseClient
      .from('coupons_list')
      .select('*', { count: 'exact' })
      .order('publication_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (state.filters.category) query = query.eq('category', state.filters.category);
    if (state.filters.status) query = query.eq('status', state.filters.status);
    if (state.filters.search) query = query.ilike('title', `%${state.filters.search}%`);

    const from = (state.page - 1) * state.pageSize;
    const to = from + state.pageSize - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    state.total = count || 0;
    if (loading) loading.style.display = 'none';

    if (!data || data.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }

    grid.innerHTML = data.map(renderCard).join('');
    renderPagination();
  } catch (err) {
    console.error('[coupons] erreur:', err);
    if (loading) loading.style.display = 'none';
    if (grid) {
      grid.innerHTML = `<div style="grid-column:1/-1;background:#FED7D7;color:#9B2C2C;padding:20px;border-radius:12px;text-align:center;">
        Impossible de charger les coupons : ${escapeHtml(err.message || 'erreur inconnue')}
      </div>`;
    }
  }
}

function renderCard(c) {
  const isLocked = c.is_locked;
  const isAuth = state.isAuthenticated;
  const datePub = formatDate(c.publication_date);
  const badge = c.category === 'gratuit'
    ? `<span class="coupon-badge badge-gratuit">Gratuit</span>`
    : `<span class="coupon-badge badge-premium">Premium</span>`;
  const lockOverlay = isLocked ? `<div class="lock-icon">🔒</div>` : '';
  const oddsDisplay = isLocked
    ? `<div class="value">🔒</div>`
    : `<div class="value">${c.total_odds ?? '—'}</div>`;
  const statusLabels = {
    disponible: 'Disponible', en_cours: 'En cours', termine: 'Terminé', archive: 'Archivé',
  };

  // Logique de redirection selon l'état d'authentification
  let ctaLabel, ctaHref;
  const couponUrl = `/coupon-detail.html?id=${c.id}`;

  if (!isAuth) {
    // Non connecté → forcer l'inscription avec retour vers le coupon
    ctaLabel = 'Se connecter pour voir';
    ctaHref = `/inscription.html?redirect=${encodeURIComponent(couponUrl)}`;
  } else if (isLocked) {
    // Connecté mais pas abonné + premium → abonnement
    ctaLabel = "S'abonner pour voir";
    ctaHref = '/abonnements.html';
  } else {
    // Connecté et autorisé
    ctaLabel = 'Voir le coupon';
    ctaHref = couponUrl;
  }

  const bgStyle = c.cover_image ? `background-image: url('${escapeAttr(c.cover_image)}');` : '';
  const matchCount = c.matches_count || 0;

  return `
    <article class="coupon-card ${isLocked ? 'locked' : ''}">
      <div class="coupon-image" style="${bgStyle}">
        ${badge}
        ${lockOverlay}
      </div>
      <div class="coupon-body">
        <h3 class="coupon-title">${escapeHtml(c.title)}</h3>
        <div class="coupon-meta">
          <span>📅 ${datePub}</span>
          <span>⚽ ${matchCount} match${matchCount > 1 ? 's' : ''}</span>
        </div>
        <div class="coupon-stats">
          <div class="coupon-stat">
            <div class="value">${matchCount}</div>
            <div class="label">Matchs</div>
          </div>
          <div class="coupon-stat">
            ${oddsDisplay}
            <div class="label">Cote totale</div>
          </div>
        </div>
        <span class="coupon-status status-${c.status}">● ${statusLabels[c.status] || c.status}</span>
        <a href="${ctaHref}" class="btn btn-primary">${ctaLabel}</a>
      </div>
    </article>
  `;
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (!el) return;
  const totalPages = Math.ceil(state.total / state.pageSize);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = `<button ${state.page === 1 ? 'disabled' : ''} data-page="${state.page - 1}">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) {
      html += `<button class="${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (Math.abs(i - state.page) === 2) {
      html += `<span style="align-self:center;padding:0 4px;color:var(--gray-text);">…</span>`;
    }
  }
  html += `<button ${state.page === totalPages ? 'disabled' : ''} data-page="${state.page + 1}">›</button>`;
  el.innerHTML = html;

  el.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages && p !== state.page) {
        state.page = p;
        loadCoupons();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

let searchTimeout;
document.getElementById('search-input')?.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.filters.search = e.target.value.trim();
    state.page = 1;
    loadCoupons();
  }, 400);
});
document.getElementById('filter-category')?.addEventListener('change', (e) => {
  state.filters.category = e.target.value;
  state.page = 1;
  loadCoupons();
});
document.getElementById('filter-status')?.addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  state.page = 1;
  loadCoupons();
});

if (document.getElementById('coupons-grid')) {
  loadCoupons();
}

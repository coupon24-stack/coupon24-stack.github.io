// frontend/assets/js/admin-coupons.js
// Chargement, filtres, duplication et suppression des coupons (admin).

const cState = {
  page: 1,
  pageSize: 20,
  filters: { search: '', category: '', status: '' },
  total: 0,
  rows: [],
};

async function loadCouponsAdmin() {
  const loading = document.getElementById('loading');
  const tbody = document.getElementById('coupons-body');

  if (loading) loading.style.display = 'flex';
  if (tbody) tbody.innerHTML = '';

  try {
    let q = supabaseClient
      .from('coupons')
      .select('id, title, category, type, status, publication_date, matches_date, total_odds, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (cState.filters.category) q = q.eq('category', cState.filters.category);
    if (cState.filters.status) q = q.eq('status', cState.filters.status);
    if (cState.filters.search) q = q.ilike('title', `%${cState.filters.search}%`);

    const from = (cState.page - 1) * cState.pageSize;
    const to = from + cState.pageSize - 1;
    const { data, count, error } = await q.range(from, to);

    if (error) throw error;

    cState.total = count || 0;
    cState.rows = data || [];
    if (loading) loading.style.display = 'none';

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-text);">Aucun coupon trouvé.</td></tr>`;
      return;
    }

    const labels = {
      disponible: 'Disponible',
      en_cours: 'En cours',
      termine: 'Terminé',
      brouillon: 'Brouillon',
      archive: 'Archivé'
    };

    tbody.innerHTML = data.map(c => `
      <tr data-id="${c.id}">
        <td data-label="Titre"><strong>${escapeHtml(c.title)}</strong></td>
        <td data-label="Catégorie"><span class="badge badge-${c.category}">${c.category}</span></td>
        <td data-label="Type">${escapeHtml(c.type || '—')}</td>
        <td data-label="Publication">${formatDateFR(c.publication_date)}</td>
        <td data-label="Matchs">${formatDateFR(c.matches_date)}</td>
        <td data-label="Cote">${c.total_odds ?? '—'}</td>
        <td data-label="Statut"><span class="badge badge-${c.status}">${labels[c.status] || c.status}</span></td>
        <td data-label="Actions">
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
            <a href="/admin/coupon-edit.html?id=${c.id}" class="btn btn-outline btn-sm">Éditer</a>
            <button class="btn btn-outline btn-sm" data-action="duplicate" data-id="${c.id}">Dupliquer</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">Suppr.</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.id));
    });

    renderPagination();
  } catch (err) {
    console.error('[coupons-admin] erreur:', err);
    if (loading) loading.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;background:#FED7D7;color:#9B2C2C;">Erreur : ${escapeHtml(err.message || 'inconnue')}</td></tr>`;
    }
  }
}

async function handleAction(action, id) {
  const row = cState.rows.find(r => r.id === id);
  if (!row) return;

  if (action === 'delete') {
    if (!confirm(`Supprimer définitivement le coupon "${row.title}" ?\nCette action est irréversible.`)) return;
    const { error } = await supabaseClient.from('coupons').delete().eq('id', id);
    if (error) return showToast('Erreur : ' + error.message, 'error');
    await logAction('delete_coupon', 'coupon', id, { title: row.title });
    showToast('Coupon supprimé', 'success');
    loadCouponsAdmin();
  }

  if (action === 'duplicate') {
    try {
      const { data: orig, error: e1 } = await supabaseClient.from('coupons').select('*').eq('id', id).single();
      if (e1) throw e1;

      const { data: { user } } = await supabaseClient.auth.getUser();

      const { data: created, error: e2 } = await supabaseClient.from('coupons').insert({
        title: orig.title + ' (copie)',
        description: orig.description,
        publication_date: orig.publication_date,
        matches_date: orig.matches_date,
        category: orig.category,
        type: orig.type,
        cover_image: orig.cover_image,
        status: 'brouillon',
        created_by: user.id,
      }).select().single();

      if (e2) throw e2;

      const { data: sels } = await supabaseClient.from('selections').select('*').eq('coupon_id', id);
      if (sels && sels.length > 0) {
        const newSels = sels.map(s => ({
          coupon_id: created.id,
          match_order: s.match_order,
          competition: s.competition,
          home_team: s.home_team,
          away_team: s.away_team,
          match_date: s.match_date,
          market: s.market,
          prediction: s.prediction,
          odds: s.odds,
          result: 'en_attente',
        }));
        const { error: e3 } = await supabaseClient.from('selections').insert(newSels);
        if (e3) console.warn('Duplication sélections partielle:', e3);
      }

      await logAction('duplicate_coupon', 'coupon', created.id, { source_id: id });
      showToast('Coupon dupliqué en brouillon', 'success');
      loadCouponsAdmin();
    } catch (err) {
      console.error('[duplicate]', err);
      showToast('Erreur duplication : ' + (err.message || 'inconnue'), 'error');
    }
  }
}

async function logAction(action, targetType, targetId, details = {}) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('admin_actions').insert({
      admin_id: user ? user.id : null,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
    });
  } catch (e) {
    console.warn('[logAction] échec:', e);
  }
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (!el) return;
  const totalPages = Math.ceil(cState.total / cState.pageSize);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="btn btn-outline btn-sm" ${cState.page === 1 ? 'disabled' : ''} data-page="${cState.page - 1}">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - cState.page) <= 1) {
      html += `<button class="btn ${i === cState.page ? 'btn-primary' : 'btn-outline'} btn-sm" data-page="${i}">${i}</button>`;
    } else if (Math.abs(i - cState.page) === 2) {
      html += `<span style="align-self:center;padding:0 4px;">…</span>`;
    }
  }
  html += `<button class="btn btn-outline btn-sm" ${cState.page === totalPages ? 'disabled' : ''} data-page="${cState.page + 1}">›</button>`;
  el.innerHTML = html;

  el.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages && p !== cState.page) {
        cState.page = p;
        loadCouponsAdmin();
      }
    });
  });
}

// Init
(async function() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  let searchTimeout;
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      cState.filters.search = e.target.value.trim();
      cState.page = 1;
      loadCouponsAdmin();
    }, 350);
  });
  document.getElementById('filter-category')?.addEventListener('change', (e) => {
    cState.filters.category = e.target.value;
    cState.page = 1;
    loadCouponsAdmin();
  });
  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    cState.filters.status = e.target.value;
    cState.page = 1;
    loadCouponsAdmin();
  });

  loadCouponsAdmin();
})();

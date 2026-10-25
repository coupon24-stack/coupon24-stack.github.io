// frontend/assets/js/admin-coupon-edit.js
// Formulaire de création/édition de coupon — avec matchs dynamiques et code bookmaker.

let editingId = null;
let selections = [];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// RENDU DES SÉLECTIONS
// ============================================================
function renderSelections() {
  const container = document.getElementById('selections-container');
  if (!container) return;

  if (selections.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--gray-text);padding:20px;font-size:0.9rem;">Aucun match ajouté. Clique sur le bouton ci-dessous.</p>`;
    updateRecap();
    return;
  }

  container.innerHTML = selections.map((s, i) => `
    <div class="selection-card" data-index="${i}">
      <div class="selection-header">
        <span class="selection-number">Match ${i + 1}</span>
        <button type="button" class="remove-selection" data-remove="${i}">🗑️ Supprimer</button>
      </div>
      <div class="selection-grid">
        <div class="form-field" style="grid-column: 1 / -1;">
          <label>Compétition</label>
          <input type="text" data-field="competition" data-index="${i}" value="${escapeHtml(s.competition || '')}" placeholder="Ex: Serie A, Ligue 1, Champions League..." />
        </div>
        <div class="form-field">
          <label>Équipe à domicile</label>
          <input type="text" data-field="home_team" data-index="${i}" value="${escapeHtml(s.home_team || '')}" placeholder="Ex: Inter" />
        </div>
        <div class="form-field">
          <label>Équipe à l'extérieur</label>
          <input type="text" data-field="away_team" data-index="${i}" value="${escapeHtml(s.away_team || '')}" placeholder="Ex: Juventus" />
        </div>
        <div class="form-field">
          <label>Date et heure du match</label>
          <input type="datetime-local" data-field="match_date" data-index="${i}" value="${s.match_date ? toLocalInput(s.match_date) : ''}" />
        </div>
        <div class="form-field">
          <label>Marché</label>
          <select data-field="market" data-index="${i}">
            ${['Résultat du match','Double chance','Plus de 2.5 buts','Moins de 2.5 buts','Les deux équipes marquent','Handicap -1','Handicap +1','Sans match nul','Score exact','Autre'].map(m => `<option value="${m}" ${s.market === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Pronostic</label>
          <input type="text" data-field="prediction" data-index="${i}" value="${escapeHtml(s.prediction || '')}" placeholder="Ex: Inter gagne, Oui, Milan ou nul..." />
        </div>
        <div class="form-field">
          <label>Cote</label>
          <input type="number" step="0.01" min="1" data-field="odds" data-index="${i}" value="${s.odds ?? ''}" placeholder="Ex: 1.85" />
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', handleSelectionChange);
    el.addEventListener('change', handleSelectionChange);
  });
  container.querySelectorAll('button[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.remove);
      selections.splice(idx, 1);
      renderSelections();
    });
  });

  updateRecap();
}

function handleSelectionChange(e) {
  const idx = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (isNaN(idx) || !field) return;
  let value = e.target.value;
  if (field === 'odds') value = value === '' ? null : parseFloat(value);
  if (field === 'match_date' && value) value = new Date(value).toISOString();
  selections[idx][field] = value;
  if (field === 'odds') updateRecap();
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function updateRecap() {
  const valid = selections.filter(s => s.odds && s.odds > 0);
  const total = valid.length === 0 ? 0 : valid.reduce((acc, s) => acc * s.odds, 1);
  const totalEl = document.getElementById('total-odds-display');
  const countEl = document.getElementById('matches-count-display');
  if (totalEl) totalEl.textContent = total > 0 ? total.toFixed(2) : '—';
  if (countEl) countEl.textContent = selections.length;
}

// ============================================================
// CHARGEMENT DU COUPON (mode édition)
// ============================================================
async function loadCouponForEdit(id) {
  try {
    const { data: coupon, error: e1 } = await supabaseClient
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single();
    if (e1) throw e1;

    document.getElementById('title').value = coupon.title || '';
    document.getElementById('description').value = coupon.description || '';
    document.getElementById('publication_date').value = coupon.publication_date || todayISO();
    document.getElementById('matches_date').value = coupon.matches_date || tomorrowISO();
    document.getElementById('type').value = coupon.type || 'Combiné';
    document.getElementById('cover_image').value = coupon.cover_image || '';
    document.getElementById('betting_code').value = coupon.betting_code || '';

    const catRadio = document.querySelector(`input[name="category"][value="${coupon.category}"]`);
    if (catRadio) catRadio.checked = true;

    const { data: sels, error: e2 } = await supabaseClient
      .from('selections')
      .select('*')
      .eq('coupon_id', id)
      .order('match_order', { ascending: true });
    if (e2) throw e2;

    selections = (sels || []).map(s => ({
      competition: s.competition,
      home_team: s.home_team,
      away_team: s.away_team,
      match_date: s.match_date,
      market: s.market,
      prediction: s.prediction,
      odds: s.odds,
    }));

    renderSelections();
  } catch (err) {
    console.error('[loadCoupon]', err);
    showAlert('Erreur chargement : ' + err.message);
  }
}

// ============================================================
// VALIDATION
// ============================================================
function validateCoupon() {
  const title = document.getElementById('title').value.trim();
  const pubDate = document.getElementById('publication_date').value;
  const matchDate = document.getElementById('matches_date').value;

  if (!title) return 'Le titre est requis.';
  if (!pubDate) return 'La date de publication est requise.';
  if (!matchDate) return 'La date des matchs est requise.';
  if (selections.length === 0) return 'Ajoute au moins un match.';

  // Valider le code bookmaker si renseigné
  const bettingCode = document.getElementById('betting_code').value.trim();
  if (bettingCode && bettingCode.length > 5) {
    return 'Le code bookmaker doit faire 5 caractères maximum.';
  }

  for (let i = 0; i < selections.length; i++) {
    const s = selections[i];
    if (!s.home_team || !s.away_team) {
      return `Match ${i + 1} : les deux équipes sont requises.`;
    }
    if (!s.prediction) {
      return `Match ${i + 1} : le pronostic est requis.`;
    }
    if (!s.match_date) {
      return `Match ${i + 1} : la date et l'heure du match sont requises.`;
    }
  }
  return null;
}

// ============================================================
// SAUVEGARDE
// ============================================================
async function saveCoupon(status) {
  hideAlert();
  const err = validateCoupon();
  if (err) {
    showAlert(err, 'error');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const publication_date = document.getElementById('publication_date').value;
  const matches_date = document.getElementById('matches_date').value;
  const category = document.querySelector('input[name="category"]:checked').value;
  const type = document.getElementById('type').value;
  const cover_image = document.getElementById('cover_image').value.trim() || null;
  const betting_code = document.getElementById('betting_code').value.trim().toUpperCase() || null;

  const btnPublish = document.getElementById('publish-btn');
  const btnDraft = document.getElementById('save-draft-btn');
  if (btnPublish) btnPublish.disabled = true;
  if (btnDraft) btnDraft.disabled = true;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const couponData = {
      title,
      description: description || null,
      publication_date,
      matches_date,
      category,
      type,
      cover_image,
      betting_code,
      status,
    };

    let couponId = editingId;

    if (editingId) {
      const { error } = await supabaseClient
        .from('coupons')
        .update(couponData)
        .eq('id', editingId);
      if (error) throw error;
    } else {
      couponData.created_by = user.id;
      const { data: created, error } = await supabaseClient
        .from('coupons')
        .insert(couponData)
        .select('id')
        .single();
      if (error) throw error;
      couponId = created.id;
      editingId = couponId;
    }

    const { error: delErr } = await supabaseClient
      .from('selections')
      .delete()
      .eq('coupon_id', couponId);
    if (delErr) throw delErr;

    if (selections.length > 0) {
      const newSels = selections.map((s, i) => ({
        coupon_id: couponId,
        match_order: i + 1,
        competition: s.competition || '',
        home_team: s.home_team,
        away_team: s.away_team,
        match_date: s.match_date,
        market: s.market || 'Autre',
        prediction: s.prediction,
        odds: s.odds || null,
        result: 'en_attente',
      }));
      const { error: insErr } = await supabaseClient.from('selections').insert(newSels);
      if (insErr) throw insErr;
    }

    try {
      await supabaseClient.from('admin_actions').insert({
        admin_id: user.id,
        action: editingId === couponId && status !== 'brouillon' ? 'publish_coupon' : 'save_coupon',
        target_type: 'coupon',
        target_id: couponId,
        details: { status, title, betting_code },
      });
    } catch (e) { console.warn('[audit]', e); }

    showToast(
      status === 'brouillon' ? 'Coupon enregistré en brouillon' : 'Coupon publié avec succès',
      'success'
    );

    setTimeout(() => {
      window.location.href = '/admin/coupons.html';
    }, 1200);

  } catch (error) {
    console.error('[saveCoupon]', error);
    showAlert('Erreur enregistrement : ' + error.message, 'error');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    if (btnPublish) btnPublish.disabled = false;
    if (btnDraft) btnDraft.disabled = false;
  }
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const loading = document.getElementById('loading');
  const form = document.getElementById('coupon-form');

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('id');

  if (editingId) {
    document.getElementById('page-title').textContent = 'Éditer le coupon';
    document.getElementById('page-subtitle').textContent = 'Modifie les informations du coupon et ses sélections.';
  }

  document.getElementById('publication_date').value = todayISO();
  document.getElementById('matches_date').value = tomorrowISO();

  // Force l'uppercase à la saisie du code
  document.getElementById('betting_code')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  if (editingId) {
    await loadCouponForEdit(editingId);
  } else {
    selections = [{
      competition: '',
      home_team: '',
      away_team: '',
      match_date: null,
      market: 'Résultat du match',
      prediction: '',
      odds: null,
    }];
    renderSelections();
  }

  document.getElementById('add-selection-btn')?.addEventListener('click', () => {
    selections.push({
      competition: '',
      home_team: '',
      away_team: '',
      match_date: null,
      market: 'Résultat du match',
      prediction: '',
      odds: null,
    });
    renderSelections();
  });

  document.getElementById('save-draft-btn')?.addEventListener('click', () => saveCoupon('brouillon'));
  document.getElementById('publish-btn')?.addEventListener('click', () => saveCoupon('disponible'));

  form?.addEventListener('submit', (e) => e.preventDefault());

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = 'block';
})();

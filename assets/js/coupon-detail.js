// frontend/assets/js/coupon-detail.js
// Charge et affiche un coupon. Exige une authentification pour tout coupon.

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

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      const returnUrl = `/coupon-detail.html?id=${couponId}`;
      window.location.replace(`/inscription.html?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

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

    if (meta.is_locked) {
      if (loading) loading.style.display = 'none';
      if (container) {
        container.style.display = 'block';
        container.innerHTML = renderCouponHeader(meta) + renderLockedPanel();
      }
      return;
    }

    const { data: selections, error: selError } = await supabaseClient
      .from('selections')
      .select('*')
      .eq('coupon_id', couponId)
      .order('match_order', { ascending: true });

    if (selError) throw selError;

    if (loading) loading.style.display = 'none';
    if (container) {
      container.style.display = 'block';
      const bettingCard = meta.betting_code ? renderBettingCodeCard(meta.betting_code) : '';
      container.innerHTML = renderCouponHeader(meta) + bettingCard + renderSelections(selections || [], meta);
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

// ============================================================
// CARTE CODE BOOKMAKER (1xbet)
// ============================================================
function renderBettingCodeCard(code) {
  if (!code) return '';
  return `
    <div class="betting-code-card">
      <div class="bc-header">
        <span class="bc-logo">1xbet</span>
        <span class="bc-title">Code du coupon</span>
      </div>
      <div class="bc-code-display">
        <span class="bc-code-value" id="bc-code-text">${escapeHtml(code)}</span>
      </div>
      <div class="bc-instructions">
        📋 Clique sur le bouton pour <strong>copier le code</strong>, puis ouvre ton application <strong>1xbet</strong> et colle-le pour télécharger le ticket.
      </div>
      <button class="bc-button" id="bc-copy-btn" data-code="${escapeAttr(code)}">
        📋 Copier le code
      </button>
      <div id="bc-success-message" style="display:none; margin-top:16px; padding:14px 18px; background:rgba(255,255,255,0.2); border-radius:10px; font-size:0.9rem; position:relative; z-index:1;">
        ✅ <strong>Code copié !</strong> Ouvre ton app 1xbet et colle-le pour télécharger le ticket.
        <button id="bc-open-app-btn" data-code="${escapeAttr(code)}" style="display:block; margin-top:12px; width:100%; padding:12px; background:white; color:#0B7A3E; border:none; border-radius:8px; font-weight:700; font-size:0.92rem; cursor:pointer; font-family:'Poppins';">
          📱 Ouvrir l'application 1xbet
        </button>
      </div>
    </div>
  `;
}

async function copyCouponCode(code, btn) {
  let success = false;

  // Méthode moderne
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(code);
      success = true;
    }
  } catch (e) { console.warn('[clipboard] API error:', e); }

  // Fallback
  if (!success) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) { console.warn('[clipboard] fallback error:', e); }
  }

  if (btn) {
    const original = btn.innerHTML;
    if (success) {
      btn.classList.add('copied');
      btn.innerHTML = '✅ Code copié !';
      // Afficher le message d'instructions + bouton d'ouverture d'app
      const msg = document.getElementById('bc-success-message');
      if (msg) msg.style.display = 'block';
      // Ne pas restaurer le texte pour que l'utilisateur voie le succès
    } else {
      btn.innerHTML = '❌ Erreur de copie';
      setTimeout(() => {
        btn.innerHTML = original;
      }, 2500);
    }
  }

  return success;
}

// Ouvre l'app 1xbet si installée, sinon redirige vers le site
function open1xbetApp() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (isMobile) {
    // Tenter d'ouvrir l'application via deep link
    const appScheme = '1xbet://';
    const websiteUrl = 'https://1xbet.com/fr/';
    
    // Éviter le blocage silencieux : utiliser un timeout
    let appOpened = false;
    
    const onVisibilityChange = () => {
      if (document.hidden) appOpened = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    
    // Essayer d'ouvrir l'app
    window.location.href = appScheme;
    
    // Après 1.5s, si l'app n'a pas été ouverte, proposer le site
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!appOpened && !document.hidden) {
        if (confirm('L\'application 1xbet ne semble pas installée sur ton téléphone.\n\nVoulez-vous ouvrir le site 1xbet dans votre navigateur ?')) {
          window.open(websiteUrl, '_blank', 'noopener,noreferrer');
        }
      }
    }, 1500);
  } else {
    // Sur desktop : ouvrir directement le site
    window.open('https://1xbet.com/fr/', '_blank', 'noopener,noreferrer');
  }
}

// Attacher le listener sur le bouton "Copier"
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#bc-copy-btn');
  if (!btn) return;
  const code = btn.dataset.code;
  if (!code) return;
  await copyCouponCode(code, btn);
});

// Attacher le listener sur le bouton "Ouvrir l'app"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#bc-open-app-btn');
  if (!btn) return;
  open1xbetApp();
});

function renderLockedPanel() {
  return `
    <div class="card locked-panel">
      <div class="locked-icon">🔒</div>
      <h2>Coupon premium</h2>
      <p>Ce coupon est réservé aux abonnés COUPON24. Souscris à une formule pour accéder aux pronostics et aux analyses détaillées.</p>
      <div class="locked-cta">
        <a href="/abonnements.html" class="btn btn-primary">Voir les abonnements</a>
        <a href="/tableau-de-bord.html" class="btn btn-outline">Mon espace</a>
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

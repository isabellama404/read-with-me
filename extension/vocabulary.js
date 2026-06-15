// vocabulary.js

// ─── Date formatting ──────────────────────────────────────────────────────────
// Returns a locale-appropriate short date string, including year.
function formatDate(ts, lang) {
  if (!ts) return '';
  const d   = new Date(ts);
  const y   = d.getFullYear();
  const m   = d.getMonth() + 1;
  const dd  = d.getDate();
  const mm  = String(m).padStart(2, '0');
  const ddd = String(dd).padStart(2, '0');
  switch (lang) {
    case 'zh': return `${y}/${m}/${dd}`;
    case 'en': return `${m}/${dd}/${y}`;
    case 'ja': return `${y}/${mm}/${ddd}`;
    case 'ko': return `${y}.${mm}.${ddd}`;
    case 'es': return `${dd}/${m}/${y}`;
    case 'fr': return `${ddd}/${mm}/${y}`;
    default:   return `${y}/${m}/${dd}`;
  }
}

// ─── Count badge text ─────────────────────────────────────────────────────────
function getCountText(n, lang) {
  const fn = RWM_STRINGS[lang]?.vocabCountFn || RWM_STRINGS.zh.vocabCountFn;
  return fn(n);
}

// ─── Update header state (count + empty + clear button) ──────────────────────
function updateHeader(lang) {
  const n       = document.querySelectorAll('.vocab-card').length;
  const countEl = document.getElementById('vocab-count');
  const clearBtn = document.getElementById('btn-clear-all');
  countEl.textContent = n > 0 ? getCountText(n, lang) : rwmT('vocabEmpty', lang);
  document.getElementById('empty').classList.toggle('show', n === 0);
  if (clearBtn) clearBtn.style.display = n > 0 ? '' : 'none';
}

// ─── Build a word card ────────────────────────────────────────────────────────
function createCard(item, lang) {
  const card = document.createElement('div');
  card.className = 'vocab-card';

  // Word + level dot
  const wordEl = document.createElement('div');
  wordEl.className = 'card-word';
  wordEl.appendChild(document.createTextNode(item.word));

  const levelColors = { A1: '#3b82f6', A2: '#3b82f6', B1: '#f59e0b', B2: '#f59e0b', C1: '#ef4444', C2: '#ef4444' };
  const dot = document.createElement('span');
  dot.className = 'card-level-dot';
  dot.style.background = levelColors[item.level] || '#d1d5db';
  if (item.level) dot.title = rwmDiffLabel(item.level, lang);
  wordEl.appendChild(dot);
  card.appendChild(wordEl);

  // Definition in the user's interface language, with fallback chain
  const defText = item.definitions?.[lang] || item.definitions?.en || item.definitions?.zh || item.definition || '';
  if (defText) {
    const def = document.createElement('div');
    def.className = 'card-def';
    def.textContent = defText;
    card.appendChild(def);
  }

  // Example sentence
  if (item.example) {
    const ex = document.createElement('div');
    ex.className = 'card-example';
    ex.textContent = item.example;
    card.appendChild(ex);
  }

  // Footer: source + date
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const srcWrap = document.createElement('div');
  srcWrap.className = 'card-source';

  const srcLabel = document.createElement('span');
  srcLabel.className = 'card-source-label';
  srcLabel.textContent = rwmT('sourceLabel', lang);
  srcWrap.appendChild(srcLabel);

  if (item.sourceUrl) {
    const a = document.createElement('a');
    a.href   = item.sourceUrl;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    a.textContent = item.sourceTitle || item.sourceUrl;
    srcWrap.appendChild(a);
  } else if (item.sourceTitle) {
    const sp = document.createElement('span');
    sp.textContent = item.sourceTitle;
    srcWrap.appendChild(sp);
  }
  footer.appendChild(srcWrap);

  if (item.savedAt) {
    const date = document.createElement('span');
    date.className   = 'card-date';
    date.textContent = formatDate(item.savedAt, lang);
    footer.appendChild(date);
  }
  card.appendChild(footer);

  // Delete button — with confirmation dialog
  const del = document.createElement('button');
  del.className   = 'btn-delete';
  del.title       = rwmT('delete', lang);
  del.textContent = '✕';
  del.addEventListener('click', async () => {
    if (!confirm(rwmT('deleteWordConfirm', lang))) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_WORD', word: item.word });
    card.remove();
    updateHeader(lang);
  });
  card.appendChild(del);

  return card;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { vocabulary = [], interfaceLanguage } =
    await chrome.storage.local.get(['vocabulary', 'interfaceLanguage']);
  const lang = rwmResolveLang(interfaceLanguage);

  // Apply i18n to static elements
  document.title = rwmT('vocabTitle', lang) + ' - Read With Me';
  document.getElementById('vocab-title').textContent = rwmT('vocabTitle', lang);
  document.getElementById('empty-title').textContent = rwmT('emptyTitle', lang);
  document.getElementById('empty-desc').textContent  = rwmT('emptyDesc', lang);

  // Clear-all button
  const clearBtn = document.getElementById('btn-clear-all');
  if (clearBtn) {
    clearBtn.textContent = rwmT('clearAllWords', lang);
    clearBtn.addEventListener('click', async () => {
      if (!confirm(rwmT('clearAllConfirm', lang))) return;
      clearBtn.disabled = true;
      await chrome.storage.local.set({ vocabulary: [] });
      document.getElementById('vocab-list').innerHTML = '';
      updateHeader(lang);
      clearBtn.disabled = false;
    });
  }

  // Render cards
  const list = document.getElementById('vocab-list');
  for (const item of vocabulary) {
    list.appendChild(createCard(item, lang));
  }
  updateHeader(lang);
});

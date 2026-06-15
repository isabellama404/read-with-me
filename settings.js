// settings.js

// Per-language descriptions shown below the level selector.
const LEVEL_DESCS = {
  zh: {
    A1: '英语初学者，能理解基本问候、数字和简单日常对话（原 A1/A2）',
    B1: '能理解工作和旅行中的主要内容',
    B2: '能理解复杂文章，与母语者流利交流（推荐默认）',
    C1: '能理解长难文中的隐含含义，流畅表达',
    C2: '几乎能理解所有内容，精细表达细微语义差别',
  },
  en: {
    A1: 'Beginner — basic greetings, numbers and simple everyday conversations (A1/A2)',
    B1: 'Intermediate — main points of familiar topics',
    B2: 'Upper-Intermediate — complex texts, fluent conversation (recommended default)',
    C1: 'Advanced — implicit meanings in complex texts',
    C2: 'Proficient — understands virtually everything with ease',
  },
  ja: {
    A1: '初心者 — 基本的な挨拶・数字・簡単な日常会話（A1/A2）',
    B1: '中級 — 身近な話題の主要内容',
    B2: '中上級 — 複雑な文章を理解、流暢な会話（推奨）',
    C1: '上級 — 複雑なテキストの暗黙の意味',
    C2: '習熟 — ほぼ全てを難なく理解',
  },
  ko: {
    A1: '초보 — 기본 인사, 숫자, 간단한 일상 대화 (A1/A2)',
    B1: '중급 — 친숙한 주제의 주요 내용',
    B2: '중상급 — 복잡한 텍스트 이해, 유창한 대화 (기본 추천)',
    C1: '고급 — 복잡한 텍스트의 함축적 의미',
    C2: '숙달 — 거의 모든 내용을 어렵지 않게 이해',
  },
  es: {
    A1: 'Principiante — saludos básicos, números y conversaciones simples (A1/A2)',
    B1: 'Intermedio — puntos principales de temas familiares',
    B2: 'Intermedio Alto — textos complejos, conversación fluida (recomendado)',
    C1: 'Avanzado — significados implícitos en textos complejos',
    C2: 'Competente — entiende prácticamente todo con facilidad',
  },
  fr: {
    A1: 'Débutant — salutations, chiffres et conversations simples du quotidien (A1/A2)',
    B1: 'Intermédiaire — points essentiels de sujets familiers',
    B2: 'Intermédiaire Avancé — textes complexes, conversation fluide (recommandé)',
    C1: 'Avancé — sens implicites dans les textes complexes',
    C2: 'Maîtrise — comprend quasiment tout sans effort',
  },
};

// Migrate pre-CEFR stored values to CEFR codes.
const MIGRATE_TO_CEFR = {
  'CET-4': 'B1', 'CET-6': 'B2', 'IELTS': 'C1', 'TOEFL': 'C1', 'Graduate': 'C1',
  // A2 merged into A1 (Basic)
  'A2': 'A1',
  // Chinese difficulty labels
  '初学者': 'A1', '基础': 'A1', '中级': 'B1', '中高级': 'B2', '高级': 'C1', '精通': 'C2',
};

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const levelSelect = document.getElementById('user-level');
  const langSelect  = document.getElementById('interface-language');
  const levelDescEl = document.getElementById('level-desc');
  const keyErrorEl  = document.getElementById('key-error');
  const successEl   = document.getElementById('success');

  // Load saved settings
  const { apiKey, userLevel: savedLevel, interactionMode, interfaceLanguage: savedLang } =
    await chrome.storage.local.get(['apiKey', 'userLevel', 'interactionMode', 'interfaceLanguage']);

  // Set initial language selector value
  langSelect.value = savedLang || 'auto';

  // Determine current display language
  let currentLang = rwmResolveLang(savedLang);

  // ── Build level options ──────────────────────────────────────────────────────
  function buildLevelOptions(lang) {
    const prev = levelSelect.value;
    levelSelect.innerHTML = '';
    CEFR_LEVELS.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code === 'A1'
        ? `${rwmDiffLabel(code, lang)}  (A1/A2)`
        : `${rwmDiffLabel(code, lang)}  (${code})`;
      levelSelect.appendChild(opt);
    });
    // Restore selection
    if (prev && CEFR_LEVELS.includes(prev)) levelSelect.value = prev;
  }

  // ── Apply all i18n labels to the page ────────────────────────────────────────
  function applyLabels(lang) {
    document.title = rwmT('settingsTitle', lang) + ' - Read With Me';
    document.getElementById('settings-title').textContent    = rwmT('settingsTitle', lang);
    document.getElementById('settings-subtitle').textContent = rwmT('settingsSubtitle', lang);
    document.getElementById('lbl-required').textContent      = rwmT('apiKeyRequired', lang);
    document.getElementById('lbl-lang-label').textContent    = rwmT('languageLabel', lang);
    document.getElementById('lbl-lang-hint').textContent     = rwmT('languageHint', lang);
    document.getElementById('lbl-level-label').textContent   = rwmT('levelLabel', lang);
    document.getElementById('lbl-level-hint').textContent    = rwmT('levelHint', lang);
    document.getElementById('lbl-trigger-label').textContent = rwmT('triggerLabel', lang);
    document.getElementById('lbl-hover-title').textContent   = rwmT('hoverTitle', lang);
    document.getElementById('lbl-hover-desc').textContent    = rwmT('hoverDesc', lang);
    document.getElementById('lbl-click-title').textContent   = rwmT('clickTitle', lang);
    document.getElementById('lbl-click-desc').textContent    = rwmT('clickDesc', lang);
    document.getElementById('lbl-trigger-hint').textContent  = rwmT('triggerHint', lang);
    document.getElementById('save-btn').textContent          = rwmT('saveBtn', lang);
    keyErrorEl.textContent                                   = rwmT('apiKeyError', lang);

    // API key hint with link
    const link = `<a href="https://platform.deepseek.com/api_keys" target="_blank">platform.deepseek.com</a>`;
    const hintStr = rwmT('apiKeyHint', lang);
    document.getElementById('lbl-api-hint').innerHTML =
      hintStr.includes('platform.deepseek.com')
        ? hintStr.replace('platform.deepseek.com', link)
        : `${hintStr} ${link}`;

    // Rebuild level options in new language
    buildLevelOptions(lang);
    updateLevelDesc(levelSelect.value, lang);
  }

  // ── Update the description text below the level selector ─────────────────────
  function updateLevelDesc(code, lang) {
    const descs = LEVEL_DESCS[lang] || LEVEL_DESCS.zh;
    levelDescEl.textContent = descs[code] || '';
  }

  // ── Initial render ────────────────────────────────────────────────────────────
  applyLabels(currentLang);

  // Restore saved level (migrate old values)
  const resolvedLevel = CEFR_LEVELS.includes(savedLevel)
    ? savedLevel
    : (MIGRATE_TO_CEFR[savedLevel] || 'B2');
  levelSelect.value = resolvedLevel;
  updateLevelDesc(resolvedLevel, currentLang);

  // Restore interaction mode
  const mode = interactionMode || 'hover';
  const modeRadio = document.querySelector(`input[name="interactionMode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  // Restore API key placeholder
  if (apiKey) {
    apiKeyInput.placeholder = rwmT('apiKeySaved', currentLang);
    apiKeyInput.dataset.hasExisting = 'true';
  }

  // ── Real-time language preview when user changes the dropdown ─────────────────
  langSelect.addEventListener('change', () => {
    currentLang = rwmResolveLang(langSelect.value);
    applyLabels(currentLang);
    // Keep level selection intact
    levelSelect.value = resolvedLevel; // will still be the previously resolved value
    updateLevelDesc(levelSelect.value, currentLang);
    // Update API key placeholder if already saved
    if (apiKeyInput.dataset.hasExisting) {
      apiKeyInput.placeholder = rwmT('apiKeySaved', currentLang);
    }
  });

  levelSelect.addEventListener('change', () => {
    updateLevelDesc(levelSelect.value, currentLang);
  });

  apiKeyInput.addEventListener('input', () => {
    keyErrorEl.classList.remove('show');
    apiKeyInput.style.borderColor = '';
  });

  // ── Save ──────────────────────────────────────────────────────────────────────
  document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawKey       = apiKeyInput.value.trim();
    const selectedMode = document.querySelector('input[name="interactionMode"]:checked')?.value || 'hover';
    const toSave = {
      userLevel:         levelSelect.value,
      interactionMode:   selectedMode,
      interfaceLanguage: langSelect.value,
    };

    if (rawKey) {
      toSave.apiKey = rawKey;
      apiKeyInput.value = '';
      apiKeyInput.placeholder = rwmT('apiKeySaved', currentLang);
      apiKeyInput.dataset.hasExisting = 'true';
    } else if (!apiKeyInput.dataset.hasExisting) {
      keyErrorEl.textContent = rwmT('apiKeyError', currentLang);
      keyErrorEl.classList.add('show');
      apiKeyInput.style.borderColor = '#dc2626';
      apiKeyInput.focus();
      return;
    }

    await chrome.storage.local.set(toSave);

    successEl.textContent = rwmT('successMsg', currentLang);
    successEl.classList.add('show');
    setTimeout(() => successEl.classList.remove('show'), 5000);
  });

  // ── Tutorial reset ────────────────────────────────────────────────────────────
  document.getElementById('btn-tutorial-reset').addEventListener('click', async () => {
    await chrome.storage.local.remove('hasSeenTutorial');
    const msg = document.getElementById('tutorial-reset-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
  });
});

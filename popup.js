// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const btnAnalyze        = document.getElementById('btn-analyze');
  const btnSettings       = document.getElementById('btn-settings');
  const btnBannerSettings = document.getElementById('btn-banner-settings');
  const btnVocab          = document.getElementById('btn-vocab');
  const btnClearCache     = document.getElementById('btn-clear-cache');
  const banner            = document.getElementById('banner');
  const resultsEl         = document.getElementById('results');
  const spinnerEl         = document.getElementById('spinner');
  const errorEl           = document.getElementById('error');
  const unsupported       = document.getElementById('unsupported');
  const diffEl            = document.getElementById('difficulty');
  const diffLabelEl       = document.getElementById('difficulty-label');
  const timeLabelEl       = document.getElementById('time-label');
  const timeEl            = document.getElementById('reading-time');

  // Load settings needed for display
  const { apiKey, userLevel: rawUserLevel = 'B2', interfaceLanguage = 'auto' } =
    await chrome.storage.local.get(['apiKey', 'userLevel', 'interfaceLanguage']);

  const lang = rwmResolveLang(interfaceLanguage);

  // Resolve stored userLevel (may be old exam label) to CEFR code
  const userLevel = CEFR_LEVELS.includes(rawUserLevel)
    ? rawUserLevel
    : (CHINESE_DIFF_TO_CEFR[rawUserLevel] || { 'CET-4': 'B1', 'CET-6': 'B2', 'IELTS': 'C1', 'TOEFL': 'C1', 'Graduate': 'C1' }[rawUserLevel] || 'B2');

  // ── Apply i18n to static labels ──
  document.getElementById('tab-analyze').textContent         = rwmT('tabAnalyze', lang);
  document.getElementById('tab-history').textContent         = rwmT('tabHistory', lang);
  btnAnalyze.textContent                                     = rwmT('analyzeBtn', lang);
  btnSettings.textContent                                    = rwmT('settingsBtn', lang);
  btnVocab.textContent                                       = rwmT('vocabBtn', lang);
  btnClearCache.textContent                                  = rwmT('clearCacheBtn', lang);
  unsupported.textContent                                    = rwmT('unsupportedMsg', lang);
  diffLabelEl.textContent                                    = rwmT('diffLabel', lang);
  timeLabelEl.textContent                                    = rwmT('timeLabel', lang);
  document.getElementById('filter-all').textContent         = rwmT('historyFilterAll', lang);
  document.getElementById('filter-collected').textContent   = rwmT('historyFilterCollected', lang);
  document.getElementById('btn-clear-history').textContent  = rwmT('clearHistoryBtn', lang);

  const historyEmptyInit = document.getElementById('history-empty-init');
  if (historyEmptyInit) historyEmptyInit.textContent = rwmT('historyEmpty', lang);

  // Banner: split around the link button
  btnBannerSettings.textContent = rwmT('bannerGoSettings', lang);
  const bannerMsg = rwmT('bannerApiMsg', lang);
  const linkText  = rwmT('bannerGoSettings', lang);
  const idx = bannerMsg.indexOf(linkText);
  if (idx >= 0) {
    document.getElementById('banner-msg-pre').textContent  = bannerMsg.slice(0, idx);
    document.getElementById('banner-msg-post').textContent = bannerMsg.slice(idx + linkText.length);
  } else {
    document.getElementById('banner-msg-pre').textContent  = bannerMsg + ' ';
    document.getElementById('banner-msg-post').textContent = '';
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 6000);
  }

  function displayResults(data) {
    if (!data) return;

    const diff = data.difficulty || '';
    const label = CEFR_LEVELS.includes(diff)
      ? rwmDiffLabel(diff, lang) + rwmCefrIcons(diff, userLevel)
      : diff || '—';

    diffEl.textContent = label;
    diffEl.className   = `stat-val ${CEFR_LEVELS.includes(diff) ? rwmCefrClass(diff) : 'medium'}`;
    diffLabelEl.textContent = rwmT('diffLabel', lang);

    const mins = data.reading_time_minutes;
    timeEl.textContent = mins ? `${mins}${rwmT('minutes', lang)}` : '—';
    resultsEl.classList.add('show');
  }

  // Check API key
  if (!apiKey) banner.classList.add('show');

  // Check current tab
  let currentTab = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (!tab?.url?.startsWith('http')) {
      unsupported.classList.add('show');
      btnAnalyze.disabled = true;
      btnClearCache.disabled = true;
    } else {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
      if (status?.isAnnotated && status.data) displayResults(status.data);
    }
  } catch {
    // Content script may not be injected yet — OK, user can still click analyze
  }

  // Analyze
  btnAnalyze.addEventListener('click', async () => {
    errorEl.classList.remove('show');
    resultsEl.classList.remove('show');
    btnAnalyze.disabled = true;
    btnAnalyze.textContent = rwmT('analyzing', lang);
    spinnerEl.classList.add('show');

    try {
      const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' });
      if (result?.error) throw new Error(result.error);
      displayResults(result);
    } catch (e) {
      showError(e.message || '分析失败，请重试');
    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.textContent = rwmT('analyzeBtn', lang);
      spinnerEl.classList.remove('show');
    }
  });

  const openSettings = () => chrome.runtime.openOptionsPage();
  btnSettings.addEventListener('click', openSettings);
  btnBannerSettings.addEventListener('click', openSettings);

  btnVocab.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('vocabulary.html') });
  });

  btnClearCache.addEventListener('click', async () => {
    if (!currentTab?.url) return;
    btnClearCache.disabled = true;
    btnClearCache.textContent = rwmT('clearingCache', lang);
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE', url: currentTab.url, tabId: currentTab.id });
      await chrome.tabs.reload(currentTab.id);
      window.close();
    } catch (e) {
      showError('清除缓存失败: ' + e.message);
      btnClearCache.disabled = false;
      btnClearCache.textContent = rwmT('clearCacheBtn', lang);
    }
  });

  // ─── History tab ─────────────────────────────────────────────────────────────

  const tabAnalyzeBtn      = document.getElementById('tab-analyze');
  const tabHistoryBtn      = document.getElementById('tab-history');
  const panelAnalyzeEl     = document.getElementById('panel-analyze');
  const panelHistoryEl     = document.getElementById('panel-history');
  const filterAllBtn       = document.getElementById('filter-all');
  const filterCollectedBtn = document.getElementById('filter-collected');
  const historyListEl      = document.getElementById('history-list');
  const btnClearHistoryEl  = document.getElementById('btn-clear-history');

  let historyData   = [];
  let historyFilter = 'all';

  function formatHistoryDate(ts) {
    const d          = new Date(ts);
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yestStart  = new Date(+todayStart - 86400000);
    const itemDay    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (+itemDay >= +todayStart)  return `${rwmT('historyToday', lang)} ${hm}`;
    if (+itemDay >= +yestStart)   return `${rwmT('historyYesterday', lang)} ${hm}`;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderHistory() {
    const items = historyFilter === 'collected'
      ? historyData.filter(h => h.collected)
      : historyData;

    const emptyKey = historyFilter === 'collected' ? 'historyCollectedEmpty' : 'historyEmpty';
    if (items.length === 0) {
      historyListEl.innerHTML = `<div class="history-empty">${rwmT(emptyKey, lang)}</div>`;
      return;
    }

    historyListEl.innerHTML = '';
    items.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const titleBtn = document.createElement('button');
      titleBtn.className   = 'history-item-title';
      titleBtn.textContent = entry.title || entry.url;
      titleBtn.title       = entry.title || entry.url;
      titleBtn.addEventListener('click', () => {
        if (currentTab) chrome.tabs.update(currentTab.id, { url: entry.url });
        else            chrome.tabs.create({ url: entry.url });
        window.close();
      });

      const dateDiv = document.createElement('div');
      dateDiv.className   = 'history-item-date';
      dateDiv.textContent = formatHistoryDate(entry.timestamp);

      const main = document.createElement('div');
      main.className = 'history-item-main';
      main.appendChild(titleBtn);
      main.appendChild(dateDiv);

      const collectBtn = document.createElement('button');
      collectBtn.className   = 'history-action-btn' + (entry.collected ? ' btn-collected' : '');
      collectBtn.title       = entry.collected ? rwmT('historyFilterCollected', lang) : rwmT('save', lang);
      collectBtn.textContent = entry.collected ? '★' : '☆';
      collectBtn.addEventListener('click', async () => {
        const result = await chrome.runtime.sendMessage({ type: 'TOGGLE_COLLECTED', id: entry.id });
        entry.collected        = result?.collected ?? !entry.collected;
        collectBtn.textContent = entry.collected ? '★' : '☆';
        collectBtn.title       = entry.collected ? rwmT('historyFilterCollected', lang) : rwmT('save', lang);
        collectBtn.className   = 'history-action-btn' + (entry.collected ? ' btn-collected' : '');
        if (historyFilter === 'collected' && !entry.collected) {
          item.remove();
          if (!historyListEl.querySelector('.history-item')) {
            historyListEl.innerHTML = `<div class="history-empty">${rwmT('historyCollectedEmpty', lang)}</div>`;
          }
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className   = 'history-action-btn';
      deleteBtn.title       = rwmT('delete', lang);
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY', id: entry.id });
        historyData = historyData.filter(h => h.id !== entry.id);
        item.remove();
        if (!historyListEl.querySelector('.history-item')) {
          historyListEl.innerHTML = `<div class="history-empty">${rwmT(emptyKey, lang)}</div>`;
        }
      });

      const actions = document.createElement('div');
      actions.className = 'history-item-actions';
      actions.appendChild(collectBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(main);
      item.appendChild(actions);
      historyListEl.appendChild(item);
    });
  }

  tabAnalyzeBtn.addEventListener('click', () => {
    tabAnalyzeBtn.classList.add('active');
    tabHistoryBtn.classList.remove('active');
    panelAnalyzeEl.classList.add('active');
    panelHistoryEl.classList.remove('active');
  });

  tabHistoryBtn.addEventListener('click', async () => {
    tabHistoryBtn.classList.add('active');
    tabAnalyzeBtn.classList.remove('active');
    panelHistoryEl.classList.add('active');
    panelAnalyzeEl.classList.remove('active');
    const result = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
    historyData = result?.history || [];
    renderHistory();
  });

  filterAllBtn.addEventListener('click', () => {
    historyFilter = 'all';
    filterAllBtn.classList.add('active');
    filterCollectedBtn.classList.remove('active');
    renderHistory();
  });

  filterCollectedBtn.addEventListener('click', () => {
    historyFilter = 'collected';
    filterCollectedBtn.classList.add('active');
    filterAllBtn.classList.remove('active');
    renderHistory();
  });

  btnClearHistoryEl.addEventListener('click', async () => {
    if (!confirm(rwmT('clearHistoryConfirm', lang))) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    historyData = [];
    renderHistory();
  });

  // ─── First-run Tutorial ──────────────────────────────────────────────────────

  const TUT_STEPS = [
    {
      icon: '👋',
      title: '欢迎使用 Read With Me',
      html: `<ul>
  <li>🔤 标注<strong>难词</strong>，显示释义和例句</li>
  <li>📐 解析<strong>长难句</strong>结构，逐段拆解</li>
  <li>💬 识别<strong>习语与实用表达</strong></li>
</ul>`,
    },
    {
      icon: '⚙️',
      title: '设置你的英语水平',
      html: `<p>点击 <span class="tut-badge outline">⚙ 设置</span> 按钮，选择你的英语水平，助手将只标注对你有挑战的内容。</p>`,
    },
    {
      icon: '🚀',
      title: '开始阅读！',
      html: `<p>打开任意英文网页，点击 <span class="tut-badge">分析当前页面</span> 按钮，稍等片刻即可看到标注结果。</p>`,
      isLast: true,
    },
  ];

  async function initTutorial() {
    const { hasSeenTutorial } = await chrome.storage.local.get('hasSeenTutorial');
    if (hasSeenTutorial) return;

    const iconEl  = document.getElementById('tut-icon');
    const titleEl = document.getElementById('tut-title');
    const bodyEl  = document.getElementById('tut-body');
    const nextBtn = document.getElementById('tut-next');
    const skipBtn = document.getElementById('tut-skip');
    const dots    = document.querySelectorAll('.tut-dot');

    let step = 0;

    function showStep(i) {
      const s = TUT_STEPS[i];
      iconEl.textContent  = s.icon;
      titleEl.textContent = s.title;
      bodyEl.innerHTML    = s.html;
      nextBtn.textContent = s.isLast ? '开始使用' : '下一步';
      dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    }

    async function closeTutorial() {
      document.body.classList.remove('tutorial-mode');
      await chrome.storage.local.set({ hasSeenTutorial: true });
    }

    nextBtn.addEventListener('click', async () => {
      if (step < TUT_STEPS.length - 1) {
        step++;
        showStep(step);
      } else {
        await closeTutorial();
      }
    });

    skipBtn.addEventListener('click', closeTutorial);

    document.body.classList.add('tutorial-mode');
    showStep(0);
  }

  initTutorial();
});

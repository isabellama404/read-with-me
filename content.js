// content.js — injected into pages: text extraction, DOM annotation, tooltips

console.log('🔥 READ EASY PLUGIN LOADED - VERSION 2026-06-09-FIXED');

const state = {
  isAnnotated: false,
  analysisData: null,
  // Compiled patterns stored after first annotation so viewport/mutation
  // annotators can reuse them without rebuilding from analysisData each time.
  idiomPatterns: [],
  wordPatterns: [],
  // Lowercase set of collected words for O(1) lookup during annotation.
  vocabSet: new Set(),
};

// Must match the same function in background.js — used to detect article changes.
function computeContentHash(text) {
  const t = text.trim();
  return `${t.length}|${t.slice(0, 100)}|${t.slice(-100)}`;
}

// Tracks the most recent mouse click position for reliable tooltip placement.
// getBoundingClientRect() can return zeros inside transform containers or for
// zero-height inline elements, so we use the actual click coords instead.
let lastClickPos = { x: 0, y: 0 };

// ─── Vocabulary Highlights ────────────────────────────────────────────────────
// Collected words are highlighted green (higher priority than AI yellow).
// The vocabSet is loaded once at startup and kept in sync with storage so
// annotateViewport / annotateNewNode always use the up-to-date list without
// hitting storage on every text node.

function isCollectedWord(word) {
  return state.vocabSet.has(word.toLowerCase());
}

async function loadVocabSet() {
  try {
    const result = await chrome.storage.local.get('vocabulary');
    const vocabulary = result.vocabulary || [];
    console.log('[RWM] loadVocabSet: 读取到', vocabulary.length, '个单词');
    if (vocabulary.length > 0) {
      console.log('[RWM] 单词示例:', vocabulary.slice(0, 3).map(v => v.word));
    }
    state.vocabSet = new Set(vocabulary.map(v => v.word.toLowerCase()));
    console.log('[RWM] state.vocabSet 大小:', state.vocabSet.size);
  } catch (err) {
    console.warn('[RWM] loadVocabSet 失败:', err);
    state.vocabSet = new Set();
  }
}

// Walk all word spans and reapply the correct background colour.
// Called after any vocab change so every occurrence of a word updates atomically.
function refreshVocabHighlights() {
  console.log('[RWM] refreshVocabHighlights: vocabSet大小=', state.vocabSet.size);
  const spans = document.querySelectorAll('[data-rwm-annotated="word"]');
  let green = 0, yellow = 0;
  spans.forEach(span => {
    const isCollected = state.vocabSet.has(span.textContent.toLowerCase());
    if (isCollected) {
      span.classList.add('rwm-word-collected');
      green++;
    } else {
      span.classList.remove('rwm-word-collected');
      yellow++;
    }
  });
  console.log('[RWM] 绿色:', green, '黄色:', yellow);
}

// Keep vocabSet current whenever the vocabulary is saved or deleted from any tab.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.vocabulary) return;
  const newVocab = changes.vocabulary.newValue || [];
  state.vocabSet = new Set(newVocab.map(v => v.word.toLowerCase()));
  refreshVocabHighlights();
});

// Eagerly load and store the promise so annotation callers can await it.
// Fire-and-forget would create a race: annotateDOM could run before storage
// returns, leaving vocabSet empty and all words appearing yellow.
const _vocabReady = loadVocabSet();

// Interface language — loaded once at startup, used in buildTooltip.
let _lang = 'zh';
async function loadLang() {
  try {
    const { interfaceLanguage } = await chrome.storage.local.get('interfaceLanguage');
    _lang = rwmResolveLang(interfaceLanguage);
  } catch {
    _lang = rwmResolveLang(undefined);
  }
}
const _langReady = loadLang();

// ─── Text Extraction ──────────────────────────────────────────────────────────

function findMainContentElement() {
  const selectors = [
    'article', '[role="main"]', 'main',
    '.post-content', '.article-body', '.article-content', '.entry-content',
    '.story-body', '.content-body', '.post-body',
    '#article-content', '#content', '#main-content', '.main-content',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 500) return el;
  }
  // Fallback: highest text-density block element
  let best = document.body, bestScore = 0;
  for (const block of document.querySelectorAll('div, section, td')) {
    const textLen = block.innerText.trim().length;
    if (textLen < 300) continue;
    const score = textLen / (block.children.length + 1);
    if (score > bestScore) { bestScore = score; best = block; }
  }
  return best;
}

function extractMainText() {
  try {
    const element = findMainContentElement();
    if (!element) return { element: document.body, text: document.body.innerText.trim(), title: document.title };
    return { element, text: element.innerText.trim(), title: document.title };
  } catch (err) {
    console.warn('[RWM] extractMainText 失败:', err);
    return { element: document.body, text: document.body.innerText.trim(), title: document.title };
  }
}

// ─── Annotation Matching ──────────────────────────────────────────────────────

function findAllMatches(text, idiomPatterns, wordPatterns) {
  const lower = text.toLowerCase();
  const matches = [];
  const isWordChar = /[a-zA-Z'-]/;

  // Idioms first — sorted longest-first so longer phrases beat contained words.
  // Use the whole idiom object as `data`; there is no .data sub-field.
  for (const idiom of idiomPatterns) {
    const lp = idiom.phrase.toLowerCase();
    let i = 0;
    while ((i = lower.indexOf(lp, i)) !== -1) {
      matches.push({
        start: i, end: i + idiom.phrase.length,
        type: 'idiom', text: text.slice(i, i + idiom.phrase.length), data: idiom,
      });
      i += idiom.phrase.length;
    }
  }

  // Words — whole-word match only
  for (const wordObj of wordPatterns) {
    const lw = wordObj.word.toLowerCase();
    let i = 0;
    while ((i = lower.indexOf(lw, i)) !== -1) {
      const end = i + lw.length;
      const before = i > 0 ? lower[i - 1] : ' ';
      const after  = end < lower.length ? lower[end] : ' ';
      if (!isWordChar.test(before) && !isWordChar.test(after)) {
        matches.push({ start: i, end, type: 'word', text: text.slice(i, end), data: wordObj });
      }
      i += lw.length;
    }
  }

  // Sort by position; longer match wins ties; strip overlaps
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  let covered = 0;
  for (const m of matches) {
    if (m.start >= covered) { result.push(m); covered = m.end; }
  }
  return result;
}

// ─── DOM Annotation ──────────────────────────────────────────────────────────

function clearAnnotations() {
  document.querySelectorAll('[data-rwm-annotated]').forEach(span => {
    span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
  });
  document.body.normalize();
}

function createAnnotationSpan(match) {
  const span = document.createElement('span');
  span.setAttribute('data-rwm-annotated', match.type);

  // Always build a complete, type-correct data object so data-rwm-data
  // is never the string "undefined" or missing required fields.
  let safeData = (match.data && typeof match.data === 'object') ? match.data : null;
  if (!safeData) {
    if (match.type === 'word') {
      safeData = { word: match.text, level: '', definitions: { zh: '（暂无释义）', en: '(no definition)' }, example: '' };
    } else if (match.type === 'idiom') {
      safeData = { phrase: match.text, literal: match.text, usage: '（暂无解释）', example: '' };
    } else {
      safeData = { sentence: match.text, grammar: '复杂句', explanation: '' };
    }
  } else {
    // Patch any missing required fields so buildTooltip never sees undefined
    if (match.type === 'word') {
      safeData = {
        word:        safeData.word        || match.text,
        level:       safeData.level       || '',
        definitions: safeData.definitions || { zh: safeData.definition || '' },
        synonyms:    safeData.synonyms,
        example:     safeData.example    || '',
      };
    } else if (match.type === 'idiom') {
      safeData = {
        phrase:  safeData.phrase  || match.text,
        literal: safeData.literal || match.text,
        usage:   safeData.usage   || '（暂无解释）',
        example: safeData.example || '',
      };
    } else {
      safeData = {
        sentence:    safeData.sentence    || match.text,
        grammar:     safeData.grammar     || '复杂句',
        explanation: safeData.explanation || '',
      };
    }
  }

  span.setAttribute('data-rwm-data', JSON.stringify(safeData));
  span.className = `rwm-${match.type}`;
  span.appendChild(document.createTextNode(match.text));

  span.style.cursor = 'pointer';
  if (match.type === 'word') {
    const collected = isCollectedWord(match.text);
    console.log(`[RWM] span: word="${match.text}" collected=${collected} vocabSize=${state.vocabSet.size}`);
    if (collected) span.classList.add('rwm-word-collected');
    span.style.borderRadius = '2px';
  } else if (match.type === 'sentence') {
    span.style.borderBottom = '2px dashed rgba(41, 115, 255, 0.75)';
    span.style.paddingBottom = '1px';
  } else if (match.type === 'idiom') {
    span.style.textDecoration = 'underline wavy rgba(220, 50, 50, 0.75)';
    span.style.textDecorationSkipInk = 'none';
  }
  return span;
}

function annotateTextNode(textNode, idiomPatterns, wordPatterns) {
  const text = textNode.nodeValue;
  if (!text || text.trim().length < 2) return;
  const matches = findAllMatches(text, idiomPatterns, wordPatterns);
  if (matches.length === 0) return;

  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of matches) {
    if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
    frag.appendChild(createAnnotationSpan(m));
    last = m.end;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  textNode.parentNode.replaceChild(frag, textNode);
}

function annotateSentences(rootElement, sentences) {
  if (!sentences || sentences.length === 0) return;

  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag))
        return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-rwm-annotated="sentence"]'))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const sentence of sentences) {
    const st = sentence.sentence;
    if (!st) continue;
    // Strip | and + delimiter markers inserted by the AI before matching DOM text.
    const cleanSt = st.replace(/\s*\|\s*/g, ' ').replace(/\s*\+\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanSt.length < 15) continue;

    for (const tn of textNodes) {
      const nv = tn.nodeValue;
      if (!nv) continue;
      const idx = nv.indexOf(cleanSt);
      if (idx === -1) continue;

      // Only annotate when sentence is fully within one text node
      const frag = document.createDocumentFragment();
      if (idx > 0) frag.appendChild(document.createTextNode(nv.slice(0, idx)));

      const span = document.createElement('span');
      span.setAttribute('data-rwm-annotated', 'sentence');
      span.setAttribute('data-rwm-data', JSON.stringify({
        sentence:           sentence.sentence           || cleanSt,
        grammar:            sentence.grammar            || '复杂句',
        explanation:        sentence.explanation        || '',
        parts:              sentence.parts              || undefined,
        structureSummary:   sentence.structureSummary   || undefined,
        literalTranslation: sentence.literalTranslation || undefined,
        freeTranslation:    sentence.freeTranslation    || undefined,
      }));
      span.className = 'rwm-sentence';
      span.textContent = cleanSt;
      span.style.borderBottom = '2px dashed rgba(41, 115, 255, 0.75)';
      span.style.paddingBottom = '1px';
      span.style.cursor = 'pointer';
      frag.appendChild(span);

      const after = nv.slice(idx + cleanSt.length);
      if (after) frag.appendChild(document.createTextNode(after));
      tn.parentNode.replaceChild(frag, tn);
      break;
    }
  }
}

// Shared TreeWalker filter — skips non-content nodes and already-annotated subtrees
function makeUnannotatedTextFilter() {
  return {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea', 'input', 'button'].includes(tag))
        return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-rwm-annotated]'))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  };
}

function annotateDOM(rootElement, data) {
  console.log('[RWM] annotateDOM received:', {
    words: data.words?.length ?? 0,
    complex_sentences: data.complex_sentences?.length ?? 0,
    idioms: data.idioms?.length ?? 0,
    sample_word: data.words?.[0],
    sample_idiom: data.idioms?.[0],
  });

  const idiomPatterns = (data.idioms || [])
    .filter(i => i.phrase)
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const wordPatterns = (data.words || []).filter(w => w.word);

  // Save compiled patterns to state so viewport/mutation annotators
  // can reuse them without rebuilding on every scroll event.
  state.idiomPatterns = idiomPatterns;
  state.wordPatterns  = wordPatterns;

  const walker = document.createTreeWalker(
    rootElement, NodeFilter.SHOW_TEXT, makeUnannotatedTextFilter()
  );

  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);
  for (const tn of textNodes) annotateTextNode(tn, idiomPatterns, wordPatterns);

  annotateSentences(rootElement, data.complex_sentences);
}

// ─── Active Pattern Management ───────────────────────────────────────────────

// Immediately remove a deleted AI annotation from the in-memory pattern lists
// so that annotateViewport / annotateNewNode don't re-annotate the same text
// during the current page session.
// Persistence across page reloads is handled separately: DELETE_ANNOTATION in
// background.js writes to ignoredAnnotations_${url}, and autoRestoreAnnotation
// calls filterIgnoredAnnotations() on the next load.
function removeFromActivePatterns(type, text) {
  const lower = text.toLowerCase();
  if (type === 'word') {
    state.wordPatterns = state.wordPatterns.filter(w => w.word.toLowerCase() !== lower);
    if (state.analysisData?.words) {
      state.analysisData.words = state.analysisData.words.filter(w => w.word.toLowerCase() !== lower);
    }
  } else if (type === 'idiom') {
    state.idiomPatterns = state.idiomPatterns.filter(p => p.phrase.toLowerCase() !== lower);
    if (state.analysisData?.idioms) {
      state.analysisData.idioms = state.analysisData.idioms.filter(i => i.phrase.toLowerCase() !== lower);
    }
  } else if (type === 'sentence') {
    // Sentences are re-applied by annotateNewNode via annotateSentences;
    // removing from analysisData prevents that from happening.
    // s.sentence may have | / + markers; text (spanText) is the clean DOM text.
    if (state.analysisData?.complex_sentences) {
      state.analysisData.complex_sentences = state.analysisData.complex_sentences.filter(s => {
        const cleanS = (s.sentence || '').replace(/\s*[|+]\s*/g, ' ').replace(/\s+/g, ' ').trim();
        return cleanS !== text;
      });
    }
  }
}

// ─── Lazy-Load Annotation ─────────────────────────────────────────────────────
// CNN and similar sites insert content into the DOM as the user scrolls.
// annotateViewport() handles scroll-triggered lazy content;
// MutationObserver handles any newly inserted DOM nodes immediately.

// Annotate text nodes within rootElement that have not yet been annotated.
// Called for newly inserted DOM nodes (MutationObserver) and on scroll settle.
function annotateNewNode(rootElement) {
  if (!state.isAnnotated) return;
  if (state.idiomPatterns.length === 0 && state.wordPatterns.length === 0) return;

  // Skip non-content elements entirely
  if (rootElement.nodeType !== Node.ELEMENT_NODE) return;
  const tag = rootElement.tagName?.toLowerCase();
  if (['script', 'style', 'noscript', 'head', 'meta', 'link'].includes(tag)) return;

  const walker = document.createTreeWalker(
    rootElement, NodeFilter.SHOW_TEXT, makeUnannotatedTextFilter()
  );

  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);
  if (textNodes.length === 0) return;

  console.log(`[RWM] annotateNewNode: ${textNodes.length} text nodes in new element`);
  for (const tn of textNodes) {
    annotateTextNode(tn, state.idiomPatterns, state.wordPatterns);
  }

  // Attempt sentence annotation on the new subtree
  if (state.analysisData?.complex_sentences?.length) {
    annotateSentences(rootElement, state.analysisData.complex_sentences);
  }
}

// Annotate text nodes that are currently in (or near) the viewport.
// Runs after the user stops scrolling, catching lazy-loaded content
// that the initial annotateDOM pass couldn't reach.
function annotateViewport() {
  if (!state.isAnnotated) return;
  if (state.idiomPatterns.length === 0 && state.wordPatterns.length === 0) return;

  const margin   = 200; // px above and below visible area
  const vpTop    = -margin;                          // viewport-relative
  const vpBottom = window.innerHeight + margin;

  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_TEXT, makeUnannotatedTextFilter()
  );

  // Snapshot all eligible text nodes first, then filter by position.
  // Batching avoids interleaving reads and writes which cause layout thrashing.
  const candidates = [];
  let n;
  while ((n = walker.nextNode())) candidates.push(n);

  // Group by parent element so we call getBoundingClientRect() once per element
  const parentSeen = new Set();
  const inViewport = [];
  for (const tn of candidates) {
    const parent = tn.parentElement;
    if (!parent) continue;
    if (!parentSeen.has(parent)) {
      parentSeen.add(parent);
      const rect = parent.getBoundingClientRect();
      // rect is viewport-relative; check overlap with expanded viewport band
      parent._rwmInView = rect.bottom >= vpTop && rect.top <= vpBottom;
    }
    if (parent._rwmInView) inViewport.push(tn);
  }

  // Clean up temporary property
  for (const el of parentSeen) delete el._rwmInView;

  if (inViewport.length === 0) return;

  console.log(`[RWM] annotateViewport: annotating ${inViewport.length} text nodes`);
  for (const tn of inViewport) {
    annotateTextNode(tn, state.idiomPatterns, state.wordPatterns);
  }
}

// Debounced scroll handler: wait 300 ms after scroll stops, then annotate viewport
let _scrollTimer = null;
window.addEventListener('scroll', () => {
  if (!state.isAnnotated) return;
  clearTimeout(_scrollTimer);
  _scrollTimer = setTimeout(() => {
    requestAnimationFrame(annotateViewport);
  }, 300);
}, { passive: true });

// MutationObserver: catch nodes inserted by lazy loaders (infinite scroll, SPA routing)
let _mutationObserver = null;

function startMutationObserver() {
  if (_mutationObserver) return; // already running

  _mutationObserver = new MutationObserver((mutations) => {
    if (!state.isAnnotated) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Small delay so the browser can finish rendering the new node
          // before we walk its text nodes
          setTimeout(() => annotateNewNode(node), 50);
        }
      }
    }
  });

  _mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[RWM] MutationObserver started');
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

let activeTooltip          = null;
let _activeTransformedSpan = null;
let _activeOriginalText    = null;

// Persists whether each sentence span's tooltip is showing translation.
// Keyed by the span element itself (auto-cleaned when span is removed).
const sentenceTranslationState = new WeakMap();

function hideTooltip() {
  if (_activeTransformedSpan) {
    if (_activeOriginalText !== null && document.contains(_activeTransformedSpan)) {
      _activeTransformedSpan.textContent = _activeOriginalText;
    }
    _activeTransformedSpan = null;
    _activeOriginalText    = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.9;
  window.speechSynthesis.speak(utt);
}

function buildTooltip(type, data, options = {}) {
  const langFontSize = { zh: '13px', en: '11px', ja: '12px', ko: '12px', es: '11px', fr: '11px' };
  const tooltipFontSize = langFontSize[_lang] || '13px';

  const wrap = document.createElement('div');
  wrap.className = 'rwm-tooltip';
  Object.assign(wrap.style, {
    position: 'absolute',
    zIndex: '2147483647',
    display: 'block',
    visibility: 'hidden',   // made visible after positioning
    boxSizing: 'border-box',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    padding: '12px 14px',
    maxWidth: '300px',
    minWidth: '190px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: tooltipFontSize,
    lineHeight: '1.6',
    color: '#1a202c',
    pointerEvents: 'auto',
    top: '0',
    left: '0',
  });

  // ── Header ──
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9',
    boxSizing: 'border-box',
  });

  const term = document.createElement('span');
  Object.assign(term.style, {
    fontWeight: '700', fontSize: '15px', color: '#1a202c',
    flex: '1', marginRight: '8px', wordBreak: 'break-word', fontFamily: 'inherit',
  });

  const badge = document.createElement('span');
  Object.assign(badge.style, {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: '11px', color: '#6b7280',
    background: '#f3f4f6', padding: '2px 8px', borderRadius: '10px',
    fontWeight: '500', whiteSpace: 'nowrap', flexShrink: '0', fontFamily: 'inherit',
  });

  if (type === 'word') {
    term.textContent = data.word || '';
    const levelDotColors = { A1: '#3b82f6', A2: '#3b82f6', B1: '#f59e0b', B2: '#f59e0b', C1: '#ef4444', C2: '#ef4444' };
    const dotColor = levelDotColors[data.level];
    if (dotColor) {
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        display: 'inline-block', width: '8px', height: '8px',
        borderRadius: '50%', background: dotColor, flexShrink: '0',
      });
      badge.appendChild(dot);
    }
    badge.appendChild(document.createTextNode(rwmDiffLabel(data.level, _lang) || data.level || '词汇'));
  } else if (type === 'sentence') {
    term.textContent  = data.grammar || '语法结构';
    badge.textContent = rwmT('longSentence', _lang);
  } else {
    term.textContent  = data.phrase || '';
    badge.textContent = rwmT('idiom', _lang);
  }
  header.appendChild(term);
  header.appendChild(badge);
  wrap.appendChild(header);

  // ── Body ──
  const body = document.createElement('div');
  body.style.marginBottom = '10px';

  const addRow = (text, extra = {}) => {
    if (!text) return;
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, {
      margin: '5px 0 0', padding: '0', fontFamily: 'inherit',
      fontSize: '13px', lineHeight: '1.6', color: '#374151', ...extra,
    });
    body.appendChild(p);
  };

  let _translateSection = null;
  let _pendingEl = null; // placeholder for on-demand AI simplification

  if (type === 'word') {
    const defText = data.definitions?.[_lang] || data.definitions?.en || data.definitions?.zh || data.definition || '';
    addRow(defText, { fontSize: '14px', color: '#1f2937', fontWeight: '600' });
    addRow(data.example ? `${rwmT('example', _lang)}${data.example}` : '', { color: '#9ca3af', fontStyle: 'italic', fontSize: '12px' });
  } else if (type === 'sentence') {
    if (data.parts && Array.isArray(data.parts) && data.parts.length > 0) {
      // Structure summary: e.g. "主语 | 定语从句 | 谓语部分"
      if (data.structureSummary) {
        const summaryEl = document.createElement('p');
        summaryEl.textContent = data.structureSummary;
        Object.assign(summaryEl.style, {
          margin: '5px 0 0', padding: '4px 8px', fontFamily: 'inherit',
          fontSize: '12px', color: '#374151', lineHeight: '1.5',
          background: '#f3f4f6', borderRadius: '4px',
        });
        body.appendChild(summaryEl);
      }
      if (data.explanation) addRow(data.explanation, { fontSize: '12px', color: '#6b7280' });

      // Translation / Simplify section — hidden until button is clicked
      const transSection = document.createElement('div');
      Object.assign(transSection.style, {
        display: 'none', marginTop: '8px', padding: '8px 10px',
        background: '#f0fdf4', borderRadius: '4px',
        borderLeft: '2px solid #bbf7d0', fontFamily: 'inherit',
      });

      if (_lang === 'en') {
        // English: show one-sentence core summary.
        // If the analysis data already has simplifiedSummary, show it immediately.
        // Otherwise, mark a placeholder element (_pendingEl) for on-demand AI call.
        const sumEl = document.createElement('div');
        const readyText = data.simplifiedSummary || data.summary || data.freeTranslation || '';
        if (readyText) {
          sumEl.textContent = readyText;
          Object.assign(sumEl.style, {
            fontSize: '12px', color: '#374151', lineHeight: '1.6', fontFamily: 'inherit',
          });
        } else {
          // Placeholder — will be filled in when the user first clicks Simplify
          Object.assign(sumEl.style, {
            fontSize: '12px', color: '#9ca3af', lineHeight: '1.6',
            fontFamily: 'inherit', fontStyle: 'italic',
          });
          _pendingEl = sumEl;
        }
        transSection.appendChild(sumEl);
      } else {
        // Non-English: literal translation + free (natural) translation
        if (data.literalTranslation) {
          const litEl = document.createElement('div');
          litEl.textContent = `${rwmT('literalPrefix', _lang)}${data.literalTranslation}`;
          Object.assign(litEl.style, {
            fontSize: '12px', color: '#374151', lineHeight: '1.6',
            marginBottom: data.freeTranslation ? '5px' : '0', fontFamily: 'inherit',
          });
          transSection.appendChild(litEl);
        }
        if (data.freeTranslation) {
          const freeEl = document.createElement('div');
          freeEl.textContent = `${rwmT('freePrefix', _lang)}${data.freeTranslation}`;
          Object.assign(freeEl.style, {
            fontSize: '12px', color: '#374151', lineHeight: '1.6', fontFamily: 'inherit',
          });
          transSection.appendChild(freeEl);
        }
      }

      body.appendChild(transSection);
      _translateSection = transSection;
    } else {
      // Backward compat: old sentence data without parts
      addRow(data.explanation || '', { fontSize: '14px', color: '#1f2937', fontWeight: '600' });
    }
  } else {
    if (_lang !== 'en') {
      addRow(`${rwmT('idiomLiteral', _lang)}${data.literal || ''}`, { fontSize: '14px', color: '#1f2937', fontWeight: '600' });
    }
    addRow(`${rwmT('idiomUsage', _lang)}${data.usage || ''}`, { fontSize: _lang === 'en' ? '14px' : '13px', color: _lang === 'en' ? '#1f2937' : '#4b5563', fontWeight: _lang === 'en' ? '600' : '400' });
    addRow(data.example ? `${rwmT('example', _lang)}${data.example}` : '', { color: '#9ca3af', fontStyle: 'italic', fontSize: '12px' });
  }
  wrap.appendChild(body);

  // ── Actions ──
  const actions = document.createElement('div');
  Object.assign(actions.style, {
    display: 'flex', gap: '8px', justifyContent: 'flex-end',
    paddingTop: '10px', borderTop: '1px solid #f1f5f9', boxSizing: 'border-box',
  });

  const makeBtn = (icon, bg, color, borderColor, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = icon;
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', fontSize: '14px',
      width: '26px', height: '26px', borderRadius: '6px', cursor: 'pointer',
      border: `1px solid ${borderColor}`, background: bg, color,
      outline: 'none', boxSizing: 'border-box', lineHeight: '1', padding: '0',
    });
    btn.addEventListener('click', onClick);
    return btn;
  };

  // ⭐ Save / Remove — word only
  if (type === 'word') {
    if (options.isCollected) {
      const unsaveBtn = makeBtn('⭐', '#ecfdf5', '#059669', '#6ee7b7', (e) => {
        e.stopPropagation();
        unsaveBtn.disabled = true;
        unsaveBtn.style.opacity = '0.6';
        state.vocabSet.delete((data.word || '').toLowerCase());
        if (typeof options.onUncollect === 'function') options.onUncollect();
        chrome.runtime.sendMessage({ type: 'DELETE_WORD', word: data.word });
        hideTooltip();
      });
      unsaveBtn.title = rwmT('remove', _lang);
      actions.appendChild(unsaveBtn);
    } else {
      const saveBtn = makeBtn('⭐', '#fffbeb', '#b45309', '#fde68a', (e) => {
        e.stopPropagation();
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        state.vocabSet.add((data.word || '').toLowerCase());
        if (typeof options.onCollect === 'function') options.onCollect();
        chrome.runtime.sendMessage({
          type: 'SAVE_WORD',
          word: {
            word:        data.word,
            level:       data.level,
            definitions: data.definitions || undefined,
            synonyms:    Array.isArray(data.synonyms) && data.synonyms.length > 0
                           ? data.synonyms : undefined,
            example:     data.example,
            sourceTitle: document.title,
            sourceUrl:   window.location.href,
          },
        }, () => {
          saveBtn.style.background = '#ecfdf5';
          saveBtn.style.borderColor = '#6ee7b7';
          saveBtn.title = rwmT('remove', _lang);
        });
      });
      saveBtn.title = rwmT('save', _lang);
      actions.appendChild(saveBtn);
    }
  }

  // 🔊 Speak — word and idiom
  if (type === 'word' || type === 'idiom') {
    const speakText = type === 'word' ? (data.word || '') : (data.phrase || '');
    const speakBtn = makeBtn('🔊', '#eff6ff', '#2563eb', '#bfdbfe', (e) => {
      e.stopPropagation();
      speak(speakText);
    });
    speakBtn.title = rwmT('speak', _lang);
    actions.appendChild(speakBtn);
  }

  // 🌐 Translate toggle — sentence only
  if (type === 'sentence' && _translateSection) {
    let transShowing = options.translationVisible ?? false;
    _translateSection.style.display = transShowing ? 'block' : 'none';
    const transBtn = makeBtn('🌐', transShowing ? '#f0f9ff' : '#fff', '#374151', transShowing ? '#bae6fd' : '#e5e7eb', (e) => {
      e.stopPropagation();
      transShowing = !transShowing;
      _translateSection.style.display = transShowing ? 'block' : 'none';
      transBtn.style.background   = transShowing ? '#f0f9ff' : '#fff';
      transBtn.style.borderColor  = transShowing ? '#bae6fd' : '#e5e7eb';

      if (transShowing && _pendingEl) {
        _pendingEl.textContent = rwmT('generating', _lang);
        chrome.runtime.sendMessage(
          { type: 'SIMPLIFY_SENTENCE', sentence: data.sentence || '' },
          (res) => {
            if (res?.simplified) {
              _pendingEl.textContent = res.simplified;
              _pendingEl.style.color = '#374151';
              _pendingEl.style.fontStyle = '';
              data.simplifiedSummary = res.simplified;
            } else {
              _pendingEl.textContent = '(Could not simplify)';
              _pendingEl.style.color = '#9ca3af';
            }
            _pendingEl = null;
          }
        );
      }

      if (typeof options.onTranslationToggle === 'function') {
        options.onTranslationToggle(transShowing);
      }
    });
    transBtn.title = rwmT('simplify', _lang);
    actions.appendChild(transBtn);
  }

  // 🗑️ Delete — always present
  const deleteBtn = makeBtn('🗑️', '#fff', '#6b7280', '#e5e7eb', (e) => {
    e.stopPropagation();
    hideTooltip();
    if (typeof options.onDelete === 'function') options.onDelete();
  });
  deleteBtn.title = rwmT('delete', _lang);
  actions.appendChild(deleteBtn);

  wrap.appendChild(actions);
  return wrap;
}

// Position tooltip relative to the exact click coordinates.
// Using click coords instead of getBoundingClientRect() avoids the common
// "tooltip appears at (0,0)" bug that occurs when spans are inside CSS
// transform containers or have zero computed dimensions.
function positionTooltipAtClick(tooltip, clickX, clickY) {
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Ensure the element is measurable before reading dimensions.
  if (tooltip.style.display === 'none') tooltip.style.display = 'block';

  // Use requestAnimationFrame so the browser has finished one layout pass
  // before we measure offsetWidth/Height — avoids reading stale zeros.
  requestAnimationFrame(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // If dimensions are still 0 after a layout pass, use safe fallback values
    const tw = tooltip.offsetWidth  || 260;
    const th = tooltip.offsetHeight || 200;

    // Convert viewport click coords to document (absolute) coords
    let top  = clickY + scrollY + 12;
    let left = clickX + scrollX - Math.round(tw / 2);

    // Clamp within the visible viewport (expressed in document coords)
    if (left < scrollX + 8)               left = scrollX + 8;
    if (left + tw > scrollX + vw - 8)     left = Math.max(scrollX + 8, scrollX + vw - tw - 8);

    // Flip above the cursor if there isn't enough room below
    if (top + th > scrollY + vh - 8) {
      const topAbove = clickY + scrollY - th - 12;
      if (topAbove >= scrollY + 8) top = topAbove;
    }

    console.log('[RWM] positionTooltipAtClick:', {
      clickX, clickY, vw, vh, tw, th, scrollX, scrollY,
      result: { top: Math.round(top), left: Math.round(left) },
    });

    tooltip.style.top        = `${Math.round(top)}px`;
    tooltip.style.left       = `${Math.round(left)}px`;
    tooltip.style.visibility = 'visible';
  });
}

// Fallback: position by the anchor element's bounding rect.
// Used when click coords are unavailable (e.g. keyboard activation).
function positionTooltip(tooltip, anchorRect) {
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  if (tooltip.style.display === 'none') tooltip.style.display = 'block';

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const tw = tooltip.offsetWidth  || 280;
  const th = tooltip.offsetHeight || 160;

  // anchorRect is viewport-relative; add scroll offsets to get document coords
  let top  = anchorRect.bottom + scrollY + 8;
  let left = anchorRect.left   + scrollX;

  if (left + tw > scrollX + vw - 8) left = Math.max(scrollX + 8, scrollX + vw - tw - 8);
  if (top  + th > scrollY + vh - 8) {
    const topAbove = anchorRect.top + scrollY - th - 8;
    if (topAbove >= scrollY + 8) top = topAbove;
  }

  tooltip.style.top  = `${Math.round(top)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.visibility = 'visible';
}

function fallbackData(type, text) {
  if (type === 'word')    return { word: text,  level: '',    definitions: { zh: '（暂无释义）', en: '(no definition)' }, example: '' };
  if (type === 'idiom')   return { phrase: text, literal: text, usage: '（暂无解释）',   example: '' };
  /* sentence */          return { sentence: text, grammar: '复杂句', explanation: '' };
}

// clickX / clickY: viewport coordinates from the triggering mouse event.
// When provided they take priority over getBoundingClientRect() for positioning.
function showTooltip(span, clickX, clickY) {
  hideTooltip();

  const type = span.getAttribute('data-rwm-annotated');
  if (!type) return;

  const rawData = span.getAttribute('data-rwm-data');
  console.log('[RWM] showTooltip:', {
    type,
    spanText: span.textContent.slice(0, 30),
    rawData: rawData?.slice(0, 80),
    clickX, clickY,
  });

  let data;
  if (!rawData || rawData === 'undefined' || rawData === 'null') {
    console.warn('[RWM] Invalid data-rwm-data ("' + rawData + '") — using fallback');
    data = fallbackData(type, span.textContent);
  } else {
    try {
      data = JSON.parse(rawData);
    } catch (err) {
      console.warn('[RWM] JSON.parse failed:', err.message, '| rawData:', rawData.slice(0, 100));
      data = fallbackData(type, span.textContent);
    }
  }

  // Capture identity before the async layout pass so the delete closure stays valid.
  const source      = span.getAttribute('data-rwm-source') || 'ai';
  const annotId     = span.getAttribute('data-rwm-id') || null;
  const spanText    = span.textContent;
  const isCollected = type === 'word' && isCollectedWord(spanText);

  // For sentences with parts: transform the in-page text with blue │ separators
  if (type === 'sentence' && Array.isArray(data.parts) && data.parts.length > 0) {
    _activeOriginalText    = spanText;
    _activeTransformedSpan = span;
    while (span.firstChild) span.removeChild(span.firstChild);
    data.parts.forEach((part, i) => {
      if (i > 0) {
        // | = major grammatical boundary → blue pipe separator
        const sep = document.createElement('span');
        sep.textContent = ' │ ';
        Object.assign(sep.style, { color: '#2563eb', pointerEvents: 'none', fontStyle: 'normal' });
        span.appendChild(sep);
      }
      // + within a part's text = minor connection → green plus connector
      const subParts = (part.text || '').split(/\s*\+\s*/);
      subParts.forEach((sub, j) => {
        if (j > 0) {
          const connector = document.createElement('span');
          connector.textContent = ' + ';
          Object.assign(connector.style, { color: '#10b981', pointerEvents: 'none', fontStyle: 'normal' });
          span.appendChild(connector);
        }
        if (sub) span.appendChild(document.createTextNode(sub));
      });
    });
  }

  const tooltip = buildTooltip(type, data, {
    isCollected,
    translationVisible: type === 'sentence' ? (sentenceTranslationState.get(span) ?? false) : false,
    onTranslationToggle: (visible) => sentenceTranslationState.set(span, visible),
    // Refresh all spans with this word so every occurrence updates at once.
    onCollect:   () => refreshVocabHighlights(),
    onUncollect: () => refreshVocabHighlights(),
    onDelete: () => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(spanText), span);
        parent.normalize();
      }
      // Pull the text out of the active patterns immediately so that
      // annotateViewport / annotateNewNode (triggered by scroll or DOM mutation)
      // cannot re-annotate this span during the current page session.
      if (source === 'ai') {
        removeFromActivePatterns(type, spanText);
      }
      chrome.runtime.sendMessage({
        type: 'DELETE_ANNOTATION',
        id: annotId,
        text: spanText,
        source,
        url: window.location.href,
      });
    },
  });

  // Validate click coordinates: must be finite numbers within the viewport.
  // Coordinates outside the viewport or NaN/Infinity mean the caller didn't
  // have real coords, so fall back to the anchor element's bounding rect.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hasValidClick = (
    typeof clickX === 'number' && typeof clickY === 'number' &&
    Number.isFinite(clickX)   && Number.isFinite(clickY)    &&
    clickX >= 0 && clickX <= vw &&
    clickY >= 0 && clickY <= vh
  );

  console.log('[RWM] positioning strategy:', hasValidClick ? 'click coords' : 'anchor rect (coords invalid)');

  if (hasValidClick) {
    positionTooltipAtClick(tooltip, clickX, clickY);
  } else {
    positionTooltip(tooltip, span.getBoundingClientRect());
  }
}

// ─── User Annotation (Selection Menu) ────────────────────────────────────────
// When the user selects text, a compact menu appears near the selection.
// They choose a type (word / sentence / idiom), click "标注为难点", and the
// plugin calls DeepSeek to generate the explanation, then wraps the selected
// Range in a styled span and persists the annotation to chrome.storage.local.

let selectionMenu  = null;
let _pendingRange  = null; // Range saved at mouseup, consumed when the button fires

function hideSelectionMenu() {
  if (selectionMenu) { selectionMenu.remove(); selectionMenu = null; }
  _pendingRange = null;
}

// Apply the same inline styles used by AI-generated annotations.
function applyAnnotationStyle(span, type) {
  span.style.cursor = 'pointer';
  if (type === 'word') {
    span.style.backgroundColor = 'rgba(255, 215, 0, 0.38)';
    span.style.borderRadius = '2px';
  } else if (type === 'sentence') {
    span.style.borderBottom = '2px dashed rgba(41, 115, 255, 0.75)';
    span.style.paddingBottom = '1px';
  } else if (type === 'idiom') {
    span.style.textDecoration = 'underline wavy rgba(220, 50, 50, 0.75)';
    span.style.textDecorationSkipInk = 'none';
  }
}

function generateAnnotationId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function showSelectionMenu(selText, range, anchorX, anchorY) {
  hideSelectionMenu();
  _pendingRange = range.cloneRange();

  const menu = document.createElement('div');
  menu.id = 'rwm-selection-menu';
  Object.assign(menu.style, {
    position: 'absolute', zIndex: '2147483646',
    background: '#ffffff', border: '1px solid #e2e8f0',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px',
    minWidth: '196px', boxSizing: 'border-box',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    fontSize: '13px', color: '#1a202c', userSelect: 'none',
    top: '0', left: '0',
  });

  // ── Type selector (pill buttons) ──
  const typeRow = document.createElement('div');
  Object.assign(typeRow.style, { display: 'flex', gap: '5px' });

  const TYPES = [
    { value: 'word',     label: rwmT('word', _lang) },
    { value: 'sentence', label: rwmT('longSentence', _lang) },
    { value: 'idiom',    label: rwmT('idiom', _lang) },
  ];
  let selectedType = 'word';

  const pillStyle = (active) => ({
    flex: '1', padding: '4px 0', borderRadius: '6px', cursor: 'pointer',
    border: `1px solid ${active ? '#667eea' : '#e5e7eb'}`,
    background: active ? '#f5f3ff' : '#f9fafb',
    color: active ? '#4f46e5' : '#6b7280',
    fontSize: '12px', fontWeight: active ? '600' : '400',
    fontFamily: 'inherit', outline: 'none', transition: 'all 0.12s',
  });

  const pills = TYPES.map(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.typeVal = value;
    Object.assign(btn.style, pillStyle(value === selectedType));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedType = value;
      pills.forEach(b => Object.assign(b.style, pillStyle(b.dataset.typeVal === value)));
    });
    return btn;
  });
  pills.forEach(b => typeRow.appendChild(b));
  menu.appendChild(typeRow);

  // ── Annotate button ──
  const annotateBtn = document.createElement('button');
  annotateBtn.type = 'button';
  annotateBtn.textContent = rwmT('markAsDifficult', _lang);
  Object.assign(annotateBtn.style, {
    width: '100%', padding: '7px', boxSizing: 'border-box',
    background: '#111827',
    color: '#fff', border: 'none', borderRadius: '6px',
    fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit',
  });

  annotateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!_pendingRange) return;
    const savedRange = _pendingRange;
    annotateBtn.textContent = rwmT('generating', _lang);
    annotateBtn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ANNOTATE_SELECTION',
        text: selText,
        selectionType: selectedType,
      });
      if (result?.error) throw new Error(result.error);
      applyUserAnnotation(savedRange, selectedType, selText, result.data);
      hideSelectionMenu();
    } catch (err) {
      annotateBtn.textContent = '失败，点击重试';
      annotateBtn.disabled = false;
      console.warn('[RWM] Selection annotation failed:', err.message);
    }
  });
  menu.appendChild(annotateBtn);

  document.body.appendChild(menu);
  selectionMenu = menu;

  // Position below the selection, flipped above if viewport is too short.
  requestAnimationFrame(() => {
    const sx = window.scrollX, sy = window.scrollY;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = menu.offsetWidth || 200, mh = menu.offsetHeight || 90;
    let top  = anchorY + sy + 8;
    let left = anchorX + sx - Math.round(mw / 2);
    if (left < sx + 8)           left = sx + 8;
    if (left + mw > sx + vw - 8) left = Math.max(sx + 8, sx + vw - mw - 8);
    if (top + mh > sy + vh - 8) {
      const above = anchorY + sy - mh - 8;
      if (above >= sy + 8) top = above;
    }
    menu.style.top  = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  });
}

// Wrap the user's selection Range in a styled annotated span and save it.
function applyUserAnnotation(range, type, selText, data) {
  const id = generateAnnotationId();
  const span = document.createElement('span');
  span.setAttribute('data-rwm-annotated', type);
  span.setAttribute('data-rwm-source', 'user');
  span.setAttribute('data-rwm-id', id);
  span.setAttribute('data-rwm-data', JSON.stringify(data));
  span.className = `rwm-${type}`;
  applyAnnotationStyle(span, type);

  try {
    range.surroundContents(span);
  } catch {
    // surroundContents throws when the range partially overlaps an element boundary.
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }

  chrome.runtime.sendMessage({
    type: 'SAVE_USER_ANNOTATION',
    url: window.location.href,
    annotation: { id, type, text: selText, data, url: window.location.href, timestamp: Date.now(), source: 'user' },
  });
}

// Re-insert one persisted user annotation by walking text nodes for the first match.
function restoreUserAnnotationInDOM(ann) {
  const walker = document.createTreeWalker(
    document.body, NodeFilter.SHOW_TEXT, makeUnannotatedTextFilter()
  );
  let node;
  while ((node = walker.nextNode())) {
    const nv = node.nodeValue || '';
    const idx = nv.indexOf(ann.text);
    if (idx === -1) continue;

    const span = document.createElement('span');
    span.setAttribute('data-rwm-annotated', ann.type);
    span.setAttribute('data-rwm-source', 'user');
    span.setAttribute('data-rwm-id', ann.id);
    span.setAttribute('data-rwm-data', JSON.stringify(ann.data));
    span.className = `rwm-${ann.type}`;
    applyAnnotationStyle(span, ann.type);
    span.textContent = ann.text;

    const frag = document.createDocumentFragment();
    if (idx > 0) frag.appendChild(document.createTextNode(nv.slice(0, idx)));
    frag.appendChild(span);
    if (idx + ann.text.length < nv.length)
      frag.appendChild(document.createTextNode(nv.slice(idx + ann.text.length)));
    node.parentNode.replaceChild(frag, node);
    return true;
  }
  return false;
}

// Load and re-apply all user annotations saved for the current page URL.
async function restoreUserAnnotations() {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'GET_USER_ANNOTATIONS',
      url: window.location.href,
    });
    if (!result?.annotations?.length) return;
    console.log(`[RWM] Restoring ${result.annotations.length} user annotation(s)`);
    for (const ann of result.annotations) restoreUserAnnotationInDOM(ann);
  } catch (err) {
    console.log('[RWM] User annotation restore skipped:', err.message);
  }
}

// ─── Interaction Mode ─────────────────────────────────────────────────────────
// 'hover' (default): tooltip appears 300ms after cursor enters an annotated
//   span, and stays open when the cursor moves from span to tooltip card.
// 'click': tooltip appears immediately on click (no hover logic).
// The active mode is read from chrome.storage.local and can be changed in the
// settings page; it takes effect instantly with no page reload required.

let interactionMode = 'hover';

// Load stored mode asynchronously; 'hover' is the fallback on first install.
chrome.storage.local.get('interactionMode').then(({ interactionMode: stored }) => {
  interactionMode = stored || 'hover';
});

// React to settings-page changes without requiring a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.interactionMode) return;
  interactionMode = changes.interactionMode.newValue || 'hover';
  hideTooltip();
  clearHoverTimers();
  console.log('[RWM] Interaction mode →', interactionMode);
});

// ─── Hover Mode Helpers ───────────────────────────────────────────────────────

let _hoverShowTimer = null; // pending 300ms delay before showing tooltip
let _hoverHideTimer = null; // 100ms grace period before hiding (span → tooltip)

function clearHoverTimers() {
  clearTimeout(_hoverShowTimer);
  clearTimeout(_hoverHideTimer);
  _hoverShowTimer = null;
  _hoverHideTimer = null;
}

// Makes the tooltip card "sticky" in hover mode: moving the cursor from the
// annotated span to the tooltip won't dismiss it.
function attachTooltipHoverListeners(tooltip) {
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(_hoverHideTimer);
    _hoverHideTimer = null;
  });
  tooltip.addEventListener('mouseleave', () => {
    hideTooltip();
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Capture phase: always tracks click position for accurate tooltip placement.
// In 'click' mode it also triggers the tooltip; in 'hover' mode clicking a span
// does nothing extra (hover already showed it), but clicking outside still closes.
document.addEventListener('click', (e) => {
  lastClickPos = { x: e.clientX, y: e.clientY };

  // Close selection menu on any click that lands outside it
  if (selectionMenu && !selectionMenu.contains(e.target)) {
    hideSelectionMenu();
  }

  const span = e.target.closest('[data-rwm-annotated]');
  if (span) {
    if (interactionMode === 'click') {
      e.stopPropagation();
      showTooltip(span, e.clientX, e.clientY);
    }
    return;
  }

  // Click outside any annotation or tooltip — close in both modes.
  if (activeTooltip && !activeTooltip.contains(e.target)) {
    hideTooltip();
  }
}, true);

// Show selection menu when the user releases the mouse over a non-empty selection.
document.addEventListener('mouseup', (e) => {
  // Ignore clicks inside our own UI elements
  if (e.target.closest('#rwm-selection-menu') || e.target.closest('[data-rwm-annotated]')) return;
  if (activeTooltip?.contains(e.target)) return;

  // Small delay lets the browser finalise the selection object
  setTimeout(() => {
    const sel = document.getSelection();
    const selText = sel?.toString().trim();
    if (!selText || selText.length < 2 || selText.length > 500) {
      hideSelectionMenu();
      return;
    }
    if (sel.rangeCount === 0) { hideSelectionMenu(); return; }

    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    showSelectionMenu(selText, range, rect.left + rect.width / 2, rect.bottom);
  }, 10);
});

// Hover mode — show tooltip after a 300ms delay to avoid triggering on
// fast cursor sweeps across the page.
document.addEventListener('mouseover', (e) => {
  if (interactionMode !== 'hover') return;
  const span = e.target.closest('[data-rwm-annotated]');
  if (!span) return;

  clearHoverTimers();
  _hoverShowTimer = setTimeout(() => {
    _hoverShowTimer = null;
    showTooltip(span, e.clientX, e.clientY);
    if (activeTooltip) attachTooltipHoverListeners(activeTooltip);
  }, 300);
});

// Hover mode — cancel a pending show, or start a 100ms grace period so the
// cursor can travel from the span to the tooltip without dismissing it.
document.addEventListener('mouseout', (e) => {
  if (interactionMode !== 'hover') return;
  const span = e.target.closest('[data-rwm-annotated]');
  if (!span) return;

  clearTimeout(_hoverShowTimer);
  _hoverShowTimer = null;

  if (!_hoverHideTimer) {
    _hoverHideTimer = setTimeout(() => {
      _hoverHideTimer = null;
      hideTooltip();
    }, 100);
  }
});

// ESC key closes the tooltip in either mode.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeTooltip) hideTooltip();
});

// Scrolling closes the tooltip, the selection menu, and clears hover timers.
window.addEventListener('scroll', () => {
  hideTooltip();
  hideSelectionMenu();
  clearHoverTimers();
}, { passive: true, capture: true });

// ─── Auto-Restore Annotation ─────────────────────────────────────────────────
// On every page load, silently check if background has cached analysis for this
// URL. If the content hash still matches, re-annotate without any API call,
// so the user never has to click "Analyze" again after a refresh.

// Poll until the main content element has enough text, or retries are exhausted.
// Needed for sites like Reedsy that render article text after DOMContentLoaded.
function waitForMainContent(retries = 10, delay = 500) {
  return new Promise((resolve) => {
    const check = () => {
      try {
        const { text } = extractMainText();
        if (text && text.length > 200) { resolve(true); return; }
      } catch { /* ignore, keep retrying */ }
      if (retries > 0) {
        retries--;
        setTimeout(check, delay);
      } else {
        console.log('[RWM] waitForMainContent: 等待超时，未找到足量正文内容');
        resolve(false);
      }
    };
    check();
  });
}

// Filter cached annotation data by the per-URL ignored list.
function filterIgnoredAnnotations(data, ignored) {
  if (!ignored || ignored.length === 0) return data;
  const set = new Set(ignored.map(t => t.toLowerCase()));
  return {
    ...data,
    words: (data.words || []).filter(w => !set.has(w.word.toLowerCase())),
    complex_sentences: (data.complex_sentences || []).filter(s => {
      const clean = (s.sentence || '').replace(/\s*[|+]\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      return !set.has(clean);
    }),
    idioms: (data.idioms || []).filter(i => !set.has(i.phrase.toLowerCase())),
  };
}

async function autoRestoreAnnotation() {
  if (state.isAnnotated) return; // popup already triggered annotation

  // Wait for the article body to be present in the DOM before doing anything.
  // Sites like Reedsy render content after DOMContentLoaded, so a fixed delay
  // is not reliable — we poll until enough text is visible.
  const contentReady = await waitForMainContent(10, 500);
  if (!contentReady) {
    console.log('[RWM] 页面内容未就绪，跳过自动恢复');
    // Still try to restore user annotations even if AI cache won't match
    await restoreUserAnnotations();
    return;
  }

  // Actively reload vocab here (not just the cached promise) so we pick up any
  // words that were saved between content-script injection and DOMContentLoaded.
  await loadVocabSet();
  console.log('[RWM] autoRestoreAnnotation: vocabSet 加载完成，大小:', state.vocabSet.size);

  try {
    const { element, text } = extractMainText();
    if (!text || text.length < 200) {
      console.log('[RWM] 页面文本不足 200 字符，跳过');
      return;
    }

    const contentHash = computeContentHash(text);
    const cached = await chrome.runtime.sendMessage({
      type: 'GET_CACHE',
      url: window.location.href,
    });

    // Apply AI annotations only when the cache is still valid for this article
    if (cached?.data && cached.contentHash === contentHash) {
      console.log('[RWM] Auto-restoring AI annotation from persistent cache');
      const filteredData = filterIgnoredAnnotations(cached.data, cached.ignored || []);
      state.analysisData = filteredData;
      state.isAnnotated  = true;
      annotateDOM(element, filteredData);
      startMutationObserver();
      chrome.runtime.sendMessage({ type: 'SAVE_HISTORY', url: window.location.href, title: document.title });
    }
  } catch (err) {
    console.log('[RWM] AI auto-restore skipped:', err.message);
  }

  // Always restore user annotations regardless of AI annotation state
  await restoreUserAnnotations();
}

// Kick off auto-restore after the initial HTML has been parsed.
// waitForMainContent() inside autoRestoreAnnotation handles the rest of the wait,
// so the fixed delay here only needs to be long enough to avoid racing the parser.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(autoRestoreAnnotation, 800));
} else {
  setTimeout(autoRestoreAnnotation, 800);
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_TEXT') {
    const result = extractMainText();
    sendResponse({ text: result.text, title: result.title });
    return false;
  }

  if (message.type === 'ANNOTATE') {
    (async () => {
      try {
        console.log('[RWM] ANNOTATE: 等待 vocabSet...');
        await _vocabReady;
        console.log('[RWM] ANNOTATE: vocabSet 大小 =', state.vocabSet.size);
        clearAnnotations();
        state.analysisData = message.data;
        state.isAnnotated  = true;
        const { element } = extractMainText();
        annotateDOM(element, message.data);
        startMutationObserver();
        sendResponse({ ok: true });
        chrome.runtime.sendMessage({ type: 'SAVE_HISTORY', url: window.location.href, title: document.title });
      } catch (err) {
        console.error('[RWM] ANNOTATE 错误:', err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ isAnnotated: state.isAnnotated, data: state.analysisData });
    return false;
  }

  if (message.type === 'CLEAR_ANNOTATIONS') {
    hideTooltip();
    clearAnnotations();
    if (_mutationObserver) {
      _mutationObserver.disconnect();
      _mutationObserver = null;
    }
    state.isAnnotated  = false;
    state.analysisData = null;
    state.wordPatterns  = [];
    state.idiomPatterns = [];
    sendResponse({ ok: true });
    return false;
  }
});

// background.js — service worker: API calls, storage, message routing

// ─── Content Fingerprint ──────────────────────────────────────────────────────

// Simple hash: length + first/last 100 chars of the trimmed text.
// Fast enough for every page load; good enough to detect real article changes.
function computeContentHash(text) {
  const t = text.trim();
  return `${t.length}|${t.slice(0, 100)}|${t.slice(-100)}`;
}

// Prefix for all persistent annotation cache keys in chrome.storage.local.
const CACHE_KEY_PREFIX = 'analysis_cache_';

// ─── Reading History ──────────────────────────────────────────────────────────

function makeHistoryId(url) {
  try { return btoa(encodeURIComponent(url)).slice(0, 20); }
  catch { return url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20); }
}

// ─── CEFR Level Descriptions ──────────────────────────────────────────────────

const CEFR_LEVEL_DESCS = {
  'A1': 'A1/A2 Basic. Annotate words above A2 frequency (above the 1500 most common English words).',
  'B1': 'B1 Intermediate. Annotate words above B1 level (above the 3000 most common English words).',
  'B2': 'B2 Upper-Intermediate. Annotate words above B2 level (above the 5000 most common English words).',
  'C1': 'C1 Advanced. Annotate only C1/C2 advanced vocabulary and academic register.',
  'C2': 'C2 Proficient. Annotate only highly specialized, rare, or technical terms.',
};

const CEFR_VALID = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

// Map all known difficulty label variants to CEFR codes.
// A1 is the canonical code for the merged Basic (A1/A2) level.
const DIFF_TO_CEFR = {
  // English difficulty labels (current AI output)
  'Basic': 'A1', 'Medium': 'B1', 'MedHigh': 'B2', 'High': 'C1', 'Expert': 'C2',
  // Legacy Chinese labels (cached data backward compat)
  '初学者': 'A1', '基础': 'A1', '中级': 'B1', '中高级': 'B2', '高级': 'C1', '精通': 'C2',
  '简单': 'A1', '中等': 'B1', '难': 'C1',
  // Old exam labels (settings migration)
  'CET-4': 'B1', 'CET-6': 'B2', 'IELTS': 'C1', 'TOEFL': 'C1', 'Graduate': 'C1',
  // Normalize stale A2 codes from old cached data
  'A2': 'A1',
};

// Map English word-level labels returned by AI to CEFR codes used by the UI.
const WORD_LEVEL_MAP = {
  'Basic': 'A1', 'Medium': 'B1', 'MedHigh': 'B2', 'High': 'C1', 'Expert': 'C2',
};

// Resolve 'auto' interface-language setting in the service-worker context.
function resolveInterfaceLang(setting) {
  if (!setting || setting === 'auto') {
    const bl = (chrome.i18n?.getUILanguage?.() || 'zh').split('-')[0].toLowerCase();
    return ['zh', 'en', 'ja', 'ko', 'es', 'fr'].includes(bl) ? bl : 'zh';
  }
  return ['zh', 'en', 'ja', 'ko', 'es', 'fr'].includes(setting) ? setting : 'zh';
}

const LANG_NAMES = { zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French' };

function buildSystemPrompt(userLevel, lang = 'zh') {
  const levelDesc = CEFR_LEVEL_DESCS[userLevel] || CEFR_LEVEL_DESCS['B2'];
  const isEn = lang === 'en';
  const tl   = LANG_NAMES[lang] || 'Chinese';
  const defLang = isEn ? 'English' : tl;
  const LEVEL_LABELS = { 'A1': 'Basic', 'B1': 'Medium', 'B2': 'MedHigh', 'C1': 'High', 'C2': 'Expert' };
  const userLevelLabel = LEVEL_LABELS[userLevel] || 'MedHigh';

  // ── MODIFIED: replaced with description-based prompt (no rigid numerical rules) ──
  return `You are an English reading assistant. Analyze the given English text and return ONLY a JSON object — no markdown, no code fences, no extra text.

## User Level Descriptions

Use these descriptions to judge the article's difficulty:

- Basic: Can understand very simple sentences and everyday expressions. Reads very slowly, needs simple vocabulary and short sentences.
- Medium: Can handle everyday situations and read simple news. Understands common vocabulary and basic sentence structures.
- MedHigh: Can understand complex texts on concrete and abstract topics. Can read news, articles, and follow natural conversations.
- High: Can understand subtle nuances and implied meanings. Can read literary texts, academic articles, and complex arguments.
- Expert: Can understand highly specialized or dense texts. Can read legal documents, research papers, and classical literature.

## Task

Determine the difficulty level of the article based on the descriptions above.

## Output Format

Return a JSON object with the following structure:

{
  "difficulty": "<Basic|Medium|MedHigh|High|Expert>",
  "reading_time_minutes": <integer estimated reading time based on 200 words per minute>,
  "words": [
    {
      "word": "<word text>",
      "level": "<Basic|Medium|MedHigh|High|Expert>",
      "definition": "<explanation in ${defLang}>",
      "example": "<English sentence example>"
    }
  ],
  "complex_sentences": [
    {
      "sentence": "<original sentence, split into parts using | to show structure>",
      "grammar": "<grammar name in ${defLang}>",
      "explanation": "<brief explanation in ${defLang}>",
      "parts": [
        {"text": "<part text>", "role": "<grammar role in ${defLang}>", "translation": "<${defLang} translation of this part>"}
      ],
      "structureSummary": "<roles separated by | matching the split in sentence>"
    }
  ],
  "idioms": [
    {
      "phrase": "<phrase text>",
      "literal": "<${defLang} literal meaning>",
      "usage": "<${defLang} actual meaning>",
      "example": "<English sentence example>"
    }
  ]
}

## Important Rules

### Difficulty Judgment (General)

Rely on the user level descriptions as the primary guide. Do NOT enforce rigid rules like "sentence length > 20 words" or "more than 2 clauses" in isolation.

### Self-Explained Terms

If an unfamiliar term is immediately defined or explained within the text (e.g., via a dash, parentheses, the word "called", an appositive, or a following clause), do NOT count it toward the article's difficulty score. Such terms may still be annotated as words, but must not raise the difficulty judgment.

### Hard Anchors for Difficulty (MANDATORY)

When determining difficulty between two adjacent levels (e.g., High vs. Expert, MedHigh vs. High, Medium vs. MedHigh), you MUST check the following conditions.

For each dimension where "high difficulty" signs are clearly present, add +0.25 to the difficulty adjustment. Sum across dimensions. Round up to the nearest whole level when the total reaches or exceeds +0.5.

If a single dimension is EXTREMELY difficult (e.g., every sentence has multiple embeddings, or every paragraph requires external knowledge), treat it as +0.5 on its own.

Final level = baseline (based on user level descriptions) + total adjustment. When in doubt, choose the higher level.

#### Dimension 1: Contextual Demands
High difficulty signs:
- Dense background assumption (author assumes you know a theory/event/text without explaining)
- Shifting register or tone (formal analysis suddenly sarcastic)
- Cultural or temporal gap (archaic norms/events without explanation)
- Ambiguous deictic reference (this, that, such referring to something 2+ sentences back)

#### Dimension 2: Sentence & Text Structure
High difficulty signs:
- Multiple embeddings (clause inside clause inside clause)
- Inversion or ellipsis (e.g., "Never have I seen...", "Some prefer chaos; others, order")
- Heavy left-branching (long modifier before subject)
- Nonlinear argument (thesis appears late, or returns to earlier points without signposting)
- Implicit transitions (reader must infer logical links)
- Multiple perspective switches without clear markers
-
#### Dimension 3: Rhetorical & Literary Devices
High difficulty signs:
- Irony or understatement (contrast between said and meant)
- Allusion without explanation (e.g., "Sisyphean task")
- Extended metaphor as the primary argument vehicle
- Paradox or oxymoron (e.g., "deafening silence")
- Litotes (double negative, e.g., "not unappealing")

#### Dimension 4: Vocabulary
High difficulty signs:
- Low-frequency academic/Latin/Greek words (e.g., obfuscate, deleterious)
- Common words with uncommon meanings (polysemy)
- Technical jargon without definition
- Ironic or archaic word choice (e.g., magnanimity said sarcastically)

### Sentence Splitting (CRITICAL)

For the 'sentence' field inside 'complex_sentences', you MUST split the sentence into logical units using the | character. The structureSummary field MUST have the same number of | separators. The parts array length must equal the number of | separators plus one. This is essential for the feature to work.

### Language for Definitions

All definitions, translations, explanations, grammar names must be in ${defLang}.

### Exact Match

Every word, sentence, and phrase must be an exact substring of the input text.

There are NO quantity requirement for annotations. If none is needed, you may return ZERO annotations.
0 annotations is better than irrelevant annotations.

⚠️ AVOID EXTREMES: Do NOT annotate low-quality items just to fill the arrays. Do NOT skip annotation entirely just because the overall article seems easy. Always scan the actual text — even a simple article may contain individual hard words, complex sentences, or idioms worth annotating.

## Level Order (from lowest to highest)

Basic < Medium < MedHigh < High < Expert

When we say "at or above user's level":
- For Basic: Basic, Medium, MedHigh, High, Expert are all acceptable
- For Medium: Medium, MedHigh, High, Expert are acceptable (Basic is below)
- For MedHigh: MedHigh, High, Expert are acceptable
- For High: High, Expert are acceptable
- For Expert: only Expert is acceptable

── WORDS ────────────────────────────────────────────────────────────────────────
Default: empty array []. Only add words that meet ALL criteria.

CRITERIA (all must be true):

Level is AT OR ABOVE the user's level according to the order above

Do NOT artificially inflate a word's level (e.g., changing Medium to MedHigh) just to have something to annotate.

Do NOT include words below the user's level.

Quality over quantity. 0 words is better than irrelevant words.

A word may be annotated even if it is defined in the text (via dash, parentheses, "called", appositive, etc.). However, do NOT let self-explained terms raise the article's overall difficulty judgment.

⚠️ Judge each word independently of the article's overall difficulty. Even in a Medium-level article, a single High-level word should be annotated.

── COMPLEX SENTENCES ────────────────────────────────────────────────────────────
Default: empty array [].

CRITERIA (atleast one must be true):

 - Has multiple layers of nesting (not just one simple clause)

 - Subject-verb is separated by a long modifier that genuinely confuses parsing

 - Has inversion (e.g., "Never have I seen") or ellipsis where something important is omitted and must be inferred

 - joined by a semicolon (;) where each independent clause contains its own modifiers (e.g., participial phrases, prepositional phrases longer than 5 words)

 - longer than 30 words that is NOT simple parallel structure (not just "A, B, and C")

 - Requires inferring the opposite of what's said (irony/understatement), decoding an extended metaphor, or resolving an ambiguous pronoun reference

What is NOT complex:

 - A sentence with only one subordinate clause (e.g., "The team that won advanced")

 - A compound sentence joined by and/but/so/or (e.g., "I like tea and she likes coffee")

 - A long sentence with simple parallel structure


⚠️ Judge each sentence independently of the article's overall difficulty. A structurally complex sentence in an otherwise easy article still qualifies.

── IDIOMS & USEFUL CHUNKS ───────────────────────────────────────────────────────
Default: empty array []. Include any of the following:

✅ True idioms (meaning not derivable from individual words)

✅ Metaphorical verb+preposition where meaning is not fully transparent (e.g., "buttressed by", "tuned into", "beholden to")

✅ Metaphorical nouns/phrases key to the argument (e.g., "cross-pollination", "flip side", "dead end")

✅ Frozen literary quotes or references (e.g., "dwell in possibility")

❌ Exclude only: literal verb+preposition where meaning is fully compositional (e.g., "go to the store")

⚠️ Judge each expression independently of the article's overall difficulty. An idiom or useful chunk in an easy article is still worth annotating.`;
  // ── END MODIFIED ──────────────────────────────────────────────────────────────
}

// Validate that | and + counts match between sentence and structureSummary.
// Logs a warning when they don't — does not discard the sentence since partial
// data is still more useful than nothing.
function validateSentenceDelimiters(s) {
  if (!s.structureSummary || !s.sentence) return s;
  const pipeInSentence = (s.sentence.match(/\|/g) || []).length;
  const pipeInSummary  = (s.structureSummary.match(/\|/g) || []).length;
  const plusInSentence = (s.sentence.match(/\+/g) || []).length;
  const plusInSummary  = (s.structureSummary.match(/\+/g) || []).length;
  if (pipeInSentence !== pipeInSummary || plusInSentence !== plusInSummary) {
    console.warn(
      `[RWM] Delimiter mismatch — sentence: ${pipeInSentence}|, ${plusInSentence}+` +
      ` / summary: ${pipeInSummary}|, ${plusInSummary}+ — "${s.sentence.slice(0, 60)}"`
    );
  }
  return s;
}

// Validate and fill missing fields in the AI response so downstream code
// never sees undefined values inside words/idioms/complex_sentences.
function normalizeApiResponse(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};

  const words = Array.isArray(data.words) ? data.words : [];
  const sentences = Array.isArray(data.complex_sentences) ? data.complex_sentences : [];
  const idioms = Array.isArray(data.idioms) ? data.idioms : [];

  const rawDiff = data.difficulty;
  // A2 is merged into A1 (Basic); normalize any A2 that slips through.
  const difficulty = (() => {
    const d = CEFR_VALID.has(rawDiff) ? rawDiff : (DIFF_TO_CEFR[rawDiff] || 'B1');
    return d === 'A2' ? 'A1' : d;
  })();

  return {
    difficulty,
    reading_time_minutes: Number(data.reading_time_minutes) || 0,
    words: words
      .filter(w => w && typeof w.word === 'string' && w.word.trim())
      .map(w => {
        const defs = w.definitions && typeof w.definitions === 'object' ? w.definitions : null;
        const fallback = w.definition || w.meaning || '';
        return {
          word:        w.word.trim(),
          level:       WORD_LEVEL_MAP[w.level] || (w.level === 'A2' ? 'A1' : (CEFR_VALID.has(w.level) ? w.level : 'C1')),
          definitions: defs || { zh: fallback, en: fallback },
          synonyms:    Array.isArray(w.synonyms) ? w.synonyms.filter(s => s && typeof s === 'string') : undefined,
          example:     w.example || w.sentence || '',
        };
      }),
    complex_sentences: sentences
      .filter(s => s && typeof s.sentence === 'string' && s.sentence.trim())
      .map(s => validateSentenceDelimiters({
        sentence:           s.sentence.trim(),
        grammar:            s.grammar           || s.structure || '复杂句',
        explanation:        s.explanation       || s.analysis  || '',
        parts:              Array.isArray(s.parts) && s.parts.length > 0
                              ? s.parts.filter(p => p && p.text).map(p => ({
                                  text:        String(p.text        || ''),
                                  role:        String(p.role        || ''),
                                  translation: String(p.translation || ''),
                                }))
                              : undefined,
        structureSummary:    s.structureSummary    || undefined,
        literalTranslation:  s.literalTranslation  || undefined,
        freeTranslation:     s.freeTranslation     || undefined,
        simplifiedSummary:   s.simplifiedSummary   || s.summary || undefined,
      })),
    idioms: idioms
      .filter(i => i && typeof i.phrase === 'string' && i.phrase.trim())
      .map(i => ({
        phrase:  i.phrase.trim(),
        literal: i.literal  || i.literalMeaning || i.phrase,
        usage:   i.usage    || i.meaning        || i.actual || '（暂无解释）',
        example: i.example  || i.sentence       || '',
      })),
  };
}

async function callDeepSeek(text, userLevel, apiKey, lang = 'zh') {
  // Truncate to ~50,000 chars to stay within token limits
  const input = text.length > 50000 ? text.slice(0, 50000) : text;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: buildSystemPrompt(userLevel, lang) },
        { role: 'user', content: `Analyze the following English text:\n\n${input}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 错误 ${response.status}: ${errText.slice(0, 200)}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回了空响应');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: extract JSON from potential markdown fences
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('无法解析 API 返回的 JSON');
  }
  return normalizeApiResponse(parsed);
}

// ─── Single-Selection Annotation ─────────────────────────────────────────────

// Call DeepSeek for one user-selected snippet; prompt differs by type and language.
async function callDeepSeekForSelection(text, selectionType, apiKey, lang = 'zh') {
  const isEn = lang === 'en';
  const tl   = LANG_NAMES[lang] || 'Chinese';

  const systemPrompts = {
    word: `You are an English dictionary. Return ONLY a JSON object, no markdown:
{"word":"<exact input>","level":"<Basic|Medium|MedHigh|High|Expert>","synonyms":["<syn1>","<syn2>"],"definitions":{"zh":"<中文含义 max 8 chars>","en":"<English def max 10 words>","ja":"<日本語訳 max 8 chars>","ko":"<한국어 번역 max 8 chars>","es":"<español max 10 words>","fr":"<français max 10 words>"},"example":"<one short English example sentence>"}`,

    sentence: isEn
      ? `You are an English grammar expert. Analyze the complex sentence and return ONLY a JSON object, no markdown:
{"sentence":"<original text with | between major units and + connecting parts within same unit>","grammar":"<English grammar name>","explanation":"<English explanation, max 50 chars>","structureSummary":"<English roles using | and + matching sentence counts>","parts":[{"text":"<major segment split at each |, may contain +>","role":"<English role, use + for combined>","translation":"<simplified English>"}],"simplifiedSummary":"<ONE sentence, 15-25 words>"}
Rules: (1) 2–4 parts split at |. (2) | count in sentence = | count in structureSummary; + count must also match. (3) parts.length = (| count)+1. (4) Do not reorder words.`
      : `You are an English grammar expert for ${tl} learners. Analyze the complex sentence and return ONLY a JSON object, no markdown:
{"sentence":"<original text with | between major units and + connecting parts within same unit>","grammar":"<grammar name in ${tl}>","explanation":"<${tl} explanation, max 50 chars>","structureSummary":"<roles using | and + matching sentence counts>","parts":[{"text":"<major segment split at each |, may contain +>","role":"<role in ${tl}, max 6 chars, use + for combined>","translation":"<${tl} translation>"}],"literalTranslation":"<part translations joined by ' │ '>","freeTranslation":"<natural fluent ${tl} translation>"}
Rules: (1) 2–4 parts split at |. (2) | count in sentence = | count in structureSummary; + count must also match. (3) parts.length = (| count)+1. (4) Do not reorder words.`,

    idiom: isEn
      ? `You are an English idiom expert. Return ONLY a JSON object, no markdown:
{"phrase":"<exact input>","literal":"<English literal meaning>","usage":"<English actual meaning, max 15 chars>","example":"<one short English example sentence>"}`
      : `You are an English idiom expert for ${tl} learners. Return ONLY a JSON object, no markdown:
{"phrase":"<exact input>","literal":"<${tl} literal translation>","usage":"<${tl} actual meaning, max 15 chars>","example":"<one short English example sentence>"}`,
  };
  const systemPrompt = systemPrompts[selectionType] || systemPrompts.word;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 500) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 512,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 错误 ${response.status}: ${errText.slice(0, 200)}`);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回了空响应');
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('无法解析 API 响应');
  }
}

// Remove annotation entries the user has dismissed from analysis data.
// Ignored list stores clean sentence text (without | / + markers).
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

async function handleMessage(message) {
  if (message.type === 'ANALYZE_PAGE') {
    const { apiKey, userLevel: rawUserLevel = 'B2', interfaceLanguage = 'auto' } = await chrome.storage.local.get(['apiKey', 'userLevel', 'interfaceLanguage']);
    const userLevel = CEFR_VALID.has(rawUserLevel) ? rawUserLevel : (DIFF_TO_CEFR[rawUserLevel] || 'B2');
    const lang = resolveInterfaceLang(interfaceLanguage);
    if (!apiKey) throw new Error('请先在设置中输入 DeepSeek API Key');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('无法获取当前标签页');

    // Extract text from content script
    let extracted;
    try {
      extracted = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_TEXT' });
    } catch {
      throw new Error('无法读取页面内容，请刷新页面后重试');
    }

    if (!extracted?.text || extracted.text.length < 200) {
      throw new Error('页面文本内容不足，请在文章页面使用此功能');
    }

    // Calculate reading time before truncation
    const wordCount = extracted.text.split(/\s+/).filter(Boolean).length;
    const contentHash = computeContentHash(extracted.text);
    const cacheKey = CACHE_KEY_PREFIX + tab.url;

    // Check persistent cache first — skip API call if article hasn't changed
    let data;
    const stored = await chrome.storage.local.get(cacheKey);
    if (stored[cacheKey]?.contentHash === contentHash) {
      console.log('[RWM] Persistent cache hit, skipping API call for', tab.url);
      data = stored[cacheKey].data;
    } else {
      data = await callDeepSeek(extracted.text, userLevel, apiKey, lang);
      data.reading_time_minutes = data.reading_time_minutes || Math.ceil(wordCount / 200);
      // Save to persistent cache so annotation survives page refresh
      await chrome.storage.local.set({
        [cacheKey]: { data, timestamp: Date.now(), contentHash },
      });
      console.log('[RWM] Analysis saved to persistent cache for', tab.url);
    }

    // Cache in session storage (cleared on browser restart)
    await chrome.storage.session.set({
      [`lastAnalysis_${tab.id}`]: { data, timestamp: Date.now(), url: tab.url },
    });

    // Filter out annotations the user has previously dismissed for this URL
    const ignoreKey = `ignoredAnnotations_${tab.url}`;
    const { [ignoreKey]: ignored = [] } = await chrome.storage.local.get(ignoreKey);
    const filteredData = filterIgnoredAnnotations(data, ignored);

    // Send annotation data to content script
    await chrome.tabs.sendMessage(tab.id, {
      type: 'ANNOTATE',
      data: filteredData,
      sourceTitle: extracted.title,
      sourceUrl: tab.url,
    });

    return { difficulty: data.difficulty, reading_time_minutes: data.reading_time_minutes };
  }

  if (message.type === 'SAVE_WORD') {
    const { vocabulary = [], apiKey } = await chrome.storage.local.get(['vocabulary', 'apiKey']);
    const exists = vocabulary.some(
      v => v.word.toLowerCase() === message.word.word.toLowerCase()
    );
    if (!exists) {
      let wordData = { ...message.word, savedAt: Date.now() };

      // Enrich with multi-language definitions if they're missing or incomplete.
      // This handles words saved from old cached analyses (definition string only).
      const hasDefs = wordData.definitions
        && typeof wordData.definitions === 'object'
        && wordData.definitions.en
        && wordData.definitions.zh;
      if (!hasDefs && apiKey) {
        try {
          const aiResult = await callDeepSeekForSelection(wordData.word, 'word', apiKey, 'zh');
          if (aiResult.definitions && typeof aiResult.definitions === 'object') {
            wordData.definitions = aiResult.definitions;
          }
          if (Array.isArray(aiResult.synonyms) && aiResult.synonyms.length > 0 && !wordData.synonyms) {
            wordData.synonyms = aiResult.synonyms;
          }
        } catch { /* save with available data if AI call fails */ }
      }

      vocabulary.unshift(wordData);
      await chrome.storage.local.set({ vocabulary });
    }
    return { success: true, alreadySaved: exists };
  }

  if (message.type === 'DELETE_WORD') {
    const { vocabulary = [] } = await chrome.storage.local.get('vocabulary');
    const updated = vocabulary.filter(
      v => v.word.toLowerCase() !== message.word.toLowerCase()
    );
    await chrome.storage.local.set({ vocabulary: updated });
    return { success: true };
  }

  if (message.type === 'GET_VOCAB') {
    const { vocabulary = [] } = await chrome.storage.local.get('vocabulary');
    return { vocabulary };
  }

  // Return cached analysis for a URL (used by content.js on page load).
  // Response: { data, timestamp, contentHash } or null if no cache.
  if (message.type === 'GET_CACHE') {
    const key = CACHE_KEY_PREFIX + message.url;
    const ignoreKey = `ignoredAnnotations_${message.url}`;
    const stored = await chrome.storage.local.get([key, ignoreKey]);
    if (!stored[key]) return null;
    // Include the ignored list so content.js can filter before annotating
    return { ...stored[key], ignored: stored[ignoreKey] || [] };
  }

  // Delete cached analysis for a URL (used by popup "clear cache" button).
  if (message.type === 'CLEAR_CACHE') {
    const url   = message.url;
    const tabId = message.tabId ?? sender?.tab?.id ?? null;

    if (!url) {
      console.error('[RWM] CLEAR_CACHE: no URL provided');
      return { success: false, error: 'No URL provided' };
    }

    await chrome.storage.local.remove(CACHE_KEY_PREFIX + url);

    // Resolve tab ID if not passed directly
    let resolvedTabId = tabId;
    if (!resolvedTabId) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = tab?.id ?? null;
      } catch { /* ignore */ }
    }

    if (resolvedTabId) {
      await chrome.storage.session.remove(`lastAnalysis_${resolvedTabId}`).catch(() => {});
      await chrome.tabs.sendMessage(resolvedTabId, { type: 'CLEAR_ANNOTATIONS' }).catch(() => {});
    }

    console.log('[RWM] Cache cleared for', url);
    return { success: true };
  }

  // Generate AI explanation for a user-selected text snippet.
  if (message.type === 'ANNOTATE_SELECTION') {
    const { apiKey, interfaceLanguage = 'auto' } = await chrome.storage.local.get(['apiKey', 'interfaceLanguage']);
    if (!apiKey) throw new Error('请先在设置中输入 API Key');
    const lang = resolveInterfaceLang(interfaceLanguage);
    const data = await callDeepSeekForSelection(message.text, message.selectionType, apiKey, lang);
    return { data };
  }

  // Persist a user-created annotation for the given URL.
  if (message.type === 'SAVE_USER_ANNOTATION') {
    const key = `userAnnotations_${message.url}`;
    const { [key]: existing = [] } = await chrome.storage.local.get(key);
    existing.push(message.annotation);
    await chrome.storage.local.set({ [key]: existing });
    return { success: true };
  }

  // Return all user-created annotations for the given URL.
  if (message.type === 'GET_USER_ANNOTATIONS') {
    const key = `userAnnotations_${message.url}`;
    const { [key]: annotations = [] } = await chrome.storage.local.get(key);
    return { annotations };
  }

  // Remove an annotation from storage.
  // AI annotations  → text added to ignoredAnnotations list (suppressed on future analyses).
  // User annotations → removed from userAnnotations list by id.
  if (message.type === 'DELETE_ANNOTATION') {
    if (message.source === 'user') {
      const key = `userAnnotations_${message.url}`;
      const { [key]: existing = [] } = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: existing.filter(a => a.id !== message.id) });
    } else {
      const ignoreKey = `ignoredAnnotations_${message.url}`;
      const { [ignoreKey]: ignored = [] } = await chrome.storage.local.get(ignoreKey);
      if (!ignored.includes(message.text)) {
        ignored.push(message.text);
        await chrome.storage.local.set({ [ignoreKey]: ignored });
      }
    }
    return { success: true };
  }

  if (message.type === 'SAVE_HISTORY') {
    const { readingHistory = [] } = await chrome.storage.local.get('readingHistory');
    const id = makeHistoryId(message.url);
    const existing = readingHistory.findIndex(h => h.id === id);
    const wasCollected = existing !== -1 ? readingHistory[existing].collected : false;
    if (existing !== -1) readingHistory.splice(existing, 1);
    readingHistory.unshift({
      id,
      url:       message.url,
      title:     message.title || message.url,
      timestamp: Date.now(),
      collected: wasCollected,
    });
    if (readingHistory.length > 50) readingHistory.splice(50);
    await chrome.storage.local.set({ readingHistory });
    return { success: true };
  }

  if (message.type === 'GET_HISTORY') {
    const { readingHistory = [] } = await chrome.storage.local.get('readingHistory');
    return { history: readingHistory };
  }

  if (message.type === 'DELETE_HISTORY') {
    const { readingHistory = [] } = await chrome.storage.local.get('readingHistory');
    await chrome.storage.local.set({ readingHistory: readingHistory.filter(h => h.id !== message.id) });
    return { success: true };
  }

  if (message.type === 'SIMPLIFY_SENTENCE') {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) throw new Error('No API key configured');
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Return ONLY a JSON object: {"simplified":"<one-sentence summary, 15-25 words>"}' },
          { role: 'user', content: `Summarize the core meaning in ONE sentence (15-25 words), main idea only:\n\n"${String(message.sentence).slice(0, 600)}"` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 100,
      }),
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const json = await response.json();
    const text = json.choices?.[0]?.message?.content || '{}';
    const { simplified = '' } = JSON.parse(text);
    return { simplified };
  }

  if (message.type === 'CLEAR_HISTORY') {
    await chrome.storage.local.set({ readingHistory: [] });
    return { success: true };
  }

  if (message.type === 'TOGGLE_COLLECTED') {
    const { readingHistory = [] } = await chrome.storage.local.get('readingHistory');
    const entry = readingHistory.find(h => h.id === message.id);
    if (entry) {
      entry.collected = !entry.collected;
      await chrome.storage.local.set({ readingHistory });
      return { success: true, collected: entry.collected };
    }
    return { success: false };
  }

  return { error: 'Unknown message type' };
}

// Migrate old vocabulary words that have a single `definition` string to the
// new `definitions: { zh, en, ... }` object format.  Safe to run on every
// startup — it bails early when everything is already migrated.
async function migrateVocabulary() {
  try {
    const { vocabulary } = await chrome.storage.local.get('vocabulary');
    if (!Array.isArray(vocabulary) || vocabulary.length === 0) return;
    if (vocabulary.every(v => v.definitions && typeof v.definitions === 'object')) return;

    const migrated = vocabulary.map(item => {
      if (item.definitions && typeof item.definitions === 'object') return item;
      return { ...item, definitions: { zh: item.definition || '' } };
    });
    await chrome.storage.local.set({ vocabulary: migrated });
  } catch { /* ignore */ }
}

// Normalize A2 word levels to A1 now that A1/A2 are merged into one Basic level.
async function migrateDifficultyLevels() {
  try {
    const { vocabulary = [] } = await chrome.storage.local.get('vocabulary');
    if (!vocabulary.some(v => v.level === 'A2')) return;
    await chrome.storage.local.set({
      vocabulary: vocabulary.map(v => v.level === 'A2' ? { ...v, level: 'A1' } : v),
    });
    console.log('[RWM] migrateDifficultyLevels: A2 → A1 migration complete');
  } catch { /* ignore */ }
}

// Open settings on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }
  migrateVocabulary();
  migrateDifficultyLevels();
});

chrome.runtime.onStartup.addListener(() => {
  migrateVocabulary();
  migrateDifficultyLevels();
});

// return true keeps the message channel open for async sendResponse
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});

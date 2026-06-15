// i18n.js — UI strings and CEFR utilities shared by content scripts and extension pages.
// Loaded as a plain script (no module syntax) so it works in both contexts.

// ─── Difficulty display labels (what users see) ───────────────────────────────

const RWM_DIFFICULTY_LABELS = {
  zh: { A1: '基础', A2: '基础', B1: '中等', B2: '中高', C1: '高等', C2: '精通' },
  en: { A1: 'Basic', A2: 'Basic', B1: 'Medium', B2: 'Med-High', C1: 'High', C2: 'Expert' },
  ja: { A1: '基礎', A2: '基礎', B1: '中級', B2: '中上級', C1: '上級', C2: '達人' },
  ko: { A1: '기초', A2: '기초', B1: '중급', B2: '중상급', C1: '고급', C2: '전문가' },
  es: { A1: 'Básico', A2: 'Básico', B1: 'Medio', B2: 'Medio-Alto', C1: 'Alto', C2: 'Experto' },
  fr: { A1: 'Basique', A2: 'Basique', B1: 'Moyen', B2: 'Moyen-Haut', C1: 'Haut', C2: 'Expert' },
};

// ─── UI strings ───────────────────────────────────────────────────────────────

const RWM_STRINGS = {
  zh: {
    // Tooltip actions
    speak: '朗读', save: '收藏', saved: '已收藏', remove: '取消收藏', simplify: '简化', delete: '删除',
    translate: '翻译此句', hideTranslation: '隐藏翻译',
    longSentence: '长难句', idiom: '习语',
    literalPrefix: '直译：', freePrefix: '意译：',
    idiomLiteral: '字面：', idiomUsage: '含义：',
    example: '例: ', synonyms: '同义词',
    // Popup — analyze tab
    tabAnalyze: '分析', tabHistory: '历史',
    analyzeBtn: '分析当前页面', analyzing: '分析中…',
    settingsBtn: '设置', vocabBtn: '单词本',
    clearCacheBtn: '清除当前页面缓存', clearingCache: '清除中…',
    bannerGoSettings: '前往设置',
    bannerApiMsg: '请先前往设置输入 DeepSeek API Key',
    unsupportedMsg: '请在网页文章页面使用此功能',
    diffLabel: '文章难度', timeLabel: '预计阅读', minutes: ' 分钟',
    yourLevel: '你的水平',
    // Popup — history tab
    historyFilterAll: '全部', historyFilterCollected: '收藏',
    historyEmpty: '暂无阅读记录', historyCollectedEmpty: '暂无收藏文章',
    clearHistoryBtn: '清空历史',
    clearHistoryConfirm: '确定要清空全部历史记录？收藏的文章也会被删除。',
    historyToday: '今天', historyYesterday: '昨天',
    // Settings
    settingsTitle: 'Read With Me 设置',
    settingsSubtitle: '配置你的 AI 英文阅读助手',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: '必填',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: '前往 platform.deepseek.com 免费注册获取 API Key',
    apiKeySaved: '已保存（输入新值即可更新）',
    apiKeyError: '请输入 API Key',
    languageLabel: '界面语言',
    languageHint: '影响标注弹窗的按钮文案和 AI 返回内容的语言',
    deleteWordConfirm: '确定删除此单词？',
    levelLabel: '我的英语水平',
    levelHint: 'AI 会根据你的水平决定哪些单词需要标注',
    triggerLabel: '浮窗触发方式',
    hoverTitle: '悬停显示', hoverDesc: '鼠标移到标注词上后自动弹出',
    clickTitle: '点击显示', clickDesc: '点击标注词后弹出',
    triggerHint: '切换后立即生效，无需刷新页面',
    saveBtn: '💾 保存设置',
    successMsg: '✅ 设置已保存！现在可以打开任意英文网页，点击插件图标开始分析。',
    // Vocabulary
    vocabTitle: '我的单词本', vocabLoading: '加载中…',
    vocabEmpty: '暂无收藏', vocabCountFn: n => `共 ${n} 个单词`,
    emptyTitle: '单词本还是空的',
    emptyDesc: '在阅读时点击高亮单词，再点击浮窗里的「收藏」即可保存到这里',
    sourceLabel: '来源：',
    clearAllWords: '清空单词本', clearAllConfirm: '确定要清空所有收藏单词？此操作不可撤销。',
    word: '单词', sentence: '长难句',
    markAsDifficult: '标注为难点', generating: 'AI 生成中…',
  },
  en: {
    // Tooltip actions
    speak: 'Read Aloud', save: 'Save', saved: 'Saved', remove: 'Remove', simplify: 'Simplify', delete: 'Delete',
    translate: 'Simplify', hideTranslation: 'Hide',
    longSentence: 'Complex Sentence', idiom: 'Idiom',
    literalPrefix: 'Simplified: ', freePrefix: 'Meaning: ',
    idiomLiteral: 'Literal: ', idiomUsage: 'Usage: ',
    example: 'E.g. ', synonyms: 'Synonyms',
    // Popup — analyze tab
    tabAnalyze: 'Analyze', tabHistory: 'History',
    analyzeBtn: 'Analyze Page', analyzing: 'Analyzing…',
    settingsBtn: 'Settings', vocabBtn: 'Vocabulary',
    clearCacheBtn: 'Clear Page Cache', clearingCache: 'Clearing…',
    bannerGoSettings: 'Go to Settings',
    bannerApiMsg: 'Please go to Settings to enter your DeepSeek API Key',
    unsupportedMsg: 'Open a web article to use this feature',
    diffLabel: 'Article Level', timeLabel: 'Est. Reading', minutes: ' min',
    yourLevel: 'Your Level',
    // Popup — history tab
    historyFilterAll: 'All', historyFilterCollected: 'Saved',
    historyEmpty: 'No reading history yet', historyCollectedEmpty: 'No saved articles',
    clearHistoryBtn: 'Clear History',
    clearHistoryConfirm: 'Clear all reading history? Saved articles will also be deleted.',
    historyToday: 'Today', historyYesterday: 'Yesterday',
    // Settings
    settingsTitle: 'Read With Me Settings',
    settingsSubtitle: 'Configure your AI English reading assistant',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: 'Required',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: 'Get a free API Key at platform.deepseek.com',
    apiKeySaved: 'Saved (enter a new value to update)',
    apiKeyError: 'Please enter your API Key',
    languageLabel: 'Interface Language',
    languageHint: 'Affects tooltip button labels and AI response language',
    deleteWordConfirm: 'Remove this word from vocabulary?',
    levelLabel: 'My English Level',
    levelHint: 'AI will annotate words above your level',
    triggerLabel: 'Tooltip Trigger',
    hoverTitle: 'Hover', hoverDesc: 'Auto-show when hovering over a word',
    clickTitle: 'Click', clickDesc: 'Show when clicking a highlighted word',
    triggerHint: 'Takes effect immediately without page refresh',
    saveBtn: '💾 Save Settings',
    successMsg: '✅ Settings saved! Open any English article and click the extension icon.',
    // Vocabulary
    vocabTitle: 'My Vocabulary', vocabLoading: 'Loading…',
    vocabEmpty: 'No words saved', vocabCountFn: n => `${n} word${n === 1 ? '' : 's'}`,
    emptyTitle: 'Your vocabulary is empty',
    emptyDesc: 'Click highlighted words while reading, then click "Save" in the tooltip',
    sourceLabel: 'Source: ',
    clearAllWords: 'Clear All', clearAllConfirm: 'Delete all saved words? This cannot be undone.',
    word: 'Word', sentence: 'Complex Sentence',
    markAsDifficult: 'Mark as difficult', generating: 'Generating…',
  },
  ja: {
    speak: '読み上げ', save: '保存', saved: '保存済み', remove: '保存解除', simplify: '簡略化', delete: '削除',
    translate: '翻訳', hideTranslation: '非表示',
    longSentence: '複雑文', idiom: '慣用句',
    literalPrefix: '直訳：', freePrefix: '意訳：',
    idiomLiteral: '字義：', idiomUsage: '用法：',
    example: '例：', synonyms: '類義語',
    tabAnalyze: '分析', tabHistory: '履歴',
    analyzeBtn: 'ページ分析', analyzing: '分析中…',
    settingsBtn: '設定', vocabBtn: '単語帳',
    clearCacheBtn: 'キャッシュ削除', clearingCache: '削除中…',
    bannerGoSettings: '設定へ',
    bannerApiMsg: '設定画面で DeepSeek API Key を入力してください',
    unsupportedMsg: 'ウェブ記事ページでご利用ください',
    diffLabel: '記事レベル', timeLabel: '読書時間', minutes: '分',
    yourLevel: '自分のレベル',
    historyFilterAll: '全て', historyFilterCollected: '保存済み',
    historyEmpty: '閲読履歴なし', historyCollectedEmpty: '保存記事なし',
    clearHistoryBtn: '履歴を消去',
    clearHistoryConfirm: '全ての閲読履歴を削除しますか？保存した記事も削除されます。',
    historyToday: '今日', historyYesterday: '昨日',
    settingsTitle: 'Read With Me 設定',
    settingsSubtitle: 'AI 英語リーディングアシスタントの設定',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: '必須',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: 'platform.deepseek.com で無料の API Key を取得',
    apiKeySaved: '保存済み（新しい値を入力して更新）',
    apiKeyError: 'API Key を入力してください',
    languageLabel: '表示言語',
    deleteWordConfirm: 'この単語を削除しますか？',
    languageHint: 'ツールチップのボタンとAI応答の言語に影響します',
    levelLabel: '英語レベル',
    levelHint: 'AIはあなたのレベルに合わせて単語に注釈を付けます',
    triggerLabel: 'ツールチップの表示方法',
    hoverTitle: 'ホバー', hoverDesc: 'マウスを乗せると自動表示',
    clickTitle: 'クリック', clickDesc: '単語をクリックして表示',
    triggerHint: 'ページ更新不要で即時反映',
    saveBtn: '💾 設定を保存',
    successMsg: '✅ 設定が保存されました！英語記事でアイコンをクリックして分析を開始。',
    vocabTitle: '単語帳', vocabLoading: '読み込み中…',
    vocabEmpty: '保存なし', vocabCountFn: n => `${n}語`,
    emptyTitle: '単語帳は空です',
    emptyDesc: '読書中にハイライト単語をクリックし、ツールチップの「保存」で追加',
    sourceLabel: '出典：',
    clearAllWords: '全て削除', clearAllConfirm: '保存した単語を全て削除しますか？この操作は取り消せません。',
    word: '単語', sentence: '複雑文',
    markAsDifficult: '難しい箇所としてマーク', generating: 'AI 生成中…',
  },
  ko: {
    speak: '읽어주기', save: '저장', saved: '저장됨', remove: '저장 취소', simplify: '단순화', delete: '삭제',
    translate: '번역', hideTranslation: '숨기기',
    longSentence: '복잡한 문장', idiom: '관용구',
    literalPrefix: '직역：', freePrefix: '의역：',
    idiomLiteral: '문자적：', idiomUsage: '용법：',
    example: '예：', synonyms: '동의어',
    tabAnalyze: '분석', tabHistory: '기록',
    analyzeBtn: '페이지 분석', analyzing: '분석 중…',
    settingsBtn: '설정', vocabBtn: '단어장',
    clearCacheBtn: '캐시 삭제', clearingCache: '삭제 중…',
    bannerGoSettings: '설정으로',
    bannerApiMsg: '설정에서 DeepSeek API Key를 입력해 주세요',
    unsupportedMsg: '웹 기사 페이지에서 사용해 주세요',
    diffLabel: '기사 수준', timeLabel: '예상 읽기', minutes: '분',
    yourLevel: '내 수준',
    historyFilterAll: '전체', historyFilterCollected: '저장됨',
    historyEmpty: '기록 없음', historyCollectedEmpty: '저장된 기사 없음',
    clearHistoryBtn: '기록 지우기',
    clearHistoryConfirm: '모든 기록을 삭제하시겠습니까? 저장된 기사도 삭제됩니다.',
    historyToday: '오늘', historyYesterday: '어제',
    settingsTitle: 'Read With Me 설정',
    settingsSubtitle: 'AI 영어 독해 도우미 설정',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: '필수',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: 'platform.deepseek.com에서 무료 API Key 발급',
    apiKeySaved: '저장됨 (새 값 입력으로 업데이트)',
    apiKeyError: 'API Key를 입력해 주세요',
    languageLabel: '인터페이스 언어',
    deleteWordConfirm: '이 단어를 삭제하시겠습니까?',
    languageHint: '툴팁 버튼 및 AI 응답 언어에 영향을 줍니다',
    levelLabel: '나의 영어 수준',
    levelHint: 'AI가 수준에 맞게 단어에 주석을 달아드립니다',
    triggerLabel: '툴팁 표시 방식',
    hoverTitle: '호버', hoverDesc: '단어에 마우스를 올리면 자동 표시',
    clickTitle: '클릭', clickDesc: '강조된 단어를 클릭하면 표시',
    triggerHint: '페이지 새로고침 없이 즉시 적용',
    saveBtn: '💾 설정 저장',
    successMsg: '✅ 설정이 저장되었습니다! 영어 기사에서 아이콘을 클릭하세요.',
    vocabTitle: '단어장', vocabLoading: '로드 중…',
    vocabEmpty: '저장 없음', vocabCountFn: n => `단어 ${n}개`,
    emptyTitle: '단어장이 비어 있습니다',
    emptyDesc: '읽는 중에 강조된 단어를 클릭하고 툴팁에서 "저장"을 누르세요',
    sourceLabel: '출처：',
    clearAllWords: '모두 삭제', clearAllConfirm: '저장된 단어를 모두 삭제하시겠습니까? 되돌릴 수 없습니다.',
    word: '단어', sentence: '복잡한 문장',
    markAsDifficult: '어려운 부분으로 표시', generating: 'AI 생성 중…',
  },
  es: {
    speak: 'Leer en voz alta', save: 'Guardar', saved: 'Guardado', remove: 'Eliminar guardado', simplify: 'Simplificar', delete: 'Eliminar',
    translate: 'Simplificar', hideTranslation: 'Ocultar',
    longSentence: 'Oración compleja', idiom: 'Modismo',
    literalPrefix: 'Lit.: ', freePrefix: 'Significado: ',
    idiomLiteral: 'Literal: ', idiomUsage: 'Uso: ',
    example: 'Ej.: ', synonyms: 'Sinónimos',
    tabAnalyze: 'Analizar', tabHistory: 'Historial',
    analyzeBtn: 'Analizar página', analyzing: 'Analizando…',
    settingsBtn: 'Ajustes', vocabBtn: 'Vocabulario',
    clearCacheBtn: 'Limpiar caché', clearingCache: 'Limpiando…',
    bannerGoSettings: 'Ir a ajustes',
    bannerApiMsg: 'Ve a Ajustes para introducir tu DeepSeek API Key',
    unsupportedMsg: 'Usa esta función en una página de artículo web',
    diffLabel: 'Nivel artículo', timeLabel: 'Lectura aprox.', minutes: ' min',
    yourLevel: 'Tu nivel',
    historyFilterAll: 'Todo', historyFilterCollected: 'Guardado',
    historyEmpty: 'Sin historial', historyCollectedEmpty: 'Sin artículos guardados',
    clearHistoryBtn: 'Borrar historial',
    clearHistoryConfirm: '¿Borrar todo el historial? También se eliminarán los artículos guardados.',
    historyToday: 'Hoy', historyYesterday: 'Ayer',
    settingsTitle: 'Ajustes de Read With Me',
    settingsSubtitle: 'Configura tu asistente de lectura en inglés',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: 'Obligatorio',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: 'Obtén una API Key gratuita en platform.deepseek.com',
    apiKeySaved: 'Guardada (introduce un nuevo valor para actualizar)',
    apiKeyError: 'Por favor introduce tu API Key',
    languageLabel: 'Idioma de interfaz',
    deleteWordConfirm: '¿Eliminar esta palabra?',
    languageHint: 'Afecta las etiquetas de los botones y el idioma de las respuestas AI',
    levelLabel: 'Mi nivel de inglés',
    levelHint: 'La IA anotará palabras por encima de tu nivel',
    triggerLabel: 'Activación del tooltip',
    hoverTitle: 'Hover', hoverDesc: 'Se muestra al pasar el ratón',
    clickTitle: 'Clic', clickDesc: 'Se muestra al hacer clic',
    triggerHint: 'Efectivo de inmediato sin recargar la página',
    saveBtn: '💾 Guardar ajustes',
    successMsg: '✅ ¡Ajustes guardados! Abre un artículo en inglés y haz clic en el icono.',
    vocabTitle: 'Mi vocabulario', vocabLoading: 'Cargando…',
    vocabEmpty: 'Sin palabras', vocabCountFn: n => `${n} palabra${n === 1 ? '' : 's'}`,
    emptyTitle: 'Tu vocabulario está vacío',
    emptyDesc: 'Haz clic en palabras resaltadas y luego en "Guardar" en el tooltip',
    sourceLabel: 'Fuente: ',
    clearAllWords: 'Borrar todo', clearAllConfirm: '¿Eliminar todas las palabras guardadas? Esta acción no se puede deshacer.',
    word: 'Palabra', sentence: 'Oración compleja',
    markAsDifficult: 'Marcar como difícil', generating: 'Generando…',
  },
  fr: {
    speak: 'Lire à voix haute', save: 'Enregistrer', saved: 'Enregistré', remove: 'Retirer', simplify: 'Simplifier', delete: 'Supprimer',
    translate: 'Simplifier', hideTranslation: 'Masquer',
    longSentence: 'Phrase complexe', idiom: 'Expression',
    literalPrefix: 'Litt. : ', freePrefix: 'Sens : ',
    idiomLiteral: 'Littéral : ', idiomUsage: 'Usage : ',
    example: 'Ex. : ', synonyms: 'Synonymes',
    tabAnalyze: 'Analyser', tabHistory: 'Historique',
    analyzeBtn: 'Analyser la page', analyzing: 'Analyse…',
    settingsBtn: 'Paramètres', vocabBtn: 'Vocabulaire',
    clearCacheBtn: 'Vider le cache', clearingCache: 'Suppression…',
    bannerGoSettings: 'Aller aux paramètres',
    bannerApiMsg: 'Allez dans Paramètres pour entrer votre DeepSeek API Key',
    unsupportedMsg: 'Utilisez cette fonction sur une page d\'article web',
    diffLabel: 'Niveau article', timeLabel: 'Lecture estimée', minutes: ' min',
    yourLevel: 'Votre niveau',
    historyFilterAll: 'Tout', historyFilterCollected: 'Enregistré',
    historyEmpty: 'Aucun historique', historyCollectedEmpty: 'Aucun article enregistré',
    clearHistoryBtn: 'Effacer l\'historique',
    clearHistoryConfirm: 'Effacer tout l\'historique ? Les articles enregistrés seront aussi supprimés.',
    historyToday: 'Aujourd\'hui', historyYesterday: 'Hier',
    settingsTitle: 'Paramètres de Read With Me',
    settingsSubtitle: 'Configurez votre assistant de lecture en anglais',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyRequired: 'Obligatoire',
    apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyHint: 'Obtenez une API Key gratuite sur platform.deepseek.com',
    apiKeySaved: 'Enregistrée (entrez une nouvelle valeur pour mettre à jour)',
    apiKeyError: 'Veuillez entrer votre API Key',
    languageLabel: 'Langue d\'interface',
    deleteWordConfirm: 'Supprimer ce mot ?',
    languageHint: 'Affecte les libellés des boutons et la langue des réponses AI',
    levelLabel: 'Mon niveau d\'anglais',
    levelHint: 'L\'IA annotera les mots au-dessus de votre niveau',
    triggerLabel: 'Déclencheur du tooltip',
    hoverTitle: 'Survol', hoverDesc: 'Affichage automatique au survol',
    clickTitle: 'Clic', clickDesc: 'Affichage au clic',
    triggerHint: 'Prend effet immédiatement sans recharger la page',
    saveBtn: '💾 Enregistrer',
    successMsg: '✅ Paramètres enregistrés ! Ouvrez un article anglais et cliquez sur l\'icône.',
    vocabTitle: 'Mon vocabulaire', vocabLoading: 'Chargement…',
    vocabEmpty: 'Aucun mot', vocabCountFn: n => `${n} mot${n === 1 ? '' : 's'}`,
    emptyTitle: 'Votre vocabulaire est vide',
    emptyDesc: 'Cliquez sur des mots surlignés puis sur « Enregistrer » dans le tooltip',
    sourceLabel: 'Source : ',
    clearAllWords: 'Tout effacer', clearAllConfirm: 'Supprimer tous les mots enregistrés ? Cette action est irréversible.',
    word: 'Mot', sentence: 'Phrase complexe',
    markAsDifficult: 'Marquer comme difficile', generating: 'Génération en cours…',
  },
};

const CEFR_LEVELS = ['A1', 'B1', 'B2', 'C1', 'C2'];

// Map Chinese difficulty labels (returned by AI) to CEFR codes.
const CHINESE_DIFF_TO_CEFR = {
  '初学者': 'A1', '基础': 'A2', '中级': 'B1',
  '中高级': 'B2', '高级': 'C1', '精通': 'C2',
};

// ─── Functions ────────────────────────────────────────────────────────────────

// Resolve 'auto' setting to a concrete language code.
function rwmResolveLang(setting) {
  if (!setting || setting === 'auto') {
    const bl = (
      (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
      (typeof navigator !== 'undefined' ? navigator.language : '') ||
      'zh'
    ).split('-')[0].toLowerCase();
    return RWM_STRINGS[bl] ? bl : 'zh';
  }
  return RWM_STRINGS[setting] ? setting : 'zh';
}

// Return localised string for key, falling back to zh then the key itself.
function rwmT(key, lang) {
  const s = RWM_STRINGS[lang] || RWM_STRINGS.zh;
  return s[key] !== undefined ? s[key] : (RWM_STRINGS.zh[key] ?? key);
}

// Return the human-readable difficulty label for a CEFR code in the given language.
function rwmDiffLabel(cefrCode, lang) {
  const map = RWM_DIFFICULTY_LABELS[lang] || RWM_DIFFICULTY_LABELS.zh;
  return map[cefrCode] || cefrCode;
}

// Return comparison emoji icons for article vs user level.
// gap > 0 → harder (⬆️); gap < 0 → easier (⬇️); gap = 0 → ✅
function rwmCefrIcons(articleLevel, userLevel) {
  const ai = CEFR_LEVELS.indexOf(articleLevel);
  const ui = CEFR_LEVELS.indexOf(userLevel);
  if (ai === -1 || ui === -1) return '';
  const gap = ai - ui;
  if (gap === 0) return ' ✅';
  if (gap > 0) return ' ' + '⬆️'.repeat(Math.min(gap, 3));
  return ' ' + '⬇️'.repeat(Math.min(-gap, 3));
}

// Compare article CEFR level to user level.
function rwmCefrCompare(articleLevel, userLevel) {
  const ai = CEFR_LEVELS.indexOf(articleLevel);
  const ui = CEFR_LEVELS.indexOf(userLevel);
  if (ai === -1 || ui === -1) return null;
  if (ai === ui) return 'match';
  return ai < ui ? 'easy' : 'hard';
}

// CSS colour class for a CEFR level (used in popup stat card).
function rwmCefrClass(level) {
  const i = CEFR_LEVELS.indexOf(level);
  if (i <= 1) return 'easy';
  if (i <= 3) return 'medium';
  return 'hard';
}

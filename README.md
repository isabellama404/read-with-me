# Read With Me — 英文阅读助手

一个 Chrome 浏览器插件，用 AI 在原文上直接标注难词、解析长难句、识别习语，难度根据你的英语水平自动适配。

## 功能

- **词汇标注** — 标注难度 ≥ 你水平的单词，显示释义、例句、同义词
- **长难句拆解** — 用 `|` 分割句子结构，显示语法解释和中文翻译
- **习语 & 有用搭配** — 标记习语、隐喻性短语、固定搭配
- **难度评分** — 文章按 CEFR 分级（Basic / Medium / Med-High / High / Expert），附带预估阅读时间
- **单词本** — 从浮窗收藏单词，在独立页面集中复习
- **阅读历史** — 浏览和分析过的文章，支持收藏
- **多语言界面** — 中文 / English / 日本語 / 한국어 / Español / Français（自动检测或手动选择）
- **悬停/点击切换** — 工具提示可在悬停或点击时触发
- **缓存** — 分析结果按 URL 缓存，重新打开同一篇文章秒开

## 技术栈

| 层级 | 技术 |
|------|------|
| 插件框架 | Chrome Manifest V3 |
| AI 后端 | [DeepSeek API](https://platform.deepseek.com) |
| 存储 | `chrome.storage.local` |
| 脚本 | 原生 JavaScript（无构建步骤） |

## 安装

1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `extension` 文件夹

## 配置

点击插件图标 → **设置**

| 配置项 | 说明 |
|--------|------|
| DeepSeek API Key | 必填。在 [platform.deepseek.com](https://platform.deepseek.com) 免费申请 |
| 界面语言 | 自动检测或手动选择 |
| 我的英语水平 | 用于过滤标注，只显示 ≥ 你水平的词 |
| 工具提示触发 | 悬停显示 / 点击显示 |

## 使用方法

1. 打开任意英文网页（CNN、BBC、The Guardian 等）
2. 点击插件图标 →「分析当前页面」
3. 等待几秒，页面自动标注
4. 悬停（或点击）标注词/句，查看解释
5. 点击浮窗中的 ⭐ 收藏单词

清除缓存：点击「清除当前页面缓存」

## CEFR 难度映射

| 显示标签 | CEFR | 适合人群 |
|---------|------|---------|
| Basic | A1/A2 | 初学者 |
| Medium | B1 | 中级 |
| Med-High | B2 | 中高级（默认） |
| High | C1 | 高级 |
| Expert | C2 | 精通 |

标注规则：只显示 **难度 ≥ 你水平** 的内容。

## 项目结构
```
extension/
├── manifest.json # 插件配置
├── background.js # Service Worker：AI 调用、缓存、历史
├── content.js # 页面脚本：文本提取、标注、浮窗
├── styles.css # 高亮和浮窗样式
├── i18n.js # 多语言文案
├── popup.html # 弹窗界面
├── popup.js
├── settings.html # 设置页面
├── settings.js
├── vocabulary.html # 单词本页面
└── vocabulary.js
```

## 隐私说明

文章文本只发送给 DeepSeek API 进行分析，不发送到任何其他地方。分析结果和单词本数据全部存储在 `chrome.storage.local` 本地。

## 许可证

MIT

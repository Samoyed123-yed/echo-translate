# Echo Translate · 留学生课堂实时字幕与翻译

**给刚到海外上课的中国学生：** 老师讲课时，屏幕上实时显示英文字幕和中文翻译，并自动整理双语重点、预测老师可能会问的难题。全部在你自己的电脑上运行，不需要 API Key。

- **English Transcript**：Chrome 实时语音识别；自动修正口误、重复、听错的术语和停顿造成的断句
- **中文实时翻译**：按整段翻译，句子完整；正在说的话约 0.1–0.2 秒就出中文
- **重点**：只写知识点，最新的在上面，核心重点不会被自动删除
- **Q&A**：站在老师角度出最难的题，附英文答案
- **课堂记录**：每节课自动保存在你自己电脑上，可随时回看、导出 Markdown / JSON
- 日间 / 夜间两套配色（16:00 自动切换），可上传课程 PPT / Word / PDF 作为术语参考

## 需要什么

| 必需 | 可选 |
|---|---|
| 电脑上的 **Google Chrome 138+**（Windows 或 macOS） | **Codex CLI**（用你自己的 ChatGPT 订阅额度）：用于纠错、译文校对、重点和 Q&A；没有它也能用免费的“基础摘要” |
| **Python 3.10+**（只用标准库，不用 pip 安装任何东西） | `pypdf`：读取 PDF 课程资料 |

## 安装（三选一）

1. **交给你的 AI 助手（推荐）**：下载或 clone 本仓库，把整个文件夹交给 Codex / Claude / ChatGPT 等能操作电脑的 AI，说：**“请按 INSTALL_FOR_AI.md 帮我安装”**。
2. **Windows 手动**：双击 `install_windows.bat`，桌面会出现 **Echo Translate** 快捷方式。
3. **macOS 手动**：在终端进入本文件夹，运行 `bash install_mac.sh`，桌面会出现 **Echo Translate.command**。

装好后双击桌面图标，会自动用 Chrome 打开 **http://127.0.0.1:8765**，点“启动麦克风”并允许麦克风权限。第一次可能需要等 Chrome 下载英译中语言包。想先看效果，可在“设置 → 演示”试用（不开麦克风、不保存）。

## 隐私与课堂礼仪（请务必读）

- 网页只在你自己电脑的 `127.0.0.1` 上运行，别人访问不到；课堂记录保存在你自己的 `文档/EchoTranslate-Records`，不会上传，同学之间也不互通。
- 但它**不是完全离线**：Chrome 的语音识别会把声音交给 Google 处理；使用 Codex 分析时，课堂文字和你上传的课程资料片段会发给 OpenAI（你自己的账号）。只想尽量少外发，可在“知识分析”选“基础摘要”。
- **很多学校和老师对课堂录音、转写有规定。** 使用前请查看课程大纲 / 学校政策，必要时先征得老师同意；需要无障碍支持的同学可以通过学校的 Disability / Accessibility Office 正式申请。课堂内容只供自己学习，不要公开传播。
- 自动生成的字幕、翻译、重点和“可能的问题”都可能出错，只作学习辅助，以老师讲的和课程资料为准。

## 常见问题

- **字幕不出来**：看计时旁的小电平条，老师说话时应亮 2–4 格；不亮就检查 Chrome 和系统的麦克风权限。老师离得远时，靠前坐或用外接麦克风最有效；设置里的“远距离收音增强”是实验功能，无效时会自动退回原始麦克风。
- **8765 端口被占用**：通常是已经开着一个了，直接用那个页面即可。
- **Codex 每轮多快**：默认“快速”档；可在“设置 → Codex 整理速度”调整。

更详细的说明见 [INSTALL_FOR_AI.md](INSTALL_FOR_AI.md) 和下面的技术说明。本项目采用 [MIT License](LICENSE)，与 OpenAI、Google 无关联。

## English

**Echo Translate** shows live English captions and a Simplified Chinese translation of a lecture, plus bilingual key points and the hardest likely questions — for Chinese students starting classes abroad. It runs on your own computer (`http://127.0.0.1:8765`); no API key is needed.

- **Needs:** Google Chrome 138+ and Python 3.10+ (standard library only), on Windows or macOS. Optional: the Codex CLI signed in with **your own** ChatGPT plan (corrections, translation checks, key points, Q&A); without it a free rule-based mode is used. Optional `pypdf` for PDF course materials.
- **Install:** give the folder to your AI agent and say *"Install it following INSTALL_FOR_AI.md"*; or run `install_windows.bat` (Windows) / `bash install_mac.sh` (macOS). Then open the desktop shortcut.
- **Privacy:** class records stay in your own `Documents/EchoTranslate-Records`. Chrome's speech recognition sends audio to Google, and Codex analysis sends transcript text to OpenAI under your account. **Check your course and school policy on recording/transcribing lectures**, and ask the instructor if needed. Generated text can be wrong; use it as a study aid.
- **License:** MIT. Not affiliated with OpenAI or Google.

---

# 技术说明（Technical notes）

**Zero-API-key classroom subtitles, Chinese translation, bilingual notes, and predicted English Q&A.** The screen has three equal columns: original speech (left), Simplified Chinese translation (middle), bilingual key points (upper right), and potential questions with English answers (lower right). The two right panels are stacked within the final third.

## 2026-11 update (source code is authoritative)

- **Layout**: language / domain / analysis / interval selectors moved into the single top bar. Right column is narrower; 重点 (key points) takes ~64% of it, Q&A ~36%.
- **Slip & mis-recognition correction** (setting: 自动修正口误与误识别, on by default). Two layers, both applied *before* translation so English and Chinese stay in sync:
  1. Instant, in the browser: fillers (um/uh), repeated words or phrases ("the the", "we need to we need to"), cut-off fragments ("proj project"), a near-identical word immediately replaced ("effect affect" → "affect"), and terms close to the glossary ("critical pass" → "critical path"). Common legitimate patterns ("that that", "need needs", "form from") are left alone.
  2. Context pass inside each Codex/Ollama analysis round: new final segments are marked as correctable; the model fixes self-repairs, tangled restarts and misheard terms. The server accepts a fix only if the model adds or substitutes few words (removing an abandoned start is fine; inventing content is not). The same round also checks each new segment's Chinese (wrong, unnatural, or inconsistent with the glossary) and replaces it, so English and Chinese stay in sync.
  Corrected segments show a faint dotted underline; hover to see the original recognition. Exports keep the original as `原识别 / ASR`.
- **Far-voice boost — experimental, OFF by default** (设置 → 远距离收音增强). By default recognition uses Chrome's own microphone path (the proven one). When turned on, the mic is opened through Web Audio (90 Hz high-pass, light 2.5 kHz presence lift, compressor + adaptive make-up gain, limiter) and the processed track is passed to `SpeechRecognition.start(track)` (Chrome desktop 133+). Chrome's online recognizer may not return results for such a track, so a safety net watches it: if the meter hears clear sound for ~3.5 s but no text arrives within ~8 s, the app switches back to the plain microphone by itself. A 5-bar level meter next to the timer works in both modes (2–4 bars while the lecturer speaks is ideal).
- **Live speed**: the words still being spoken are shown almost solid and translated on their own (only the unconfirmed tail, so ~0.1–0.2 s per word with the on-device translator); when Chrome confirms the sentence, the full paragraph translation replaces it (~0.6 s). The ~2 s before a sentence is *confirmed* is Chrome's end-of-speech detection and cannot be shortened by a web page. The class record is serialised and saved at most every 2 s, never per word, so long lectures do not slow the subtitles.
- **Chinese is translated per paragraph**: speech recognition cuts continuous speech at every pause (often adding a period), so one sentence can arrive as several fragments. English is shown as a flowing passage; Chinese is translated a whole paragraph (up to 6 fragments) at a time, so it reads as complete sentences. A period after words like "of / the / and" is removed instantly; each analysis round also repairs remaining false breaks and misheard words, then writes the paragraph's Chinese as fluent sentences.
- **English and Chinese always match**: Chinese is shown as current only when it translates exactly the English on screen; while a corrected line is re-translated, the old Chinese is dimmed. If the browser's translation comes back mostly untranslated (a sign the English was misrecognized), the line is flagged and the next analysis round is pulled forward to fix English and Chinese together. Lines that are pure recognition noise are removed from both panels (the original stays in the record).
- **Analysis interval**: 10 s (default) or 30 s. Key points refresh every round; Q&A refreshes about every 40 s, and questions the lecture has moved past are removed. Notes are written as direct knowledge statements, never "the lecturer said…".
- **清空字幕** (English panel header): empties the English and Chinese panels and keeps recording; key points and Q&A stay. Cleared lines remain in the class record and exports.
- **Key points and Q&A, newest first**: notes rated 4–5 (`核心` / `重要`) stay on screen unless the model merges them into another note; minor notes the model stops mentioning leave the panel. Q&A keeps ≤3 of the hardest questions from the lecturer's perspective, newest on top. Anything that leaves a panel is kept in the record and in exports.
- **Class records**: every class autosaves (every 4 s) to `Documents/EchoTranslate-Records` on this computer — outside the app folder, so sharing the app never shares notes, and installs never sync with each other. Nothing is deleted automatically. **☰ 记录** lists past classes, reopens any of them, or starts a new class. Reopening the page within 3 hours resumes the current class. Override the folder with `ECHO_TRANSLATE_DATA`.
- **Design**: two poster-inspired themes switch at 16:00 (☀/☾ overrides until the next switch). The only decoration is a softly lit, rippling water surface (an SVG lighting filter, no lines) shown in the outer frame and fading out before the panels; nothing sits behind a panel. No animation.
- **Codex speed is fast by default** (设置 → Codex 整理速度: 快速 / 标准 / 深入). Rounds run with `-c model_reasoning_effort="low"` automatically — no environment variable needed, also on friends' installs. If a Codex version rejects that setting, the server retries once without it and stops sending it. `ECHO_TRANSLATE_EFFORT=low|medium|high` still overrides the UI, and `ECHO_TRANSLATE_EFFORT=default` leaves Codex's own setting alone.
- **Fast correction rounds**: while there is newly confirmed English to check, the next Codex round starts ~1.5 s after the previous one ends (job results are polled every 0.4 s). Key points join a round only every 整理间隔 and Q&A about every 40 s; the rounds in between only correct and translate, so their prompt and answer are smaller. With a simulated 4 s Codex, a misheard word is fixed ~5–9 s after the sentence is confirmed (previously ~12–19 s). When nothing needs checking, rounds pause.
- **Paragraphs end only at sentence ends**: a pause in the middle of a sentence never starts a new paragraph (hard cap 12 fragments / 1000 characters). When Codex removes a false period at a paragraph end, the rest of the sentence is pulled back into that paragraph, and both paragraphs are re-translated first in the queue (~0.5 s).
- The server rejects requests whose Host header is not 127.0.0.1/localhost (DNS-rebinding protection).

## Start in Windows (simple)

1. Install **Google Chrome 138+** and **Python 3.10+** (once). Python: https://www.python.org/downloads/windows/ . When installing Python, enable *Add Python to PATH*.
2. Unzip the entire `Codex-Translate.zip` folder. Double-click **`start_windows.bat`**.
3. Chrome opens `http://127.0.0.1:8765`. In Chrome, click **启动麦克风** and allow microphone access. Use **全屏** (or `F11`) for a lecture dashboard.
4. When using Chrome's Translator API for the first time, your browser may download an English–Chinese language pack. Allow time for this download before class.
5. In **设置**, optionally paste the course reference or upload TXT/MD/DOCX/PPTX. PDF is supported after installing `pypdf` (see below). Choose Management / Finance / Quant / Math, customize the term glossary, and select an analysis mode.
6. **导出** saves an aligned Markdown classroom transcript, bilingual notes and Q&A. Hold **Shift** while clicking 导出 to save JSON instead.

The basic app uses only Python's standard library; **no `pip install` is required** for ordinary use. You don't need a paid OpenAI API key, and the app never asks for one.

### Free speech recognition and free on-device translation

- **Microphone → speech transcript:** Browser Web Speech API (`SpeechRecognition`). This is similar to the live speech recognition used by browser translator demos. *Chrome may send microphone audio to Google's speech recognition servers.* No API key is requested. It typically needs a network connection, and browser availability, reliability, continuous-session behavior, and fair-use/service policies may vary.
- **Transcript → Chinese:** Chrome built-in Translator API (`window.Translator`) on Chrome 138+ on supported desktop systems. First use downloads an on-device model or language pack, if available for the device. This avoids OpenAI API charges. The language pack remains in Chrome's storage after installation.
- Select another source language in the toolbar if necessary. SpeechRecognition does not automatically identify every spoken language; source language is user-configured.
- **Target latency:** aim for an English/interim-Chinese display time under 3 seconds. **This is NOT an SLA**: recognition timing depends on audio quality, pauses, network, browser model download and hardware. The UI footnote `TRANSLATE ... ms*` measures **only the translation-call duration**, not end-to-end microphone latency.
- The on-device translator does **not** accept a custom language-model prompt. Domain glossaries therefore show as *verified canonical term hints* alongside the translation; they do not secretly rewrite the lecturer's wording. AI-assisted specialized correction is a possible later improvement, but could increase delay.
- If the on-device Translator API is unsupported or blocked, there is **no silent fake translation**. You can install free Ollama and select its mode as a local translation fallback. Ollama latency may be materially longer on a CPU.

### Optional: use your ChatGPT/Codex subscription for the right-side panels

1. Install **Codex CLI**. Official install instructions: https://github.com/openai/codex . One method, with Node/npm installed: `npm install -g @openai/codex`.
2. In a Windows terminal, run **`codex login`**, sign into **your own** ChatGPT account, and verify with **`codex login status`**.
3. Relaunch the app, open 设置 and click **重新检测**. Select **Codex · 订阅额度** or **自动 · 优先 Codex**.
4. Every 15/30/60 seconds or 15 minutes (as chosen), the app submits a **text-only excerpt** from the lecture, glossary and relevant reference excerpt to `codex exec --ephemeral --sandbox read-only`. It uses the Codex CLI's **current login and associated plan allowances**; no API key is stored or inferred. Results appear asynchronously in the right panels.

Codex CLI was developed as a coding agent, so it is not a low-latency translation engine. Each invocation can take much longer than the interval; jobs are serialized and usage counts toward subscription limits. The app will never send Codex API credentials via the browser. If Codex is missing, at limit, or fails, the right panels show **rule-based, verbatim-derived revision notes**, visibly marked as less reliable. The rule-based right panels do *not* pretend to have an AI model.

**ChatGPT subscription is not OpenAI API credit.** This project does not call a paid API. Codex CLI uses its documented subscription sign-in and `codex exec`; that access and quotas depend on your plan and account.

### Optional: fully local analysis and translation fallback with Ollama

1. Install Ollama on Windows from https://ollama.com/ .
2. In Command Prompt, run `ollama pull qwen2.5:3b` (downloads the free local model to your computer).
3. Start Ollama; select **Ollama · 本地模型** in the toolbar. The right panels will use `http://127.0.0.1:11434` on the same computer.
4. If Chrome on-device translation is unavailable, the app uses the local Ollama translation fallback in this mode, if Ollama is running. For best classroom latency use Chrome's translation whenever available.

The Ollama route needs storage, RAM, and CPU/GPU. It may be considerably slower than Chrome's translation and may not satisfy three-second timing. **No additional API fee**, but model downloads, local energy and hardware requirements still apply.

### Optional PDF references

You can load `.docx`, `.pptx`, `.txt`, `.md`, `.csv`, and `.srt` without dependencies. For text-based PDF uploads, install the optional free `pypdf` package once:

```powershell
py -m pip install pypdf
```

Scanned PDFs that contain images rather than selectable text require OCR outside this app. For speed and cost control, the analysis pipeline currently passes **only the first 5,500 characters** of the course reference per analysis call. It does not compare the full PDF automatically.

## Sharing with classmates

Zip the project folder and send it. Each classmate installs Python and Chrome, double-clicks `start_windows.bat`, and can run the basic free subtitle mode. If they want Codex, **they install and log into their own Codex CLI**. If they want Ollama, they install their own local model. No keys or personal accounts are embedded in the project.

## Operating tips and limitations

- Windows Settings → Privacy & security → Microphone: make sure microphone access and desktop apps are allowed. Position the laptop near the teacher or use a suitable directional microphone. The app does not play any synthesized speech, and does not turn your speakers on.
- Open the site through `start_windows.bat` and `http://127.0.0.1:8765`, **not** by double-clicking `index.html`. Chrome requires secure contexts for microphone and some built-in model APIs; loopback localhost qualifies.
- Four panels are independently scrollable. They follow the newest messages by default. Scrolling up pauses following; click **↓ 追踪** to resume. Oldest on-screen captions are removed after 480 segments to prevent memory bloat. Export notes before ending class: the session is **not automatically stored on disk or uploaded**.
- Speech recognition can restart itself after an interruption. Some browsers enforce session length and may temporarily reject restarts. Actual accuracy and speed need to be tested in a live lecture.
- **Privacy:** the server listens only on `127.0.0.1`, there is no telemetry, and the app does not persist your recording or API key. Chrome speech recognition may use a remote service. Codex analysis transmits selected transcript/reference text to your signed-in Codex service. Ollama inference remains local. Always obtain permission for recording/transcription in class where required.
- **Accuracy:** specialized terminology is supported with visible glossary hints. Teacher-specific phrases, microeconomics equations, and ambiguous terms may still be mistranscribed or translated. A glossary is not equivalent to a trained specialist interpreter. Potential questions are predictions, not claims about what the teacher will ask.
- **Compatibility:** Chrome 138+ desktop is the preferred browser; `SpeechRecognition` and `Translator` are not universally available. The app clearly signals unsupported features rather than claiming they work.
- **Security:** this is intended for a trusted user's own computer on loopback. Do not rebind the server to `0.0.0.0` or deploy it on the open Internet without proper authentication and access controls.

## File layout

```text
codex-translate/
├── start_windows.bat        Windows launcher
├── start_mac_linux.sh      macOS/Linux launcher
├── server.py               Standard-library localhost server, document parser, Codex/Ollama bridge
├── requirements.txt        Optional PDF package note
├── public/
│   ├── index.html          Full-screen UI
│   ├── styles.css          Responsive four-panel layout
│   └── app.js              Streaming speech, on-device translation, live notes and export
└── tests/
    └── test_server.py      Unit and HTTP smoke tests
```

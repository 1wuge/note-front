<template>
  <div class="doc-editor" ref="rootRef" v-loading="loading">
    <template v-if="!loading && loaded">
      <div class="editor-head">
        <input
          v-model="title"
          class="title-input"
          placeholder="无标题"
          maxlength="200"
          @input="scheduleSave"
        />
        <el-button
          size="small"
          text
          :icon="EditPen"
          title="把光标放进代码块，再点这里从预设里挑一个名字（也可以自己输入）"
          @click="openNameDialog"
        >
          代码块命名
        </el-button>
        <el-button
          size="small"
          text
          :icon="List"
          :type="showOutline ? 'primary' : 'default'"
          :title="showOutline ? '隐藏大纲' : '显示大纲（按小标题快速定位）'"
          @click="toggleOutline"
        >
          大纲
        </el-button>
        <el-radio-group v-model="mode" size="small" class="mode-switch">
          <el-radio-button value="edit">编辑</el-radio-button>
          <el-radio-button value="split">分屏</el-radio-button>
          <el-radio-button value="preview">预览</el-radio-button>
        </el-radio-group>
        <div class="save-status">
          <el-icon v-if="saving" class="spin"><Loading /></el-icon>
          <el-icon v-else class="ok"><CircleCheck /></el-icon>
          <span>{{ statusText }}</span>
        </div>
      </div>

      <div class="editor-wrap">
        <div class="editor-body" :class="mode">
          <div
            class="pane pane-edit"
            ref="editPaneRef"
            v-show="mode !== 'preview'"
            @drop="handleDrop"
            @dragover="handleDragOver"
          >
            <Toolbar
              class="editor-toolbar"
              :editor="editorRef"
              :default-config="toolbarConfig"
              mode="default"
            />
            <Editor
              class="editor-area"
              :default-config="editorConfig"
              mode="default"
              v-model="htmlContent"
              @on-created="handleCreated"
              @custom-paste="handleCustomPaste"
            />
          </div>

          <div
            class="pane pane-preview"
            ref="previewPaneRef"
            v-show="mode !== 'edit'"
            v-html="htmlContent"
          ></div>
        </div>

        <aside class="outline" v-show="showOutline">
          <div class="outline-head">
            <span>大纲</span>
            <span class="outline-count" v-if="outline.length">{{ outline.length }}</span>
          </div>
          <div class="outline-list" v-if="outline.length">
            <div
              v-for="(item, i) in outline"
              :key="i"
              class="outline-item"
              :class="['lv' + item.level, { active: i === activeHeading }]"
              :title="item.text || '（无标题）'"
              @click="jumpTo(i)"
            >
              {{ item.text || "（无标题）" }}
            </div>
          </div>
          <div class="outline-empty" v-else>
            正文里用了「标题1 / 标题2 / 标题3」后，目录会出现在这里
          </div>
        </aside>
      </div>

      <div class="editor-foot">
        <span>{{ charCount }} 字</span>
        <span class="dot">·</span>
        <span>约 {{ readMinutes }} 分钟读完</span>
        <span class="dot">·</span>
        <span>{{ modeLabel }}</span>
      </div>

      <el-dialog
        v-model="nameDialog.visible"
        title="代码块命名"
        width="430px"
        append-to-body
      >
        <div class="name-row">
          <el-input
            v-model="nameDialog.value"
            class="name-input"
            placeholder="直接输入任意名字，例如 nginx.conf、Java"
            maxlength="40"
            clearable
            @keyup.enter="confirmCodeName"
          />
          <el-popover
            v-model:visible="presetVisible"
            placement="bottom-end"
            :width="360"
            trigger="click"
          >
            <template #reference>
              <el-button class="preset-btn">预设</el-button>
            </template>
            <div class="preset-panel">
              <div
                v-for="group in presetGroups"
                :key="group.label"
                class="preset-group"
              >
                <div class="preset-title">{{ group.label }}</div>
                <div class="preset-items">
                  <el-button
                    v-for="item in group.options"
                    :key="item"
                    size="small"
                    text
                    bg
                    @click="pickPreset(item)"
                  >
                    {{ item }}
                  </el-button>
                </div>
              </div>
            </div>
          </el-popover>
        </div>
        <p class="name-hint">
          名字显示在代码块左上角，会随文档一起保存；留空表示不命名（此时左上角显示代码块自带的语言）。这里可以随便输入，点「预设」也能快速填入常用语言或文件名，自己输入过的名字会自动收进「最近使用」。
        </p>
        <template #footer>
          <el-button text @click="clearCodeName">清除命名</el-button>
          <el-button @click="nameDialog.visible = false">取消</el-button>
          <el-button type="primary" @click="confirmCodeName">确定</el-button>
        </template>
      </el-dialog>
    </template>

    <el-empty v-else-if="!loading" description="选择或新建一篇文档开始" />
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { Loading, CircleCheck, EditPen, List } from "@element-plus/icons-vue";
import { SlateNode, SlateTransforms } from "@wangeditor/editor";
import "@wangeditor/editor/dist/css/style.css";
import { Editor, Toolbar } from "@wangeditor/editor-for-vue";
import api from "../api/index.js";

const props = defineProps({
  docId: { type: [Number, String], required: true },
});
const emit = defineEmits(["saved"]);

const editorRef = shallowRef(null);
const rootRef = ref(null);
const editPaneRef = ref(null);
const previewPaneRef = ref(null);
const showOutline = ref(true);
try {
  const savedOutline = localStorage.getItem("note.outline");
  if (savedOutline != null) showOutline.value = savedOutline === "1";
} catch (e) {
  /* 忽略隐私模式等读取失败 */
}
const outline = ref([]);
const activeHeading = ref(0);
const loading = ref(false);
const loaded = ref(false);
const title = ref("");
const htmlContent = ref("");
const mode = ref("edit");
const saving = ref(false);
const savedAt = ref(null);
let timer = null;
let suppress = false;
let pendingRestore = null;

const toolbarConfig = {
  toolbarKeys: [
    "headerSelect",
    "bold",
    "italic",
    "underline",
    "through",
    "color",
    "bgColor",
    "fontSize",
    "fontFamily",
    "|",
    "bulletedList",
    "numberedList",
    "|",
    "justifyLeft",
    "justifyCenter",
    "justifyRight",
    "justifyJustify",
    "|",
    "insertLink",
    "uploadImage",
    "blockquote",
    "codeBlock",
    "|",
    "undo",
    "redo",
    "clearStyle",
  ],
};

const editorConfig = {
  placeholder: "开始写作…（支持居中、缩进、多空格等自由排版）",
  scroll: false,
  MENU_CONF: {
    uploadImage: {
      maxFileSize: 5 * 1024 * 1024,
      allowedFileTypes: ["image/*"],
      async customUpload(file, insertFn) {
        const res = await api.uploadImage(file);
        insertFn(res.data.url, file.name || "image", res.data.url);
      },
    },
  },
};

// 粘贴图片：customPaste 必须挂成 Editor 的事件（@custom-paste），放进 default-config 会被 wangEditor 抛错
function handleCustomPaste(editor, event, setResult) {
  const files = imageFilesFrom(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  if (setResult) setResult(false);
  uploadAndInsert(editor, files);
}

// 从剪贴板/拖拽里挑出图片文件
function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return [];
  const fromItems = Array.from(dataTransfer.items || [])
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => (it.getAsFile ? it.getAsFile() : null));
  const merged = fromItems.length
    ? fromItems
    : Array.from(dataTransfer.files || []);
  return merged.filter((f) => f && f.type.startsWith("image/"));
}

// 上传并插入到光标处
async function uploadAndInsert(editor, files) {
  const urls = [];
  for (const file of files) {
    try {
      const res = await api.uploadImage(file);
      urls.push(res.data.url);
    } catch (e) {
      console.error("图片上传失败", file.name, e);
    }
  }
  if (!urls.length || !editor) return;
  const html = urls.map((url) => `<img src="${url}" alt="image"/>`).join("");
  editor.dangerouslyInsertHtml(html);
}

function handleDragOver(e) {
  if (imageFilesFrom(e.dataTransfer).length) e.preventDefault();
}

function handleDrop(e) {
  const files = imageFilesFrom(e.dataTransfer);
  if (!files.length) return;
  e.preventDefault();
  uploadAndInsert(editorRef.value, files);
}

const plainText = computed(() =>
  htmlContent.value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ")
);
const charCount = computed(() => plainText.value.replace(/\s/g, "").length);
const readMinutes = computed(() => Math.max(1, Math.round(charCount.value / 400)));
const modeLabel = computed(
  () => ({ edit: "纯编辑", split: "编辑并预览", preview: "纯预览" }[mode.value])
);
const statusText = computed(() => {
  if (saving.value) return "保存中…";
  if (savedAt.value) {
    const d = savedAt.value;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return "已保存 " + hh + ":" + mm;
  }
  return "未保存";
});

function handleCreated(editor) {
  editorRef.value = editor;
  buildOutline();
  // 编辑器（v-if 控制）是在 load 结束之后才挂载的，命名要等到这里才能落回节点
  restoreCodeNames(pendingRestore);
  applyCodeLabels();
  requestAnimationFrame(applyCodeLabels);
}

async function load() {
  loading.value = true;
  loaded.value = false;
  try {
    const res = await api.getDoc(props.docId);
    suppress = true;
    title.value = res.data.title || "";
    htmlContent.value = res.data.content || "<p><br></p>";
    savedAt.value = null;
    setTimeout(() => {
      suppress = false;
    }, 0);
    loaded.value = true;
    pendingRestore = res.data.content;
    buildOutline();
    await nextTick();
    applyCodeLabels();
  } catch (e) {
    console.error("load doc failed", e);
  } finally {
    loading.value = false;
  }
}

function scheduleSave() {
  if (suppress || !loaded.value) return;
  saving.value = true;
  clearTimeout(timer);
  timer = setTimeout(doSave, 700);
}

async function doSave() {
  if (!loaded.value) return;
  try {
    await api.updateDoc(props.docId, {
      title: (title.value || "").trim() || "无标题",
      content: withCodeNames(htmlContent.value),
    });
    savedAt.value = new Date();
    emit("saved", { id: props.docId, title: (title.value || "").trim() || "无标题" });
  } catch (e) {
    console.error("save failed", e);
  } finally {
    saving.value = false;
  }
}

watch(htmlContent, () => {
  scheduleSave();
  scheduleOutline();
  nextTick(applyCodeLabels);
});
watch(() => props.docId, load, { immediate: true });

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    clearTimeout(timer);
    doSave();
  }
}

onMounted(() => {
  // 滚动事件不冒泡，用捕获阶段统一监听编辑区/预览区的滚动
  if (rootRef.value) rootRef.value.addEventListener("scroll", onPaneScroll, true);
});

function toggleOutline() {
  showOutline.value = !showOutline.value;
  try {
    localStorage.setItem("note.outline", showOutline.value ? "1" : "0");
  } catch (e) {
    /* 忽略隐私模式等写入失败 */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKeydown);
}

onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(outlineTimer);
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  if (rootRef.value) rootRef.value.removeEventListener("scroll", onPaneScroll, true);
  if (typeof window !== "undefined") window.removeEventListener("keydown", onKeydown);
  if (editorRef.value) {
    try {
      editorRef.value.destroy();
    } catch (e) {
      /* noop */
    }
  }
  editorRef.value = null;
});

// ---------- 大纲：按小标题快速定位 ----------
let outlineTimer = null;
let scrollRaf = 0;
let jumpLockUntil = 0;

function buildOutline() {
  const doc = new DOMParser().parseFromString(htmlContent.value || "", "text/html");
  outline.value = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5")).map((el) => ({
    level: Number(el.tagName.slice(1)),
    text: (el.textContent || "").replace(/\s+/g, " ").trim(),
  }));
  if (activeHeading.value >= outline.value.length) activeHeading.value = 0;
}

function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(buildOutline, 250);
}

// 取当前可见窗格里的标题元素（编辑区 / 预览区，顺序与大纲一致）
function headingEls(scroller) {
  if (!scroller) return [];
  return Array.from(scroller.querySelectorAll("h1,h2,h3,h4,h5"));
}

function scrollers() {
  const list = [];
  if (mode.value !== "preview" && editPaneRef.value) {
    list.push(editPaneRef.value.querySelector(".editor-area") || editPaneRef.value);
  }
  if (mode.value !== "edit" && previewPaneRef.value) list.push(previewPaneRef.value);
  return list;
}

async function jumpTo(index) {
  activeHeading.value = index;
  // 文档末尾长度不够时滚动会被夹住，这时别让滚动反查把高亮抢回去
  jumpLockUntil = Date.now() + 1300;
  await nextTick();
  scrollers().forEach((sc) => {
    const el = headingEls(sc)[index];
    if (!el) return;
    // 自己算距离再滚：scrollIntoView 在内容不够长时会停在半路
    const delta = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    sc.scrollTo({ top: Math.max(0, sc.scrollTop + delta - 8), behavior: "smooth" });
    el.classList.add("heading-flash");
    setTimeout(() => el.classList.remove("heading-flash"), 1400);
  });
  // 动画结束后再钉一次高亮，避免被滚动反查改掉
  setTimeout(() => {
    activeHeading.value = index;
  }, 1200);
}

// 滚动时反查当前停在哪个标题，让大纲高亮跟着走
function syncActiveHeading(scroller) {
  const els = headingEls(scroller);
  if (!els.length) return;
  const top = scroller.getBoundingClientRect().top;
  let index = 0;
  els.forEach((el, i) => {
    if (el.getBoundingClientRect().top - top <= 40) index = i;
  });
  activeHeading.value = index;
}

function onPaneScroll(e) {
  const el = e.target;
  if (!el || !el.classList) return;
  if (
    !el.classList.contains("editor-area") &&
    !el.classList.contains("pane-preview") &&
    !el.classList.contains("w-e-scroll")
  ) {
    return;
  }
  if (Date.now() < jumpLockUntil) return;
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    syncActiveHeading(el);
  });
}

// ---------- 代码块命名 ----------
// 下拉预设：常用文件名 + 语言/技术栈
const namePresets = [
  {
    label: "常用文件名",
    options: [
      "nginx.conf",
      "application.yml",
      "pom.xml",
      "package.json",
      "vite.config.js",
      "Dockerfile",
      "docker-compose.yml",
      "init.sql",
      "schema.sql",
      "my.cnf",
      "requirements.txt",
      ".gitignore",
      "start.sh",
    ],
  },
  {
    label: "语言 / 技术栈",
    options: [
      "Java",
      "Spring Boot",
      "JavaScript",
      "TypeScript",
      "Vue",
      "HTML",
      "CSS",
      "SQL",
      "MySQL",
      "Bash",
      "Shell",
      "YAML",
      "JSON",
      "XML",
      "Python",
      "Go",
      "C",
      "C++",
      "C#",
      "PHP",
      "Rust",
      "Kotlin",
      "Markdown",
      "纯文本",
    ],
  },
];

const nameDialog = ref({ visible: false, path: null, value: "" });
const presetVisible = ref(false);
// 自己起过的名字（预设以外的）记在本地，下次直接从「最近使用」里挑
const recentNames = ref([]);
try {
  const saved = JSON.parse(localStorage.getItem("note.codeNames") || "[]");
  if (Array.isArray(saved)) {
    recentNames.value = saved.filter((n) => typeof n === "string" && n.trim()).slice(0, 8);
  }
} catch (e) {
  /* 忽略隐私模式等读取失败 */
}

const presetValues = new Set(namePresets.flatMap((group) => group.options));

const presetGroups = computed(() =>
  recentNames.value.length
    ? [{ label: "最近使用", options: recentNames.value }, ...namePresets]
    : namePresets
);

function pickPreset(item) {
  nameDialog.value.value = item;
  presetVisible.value = false;
}

function rememberName(name) {
  const value = (name || "").trim();
  if (!value || presetValues.has(value)) return;
  recentNames.value = [value, ...recentNames.value.filter((n) => n !== value)].slice(0, 8);
  try {
    localStorage.setItem("note.codeNames", JSON.stringify(recentNames.value));
  } catch (e) {
    /* 忽略隐私模式等写入失败 */
  }
}

// language-xxx → 展示用的语言名
const LANG_LABELS = {
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "LESS",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TypeScript",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  sql: "SQL",
  mysql: "MySQL",
  java: "Java",
  kotlin: "Kotlin",
  python: "Python",
  py: "Python",
  go: "Go",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  csharp: "C#",
  cs: "C#",
  php: "PHP",
  ruby: "Ruby",
  rust: "Rust",
  swift: "Swift",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  powershell: "PowerShell",
  ps1: "PowerShell",
  bat: "批处理",
  cmd: "批处理",
  ini: "INI",
  conf: "配置",
  properties: "Properties",
  nginx: "Nginx",
  dockerfile: "Dockerfile",
  plaintext: "纯文本",
  plain: "纯文本",
  text: "纯文本",
};

function langLabel(className) {
  const m = /language-([\w+#.-]+)/i.exec(className || "");
  if (!m) return "";
  const key = m[1].toLowerCase();
  return LANG_LABELS[key] || m[1];
}

// 编辑区的 DOM 不带 language-xxx（只有存下来的 HTML 带），所以从 htmlContent 里按顺序取
function langsInOrder() {
  const doc = new DOMParser().parseFromString(htmlContent.value || "", "text/html");
  return Array.from(doc.querySelectorAll("pre")).map((pre) =>
    langLabel(pre.querySelector("code")?.className)
  );
}
// 名字挂在 pre 节点的 name 上，展示靠 DOM 的 data-name + CSS ::before
function collectPrePaths(editor) {
  const paths = [];
  const walk = (nodes, parentPath) => {
    nodes.forEach((node, i) => {
      const path = [...parentPath, i];
      if (node.type === "pre") {
        paths.push(path);
        return;
      }
      if (Array.isArray(node.children)) walk(node.children, path);
    });
  };
  if (editor && Array.isArray(editor.children)) walk(editor.children, []);
  return paths;
}

function codeNamesInOrder() {
  const editor = editorRef.value;
  if (!editor) return [];
  return collectPrePaths(editor).map((path) => SlateNode.get(editor, path)?.name || "");
}

function applyCodeLabels() {
  if (!loaded.value) return;
  const names = codeNamesInOrder();
  const langs = langsInOrder();
  [editPaneRef.value, previewPaneRef.value].forEach((pane) => {
    if (!pane) return;
    pane.querySelectorAll("pre").forEach((pre, i) => {
      // 自己起的名字优先；没起名字就显示代码块的语言；都没有就交给 CSS 兜底
      const label =
        (names[i] || "").trim() ||
        langs[i] ||
        langLabel(pre.querySelector("code")?.className);
      if (label) pre.setAttribute("data-name", label);
      else pre.removeAttribute("data-name");
    });
  });
}

function currentCodePath() {
  const editor = editorRef.value;
  if (!editor || !editor.selection) return null;
  const anchor = editor.selection.anchor.path;
  return (
    collectPrePaths(editor).find(
      (path) => path.length < anchor.length && path.every((v, i) => anchor[i] === v)
    ) || null
  );
}

function openNameDialog() {
  const editor = editorRef.value;
  if (!editor) return;
  const path = currentCodePath();
  if (!path) {
    ElMessage.info("请先把光标放进代码块里，再点命名");
    return;
  }
  nameDialog.value.path = path;
  nameDialog.value.value = SlateNode.get(editor, path)?.name || "";
  presetVisible.value = false;
  nameDialog.value.visible = true;
}

async function confirmCodeName() {
  const editor = editorRef.value;
  const path = nameDialog.value.path;
  nameDialog.value.visible = false;
  if (!editor || !path) return;
  rememberName(nameDialog.value.value);
  SlateTransforms.setNodes(
    editor,
    { name: (nameDialog.value.value || "").trim() },
    { at: path }
  );
  await nextTick();
  applyCodeLabels();
  scheduleSave(); // 只改了节点属性、正文 HTML 没变，需要手动触发一次保存
}

function clearCodeName() {
  nameDialog.value.value = "";
  confirmCodeName();
}

// 存盘时把名字写进 HTML 的 data-name，刷新后才有得读
function withCodeNames(html) {
  const names = codeNamesInOrder();
  if (!names.some((n) => n)) return html;
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll("pre").forEach((pre, i) => {
    const name = names[i] || "";
    if (name) pre.setAttribute("data-name", name);
    else pre.removeAttribute("data-name");
  });
  return doc.body.innerHTML;
}

// 打开文档后，把 HTML 里的 data-name 还原回节点
function restoreCodeNames(raw) {
  const editor = editorRef.value;
  if (!editor || !raw) return;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const names = Array.from(doc.querySelectorAll("pre")).map(
    (pre) => pre.getAttribute("data-name") || ""
  );
  if (!names.some((n) => n)) return;
  const paths = collectPrePaths(editor);
  paths.forEach((path, i) => {
    if (names[i]) SlateTransforms.setNodes(editor, { name: names[i] }, { at: path });
  });
  applyCodeLabels();
}

defineExpose({ flush: doSave });
</script>

<style scoped>
.doc-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 28px 12px;
  overflow: hidden;
  box-sizing: border-box;
}

.editor-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 26px;
  font-weight: 700;
  color: #1f2329;
  background: transparent;
  padding: 4px 0;
}

.title-input::placeholder {
  color: #c4c9d0;
}

.mode-switch {
  flex-shrink: 0;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8a919f;
  white-space: nowrap;
  min-width: 74px;
  justify-content: flex-end;
}

.save-status .ok {
  color: #52c41a;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 编辑区 + 右侧大纲栏 */
.editor-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

/* Body: three modes */
.editor-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  overflow: hidden;
}

/* 大纲 */
.outline {
  width: 210px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fcfcfd;
  overflow: hidden;
}

.outline-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 1px solid #eef0f3;
}

.outline-count {
  font-weight: 400;
  color: #a3a9b3;
}

.outline-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.outline-item {
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-item:hover {
  background: #eef4ff;
  color: #1f2329;
}

.outline-item.active {
  background: #e8f2ff;
  color: #1677ff;
  font-weight: 600;
}

.outline-item.lv2 { padding-left: 20px; font-size: 12.5px; }
.outline-item.lv3 { padding-left: 32px; font-size: 12.5px; color: #6b7280; }
.outline-item.lv4 { padding-left: 44px; font-size: 12px; color: #8a919f; }
.outline-item.lv5 { padding-left: 54px; font-size: 12px; color: #8a919f; }

.outline-empty {
  padding: 16px 14px;
  font-size: 12px;
  line-height: 1.7;
  color: #a3a9b3;
}

.editor-body.split {
  grid-template-columns: 1fr 1fr;
}

.pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-edit .editor-toolbar {
  border-bottom: 1px solid #eef0f3;
  flex-shrink: 0;
}

.pane-edit .editor-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.editor-body.split .pane-preview {
  border-left: 1px solid #eef0f3;
}

.pane-edit .editor-area :deep(.w-e-text-container) {
  height: 100% !important;
}

.pane-edit .editor-area :deep(.w-e-scroll) {
  height: 100% !important;
}

/* Preview pane (read-only render) */
.pane-preview {
  overflow-y: auto;
  padding: 16px 22px;
  line-height: 1.85;
  color: #2b2f36;
  font-size: 15px;
  word-break: break-word;
}

.pane-preview :deep(h1) { font-size: 1.7em; margin: 0.6em 0 0.4em; border-bottom: 1px solid #eee; padding-bottom: 6px; }
.pane-preview :deep(h2) { font-size: 1.4em; margin: 0.6em 0 0.4em; }
.pane-preview :deep(h3) { font-size: 1.2em; margin: 0.5em 0 0.3em; }
.pane-preview :deep(p) { margin: 0.5em 0; }
.pane-preview :deep(a) { color: #409eff; }
.pane-preview :deep(code) {
  background: #f2f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 0.9em;
  color: #d6336c;
}
.pane-preview :deep(pre) {
  background: #1e1e2a;
  color: #e6e6ef;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.8em 0;
  /* 预览区是纵向 flex 容器：pre 一旦可滚动，自动最小高度就是 0，
     会被 flex 压成一行高（看起来“极窄”），必须显式禁止收缩 */
  flex: none;
  /* 阅读视图里让长行折行，避免横向滚动把内容藏起来 */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pane-preview :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
  white-space: inherit;
  overflow-wrap: inherit;
}
.pane-preview :deep(blockquote) {
  border-left: 3px solid #409eff;
  background: #f7f9fc;
  margin: 0.6em 0;
  padding: 6px 14px;
  color: #5b6472;
  border-radius: 0 6px 6px 0;
}
.pane-preview :deep(ul),
.pane-preview :deep(ol) { padding-left: 1.6em; margin: 0.5em 0; }
.pane-preview :deep(li) { margin: 0.15em 0; }
.pane-preview :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 1.2em 0; }
.pane-preview :deep(img) { max-width: 100%; border-radius: 6px; }

/* 跳转定位时闪一下，方便一眼看到落在哪 */
.pane-edit :deep(.heading-flash),
.pane-preview :deep(.heading-flash) {
  animation: headingFlash 1.4s ease;
}

@keyframes headingFlash {
  from { background-color: #fff3bf; }
  to { background-color: transparent; }
}

/* 代码块左上角的自定义命名（data-name 由 applyCodeLabels 写入） */
.pane-edit :deep(.w-e-text-container pre[data-name])::before {
  content: attr(data-name);
  display: block;
  padding: 4px 14px;
  margin-bottom: 2px;
  background: #ebedf0;
  border: 1px solid #e0e3e8;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  color: #5b6472;
  font-family: Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}

/* 预览区每个代码块都带左上角标签：自己起的名字 > 代码块语言 > 「代码」 */
.pane-preview :deep(pre)::before {
  content: attr(data-name);
  display: block;
  margin: -14px -16px 10px;
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.07);
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  color: #9fb0c9;
  font-family: Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace;
  font-size: 12px;
  font-weight: 600;
}

.pane-preview :deep(pre:not([data-name]))::before {
  content: "代码";
  color: #7d8ba1;
}
.pane-preview :deep(table) { border-collapse: collapse; margin: 0.6em 0; }
.pane-preview :deep(th),
.pane-preview :deep(td) { border: 1px solid #e5e7eb; padding: 6px 12px; }

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-input {
  flex: 1;
  min-width: 0;
}

.preset-btn {
  flex-shrink: 0;
}

.preset-panel {
  max-height: 320px;
  overflow-y: auto;
}

.preset-group + .preset-group {
  margin-top: 12px;
}

.preset-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.preset-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.preset-items :deep(.el-button + .el-button) {
  margin-left: 0;
}

.name-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #8a919f;
}

.editor-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 0;
  font-size: 12px;
  color: #a3a9b3;
  flex-shrink: 0;
}

.editor-foot .dot {
  color: #d5d9df;
}
</style>

<template>
  <div class="workspace">
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand">
        <div class="brand-left">
          <el-icon :size="20" color="#409eff"><Notebook /></el-icon>
          <span class="brand-name">我的知识库</span>
        </div>
        <el-icon class="collapse-btn" @click="collapsed = !collapsed">
          <Expand v-if="collapsed" />
          <Fold v-else />
        </el-icon>
      </div>

      <template v-if="!collapsed">
        <div class="side-tools">
          <el-input
            v-model="filterText"
            placeholder="搜索文档"
            :prefix-icon="Search"
            size="default"
            clearable
          />
          <el-dropdown trigger="click" @command="onCreateCommand">
            <el-button type="primary" :icon="Plus" class="new-btn">新建</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="doc">
                  <el-icon><Document /></el-icon> 新建文档
                </el-dropdown-item>
                <el-dropdown-item command="group">
                  <el-icon><FolderAdd /></el-icon> 新建分组
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="tree-wrap" v-loading="loading">
          <DocTree
            :data="treeData"
            :active-id="activeId"
            :filter-text="filterText"
            @select="onSelect"
            @command="onNodeCommand"
            @move="onMove"
          />
        </div>

        <div class="side-foot">共 {{ summaries.length }} 项 · {{ docCount }} 篇文档</div>
      </template>
    </aside>

    <main class="main">
      <DocEditor
        v-if="activeId && activeIsDoc"
        :key="activeId"
        ref="editorRef"
        :doc-id="activeId"
        @saved="onSaved"
      />
      <div v-else class="welcome">
        <el-icon :size="56" color="#d3d9e2"><Notebook /></el-icon>
        <h2>开始你的知识库</h2>
        <p>在左侧新建文档或分组，像语雀一样管理你的笔记</p>
        <el-button type="primary" :icon="Plus" size="large" @click="createUnder(null, false)">
          新建文档
        </el-button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Notebook,
  Search,
  Plus,
  Document,
  FolderAdd,
  Expand,
  Fold,
} from "@element-plus/icons-vue";
import api from "../api/index.js";
import DocTree from "../components/DocTree.vue";
import DocEditor from "../components/DocEditor.vue";

const summaries = ref([]);
const treeData = ref([]);
const activeId = ref(null);
const loading = ref(false);
const filterText = ref("");
const collapsed = ref(false);
const editorRef = ref(null);

const docCount = computed(() => summaries.value.filter((d) => !d.isFolder).length);
const activeIsDoc = computed(() => {
  const d = summaries.value.find((x) => x.id === activeId.value);
  return !!d && !d.isFolder;
});

function buildTree(list) {
  const map = {};
  const roots = [];
  list.forEach((d) => {
    map[d.id] = { ...d, children: [] };
  });
  list.forEach((d) => {
    const node = map[d.id];
    if (d.parentId && map[d.parentId]) {
      map[d.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (arr) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

async function loadTree() {
  loading.value = true;
  try {
    const res = await api.getDocs();
    summaries.value = res.data;
    treeData.value = buildTree(res.data);
    if (activeId.value != null && !activeIsDoc.value) {
      activeId.value = null;
      syncRoute(null);
    }
  } catch (e) {
    ElMessage.error("加载目录失败，请确认后端已启动");
    console.error(e);
  } finally {
    loading.value = false;
  }
}

const route = useRoute();
const router = useRouter();

// 选中态 → URL：刷新/复制链接后还能回到同一篇
function syncRoute(id) {
  if (id == null) {
    if (route.path !== "/") router.replace("/");
    return;
  }
  const target = `/doc/${id}`;
  if (route.path !== target) router.push(target);
}

// URL → 选中态：直接打开 /doc/:id、浏览器前进后退都能还原
watch(
  () => route.params.id,
  (raw) => {
    const next = raw == null || raw === "" ? null : Number(raw);
    activeId.value = Number.isFinite(next) ? next : null;
  },
  { immediate: true }
);

function onSelect(nodeData) {
  activeId.value = nodeData.id;
  syncRoute(nodeData.id);
}

function onSaved({ id, title }) {
  const s = summaries.value.find((x) => x.id === id);
  if (s && s.title !== title) {
    s.title = title;
    treeData.value = buildTree(summaries.value);
  }
}

async function createUnder(parentId, isFolder) {
  const label = isFolder ? "分组" : "文档";
  let name;
  try {
    const { value } = await ElMessageBox.prompt(`请输入${label}名称`, `新建${label}`, {
      confirmButtonText: "创建",
      cancelButtonText: "取消",
      inputValue: isFolder ? "新建分组" : "无标题文档",
      inputValidator: (v) => (v && v.trim() ? true : "名称不能为空"),
    });
    name = value.trim();
  } catch (e) {
    return;
  }
  try {
    const res = await api.createDoc({ title: name, parentId, isFolder });
    await loadTree();
    if (!isFolder) {
      activeId.value = res.data.id;
      syncRoute(res.data.id);
    }
  } catch (e) {
    ElMessage.error("创建失败");
    console.error(e);
  }
}

function onCreateCommand(cmd) {
  createUnder(null, cmd === "group");
}

function onNodeCommand({ action, node }) {
  if (action === "newdoc") createUnder(node.id, false);
  else if (action === "newgroup") createUnder(node.id, true);
  else if (action === "rename") renameNode(node);
  else if (action === "delete") deleteNode(node);
}

async function renameNode(node) {
  let name;
  try {
    const { value } = await ElMessageBox.prompt("请输入新名称", "重命名", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: node.title,
      inputValidator: (v) => (v && v.trim() ? true : "名称不能为空"),
    });
    name = value.trim();
  } catch (e) {
    return;
  }
  try {
    await api.updateDoc(node.id, { title: name });
    await loadTree();
  } catch (e) {
    ElMessage.error("重命名失败");
  }
}

async function deleteNode(node) {
  try {
    await ElMessageBox.confirm(
      node.isFolder
        ? `确定删除分组「${node.title}」及其全部内容吗？`
        : `确定删除文档「${node.title}」吗？`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch (e) {
    return;
  }
  try {
    await api.deleteDoc(node.id);
    if (activeId.value === node.id) {
      activeId.value = null;
      syncRoute(null);
    }
    await loadTree();
    ElMessage.success("已删除");
  } catch (e) {
    ElMessage.error("删除失败");
  }
}

async function onMove({ id, parentId, sortOrder }) {
  try {
    await api.moveDoc(id, { parentId, sortOrder });
    await loadTree();
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || "移动失败");
    await loadTree();
  }
}

onMounted(loadTree);
</script>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f6f7f9;
}

.sidebar {
  width: 288px;
  flex-shrink: 0;
  background: #fbfbfc;
  border-right: 1px solid #eaecef;
  display: flex;
  flex-direction: column;
  transition: width 0.22s ease;
}

.sidebar.collapsed {
  width: 52px;
}

.brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;
}

.brand-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.brand-name {
  font-weight: 600;
  color: #1f2329;
  font-size: 15px;
  white-space: nowrap;
}

.collapse-btn {
  color: #8a919f;
  cursor: pointer;
}

.collapse-btn:hover {
  color: #409eff;
}

.side-tools {
  display: flex;
  gap: 8px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}

.side-tools .el-input {
  flex: 1;
}

.new-btn {
  flex-shrink: 0;
}

.tree-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
}

.side-foot {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 12px;
  color: #a3a9b3;
  border-top: 1px solid #eaecef;
}

.main {
  flex: 1;
  min-width: 0;
  background: #fff;
  overflow: hidden;
}

.welcome {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #6b7280;
}

.welcome h2 {
  margin: 12px 0 4px;
  color: #1f2329;
  font-weight: 600;
}

.welcome p {
  margin-bottom: 16px;
  color: #98a1af;
  font-size: 14px;
}

:deep(.el-tree-node__content) {
  height: 34px;
  border-radius: 6px;
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #e8f2ff;
}
</style>

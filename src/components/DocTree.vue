<template>
  <el-tree
    ref="treeRef"
    :data="data"
    node-key="id"
    :props="{ label: 'title', children: 'children' }"
    :filter-node-method="filterNode"
    default-expand-all
    highlight-current
    :expand-on-click-node="false"
    draggable
    :allow-drag="allowDrag"
    :allow-drop="allowDrop"
    empty-text="还没有内容，点击上方新建"
    @node-click="onClick"
    @node-drop="onDrop"
  >
    <template #default="{ data: node }">
      <div class="tnode">
        <el-icon class="tnode-icon" :class="{ folder: node.isFolder }">
          <Folder v-if="node.isFolder" />
          <Document v-else />
        </el-icon>
        <span class="tnode-label" :title="node.title">{{ node.title }}</span>
        <span class="tnode-actions" @click.stop>
          <el-icon
            v-if="node.isFolder"
            class="act"
            title="新建文档"
            @click="emit('command', { action: 'newdoc', node })"
          >
            <Plus />
          </el-icon>
          <el-dropdown
            trigger="click"
            @command="(cmd) => emit('command', { action: cmd, node })"
          >
            <el-icon class="act"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                <el-dropdown-item v-if="node.isFolder" command="newdoc">新建文档</el-dropdown-item>
                <el-dropdown-item v-if="node.isFolder" command="newgroup">新建分组</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </span>
      </div>
    </template>
  </el-tree>
</template>

<script setup>
import { ref, watch } from "vue";
import { Folder, Document, Plus, MoreFilled } from "@element-plus/icons-vue";

const props = defineProps({
  data: { type: Array, default: () => [] },
  activeId: { type: [Number, String], default: null },
  filterText: { type: String, default: "" },
});

const emit = defineEmits(["select", "command", "move"]);
const treeRef = ref(null);

watch(
  () => props.activeId,
  (id) => {
    if (id != null) treeRef.value && treeRef.value.setCurrentKey(id);
  }
);

watch(
  () => props.filterText,
  (val) => {
    treeRef.value && treeRef.value.filter(val || "");
  }
);

function filterNode(value, nodeData) {
  if (!value) return true;
  return (nodeData.title || "").toLowerCase().includes(value.toLowerCase());
}

function allowDrag() {
  return true;
}

function allowDrop(dragNode, dropNode, type) {
  if (type === "inner") {
    return !!dropNode.data.isFolder;
  }
  return true;
}

function onClick(nodeData) {
  if (!nodeData.isFolder) {
    emit("select", nodeData);
  }
}

function onDrop(dragNode, dropNode, dropType) {
  let parentId = null;
  let siblings;
  if (dropType === "inner") {
    parentId = dropNode.data.id;
    siblings = dropNode.childNodes || [];
  } else {
    const parent = dropNode.parent;
    if (parent && parent.level > 0) {
      parentId = parent.data.id;
      siblings = parent.childNodes || [];
    } else {
      parentId = null;
      siblings = (treeRef.value && treeRef.value.root.childNodes) || [];
    }
  }
  const index = siblings.findIndex((c) => c.data.id === dragNode.data.id);
  emit("move", { id: dragNode.data.id, parentId, sortOrder: index + 1 });
}

defineExpose({
  filter: (val) => treeRef.value && treeRef.value.filter(val || ""),
});
</script>

<style scoped>
.tnode {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding-right: 4px;
}

.tnode-icon {
  color: #8a919f;
  flex-shrink: 0;
}

.tnode-icon.folder {
  color: #f0b400;
}

.tnode-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
}

.tnode-actions {
  display: none;
  align-items: center;
  gap: 4px;
}

.tnode:hover .tnode-actions {
  display: flex;
}

.act {
  color: #8a919f;
  padding: 2px;
  border-radius: 4px;
}

.act:hover {
  background: #eef2f7;
  color: #409eff;
}
</style>

import { createRouter, createWebHistory } from "vue-router";
import Workspace from "./views/Workspace.vue";

const routes = [
  { path: "/", name: "Workspace", component: Workspace },
  { path: "/doc/:id", name: "Doc", component: Workspace },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

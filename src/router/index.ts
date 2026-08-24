import { createRouter, createWebHashHistory } from "vue-router";
import TranslationPage from "../pages/TranslationPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";
import AboutPage from "../pages/AboutPage.vue";
import PopupPage from "../pages/PopupPage.vue";
import SelectionTipPage from "../pages/SelectionTipPage.vue";
import DocumentsPage from "../pages/DocumentsPage.vue";
import NotFoundPage from "../pages/NotFoundPage.vue";
import VocabularyPage from "../pages/VocabularyPage.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: TranslationPage, meta: { shell: "workbench" } },
    { path: "/naming", redirect: "/?mode=naming" },
    { path: "/history", redirect: "/" },
    { path: "/documents", component: DocumentsPage, meta: { shell: "secondary" } },
    { path: "/vocabulary", component: VocabularyPage, meta: { shell: "secondary" } },
    { path: "/settings", component: SettingsPage, meta: { shell: "secondary" } },
    { path: "/about", component: AboutPage, meta: { shell: "secondary" } },
    { path: "/popup", component: PopupPage, meta: { shell: "popup", popup: true } },
    { path: "/selection-tip", component: SelectionTipPage, meta: { shell: "popup", popup: true } },
    { path: "/:pathMatch(.*)*", component: NotFoundPage, meta: { shell: "secondary" } }
  ]
});

export default router;

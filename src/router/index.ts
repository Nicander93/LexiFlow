import { createRouter, createWebHashHistory } from "vue-router";
import TranslationPage from "../pages/TranslationPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";
import AboutPage from "../pages/AboutPage.vue";
import PopupPage from "../pages/PopupPage.vue";
import SelectionTipPage from "../pages/SelectionTipPage.vue";
import DocumentsPage from "../pages/DocumentsPage.vue";
import NotFoundPage from "../pages/NotFoundPage.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: TranslationPage },
    { path: "/naming", redirect: "/?mode=naming" },
    { path: "/history", redirect: "/?drawer=history" },
    { path: "/documents", component: DocumentsPage },
    { path: "/settings", component: SettingsPage },
    { path: "/about", component: AboutPage },
    { path: "/popup", component: PopupPage, meta: { popup: true } },
    { path: "/selection-tip", component: SelectionTipPage, meta: { popup: true } },
    { path: "/:pathMatch(.*)*", component: NotFoundPage }
  ]
});

export default router;

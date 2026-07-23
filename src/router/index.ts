import { createRouter, createWebHashHistory } from "vue-router";
import TranslationPage from "../pages/TranslationPage.vue";
import NamingPage from "../pages/NamingPage.vue";
import HistoryPage from "../pages/HistoryPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";
import AboutPage from "../pages/AboutPage.vue";
import PopupPage from "../pages/PopupPage.vue";
import NotFoundPage from "../pages/NotFoundPage.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: TranslationPage },
    { path: "/naming", component: NamingPage },
    { path: "/history", component: HistoryPage },
    { path: "/settings", component: SettingsPage },
    { path: "/about", component: AboutPage },
    { path: "/popup", component: PopupPage, meta: { popup: true } },
    { path: "/:pathMatch(.*)*", component: NotFoundPage }
  ]
});

export default router;

import { createApp } from "vue";
import App from "./App.vue";
import RuntimeUnavailable from "./components/RuntimeUnavailable.vue";
import { hasTranslatorApi, installBrowserPreviewApi } from "./platform/translator";
import router from "./router";
import "./styles/main.css";

const previewRequested = new URLSearchParams(window.location.search).has("preview");
if (import.meta.env.DEV || previewRequested) installBrowserPreviewApi();

const application = hasTranslatorApi()
  ? createApp(App).use(router)
  : createApp(RuntimeUnavailable);

application.mount("#app");

import type { GlossaryService } from "../../application/glossary/glossary-service";
import type { HistoryService } from "../../application/history/history-service";
import type { ProfileService } from "../../application/profile/profile-service";
import type { RuntimeService } from "../../application/runtime/runtime-service";
import type { SettingsUseCases } from "../../application/settings/settings-use-cases";
import type { DictionaryService } from "../../dictionary/dictionary-service";
import type { DocumentManager } from "../../document/manager";
import type { TranslationManager } from "../../translation/manager";
import type { TranslationSessionStore } from "../../translation/session-store";
import type { WindowsOcrService } from "../../ocr/windows-ocr";
import type { WindowManager } from "../../window/manager";

export interface IpcDependencies {
  settingsUseCases: SettingsUseCases;
  runtimeService: RuntimeService;
  historyService: HistoryService;
  dictionaryService: DictionaryService;
  glossaryService: GlossaryService;
  profileService: ProfileService;
  documentManager: DocumentManager;
  ocrService: WindowsOcrService;
  translationManager: TranslationManager;
  translationSessionStore: TranslationSessionStore;
  windowManager: WindowManager;
  clipboardWrite: (text: string) => void;
  clearLocalData: () => Promise<void>;
  triggerSelectionTip: () => void;
  dismissSelectionTip: () => void;
}

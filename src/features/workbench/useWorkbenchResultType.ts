import { computed, type Ref } from "vue";
import type { NamingResult, TranslationMode, TranslationSegment, TranslationStatus } from "../../../electron/shared/types";
import { resolveWorkbenchResultType, type WorkbenchResultType } from "../../../electron/shared/workbench-result";

export type { WorkbenchResultType };

export function useWorkbenchResultType(options: {
  mode: Ref<TranslationMode>;
  sourceText: Ref<string>;
  status: Ref<TranslationStatus>;
  displayResultText: Ref<string>;
  displaySegments: Ref<TranslationSegment[]>;
  showMainDictionary: Ref<boolean>;
  namingResult: Ref<NamingResult | null>;
}) {
  return computed<WorkbenchResultType>(() => resolveWorkbenchResultType({
    mode: options.mode.value,
    sourceText: options.sourceText.value,
    status: options.status.value,
    displayResultText: options.displayResultText.value,
    displaySegments: options.displaySegments.value,
    showMainDictionary: options.showMainDictionary.value,
    namingResult: options.namingResult.value
  }));
}

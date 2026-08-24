<script setup lang="ts">
import { computed } from "vue";
import type { DictionaryEntry, NamingResult, TranslationSegment, TranslationStatus } from "../../../../electron/shared/types";
import DictionaryResult from "../../dictionary/components/DictionaryResult.vue";
import NamingResultView from "../../naming/NamingResult.vue";
import BilingualReadingResult from "../../translation/components/BilingualReadingResult.vue";
import ResultPanel from "../../translation/components/ResultPanel.vue";
import SimpleTranslationResult from "../../translation/components/SimpleTranslationResult.vue";
import type { WorkbenchResultType } from "../result-type";

const props = defineProps<{
  resultType: WorkbenchResultType;
  emptyLabel: string;
  emptyHint: string;
  dictionaryEntry?: DictionaryEntry | null;
  namingResult?: NamingResult | null;
  displayResultText: string;
  sourceText: string;
  status: TranslationStatus;
  errorMessage: string;
  warningMessage: string;
  segments: TranslationSegment[];
  activeSegmentId?: string;
  copied: boolean;
  dictionaryNote?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}>();

const emit = defineEmits<{
  copy: [];
  "copy-source": [];
  "copy-bilingual": [];
  "copy-naming": [name: string];
  stop: [];
  retry: [];
  regenerate: [];
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  "select-term": [term: string, segmentId?: string];
  "save-word": [entry: DictionaryEntry];
}>();

const showPanelFallback = computed(() => props.resultType === "loading" || props.resultType === "error");
</script>

<template>
  <section v-if="resultType === 'empty'" class="workbench-empty">
    <div class="empty-illustration" aria-hidden="true">
      <div class="plant"><i /><i /><b /></div>
      <span>{{ emptyLabel }}</span>
      <em>↝</em>
    </div>
    <span v-html="emptyHint" />
  </section>

  <DictionaryResult v-else-if="resultType === 'dictionary' && dictionaryEntry" :entry="dictionaryEntry" @save-word="emit('save-word', $event)" />

  <NamingResultView
    v-else-if="resultType === 'naming' && namingResult"
    :result="namingResult"
    @copy="emit('copy-naming', $event)"
    @regenerate="emit('regenerate')"
  />

  <BilingualReadingResult
    v-else-if="resultType === 'bilingual'"
    :segments="segments"
    :active-segment-id="activeSegmentId"
    :source-language="sourceLanguage"
    :target-language="targetLanguage"
    @copy-source="emit('copy-source')"
    @copy="emit('copy')"
    @hover="emit('hover', $event)"
    @toggle="emit('toggle', $event)"
    @clear="emit('clear')"
    @navigate="emit('navigate', $event)"
    @select-term="(term, id) => emit('select-term', term, id)"
  />

  <SimpleTranslationResult
    v-else-if="resultType === 'translation'"
    :text="displayResultText"
    :segments="segments"
    :active-segment-id="activeSegmentId"
    :target-language="targetLanguage"
    @copy="emit('copy')"
    @retry="emit('retry')"
    @copy-source="emit('copy-source')"
    @copy-bilingual="emit('copy-bilingual')"
    @hover="emit('hover', $event)"
    @toggle="emit('toggle', $event)"
    @clear="emit('clear')"
    @navigate="emit('navigate', $event)"
    @select-term="(term, id) => emit('select-term', term, id)"
  />

  <ResultPanel
    v-else-if="showPanelFallback || displayResultText || status !== 'idle'"
    class="workbench-result"
    :status="status"
    :text="displayResultText"
    :source-text="sourceText"
    :error="errorMessage"
    :warning="warningMessage"
    :segments="segments"
    :active-segment-id="activeSegmentId"
    :copied="copied"
    :target-language="targetLanguage"
    @copy="emit('copy')"
    @copy-source="emit('copy-source')"
    @copy-bilingual="emit('copy-bilingual')"
    @stop="emit('stop')"
    @retry="emit('retry')"
    @hover="emit('hover', $event)"
    @toggle="emit('toggle', $event)"
    @clear="emit('clear')"
    @navigate="emit('navigate', $event)"
    @select-term="(term, id) => emit('select-term', term, id)"
  />

  <p v-if="dictionaryNote" class="dictionary-note">{{ dictionaryNote }}</p>
</template>

<style scoped>
.workbench-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 200px; padding-bottom: 28px; color: var(--muted);
}
.workbench-empty > span { margin-top: 8px; font-size: 13px; }
.workbench-empty :deep(b) { color: var(--accent-strong); font-weight: 500; }
.empty-illustration { position: relative; width: 176px; height: 70px; }
.empty-illustration > span {
  position: absolute; left: 72px; top: 12px; padding: 8px 11px;
  border: 1px solid var(--border-strong); border-radius: 48% 48% 48% 12px;
  color: var(--ink-soft); background: var(--surface); font-size: 13px; font-weight: 600; transform: rotate(-2deg);
}
.empty-illustration > em {
  position: absolute; left: 136px; top: 43px; color: var(--ink-soft);
  font-size: 17px; font-style: normal; transform: rotate(26deg);
}
.plant { position: absolute; left: 27px; bottom: 0; width: 52px; height: 58px; }
.plant b {
  position: absolute; left: 15px; bottom: 0; width: 27px; height: 22px;
  border: 1.4px solid var(--ink-soft); border-radius: 2px 2px 7px 7px; background: #e8dfc5; transform: rotate(-1deg);
}
.plant i {
  position: absolute; left: 27px; bottom: 20px; width: 16px; height: 27px;
  border: solid var(--accent-strong); border-width: 0 0 1.7px 1.7px; border-radius: 80% 10%; transform: rotate(-30deg);
}
.plant i:nth-child(2) { left: 22px; bottom: 25px; transform: scaleX(-1) rotate(-42deg); }
.workbench-result { flex: 1; min-height: 200px; margin-top: 8px; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
.dictionary-note { margin: 8px 4px 0; color: var(--muted); font-size: 12px; }
</style>

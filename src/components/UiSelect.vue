<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";

export interface UiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  options: UiSelectOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  placeholder: "请选择",
  disabled: false
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

const open = ref(false);
const highlightedIndex = ref(-1);
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const menuStyle = ref<Record<string, string>>({});
const listboxId = `ui-select-${crypto.randomUUID()}`;
const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue));

function selectableIndex(start: number, direction: 1 | -1): number {
  if (!props.options.length) return -1;
  for (let offset = 0; offset < props.options.length; offset += 1) {
    const index = (start + offset * direction + props.options.length) % props.options.length;
    if (!props.options[index]?.disabled) return index;
  }
  return -1;
}

function updatePosition(): void {
  const bounds = trigger.value?.getBoundingClientRect();
  if (!bounds) return;
  const estimatedHeight = Math.min(264, props.options.length * 38 + 10);
  const roomBelow = window.innerHeight - bounds.bottom - 8;
  const placeAbove = roomBelow < estimatedHeight && bounds.top > roomBelow;
  menuStyle.value = {
    left: `${Math.round(bounds.left)}px`,
    width: `${Math.round(bounds.width)}px`,
    maxHeight: `${Math.max(112, Math.min(264, placeAbove ? bounds.top - 12 : roomBelow))}px`,
    ...(placeAbove
      ? { bottom: `${Math.round(window.innerHeight - bounds.top + 6)}px` }
      : { top: `${Math.round(bounds.bottom + 6)}px` })
  };
}

function onWindowPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !menu.value?.contains(target)) close();
}

function addWindowListeners(): void {
  window.addEventListener("pointerdown", onWindowPointerDown, true);
  window.addEventListener("resize", updatePosition);
  window.addEventListener("scroll", updatePosition, true);
}

function removeWindowListeners(): void {
  window.removeEventListener("pointerdown", onWindowPointerDown, true);
  window.removeEventListener("resize", updatePosition);
  window.removeEventListener("scroll", updatePosition, true);
}

async function show(): Promise<void> {
  if (props.disabled || open.value) return;
  const current = props.options.findIndex((option) => option.value === props.modelValue && !option.disabled);
  highlightedIndex.value = current >= 0 ? current : selectableIndex(0, 1);
  open.value = true;
  await nextTick();
  updatePosition();
  addWindowListeners();
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  removeWindowListeners();
}

function choose(option: UiSelectOption): void {
  if (option.disabled) return;
  close();
  if (option.value === props.modelValue) return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
  void nextTick(() => trigger.value?.focus());
}

function move(direction: 1 | -1): void {
  if (!open.value) {
    void show();
    return;
  }
  const start = highlightedIndex.value < 0 ? 0 : highlightedIndex.value + direction;
  highlightedIndex.value = selectableIndex(start, direction);
  void nextTick(() => document.getElementById(`${listboxId}-${highlightedIndex.value}`)?.scrollIntoView({ block: "nearest" }));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    move(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && open.value) {
    event.preventDefault();
    const option = props.options[highlightedIndex.value];
    if (option) choose(option);
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && !open.value) {
    event.preventDefault();
    void show();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

onBeforeUnmount(removeWindowListeners);
</script>

<template>
  <div class="ui-select" :class="{ open, disabled }">
    <button
      ref="trigger"
      class="ui-select__trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown="onKeydown"
    >
      <span :class="{ placeholder: !selectedOption }">{{ selectedOption?.label ?? placeholder }}</span>
      <i aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition name="select-menu">
        <div
          v-if="open"
          :id="listboxId"
          ref="menu"
          class="ui-select__menu"
          role="listbox"
          :aria-label="label"
          :style="menuStyle"
          @keydown="onKeydown"
        >
          <button
            v-for="(option, index) in options"
            :id="`${listboxId}-${index}`"
            :key="option.value"
            type="button"
            role="option"
            :aria-selected="option.value === modelValue"
            :disabled="option.disabled"
            :class="{ highlighted: index === highlightedIndex }"
            @pointerenter="highlightedIndex = index"
            @click="choose(option)"
          >
            <span>{{ option.label }}</span>
            <b v-if="option.value === modelValue" aria-hidden="true">✓</b>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.ui-select { position: relative; width: 100%; min-width: 0; }
.ui-select__trigger {
  width: 100%; min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 11px 7px 12px; border: 1px solid var(--border); border-radius: 8px;
  color: var(--ink); background: var(--surface); text-align: left; cursor: pointer;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
.ui-select__trigger:hover { border-color: var(--border-strong); background: var(--surface-hover); }
.ui-select.open .ui-select__trigger,
.ui-select__trigger:focus-visible { border-color: rgba(95,154,108,.62); box-shadow: 0 0 0 3px rgba(125,187,138,.13); outline: none; }
.ui-select__trigger span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-select__trigger .placeholder { color: var(--muted); }
.ui-select__trigger i {
  width: 7px; height: 7px; flex: 0 0 auto; border: solid currentColor; border-width: 0 1.5px 1.5px 0;
  color: var(--muted); transform: rotate(45deg) translateY(-2px); transition: transform .16s ease;
}
.ui-select.open .ui-select__trigger i { transform: rotate(225deg) translate(-1px, -1px); }
.ui-select.disabled { opacity: .5; }
.ui-select__menu {
  position: fixed; z-index: var(--z-popover); overflow: auto; padding: 5px;
  border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,.98);
  box-shadow: 0 14px 36px rgba(53,62,50,.15), 0 2px 8px rgba(53,62,50,.08);
  backdrop-filter: blur(18px);
}
.ui-select__menu button {
  width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: 0; border-radius: 7px; padding: 7px 9px; color: var(--ink-soft); background: transparent;
  text-align: left; cursor: pointer;
}
.ui-select__menu button:hover,
.ui-select__menu button.highlighted { color: var(--ink); background: var(--surface-soft); }
.ui-select__menu button[aria-selected="true"] { color: var(--accent-strong); background: var(--accent-faint); font-weight: 600; }
.ui-select__menu button b { color: var(--accent-strong); font-size: 12px; }
.select-menu-enter-active, .select-menu-leave-active { transition: opacity .14s ease, transform .14s ease; transform-origin: top; }
.select-menu-enter-from, .select-menu-leave-to { opacity: 0; transform: translateY(-3px) scale(.985); }
</style>

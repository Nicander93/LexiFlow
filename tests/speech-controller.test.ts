import { describe, expect, it, vi } from "vitest";
import { normalizeSpeechLanguage, pickSpeechVoice, SpeechController, splitSpeechText } from "../electron/shared/speech";

function voice(lang: string): SpeechSynthesisVoice {
  return { default: false, lang, localService: true, name: lang, voiceURI: lang };
}

describe("通用语音控制器", () => {
  it("规范化语言并优先选择精确语音", () => {
    const voices = [voice("en-GB"), voice("en-US"), voice("zh-CN")];
    expect(normalizeSpeechLanguage("zh_Hans")).toBe("zh-CN");
    expect(normalizeSpeechLanguage("en")).toBe("en-US");
    expect(pickSpeechVoice(voices, "en-US")?.lang).toBe("en-US");
  });

  it("按句子和长度拆分长文本", () => {
    expect(splitSpeechText("第一句。第二句！")).toEqual(["第一句。", "第二句！"]);
    expect(splitSpeechText("one two three four", 8)).toEqual(["one two", "three", "four"]);
  });

  it("依次朗读队列并可由同一 owner 停止", () => {
    const spoken: SpeechSynthesisUtterance[] = [];
    const cancel = vi.fn();
    const engine = {
      cancel,
      getVoices: () => [voice("en-US")],
      speak: (utterance: SpeechSynthesisUtterance) => spoken.push(utterance)
    };
    const controller = new SpeechController({
      engine: () => engine,
      createUtterance: (text) => ({ text } as SpeechSynthesisUtterance)
    });
    const owner = Symbol("test");
    expect(controller.speak("First. Second.", "en", owner)).toBe(true);
    expect(spoken.map((item) => item.text)).toEqual(["First."]);
    spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(spoken.map((item) => item.text)).toEqual(["First.", "Second."]);
    controller.stop(owner);
    expect(cancel).toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("idle");
  });
});

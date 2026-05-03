"use client";

import { EMOJI_QUICK_PICK } from "@app-messenger/shared";

export type ChatEmojiPickerPanelProps = {
  onPick: (emoji: string) => void;
};

export function ChatEmojiPickerPanel({ onPick }: ChatEmojiPickerPanelProps) {
  return (
    <div
      role="listbox"
      aria-label="Emoji picker"
      className="grid max-h-[min(40vh,16rem)] grid-cols-8 gap-0.5 overflow-y-auto p-2 tg-scrollbar"
    >
      {EMOJI_QUICK_PICK.map((emoji: string, index: number) => (
        <button
          key={`${index}-${emoji}`}
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[1.35rem] leading-none text-[#e4e6eb] hover:bg-[#3a4555] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8774e1]/60"
          onClick={() => onPick(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}

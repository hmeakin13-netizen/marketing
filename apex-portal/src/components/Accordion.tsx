"use client";

import { useState } from "react";

export function Accordion({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white shadow-card">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="font-medium text-forest-900">
                {item.question}
              </span>
              <span
                className={`shrink-0 text-forest-500 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            {isOpen ? (
              <div className="px-6 pb-5 text-sm leading-relaxed text-forest-700">
                {item.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

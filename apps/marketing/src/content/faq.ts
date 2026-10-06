// FAQ content. Every answer describes what the product does today; the
// evidence for each claim is listed in docs/PRODUCT-TRUTH.md.

export type FaqItem = {
  readonly id: string;
  readonly question: string;
  /** Plain-text answer: rendered on the page and used verbatim in FAQPage schema. */
  readonly answer: string;
};

export type FaqCategory = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly FaqItem[];
};

export const FAQ: readonly FaqCategory[] = [];

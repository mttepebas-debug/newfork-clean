// A short notice when something cannot happen in this copy (saving, signing
// out, leaving the app).
let timer = 0;
export function notice(text: string): void {
  let box = document.getElementById("today-notice");
  if (!box) return;
  box.textContent = text;
  box.dataset.open = "true";
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { box!.dataset.open = "false"; }, 2800);
}

export function mountNotice(): void {
  const style = document.createElement("style");
  style.textContent = `#today-notice { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -8px); z-index: 2147483000;
    background: #111827; color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; padding: 10px 14px; border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; max-width: calc(100vw - 32px); }
    #today-notice[data-open="true"] { opacity: 1; transform: translate(-50%, 0); }`;
  document.head.append(style);
  const box = document.createElement("div");
  box.id = "today-notice";
  box.setAttribute("role", "status");
  document.body.append(box);
}

export function guardClicks(): void {
  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest("button, a");
    if (button && /^sign out$/i.test(button.textContent?.trim() ?? "")) {
      event.preventDefault();
      event.stopPropagation();
      notice("Sign out is off in this copy. Use \"Kim bakıyor\" above to switch people.");
      return;
    }
    const link = target.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href")!;
      if (/^(https?:|mailto:|tel:)/.test(href) && !href.startsWith(window.location.origin)) {
        event.preventDefault();
        notice("Links outside the app do not open in this copy.");
      }
    }
  }, true);
}

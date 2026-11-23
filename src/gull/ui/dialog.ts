import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a card that takes over the screen (title, dossier, pause, review): focus moves into it when
 * it opens (to `[data-autofocus]`, else its first control), Tab stays inside it, Escape calls `onClose`, and focus
 * goes back where it was when it closes.
 *
 * Unlike SailSim's useModal (src/ui/useModal.ts) it does not make the rest of the page inert: the 3D view must stay
 * able to take the mouse capture that a button in the card asks for.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose?: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.contains(document.activeElement)) {
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) {
        e.stopPropagation();
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const inside = el.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // On the document, in the capture phase: the card answers even when focus has fallen onto the page itself.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref]);
}

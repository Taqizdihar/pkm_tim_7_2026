import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import './dialog.css';

interface Gesture {
  pointerId?: number;
  startX: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  offset: number;
  dragging: boolean;
}

export function Dialog({
  children,
  onClose,
  labelledBy,
  className = "",
  dismissible = true,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  dismissible?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const requestClose = useRef(() => {});
  const cancelDrag = useRef(() => {});
  const suppressClick = useRef(false);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const mobile = window.matchMedia('(max-width: 600px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | null = null;
    let gesture: Gesture | null = null;
    let closing = false;
    let mounted = true;
    const stopAnimation = () => {
      if (animation) { animation.onfinish = null; animation.cancel(); animation = null; }
    };
    const translate = (offset: number) => { dialog.style.transform = offset ? `translateY(${offset}px)` : ''; };
    const reset = () => {
      const previous = gesture;
      gesture = null;
      delete dialog.dataset.dragging;
      if (previous?.pointerId !== undefined && dialog.hasPointerCapture(previous.pointerId)) dialog.releasePointerCapture(previous.pointerId);
    };
    const animateTo = (from: number, to: number, duration: number, done?: () => void) => {
      stopAnimation();
      translate(to);
      if (from === to || reducedMotion.matches || !dialog.animate) { done?.(); return; }
      animation = dialog.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
        { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      animation.onfinish = () => { animation = null; if (mounted) done?.(); };
    };
    const currentOffset = () => new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m42;
    const settle = () => {
      const offset = currentOffset();
      reset();
      closing = false;
      animateTo(offset, 0, 200);
    };
    requestClose.current = () => {
      if (!dismissibleRef.current || closing) return;
      closing = true;
      const offset = currentOffset();
      reset();
      if (!mobile.matches) { onCloseRef.current(); return; }
      animateTo(offset, window.innerHeight - dialog.getBoundingClientRect().top + offset + 24, 220, () => {
        if (dismissibleRef.current) onCloseRef.current();
        else settle();
      });
    };
    cancelDrag.current = settle;

    const begin = (target: EventTarget | null, x: number, y: number, pointerId?: number) => {
      if (!mobile.matches || !dismissibleRef.current || closing || !(target instanceof Element)) return;
      const handle = target.closest('.dialog-sheet-handle');
      if (!handle) {
        if (target.closest('button, a, input, textarea, select, label, summary, [contenteditable], [role="button"], [role="slider"]')) return;
        // Mouse/pen dragging belongs to the handle; touch can pull content from its scroll origin.
        if (pointerId !== undefined) return;
        for (let element: Element | null = target; element; element = element.parentElement) {
          if (element.scrollTop > 0) return;
          if (element === dialog) break;
        }
      }
      const bounds = dialog.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
      suppressClick.current = false;
      gesture = { pointerId, startX: x, startY: y, lastY: y, lastTime: performance.now(), velocity: 0, offset: 0, dragging: false };
    };
    const move = (x: number, y: number) => {
      if (!gesture) return false;
      const dx = x - gesture.startX, dy = y - gesture.startY;
      if (!gesture.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return false;
        if (dy <= 0 || Math.abs(dx) >= Math.abs(dy)) { suppressClick.current = true; reset(); return false; }
        stopAnimation();
        gesture.dragging = true;
        suppressClick.current = true;
        dialog.dataset.dragging = 'true';
        if (gesture.pointerId !== undefined) dialog.setPointerCapture(gesture.pointerId);
      }
      const now = performance.now();
      gesture.velocity = .7 * (y - gesture.lastY) / Math.max(1, now - gesture.lastTime) + .3 * gesture.velocity;
      gesture.lastY = y;
      gesture.lastTime = now;
      gesture.offset = Math.max(0, dy);
      translate(gesture.offset);
      return true;
    };
    const end = (cancelled = false) => {
      if (!gesture) return;
      const { dragging, offset, velocity, lastTime } = gesture;
      if (!dragging) { reset(); return; }
      const threshold = Math.min(140, Math.max(64, dialog.offsetHeight * .28));
      const flick = offset >= 28 && velocity > .65 && performance.now() - lastTime < 80;
      if (!cancelled && (offset >= threshold || flick)) requestClose.current();
      else settle();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
      suppressClick.current = false;
      begin(event.target, event.clientX, event.clientY, event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (gesture?.pointerId === event.pointerId && move(event.clientX, event.clientY)) event.preventDefault();
    };
    const pointerUp = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) end(); };
    const pointerCancel = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) end(true); };
    const touchStart = (event: TouchEvent) => {
      suppressClick.current = false;
      if (event.touches.length !== 1) { end(true); return; }
      const touch = event.touches[0];
      begin(event.target, touch.clientX, touch.clientY);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { end(true); return; }
      if (!event.cancelable) { end(true); return; }
      if (move(event.touches[0].clientX, event.touches[0].clientY)) event.preventDefault();
    };
    const touchEnd = () => { if (gesture?.pointerId === undefined) end(); };
    const touchCancel = () => end(true);
    const syncLayout = () => {
      stopAnimation(); reset(); translate(0); closing = false;
      dialog.dataset.sheet = String(mobile.matches);
    };
    const syncMotion = () => {
      if (!reducedMotion.matches) return;
      if (closing && dismissibleRef.current) { stopAnimation(); onCloseRef.current(); }
      else settle();
    };
    syncLayout();
    dialog.showModal();
    if (mobile.matches) animateTo(window.innerHeight - dialog.getBoundingClientRect().top + 24, 0, 280);
    dialog.addEventListener('pointerdown', pointerDown);
    dialog.addEventListener('pointermove', pointerMove);
    dialog.addEventListener('pointerup', pointerUp);
    dialog.addEventListener('pointercancel', pointerCancel);
    dialog.addEventListener('lostpointercapture', pointerCancel);
    dialog.addEventListener('touchstart', touchStart, { passive: true });
    // Prevent native scrolling only after a downward pull from the top has been claimed.
    dialog.addEventListener('touchmove', touchMove, { passive: false });
    dialog.addEventListener('touchend', touchEnd);
    dialog.addEventListener('touchcancel', touchCancel);
    mobile.addEventListener('change', syncLayout);
    reducedMotion.addEventListener('change', syncMotion);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      mounted = false;
      stopAnimation(); reset();
      dialog.removeEventListener('pointerdown', pointerDown);
      dialog.removeEventListener('pointermove', pointerMove);
      dialog.removeEventListener('pointerup', pointerUp);
      dialog.removeEventListener('pointercancel', pointerCancel);
      dialog.removeEventListener('lostpointercapture', pointerCancel);
      dialog.removeEventListener('touchstart', touchStart);
      dialog.removeEventListener('touchmove', touchMove);
      dialog.removeEventListener('touchend', touchEnd);
      dialog.removeEventListener('touchcancel', touchCancel);
      mobile.removeEventListener('change', syncLayout);
      reducedMotion.removeEventListener('change', syncMotion);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => { if (!dismissible) cancelDrag.current(); }, [dismissible]);
  return (
    <dialog
      ref={dialogRef}
      className={`garden-dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); requestClose.current(); }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          if (event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose.current();
        }
      }}
    >
      <button type="button" className="dialog-sheet-handle" aria-label="Tutup panel" title="Geser ke bawah untuk menutup" disabled={!dismissible} onClick={() => requestClose.current()}><span aria-hidden="true" /></button>
      <div className="garden-dialog-content">{children}</div>
    </dialog>
  );
}

export function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  return !!element?.closest('input, textarea, [contenteditable="true"]');
}

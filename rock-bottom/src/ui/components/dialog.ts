import { h } from '../dom';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** A small modal confirmation. Resolves true if confirmed; Escape cancels. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = h('button', { class: 'btn', type: 'button' }, options.cancelLabel);
    const confirm = h('button', { class: 'btn btn--danger', type: 'button' }, options.confirmLabel);
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': 'dialog-title' },
      h('h2', { class: 'dialog__title', id: 'dialog-title' }, options.title),
      h('p', { class: 'dialog__message' }, options.message),
      h('div', { class: 'dialog__actions' }, cancel, confirm),
    );

    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('close', () => finish(false));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false); // click on the backdrop
    });

    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

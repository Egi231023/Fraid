import { esc } from './core.js';

// A save belongs to the form that started it, never to a later dialog.
export function createModalController({ dialog, body, button, onSaved = () => {}, hasPending = () => false }) {
  let active = null;

  function isBusy() {
    return Boolean(dialog.open && active?.busy);
  }

  function close() {
    if (isBusy()) return false;
    dialog.close();
    active = null;
    return true;
  }

  dialog.addEventListener('cancel', event => {
    // The request may already have committed. Dismissing is not cancellation.
    if (isBusy()) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) active = null;
  });

  function open(title, html, submit, onSubmit) {
    if (isBusy()) return null;
    body.innerHTML = `<form id="editor"><div class="row between"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="small" data-action="close" aria-label="Zavrieť dialóg">✕</button></div><div class="formgrid">${html}</div><p id="form-error" class="error-text" role="alert"></p><div id="retry-area"></div><div class="actions">${button('Zavrieť', 'close')}${submit ? `<button class="primary" type="submit">${esc(submit)}</button>` : ''}</div></form>`;
    body.querySelectorAll('button[data-action]').forEach(control => { control.type = 'button'; });
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    const form = body.querySelector('#editor');
    const error = form.querySelector('#form-error');
    const retry = form.querySelector('#retry-area');
    const submitButton = form.querySelector('[type="submit"]');
    const state = { form, busy: false };
    active = state;
    const ownsDialog = () => active === state && dialog.open && body.contains(form);
    if (!dialog.open) dialog.showModal();

    form.onsubmit = async event => {
      event.preventDefault();
      if (!ownsDialog() || state.busy || !submitButton || typeof onSubmit !== 'function') return;
      // Read before disabling controls: disabled fields are omitted by FormData.
      const FormData = body.ownerDocument.defaultView.FormData;
      const values = Object.fromEntries(new FormData(form));
      const controls = [...form.querySelectorAll('button,input,select,textarea')].map(control => [control, control.disabled]);
      const label = submitButton.textContent;
      state.busy = true;
      form.setAttribute('aria-busy', 'true');
      controls.forEach(([control]) => { control.disabled = true; });
      submitButton.textContent = 'Ukladám…';
      error.textContent = '';
      retry.replaceChildren();
      try {
        await onSubmit(values, form);
        if (!ownsDialog()) return;
        state.busy = false;
        close();
        onSaved();
      } catch (err) {
        if (!ownsDialog()) return;
        error.textContent = err?.message || 'Operácia sa nepodarila. Skús znova.';
        if (hasPending()) {
          retry.innerHTML = button('Overiť uloženie pôvodného zápisu', 'retry-write', '', 'accent');
          retry.querySelector('button').type = 'button';
        }
      } finally {
        state.busy = false;
        form.removeAttribute('aria-busy');
        controls.forEach(([control, disabled]) => { control.disabled = disabled; });
        submitButton.textContent = label;
      }
    };
    return form;
  }

  return { open, close, isBusy };
}

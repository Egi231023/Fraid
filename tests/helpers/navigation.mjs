import assert from 'node:assert/strict';

// Follow the same visible navigation on desktop and mobile.
export function openPage(page) {
  const primary = document.querySelector(`nav[aria-label="Hlavné menu"] [data-page="${page}"]`);
  if (primary) {
    primary.click();
  } else {
    document.querySelector('nav[aria-label="Hlavné menu"] [data-page="more"]').click();
    const item = document.querySelector(`#view [data-page="${page}"]`);
    assert.ok(item, `${page} is reachable from Menu`);
    item.click();
    assert.ok(document.querySelector('.menu-back'), `${page} has a return to Menu`);
    assert.equal(document.querySelector('.sidebar .nav.active').dataset.page, 'more');
  }
  assert.equal(document.querySelector('#view').dataset.view, page);
}

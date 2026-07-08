import test from 'node:test';
import assert from 'node:assert/strict';
import { closeMenusOutside } from '../src/ui-interactions.js';

function fakeMenu(containsTarget) {
  return {
    closed: false,
    contains: () => containsTarget,
    removeAttribute(attribute) {
      if (attribute === 'open') this.closed = true;
    }
  };
}

test('kliknutie mimo otvorenej ponuky ju zavrie', () => {
  const menu = fakeMenu(false);
  const root = { querySelectorAll: () => [menu] };

  closeMenusOutside(root, {});

  assert.equal(menu.closed, true);
});

test('kliknutie v otvorenej ponuke ju nezavrie', () => {
  const menu = fakeMenu(true);
  const root = { querySelectorAll: () => [menu] };

  closeMenusOutside(root, {});

  assert.equal(menu.closed, false);
});

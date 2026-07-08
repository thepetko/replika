import test from 'node:test';
import assert from 'node:assert/strict';
import { closeMenusOutside, maskMemorizedText } from '../src/ui-interactions.js';

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

test('scénická poznámka zostane pri skrytí textu viditeľná', () => {
  assert.equal(
    maskMemorizedText('(Vstane.) Odchádzam.', 0),
    '(Vstane.) ••••••'
  );
  assert.equal(
    maskMemorizedText('(Vstane.) Odchádzam.', 1),
    '(Vstane.) O…'
  );
});

test('nápoveda počíta iba slová mimo scénických poznámok', () => {
  assert.equal(
    maskMemorizedText('Dnes (ticho) odídem veľmi ďaleko.', 2),
    'Dnes (ticho) odídem veľmi …'
  );
});

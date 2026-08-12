import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('denný plán má v DOM poradí kalendár, dnešné úlohy a ďalšie dni', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const calendar = html.indexOf('id="gameCalendar"');
  const today = html.indexOf('id="todayPlan"');
  const upcoming = html.indexOf('id="gameSchedule"');

  assert.ok(calendar >= 0 && calendar < today);
  assert.ok(today < upcoming);
});

test('nový režim hry má jednu obrazovku bez paralelných tabov', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="scriptGameView"');
  const end = html.indexOf('id="libraryView"');
  const view = html.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(view, /id="scriptDocument"/u);
  assert.match(view, /id="goToTodayTargetBtn"/u);
  assert.doesNotMatch(view, /role="tablist"/u);
});

test('import novej hry ponúka iba DOCX a nevytvára učebné úseky', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="scriptImportPanel"');
  const end = html.indexOf('id="emptyLibrary"');
  const panel = html.slice(start, end);
  assert.match(panel, /accept="\.docx,/u);
  assert.doesNotMatch(panel, /scriptImportUnits|scriptImportText|Rozdeliť/u);
});

test('checkbox scenára má samostatný change handler a karta ho neprepína', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /checkbox\.addEventListener\('change'/u);
  assert.doesNotMatch(source, /row\.addEventListener\('click'.*setScriptSpeechLearned/su);
});

test('HTML a modulový graf používajú rovnakú verziu vydania ako offline cache', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const scriptGame = readFileSync(new URL('../src/script-game.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');
  const release = worker.match(/const RELEASE = '(\d+)'/u)?.[1];

  assert.ok(release, 'Service worker musí deklarovať verziu vydania.');
  assert.match(html, new RegExp(`styles\\.css\\?v=${release}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${release}`));
  assert.doesNotMatch(app, /from '\.\/[^']+\.js';/u);
  assert.doesNotMatch(scriptGame, /from '\.\/[^']+\.js';/u);
  assert.match(app, /updateViaCache:\s*'none'/u);
});

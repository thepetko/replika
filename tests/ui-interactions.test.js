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

test('hra používa iba celý scenár bez starého detailu a prepínača režimov', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="gameDetailView"|Starší import|Nahrať znova v novom režime/u);
  assert.doesNotMatch(source, /game\.mode|mode:\s*'script'|Nahrať znova v novom režime/u);
});

test('hra má jednu obrazovku bez paralelných tabov', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="scriptGameView"');
  const end = html.indexOf('id="libraryView"');
  const view = html.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(view, /id="scriptDocument"/u);
  assert.match(view, /id="goToTodayTargetBtn"/u);
  assert.doesNotMatch(view, /role="tablist"/u);
});

test('ovládanie scenára používa kompaktnú spoločnú lištu', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const toolbar = html.slice(html.indexOf('class="script-toolbar"'), html.indexOf('id="scriptTodayPanel"'));
  assert.match(toolbar, /class="script-toolbar-main"/u);
  assert.match(toolbar, />Dnešný cieľ</u);
  assert.match(toolbar, />Odkryť repliky</u);
  assert.match(toolbar, /aria-label="Prejsť na časť scenára"/u);
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
  assert.match(source, /setScriptSpeechLearnedById\(appData\.games, game\.id, speech\.id/u);
  assert.doesNotMatch(source, /row\.addEventListener\('click'.*setScriptSpeechLearned/su);
});

test('vlastná replika ponúka trvalo viditeľnú automaticky ukladanú poznámku mimo masky', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const renderSpeech = source.slice(source.indexOf('function renderScriptSpeech'), source.indexOf('function renderScriptGame'));

  assert.match(renderSpeech, /Pridať poznámku/u);
  assert.match(renderSpeech, /script-speech-note/u);
  assert.match(renderSpeech, /setScriptSpeechNoteById\(appData\.games, game\.id, speech\.id/u);
  assert.ok(renderSpeech.indexOf("row.append(textWrap)") < renderSpeech.indexOf('script-speech-note'));
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

test('menu ponúka úplný reset a vymazané úložisko sa pri odchode neobnoví', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(html, /id="resetAppBtn"[^>]*>Vymazať všetky dáta</u);
  assert.doesNotMatch(html, /Našiel sa starší uložený text|id="legacyBanner"/u);
  assert.match(source, /clearAppData\(globalThis\.localStorage\)/u);
  assert.doesNotMatch(source, /getLegacyText|migrateLegacyData|legacyDismissed/u);
  assert.match(source, /getItem\(APP_STORAGE_KEY\) !== null[\s\S]*persist\(\)/u);
});

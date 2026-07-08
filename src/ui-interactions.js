const DISMISSIBLE_MENU_SELECTOR = 'details.app-menu[open], details.card-menu[open]';

export function closeMenusOutside(root, target) {
  root.querySelectorAll(DISMISSIBLE_MENU_SELECTOR).forEach(menu => {
    if (!menu.contains(target)) menu.removeAttribute('open');
  });
}

function isStageDirection(part) {
  return /^\([^()]*\)$/s.test(part);
}

export function maskMemorizedText(text, hintLevel) {
  const parts = String(text).split(/(\([^()]*\))/g);
  let shownWords = 0;
  let omissionShown = false;

  const masked = parts.map(part => {
    if (isStageDirection(part) || !part.trim()) return part;
    if (hintLevel === 0) return part.replace(/\S(?:.*\S)?/s, '••••••');
    if (hintLevel === 1) return part.replace(/\S+/g, word => `${word[0]}…`);

    return part.replace(/\S+/g, word => {
      if (shownWords < 3) {
        shownWords += 1;
        return word;
      }
      if (!omissionShown) {
        omissionShown = true;
        return '…';
      }
      return '';
    });
  }).join('');

  return masked.replace(/\s+/g, ' ').trim();
}

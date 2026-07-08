const DISMISSIBLE_MENU_SELECTOR = 'details.app-menu[open], details.card-menu[open]';

export function closeMenusOutside(root, target) {
  root.querySelectorAll(DISMISSIBLE_MENU_SELECTOR).forEach(menu => {
    if (!menu.contains(target)) menu.removeAttribute('open');
  });
}

export {};

declare global {
  interface Window {
    server_id: string;
    rootPlugins: string[];
    disabledPlugins: string[];
  }
}

import { initServersPage } from './servers';
import { initManagePage } from './manage';

$(document).ready(function () {
  // Navbar hamburger toggle (replaces inline onclick for CSP compliance)
  $('#nav-toggle-btn').on('click', () => {
    document.querySelector('.nav-links')?.classList.toggle('open');
  });

  const currentPath = window.location.pathname;
  if (currentPath === '/servers') initServersPage();
  if (currentPath.startsWith('/manage/')) initManagePage();
});

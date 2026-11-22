import './styles/index.css';
import { el } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { store } from './lib/store.js';
import { flushQueue, initSync, adoptAccount } from './lib/cloud.js';
import { applyTheme } from './ui/theme.js';
import { mountShell } from './ui/shell.js';
import { setupOfflineBanner } from './ui/offlinebanner.js';
import { shouldOnboard, openOnboarding } from './ui/onboarding.js';
import { authView } from './views/auth.js';
import { downloadFile } from './lib/util.js';
import { supabase } from './lib/supabase.js';

const appRoot = document.getElementById('app');
const landingLifecycle = new AbortController();
let landing;
function showLanding() {
  landing ||= authView({ onSignedIn: boot, signal: landingLifecycle.signal });
  if (!appRoot.contains(landing)) appRoot.replaceChildren(landing);
}
function showError(title, message, onRetry) {
  appRoot.replaceChildren(el('div.auth-view.auth-error', {},
    el('div.empty-icon', { html: icon('wifiOff', 30) }),
    el('h1.auth-title', { style: { fontSize: '22px' } }, title),
    el('p.auth-sub', {}, message),
    el('button.btn.btn-primary.auth-cta', { onclick: onRetry }, 'Try again')));
}
async function start() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) { showLanding(); return; }
    await boot();
  } catch (error) {
    console.error(error);
    showError('Couldn’t connect to your account', 'Check your connection and try again.', () => location.reload());
  }
}
async function boot() {
  landingLifecycle.abort();
  landing = null;
  if (location.hash && !location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + location.search);
  appRoot.replaceChildren(el('div.boot-splash', { role: 'status', 'aria-label': 'Loading Inventory' },
    el('img.boot-mark', { src: './icon-192.png', width: 56, height: 56, alt: '' })));
  window.scrollTo(0, 0);
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data.user;
    if (!user) { showLanding(); return; }
    await adoptAccount(user.id);
    await initSync();
    await store.init();
  } catch (err) {
    console.error(err);
    showError('Couldn’t load your inventory', err.recovery ? err.message : 'Something went wrong connecting to your Supabase account. Check your connection and try again.', () => location.reload());
    if (err.recovery) appRoot.firstElementChild.append(el('button.btn', { onclick: () =>
      downloadFile('inventory-recovery.json', JSON.stringify(err.recovery, null, 2), 'application/json') }, 'Download recovery data'));
    return;
  }
  applyTheme(store.settings.theme || 'system');
  mountShell(appRoot);
  store.recordSnapshot().catch(() => {});
  if (shouldOnboard(store)) openOnboarding();
  setupOfflineBanner();
  if (navigator.onLine) flushQueue().catch(() => {});
}
if (import.meta.env?.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker failed', err)));
}
if (import.meta.env?.DEV) window.__inv = { store };
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
start();

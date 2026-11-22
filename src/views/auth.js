import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import landingHTML from './landing.html?raw';
import { initPublicNavigation } from '../../site/client.js';
import { supabase, authRedirectURL } from '../lib/supabase.js';

function field(labelText, type, name, autocomplete) {
  const wrap = el('label.auth-field');
  wrap.append(el('span.auth-field-label', {}, labelText));
  const input = el('input.auth-input', {
    type, name, autocomplete, required: type !== 'email' || true,
    ...(type === 'password' ? { minlength: 8 } : {}),
  });
  wrap.append(input);
  return { wrap, input };
}

export function authView({ onSignedIn, signal }) {
  const view = document.getElementById('landing-top') || el('div.landing', { id: 'landing-top', html: landingHTML });
  view.dataset.ready = 'true';
  for (const slot of view.querySelectorAll('[data-icon]')) slot.innerHTML = icon(slot.dataset.icon, 20, 1.7);
  const buttons = [...view.querySelectorAll('[data-sign-in]')];
  buttons.forEach((button) => { button.disabled = false; });
  const disposeNavigation = initPublicNavigation(view);
  signal?.addEventListener('abort', disposeNavigation, { once: true });
  let panel;

  const openPanel = () => {
    if (panel?.isConnected) { panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    panel = el('section.auth-panel', { 'aria-label': 'Sign in to Inventory' });
    const heading = el('h2.auth-title', {}, 'Access your inventory');
    const status = el('p.auth-status', { role: 'status', tabindex: '-1' });
    const email = field('Email address', 'email', 'email', 'email');
    const password = field('Password', 'password', 'password', 'current-password');
    const form = el('form.auth-form');
    const submit = el('button.btn.btn-primary.auth-cta', { type: 'submit' }, 'Sign in');
    const google = el('button.btn.auth-google', { type: 'button' }, 'Continue with Google');
    const switchMode = el('button.auth-link', { type: 'button' }, 'Create an account');
    const reset = el('button.auth-link', { type: 'button' }, 'Forgot password?');
    let mode = 'signin';
    form.append(email.wrap, password.wrap, submit);
    panel.append(heading, el('p.auth-sub', {}, 'Use email and password or continue with Google.'), google, el('div.auth-divider', {}, 'or'), form, switchMode, reset, status);
    const hero = view.querySelector('.lp-hero') || view;
    const actions = hero.querySelector('.lp-actions');
    if (actions) actions.after(panel); else hero.prepend(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    switchMode.addEventListener('click', () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      heading.textContent = mode === 'signin' ? 'Access your inventory' : 'Create your account';
      submit.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
      password.input.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
      switchMode.textContent = mode === 'signin' ? 'Create an account' : 'Already have an account? Sign in';
      reset.hidden = mode !== 'signin';
      status.textContent = '';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = google.disabled = switchMode.disabled = reset.disabled = true;
      status.textContent = mode === 'signin' ? 'Signing in…' : 'Creating your account…';
      try {
        const credentials = { email: email.input.value.trim(), password: password.input.value };
        const result = mode === 'signin'
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: authRedirectURL() } });
        if (result.error) throw result.error;
        if (mode === 'signup' && !result.data.session) {
          status.textContent = 'Check your email for a verification link, then return here to sign in.';
          return;
        }
        await onSignedIn();
      } catch (error) {
        status.textContent = error.message || 'Authentication failed. Please try again.';
        status.focus();
      } finally {
        submit.disabled = google.disabled = switchMode.disabled = reset.disabled = false;
      }
    });

    google.addEventListener('click', async () => {
      google.disabled = true;
      status.textContent = 'Redirecting to Google…';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authRedirectURL(), queryParams: { access_type: 'offline', prompt: 'select_account' } },
      });
      if (error) { status.textContent = error.message; google.disabled = false; }
    });

    reset.addEventListener('click', async () => {
      const address = email.input.value.trim();
      if (!address) { status.textContent = 'Enter your email address first.'; email.input.focus(); return; }
      reset.disabled = true;
      const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: authRedirectURL() });
      status.textContent = error ? error.message : 'If an account exists for that address, a password reset link has been sent.';
      reset.disabled = false;
    });
  };

  view.addEventListener('click', (event) => {
    if (event.target.closest('[data-sign-in]')) openPanel();
  }, signal ? { signal } : undefined);
  return view;
}

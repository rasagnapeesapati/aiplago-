// js/auth-modal.js
// Injects a login/signup modal into the page and wires its behavior.
// Call window.openAuthModal('login' | 'signup') to show it.

function injectAuthModal() {
  if (document.getElementById('authModalOverlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'authModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="authModalClose" aria-label="Close">✕</button>
      <div class="auth-card">
        <div class="seal" style="margin:0 auto 18px;width:48px;height:48px;"></div>
        <h2 id="authTitle">Welcome back</h2>
        <p class="sub" id="authSub">Log in to continue using AIPlago.</p>

        <div id="authError" class="field-error" style="text-align:center;margin-bottom:14px;"></div>

        <form id="authForm">
          <div class="field hidden" id="nameField">
            <label for="authName">Full name</label>
            <input type="text" id="authName" autocomplete="name" placeholder="Jordan Lee"/>
          </div>
          <div class="field">
            <label for="authEmail">Email</label>
            <input type="email" id="authEmail" autocomplete="email" placeholder="you@example.com" required/>
          </div>
          <div class="field">
            <label for="authPassword">Password</label>
            <input type="password" id="authPassword" autocomplete="current-password" placeholder="••••••••" required/>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" id="authSubmitBtn">Log in</button>
        </form>

        <div class="auth-switch">
          <span id="authSwitchPrompt">Don't have an account?</span>
          <button id="authSwitchBtn">Sign up free</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let mode = 'login';

  function setMode(newMode) {
    mode = newMode;
    const title = document.getElementById('authTitle');
    const sub = document.getElementById('authSub');
    const nameField = document.getElementById('nameField');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchPrompt = document.getElementById('authSwitchPrompt');
    const switchBtn = document.getElementById('authSwitchBtn');
    const errorBox = document.getElementById('authError');
    errorBox.classList.remove('show');
    errorBox.textContent = '';

    if (mode === 'signup') {
      title.textContent = 'Create your account';
      sub.textContent = 'Get unlimited scans and a usage dashboard.';
      nameField.classList.remove('hidden');
      document.getElementById('authName').required = true;
      submitBtn.textContent = 'Create account';
      switchPrompt.textContent = 'Already have an account?';
      switchBtn.textContent = 'Log in';
      document.getElementById('authPassword').autocomplete = 'new-password';
    } else {
      title.textContent = 'Welcome back';
      sub.textContent = 'Log in to continue using AIPlago.';
      nameField.classList.add('hidden');
      document.getElementById('authName').required = false;
      submitBtn.textContent = 'Log in';
      switchPrompt.textContent = "Don't have an account?";
      switchBtn.textContent = 'Sign up free';
      document.getElementById('authPassword').autocomplete = 'current-password';
    }
  }

  document.getElementById('authSwitchBtn').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuthModal(); });

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('authError');
    errorBox.classList.remove('show');
    const submitBtn = document.getElementById('authSubmitBtn');
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value.trim();

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';

    try {
      if (mode === 'signup') {
        await Auth.signup(name, email, password);
      } else {
        await Auth.login(email, password);
      }
      closeAuthModal();
      renderNavAuthState();
      if (window.onAuthSuccess) window.onAuthSuccess();
      else window.location.reload();
    } catch (err) {
      errorBox.textContent = err.message || 'Something went wrong. Please try again.';
      errorBox.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  window.openAuthModal = function (initialMode = 'login') {
    setMode(initialMode);
    overlay.classList.add('show');
    document.getElementById('authEmail').focus();
  };
  window.closeAuthModalFn = closeAuthModal;

  function closeAuthModal() {
    overlay.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', injectAuthModal);

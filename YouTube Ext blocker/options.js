// Options page logic

// DOM elements
const extensionEnabled = document.getElementById('extension-enabled');
const extensionStatus = document.getElementById('extension-status');
const blockingStatus = document.getElementById('blocking-status');
const displayStatus = document.getElementById('display-status');
const focusModeEnabled = document.getElementById('focus-mode-enabled');
const focusModeStatus = document.getElementById('focus-mode-status');
const focusModeStatusText = document.getElementById('focus-mode-status-text');
const lockBtn = document.getElementById('lock-btn');
const unlockBtn = document.getElementById('unlock-btn');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const savePasswordBtn = document.getElementById('save-password-btn');
const passwordMessage = document.getElementById('password-message');
const setupWebAuthnBtn = document.getElementById('setup-webauthn-btn');
const removeWebAuthnBtn = document.getElementById('remove-webauthn-btn');
const webauthnStatus = document.getElementById('webauthn-status');
const unlockDurationSelect = document.getElementById('unlock-duration');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateStatus();
  
  // Set up event listeners
  extensionEnabled.addEventListener('change', handleExtensionToggle);
  focusModeEnabled.addEventListener('change', handleFocusModeToggle);
  lockBtn.addEventListener('click', handleManualLock);
  unlockBtn.addEventListener('click', handleManualUnlock);
  savePasswordBtn.addEventListener('click', handleSavePassword);
  setupWebAuthnBtn.addEventListener('click', handleSetupWebAuthn);
  removeWebAuthnBtn.addEventListener('click', handleRemoveWebAuthn);
  unlockDurationSelect.addEventListener('change', handleUnlockDurationChange);
  
  // Update status periodically
  setInterval(updateStatus, 2000);
  
  // Check WebAuthn availability
  if (!window.PublicKeyCredential) {
    setupWebAuthnBtn.disabled = true;
    setupWebAuthnBtn.textContent = 'Biometric Auth Not Available';
    webauthnStatus.textContent = 'WebAuthn is not supported in this browser.';
  }
});

// Load settings
async function loadSettings() {
  const settings = await chrome.storage.local.get([
    'enabled',
    'focusMode',
    'unlockDuration',
    'hashedPassword',
    'webauthnCredentialId'
  ]);
  
  extensionEnabled.checked = settings.enabled !== false;
  updateExtensionStatus();
  
  focusModeEnabled.checked = settings.focusMode === true;
  updateFocusModeStatus();
  
  if (settings.unlockDuration) {
    unlockDurationSelect.value = settings.unlockDuration;
  }
  
  if (settings.hashedPassword) {
    passwordMessage.textContent = 'Password is set.';
    passwordMessage.className = 'message success';
  }
  
  if (settings.webauthnCredentialId) {
    webauthnStatus.textContent = '✓ Biometric authentication is configured.';
    webauthnStatus.className = 'status-info success';
    setupWebAuthnBtn.style.display = 'none';
    removeWebAuthnBtn.style.display = 'inline-block';
  } else {
    webauthnStatus.textContent = 'Biometric authentication is not set up.';
    webauthnStatus.className = 'status-info';
    setupWebAuthnBtn.style.display = 'inline-block';
    removeWebAuthnBtn.style.display = 'none';
  }
}

// Update status display
async function updateStatus() {
  const settings = await chrome.storage.local.get([
    'blocked',
    'externalDisplayConnected',
    'focusMode',
    'unlockToken',
    'unlockExpiry'
  ]);
  
  // Update blocking status
  const now = Date.now();
  const isUnlocked = settings.unlockToken && settings.unlockExpiry && now < settings.unlockExpiry;
  const actuallyBlocked = settings.blocked && !isUnlocked;
  
  if (actuallyBlocked) {
    blockingStatus.textContent = '🔒 Blocked';
    blockingStatus.className = 'status-badge blocked';
  } else {
    blockingStatus.textContent = '🔓 Unlocked';
    blockingStatus.className = 'status-badge unlocked';
  }
  
  // Update display status
  if (settings.externalDisplayConnected) {
    displayStatus.textContent = '✓ Connected';
    displayStatus.className = 'status-badge connected';
  } else {
    displayStatus.textContent = '✗ Not Connected';
    displayStatus.className = 'status-badge disconnected';
  }
  
  // Update focus mode status
  updateFocusModeStatus();
}

// Update focus mode status display
function updateFocusModeStatus() {
  if (focusModeEnabled.checked) {
    focusModeStatus.textContent = '✓ Active';
    focusModeStatus.className = 'status-badge connected';
    focusModeStatusText.textContent = 'Enabled';
    focusModeStatusText.className = 'status-text enabled';
  } else {
    focusModeStatus.textContent = '✗ Inactive';
    focusModeStatus.className = 'status-badge disconnected';
    focusModeStatusText.textContent = 'Disabled';
    focusModeStatusText.className = 'status-text disabled';
  }
}

// Update extension status text
function updateExtensionStatus() {
  extensionStatus.textContent = extensionEnabled.checked ? 'Enabled' : 'Disabled';
  extensionStatus.className = extensionEnabled.checked ? 'status-text enabled' : 'status-text disabled';
}

// Handle extension toggle
async function handleExtensionToggle() {
  await chrome.storage.local.set({ enabled: extensionEnabled.checked });
  updateExtensionStatus();
  
  if (extensionEnabled.checked) {
    // Check display state when enabled
    chrome.runtime.sendMessage({ action: 'checkDisplay' });
  }
}

// Handle focus mode toggle
async function handleFocusModeToggle() {
  chrome.runtime.sendMessage({ action: 'toggleFocusMode' }, (response) => {
    if (response && response.success) {
      updateFocusModeStatus();
      const message = response.focusMode 
        ? 'Focus Mode enabled. YouTube is now blocked.' 
        : 'Focus Mode disabled.';
      showMessage(message, 'success');
      updateStatus();
    } else {
      // Revert toggle if failed
      focusModeEnabled.checked = !focusModeEnabled.checked;
      showMessage('Failed to toggle Focus Mode.', 'error');
    }
  });
}

// Handle manual lock
async function handleManualLock() {
  lockBtn.disabled = true;
  lockBtn.textContent = 'Locking...';
  
  chrome.runtime.sendMessage({ action: 'manualLock' }, (response) => {
    if (response && response.success) {
      showMessage('YouTube locked successfully.', 'success');
      updateStatus();
    } else {
      showMessage('Failed to lock YouTube.', 'error');
    }
    lockBtn.disabled = false;
    lockBtn.textContent = '🔒 Lock YouTube Now';
  });
}

// Handle manual unlock
async function handleManualUnlock() {
  // Check if password or WebAuthn is set up
  const settings = await chrome.storage.local.get(['hashedPassword', 'webauthnCredentialId']);
  if (!settings.hashedPassword && !settings.webauthnCredentialId) {
    showMessage('Please set up a password or biometric authentication first.', 'error');
    return;
  }
  
  // Open unlock page
  window.open(chrome.runtime.getURL('unlock.html'), '_blank');
}

// Handle save password
async function handleSavePassword() {
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (!newPassword) {
    showPasswordMessage('Please enter a password.', 'error');
    return;
  }
  
  if (newPassword.length < 4) {
    showPasswordMessage('Password must be at least 4 characters.', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showPasswordMessage('Passwords do not match.', 'error');
    return;
  }
  
  savePasswordBtn.disabled = true;
  savePasswordBtn.textContent = 'Saving...';
  
  try {
    const hashedPassword = await hashPassword(newPassword);
    await chrome.storage.local.set({ hashedPassword });
    
    showPasswordMessage('Password saved successfully!', 'success');
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
  } catch (error) {
    console.error('Error saving password:', error);
    showPasswordMessage('Error saving password. Please try again.', 'error');
  } finally {
    savePasswordBtn.disabled = false;
    savePasswordBtn.textContent = 'Save Password';
  }
}

// Hash password
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Handle setup WebAuthn
async function handleSetupWebAuthn() {
  if (!window.PublicKeyCredential) {
    showMessage('WebAuthn is not supported in this browser.', 'error');
    return;
  }
  
  setupWebAuthnBtn.disabled = true;
  setupWebAuthnBtn.textContent = 'Setting up...';
  
  try {
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from(randomString(32), c => c.charCodeAt(0)),
      rp: {
        name: "YouTube Display Blocker",
        id: "localhost"
      },
      user: {
        id: Uint8Array.from("user-id", c => c.charCodeAt(0)),
        name: "user@example.com",
        displayName: "User"
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required"
      },
      timeout: 60000,
      attestation: "direct"
    };
    
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });
    
    const credentialId = Array.from(new Uint8Array(credential.rawId))
      .map(b => String.fromCharCode(b))
      .join('');
    
    await chrome.storage.local.set({ 
      webauthnCredentialId: btoa(credentialId)
    });
    
    webauthnStatus.textContent = '✓ Biometric authentication configured successfully!';
    webauthnStatus.className = 'status-info success';
    setupWebAuthnBtn.style.display = 'none';
    removeWebAuthnBtn.style.display = 'inline-block';
    showMessage('Biometric authentication set up successfully!', 'success');
  } catch (error) {
    console.error('WebAuthn setup error:', error);
    if (error.name === 'NotAllowedError') {
      showMessage('Biometric authentication was cancelled or not allowed.', 'error');
    } else {
      showMessage('Failed to set up biometric authentication. Please try again.', 'error');
    }
  } finally {
    setupWebAuthnBtn.disabled = false;
    setupWebAuthnBtn.textContent = 'Setup Biometric Auth';
  }
}

// Handle remove WebAuthn
async function handleRemoveWebAuthn() {
  if (confirm('Are you sure you want to remove biometric authentication?')) {
    await chrome.storage.local.remove('webauthnCredentialId');
    webauthnStatus.textContent = 'Biometric authentication is not set up.';
    webauthnStatus.className = 'status-info';
    setupWebAuthnBtn.style.display = 'inline-block';
    removeWebAuthnBtn.style.display = 'none';
    showMessage('Biometric authentication removed.', 'success');
  }
}

// Handle unlock duration change
async function handleUnlockDurationChange() {
  const duration = parseInt(unlockDurationSelect.value);
  await chrome.storage.local.set({ unlockDuration: duration });
  showMessage('Unlock duration updated.', 'success');
}

// Show password message
function showPasswordMessage(message, type) {
  passwordMessage.textContent = message;
  passwordMessage.className = `message ${type}`;
  setTimeout(() => {
    passwordMessage.textContent = '';
    passwordMessage.className = 'message';
  }, 5000);
}

// Show general message
function showMessage(message, type) {
  // Create temporary message element
  const messageEl = document.createElement('div');
  messageEl.className = `toast-message ${type}`;
  messageEl.textContent = message;
  document.body.appendChild(messageEl);
  
  setTimeout(() => {
    messageEl.remove();
  }, 3000);
}

// Random string generator
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

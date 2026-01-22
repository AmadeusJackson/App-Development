// Unlock page logic with WebAuthn and password authentication

let UNLOCK_DURATION = 60 * 60 * 1000; // Default: 1 hour in milliseconds

// DOM elements
const webauthnBtn = document.getElementById('webauthn-btn');
const passwordBtn = document.getElementById('password-btn');
const passwordInput = document.getElementById('password-input');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load unlock duration from settings
  const settings = await chrome.storage.local.get(['unlockDuration']);
  if (settings.unlockDuration !== undefined) {
    UNLOCK_DURATION = settings.unlockDuration;
  }
  
  // Check if WebAuthn is available
  if (!window.PublicKeyCredential) {
    webauthnBtn.style.display = 'none';
    const divider = document.querySelector('.divider');
    if (divider) divider.style.display = 'none';
  }
  
  // Check if password is set
  const passwordSettings = await chrome.storage.local.get(['hashedPassword']);
  if (!passwordSettings.hashedPassword) {
    // No password set, show message
    showError('Please set a password in the extension settings first.');
    passwordInput.disabled = true;
    passwordBtn.disabled = true;
  }
  
  // Event listeners
  webauthnBtn.addEventListener('click', handleWebAuthn);
  passwordBtn.addEventListener('click', handlePassword);
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handlePassword();
    }
  });
});

// Handle WebAuthn authentication
async function handleWebAuthn() {
  try {
    webauthnBtn.disabled = true;
    webauthnBtn.textContent = 'Authenticating...';
    
    // Check if credential exists
    const settings = await chrome.storage.local.get(['webauthnCredentialId']);
    
    if (!settings.webauthnCredentialId) {
      // First time - register credential
      await registerWebAuthn();
    } else {
      // Authenticate with existing credential
      await authenticateWebAuthn(settings.webauthnCredentialId);
    }
  } catch (error) {
    console.error('WebAuthn error:', error);
    showError('Biometric authentication failed. Please try again or use password.');
    webauthnBtn.disabled = false;
    webauthnBtn.innerHTML = '<span class="button-icon">👆</span><span>Use Touch ID / Face ID</span>';
  }
}

// Register WebAuthn credential
async function registerWebAuthn() {
  try {
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from(randomStringFromServer(32), c => c.charCodeAt(0)),
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
    
    // Store credential ID
    const credentialId = Array.from(new Uint8Array(credential.rawId))
      .map(b => String.fromCharCode(b))
      .join('');
    
    await chrome.storage.local.set({ 
      webauthnCredentialId: btoa(credentialId)
    });
    
    // Unlock
    await unlock();
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Authentication was cancelled or not allowed.');
    }
    throw error;
  }
}

// Authenticate with WebAuthn
async function authenticateWebAuthn(credentialIdBase64) {
  try {
    const credentialId = Uint8Array.from(atob(credentialIdBase64), c => c.charCodeAt(0));
    
    const publicKeyCredentialRequestOptions = {
      challenge: Uint8Array.from(randomStringFromServer(32), c => c.charCodeAt(0)),
      allowCredentials: [{
        id: credentialId,
        type: 'public-key',
        transports: ['internal']
      }],
      timeout: 60000,
      userVerification: "required"
    };
    
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    });
    
    // Verify assertion (in a real app, this would be done server-side)
    // For this extension, we'll just check that we got a valid assertion
    if (assertion) {
      await unlock();
    }
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Authentication was cancelled.');
    }
    throw error;
  }
}

// Handle password authentication
async function handlePassword() {
  const password = passwordInput.value;
  
  if (!password) {
    showError('Please enter a password.');
    return;
  }
  
  passwordBtn.disabled = true;
  passwordBtn.textContent = 'Verifying...';
  
  try {
    // Get stored hashed password
    const settings = await chrome.storage.local.get(['hashedPassword']);
    
    if (!settings.hashedPassword) {
      showError('No password set. Please configure in settings.');
      passwordBtn.disabled = false;
      passwordBtn.textContent = 'Unlock with Password';
      return;
    }
    
    // Hash the entered password
    const hashedInput = await hashPassword(password);
    
    // Compare hashes
    if (hashedInput === settings.hashedPassword) {
      await unlock();
    } else {
      showError('Incorrect password. Please try again.');
      passwordInput.value = '';
      passwordBtn.disabled = false;
      passwordBtn.textContent = 'Unlock with Password';
    }
  } catch (error) {
    console.error('Password verification error:', error);
    showError('An error occurred. Please try again.');
    passwordBtn.disabled = false;
    passwordBtn.textContent = 'Unlock with Password';
  }
}

// Hash password using Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Unlock YouTube
async function unlock() {
  const token = generateToken();
  const expiry = Date.now() + UNLOCK_DURATION;
  
  // Send unlock message to background script
  chrome.runtime.sendMessage({
    action: 'unlock',
    token: token,
    expiry: expiry
  }, (response) => {
    if (response && response.success) {
      showSuccess('YouTube unlocked successfully!');
      
      // Close unlock page after a moment
      setTimeout(() => {
        window.close();
        // If window.close() doesn't work (some browsers block it), try to close the tab
        chrome.tabs.getCurrent((tab) => {
          if (tab) {
            chrome.tabs.remove(tab.id);
          }
        });
      }, 1500);
    } else {
      showError('Failed to unlock. Please try again.');
    }
  });
}

// Generate random token
function randomStringFromServer(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  return randomStringFromServer(32);
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

// Show success message
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';
}

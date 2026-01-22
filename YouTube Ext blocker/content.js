// Content script for blocking YouTube pages

(function() {
  'use strict';
  
  let isBlocked = false;
  let unlockOverlay = null;
  
  // Check blocking state
  async function checkBlockingState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkBlocked' });
      return response && response.blocked;
    } catch (error) {
      console.error('Error checking blocking state:', error);
      return false;
    }
  }
  
  // Create blocking overlay
  function createBlockingOverlay() {
    if (unlockOverlay) {
      return; // Already exists
    }
    
    // Remove existing page content
    document.documentElement.innerHTML = '';
    
    // Create overlay container
    unlockOverlay = document.createElement('div');
    unlockOverlay.id = 'yt-blocker-overlay';
    unlockOverlay.innerHTML = `
      <div class="blocker-container">
        <div class="blocker-content">
          <h1>🚫 YouTube Blocked</h1>
          <p>An external display has been detected. YouTube is currently blocked.</p>
          <p class="subtitle">Use your password or biometric authentication to unlock.</p>
          <button id="unlock-btn" class="unlock-button">Unlock YouTube</button>
        </div>
      </div>
    `;
    
    document.documentElement.appendChild(unlockOverlay);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #yt-blocker-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      }
      .blocker-container {
        text-align: center;
        color: white;
        padding: 40px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        max-width: 500px;
      }
      .blocker-content h1 {
        font-size: 2.5em;
        margin: 0 0 20px 0;
        font-weight: 700;
      }
      .blocker-content p {
        font-size: 1.2em;
        margin: 15px 0;
        line-height: 1.6;
      }
      .subtitle {
        font-size: 1em;
        opacity: 0.9;
      }
      .unlock-button {
        margin-top: 30px;
        padding: 15px 40px;
        font-size: 1.1em;
        background: white;
        color: #667eea;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      }
      .unlock-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
      }
      .unlock-button:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
    
    // Add unlock button handler
    const unlockBtn = unlockOverlay.querySelector('#unlock-btn');
    unlockBtn.addEventListener('click', () => {
      openUnlockPage();
    });
  }
  
  // Open unlock page
  function openUnlockPage() {
    chrome.runtime.sendMessage({ action: 'openUnlock' }, (response) => {
      if (chrome.runtime.lastError) {
        // Fallback: open unlock page in new tab
        window.open(chrome.runtime.getURL('unlock.html'), '_blank');
      }
    });
  }
  
  // Remove blocking overlay
  function removeBlockingOverlay() {
    if (unlockOverlay) {
      unlockOverlay.remove();
      unlockOverlay = null;
    }
  }
  
  // Main blocking check
  async function init() {
    const blocked = await checkBlockingState();
    
    if (blocked) {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBlockingOverlay);
      } else {
        createBlockingOverlay();
      }
      
      // Prevent navigation
      window.addEventListener('beforeunload', (e) => {
        if (isBlocked) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      
      isBlocked = true;
    } else {
      removeBlockingOverlay();
      isBlocked = false;
    }
  }
  
  // Listen for unlock messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'unlocked') {
      removeBlockingOverlay();
      isBlocked = false;
      // Reload the page
      window.location.reload();
    }
  });
  
  // Check blocking state periodically
  setInterval(() => {
    checkBlockingState().then(blocked => {
      if (blocked && !isBlocked) {
        createBlockingOverlay();
        isBlocked = true;
      } else if (!blocked && isBlocked) {
        removeBlockingOverlay();
        isBlocked = false;
        window.location.reload();
      }
    });
  }, 1000);
  
  // Initial check
  init();
})();

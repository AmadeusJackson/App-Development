// Background service worker for YouTube Display Blocker

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  // Set default settings
  await chrome.storage.local.set({
    enabled: true,
    blocked: false,
    externalDisplayConnected: false,
    focusMode: false,
    unlockToken: null,
    unlockExpiry: null
  });
  
  // Check initial display state
  checkDisplayState();
});

// Monitor display changes
chrome.system.display.onDisplayChanged.addListener(() => {
  checkDisplayState();
});

// Check display state and update blocking
async function checkDisplayState() {
  try {
    const displays = await chrome.system.display.getInfo();
    const externalDisplayConnected = displays.length > 1;
    
    // Get all relevant settings including unlock state
    const settings = await chrome.storage.local.get([
      'enabled', 
      'blocked', 
      'focusMode', 
      'unlockToken', 
      'unlockExpiry'
    ]);
    
    // Check if there's an active unlock token
    const now = Date.now();
    const isUnlocked = settings.unlockToken && settings.unlockExpiry && now < settings.unlockExpiry;
    
    if (settings.enabled) {
      // If unlocked, don't activate blocking (but keep state for when unlock expires)
      if (isUnlocked) {
        await chrome.storage.local.set({ 
          externalDisplayConnected,
          blocked: false  // Ensure blocked is false when unlocked
        });
        return;
      }
      
      // Check if focus mode is enabled - if so, always block (when not unlocked)
      if (settings.focusMode && !settings.blocked) {
        await activateBlocking('focus mode');
        await chrome.storage.local.set({ externalDisplayConnected });
        return;
      }
      
      // If focus mode is disabled, check display state
      if (externalDisplayConnected && !settings.blocked) {
        // External display connected - activate blocking (only if not unlocked)
        await activateBlocking('external display');
      } else if (!externalDisplayConnected && settings.blocked && !settings.focusMode) {
        // Only primary display and focus mode is off - deactivate blocking
        await deactivateBlocking();
      }
    }
    
    // Update display state
    await chrome.storage.local.set({ externalDisplayConnected });
  } catch (error) {
    console.error('Error checking display state:', error);
  }
}

// Activate blocking
async function activateBlocking(reason = 'external display') {
  await chrome.storage.local.set({ blocked: true });
  
  // Close all YouTube tabs or show blocking message
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    chrome.tabs.reload(tab.id);
  }
  
  console.log(`YouTube blocking activated - ${reason}`);
}

// Deactivate blocking
async function deactivateBlocking() {
  await chrome.storage.local.set({ blocked: false });
  console.log('YouTube blocking deactivated - only primary display');
}

// Handle unlock requests from content script or unlock page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'unlock') {
    handleUnlock(request.token, request.expiry).then(success => {
      sendResponse({ success });
      if (success) {
        // Reload YouTube tabs to remove blocking
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
          tabs.forEach(tab => chrome.tabs.reload(tab.id));
        });
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'checkBlocked') {
    chrome.storage.local.get(['blocked', 'focusMode', 'externalDisplayConnected', 'unlockToken', 'unlockExpiry'], (result) => {
      const now = Date.now();
      const isUnlocked = result.unlockToken && result.unlockExpiry && now < result.unlockExpiry;
      
      // If unlocked, never block
      if (isUnlocked) {
        sendResponse({ blocked: false });
        return;
      }
      
      // If focus mode is enabled, always block (when not unlocked)
      if (result.focusMode) {
        sendResponse({ blocked: true });
        return;
      }
      
      // Otherwise, check normal blocking state (external display)
      sendResponse({ blocked: result.blocked && !isUnlocked });
    });
    return true;
  }
  
  if (request.action === 'manualLock') {
    chrome.storage.local.set({ 
      blocked: true,
      unlockToken: null,
      unlockExpiry: null
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'manualUnlock') {
    handleUnlock(request.token, request.expiry).then(success => {
      sendResponse({ success });
    });
    return true;
  }
  
  if (request.action === 'openUnlock') {
    chrome.tabs.create({ url: chrome.runtime.getURL('unlock.html') });
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'checkDisplay') {
    checkDisplayState();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'toggleFocusMode') {
    chrome.storage.local.get(['focusMode'], (result) => {
      const newFocusMode = !result.focusMode;
      chrome.storage.local.set({ focusMode: newFocusMode }, () => {
        checkDisplayState();
        sendResponse({ success: true, focusMode: newFocusMode });
      });
    });
    return true;
  }
});

// Handle unlock with token and expiry
async function handleUnlock(token, expiry) {
  // Store unlock token - blocking state will be determined by checkBlocked logic
  await chrome.storage.local.set({
    unlockToken: token,
    unlockExpiry: expiry,
    blocked: false  // Temporarily unblock for unlock duration
  });
  return true;
}

// Check display state on startup
checkDisplayState();

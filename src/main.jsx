import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker, setupAutoSync, listenToSyncEvents } from './utils/offlineSync';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA + Offline Sync (Res. 38 DT)
registerServiceWorker().then((registration) => {
  if (registration) {
    // Check for updates every 60 minutes
    setInterval(() => registration.update(), 60 * 60 * 1000);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            console.log('[Flexio] Nueva versión disponible');
          }
        });
      }
    });
  }
});

// Setup auto-sync when coming back online
setupAutoSync();

// Listen for sync events from SW
listenToSyncEvents(
  (data) => {
    if (data.synced > 0) {
      console.log(`[Flexio] ${data.synced} registro(s) sincronizados`);
    }
  },
  (data) => {
    console.log('[Flexio] Registro guardado offline:', data.message);
  }
);

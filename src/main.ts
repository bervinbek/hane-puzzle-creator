import '@fontsource-variable/fredoka';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { mountShell } from './ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
mountShell(root);

// Keep the site on this device after the first visit, so it still opens when the classroom Wi-Fi
// does not. Only in the real build (the file below is made by the build) and only where allowed.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // No worker (private window, blocked storage): the site simply needs the network each time.
      });
  });
}

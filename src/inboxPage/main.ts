import '@fontsource-variable/fredoka';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '../styles/tokens.css';
import './page.css';
import { applyComfort, loadComfort } from '../ui/comfort';
import { inboxConfig } from '../ui/inbox';
import { mountInbox } from './page';

// The teacher's inbox (inbox.html). Not linked from the site, and not kept for offline use.
applyComfort(loadComfort());
const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
mountInbox(root, inboxConfig());

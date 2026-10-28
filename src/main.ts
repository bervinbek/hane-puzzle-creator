import '@fontsource-variable/fredoka';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { mountShell } from './ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
mountShell(root);

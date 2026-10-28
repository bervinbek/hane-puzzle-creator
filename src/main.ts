import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './styles/tokens.css';
import './styles/app.css';
import { mountShell } from './ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
mountShell(root);

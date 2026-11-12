import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/stage.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
new App(root);

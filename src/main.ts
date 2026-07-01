import { createApp } from './ui/App';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('No se encontro el contenedor principal de la aplicacion.');
}

createApp(root);

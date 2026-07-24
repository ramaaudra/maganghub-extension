import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.querySelector('#app');
if (!(target instanceof HTMLElement)) {
  throw new Error('Popup root #app not found');
}

const app = mount(App, {
  target,
});

export default app;
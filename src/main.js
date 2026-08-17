import { Game } from './Game.js';

const canvas = document.querySelector('#app');
const game = new Game(canvas);
game.start();

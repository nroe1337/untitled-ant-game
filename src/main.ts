import './style.css';
import { Game } from './core/game';
import { SYSTEMS } from './systems';

const game = new Game(SYSTEMS);
game.start(document.getElementById('app')!);
// handy for debugging in the browser console: window.game.ctx.res.add('soil', 100)
(window as any).game = game;

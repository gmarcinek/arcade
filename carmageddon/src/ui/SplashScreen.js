import * as PIXI from 'pixi.js';

export class SplashScreen {
  constructor(stage, screenW, screenH, onStart) {
    this.container = new PIXI.Container();
    stage.addChild(this.container);

    // Dark overlay
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.85 });
    this.container.addChild(bg);

    // Title
    const title = new PIXI.Text({ text: 'CARMAGEDDON', style: {
      fill: 0xef4444,
      fontSize: 64,
      fontWeight: '900',
      letterSpacing: 4,
    }});
    title.anchor.set(0.5);
    title.x = screenW / 2;
    title.y = screenH / 2 - 80;
    this.container.addChild(title);

    // Subtitle
    const sub = new PIXI.Text({ text: 'WYŚCIGI · DEMOLKA · PRZEŻYJ', style: {
      fill: 0xaaaaaa,
      fontSize: 16,
      letterSpacing: 3,
    }});
    sub.anchor.set(0.5);
    sub.x = screenW / 2;
    sub.y = screenH / 2 - 20;
    this.container.addChild(sub);

    // Controls
    const ctrl = new PIXI.Text({ text: 'WASD / STRZAŁKI — sterowanie\nTARANUJ wrogów i zombie-pojazdy\nWyeliminuj wszystkich lub przeżyj 3 minuty', style: {
      fill: 0x888888,
      fontSize: 13,
      align: 'center',
      lineHeight: 22,
    }});
    ctrl.anchor.set(0.5);
    ctrl.x = screenW / 2;
    ctrl.y = screenH / 2 + 50;
    this.container.addChild(ctrl);

    // Start button
    const btn = new PIXI.Text({ text: '[ SPACJA / KLIK — START ]', style: {
      fill: 0x00ff88,
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: 2,
    }});
    btn.anchor.set(0.5);
    btn.x = screenW / 2;
    btn.y = screenH / 2 + 130;
    this.container.addChild(btn);

    // Pulsate button
    let t = 0;
    this.pulsateFn = () => { t += 0.05; btn.alpha = 0.6 + 0.4 * Math.sin(t); };

    // Input handlers — both removed once either fires
    const start = () => {
      window.removeEventListener('keydown', this._keyHandler);
      this.container.off('pointerdown', start);
      this.hide();
      onStart();
    };
    this._keyHandler = (e) => { if (e.code === 'Space') start(); };
    window.addEventListener('keydown', this._keyHandler);
    this.container.eventMode = 'static';
    this.container.on('pointerdown', start);

    this.show();
  }

  update() { if (this.pulsateFn) this.pulsateFn(); }
  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }
}

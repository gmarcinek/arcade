import * as PIXI from 'pixi.js';

export class GameOverScreen {
  constructor(stage, screenW, screenH, onRestart) {
    this.container = new PIXI.Container();
    this.container.visible = false;
    stage.addChild(this.container);
    this.onRestart = onRestart;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.88 });
    this.container.addChild(bg);

    this.resultText = new PIXI.Text({ text: '', style: { fill: 0xffffff, fontSize: 72, fontWeight: '900', letterSpacing: 4 } });
    this.resultText.anchor.set(0.5);
    this.resultText.x = screenW / 2;
    this.resultText.y = screenH / 2 - 60;
    this.container.addChild(this.resultText);

    this.infoText = new PIXI.Text({ text: '', style: { fill: 0xaaaaaa, fontSize: 16, align: 'center' } });
    this.infoText.anchor.set(0.5);
    this.infoText.x = screenW / 2;
    this.infoText.y = screenH / 2 + 20;
    this.container.addChild(this.infoText);

    const btn = new PIXI.Text({ text: '[ ZAGRAJ PONOWNIE ]', style: { fill: 0xffffff, fontSize: 20, fontWeight: 'bold', letterSpacing: 2 } });
    btn.anchor.set(0.5);
    btn.x = screenW / 2;
    btn.y = screenH / 2 + 90;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => onRestart());
    this.container.addChild(btn);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.container.visible) onRestart();
    });
  }

  showWin(timeLeft, killCount) {
    this.resultText.text = 'WYGRANA!';
    this.resultText.style.fill = 0x22cc44;
    this.infoText.text = `Zniszczono ${killCount} pojazdów\nCzas: ${Math.floor(180 - timeLeft)}s`;
    this.container.visible = true;
  }

  showLose(timeLeft) {
    this.resultText.text = 'GAME OVER';
    this.resultText.style.fill = 0xef4444;
    this.infoText.text = `Przeżyłeś ${Math.floor(180 - timeLeft)} sekund`;
    this.container.visible = true;
  }

  hide() { this.container.visible = false; }
}

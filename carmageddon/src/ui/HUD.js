import * as PIXI from 'pixi.js';

export class HUD {
  constructor(stage, screenW, screenH) {
    this.container = new PIXI.Container();
    stage.addChild(this.container);

    // HP bar background
    this.hpBg = new PIXI.Graphics();
    this.hpBg.rect(20, 20, 200, 18).fill(0x333333);
    this.container.addChild(this.hpBg);

    // HP bar fill
    this.hpFill = new PIXI.Graphics();
    this.container.addChild(this.hpFill);

    // HP label
    this.hpLabel = new PIXI.Text({ text: 'HP', style: { fill: 0xffffff, fontSize: 12, fontWeight: 'bold' } });
    this.hpLabel.x = 20;
    this.hpLabel.y = 5;
    this.container.addChild(this.hpLabel);

    // Timer
    this.timerText = new PIXI.Text({ text: '3:00', style: { fill: 0xffffff, fontSize: 20, fontWeight: 'bold' } });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = screenW / 2;
    this.timerText.y = 10;
    this.container.addChild(this.timerText);

    // Enemy counter
    this.enemyText = new PIXI.Text({ text: 'WROGOWIE: 0', style: { fill: 0xffcc00, fontSize: 14, fontWeight: 'bold' } });
    this.enemyText.anchor.set(1, 0);
    this.enemyText.x = screenW - 20;
    this.enemyText.y = 10;
    this.container.addChild(this.enemyText);
  }

  update(hp, maxHp, timeLeft, enemyCount) {
    // HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barColor = ratio > 0.5 ? 0x22cc44 : ratio > 0.25 ? 0xffaa00 : 0xff2222;
    this.hpFill.clear();
    this.hpFill.rect(20, 20, 200 * ratio, 18).fill(barColor);

    // Timer
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    this.timerText.text = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Enemy counter
    this.enemyText.text = `WROGOWIE: ${enemyCount}`;
  }

  resize(screenW, screenH) {
    this.timerText.x = screenW / 2;
    this.enemyText.x = screenW - 20;
  }
}

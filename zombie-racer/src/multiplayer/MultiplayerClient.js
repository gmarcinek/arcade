import { io } from 'socket.io-client';

/**
 * MultiplayerClient — Client-authoritative relay.
 * Wysyła pełny stan fizyki gracza + pozycje zombich.
 * Odbiera pełny stan wszystkich graczy + ich zombie.
 */
export class MultiplayerClient {
  constructor() {
    this.socket  = null;
    this.myId    = null;
    this.myIp    = null;

    /** @type {(data: {id,ip,players,timeLeft,scores,inResults}) => void} */
    this.onInit          = null;
    /** @type {(players: Object, zombies: Object, myId: string) => void} */
    this.onPlayersUpdate = null;
    /** @type {(id: string, ip: string, data: Object) => void} */
    this.onPlayerJoined  = null;
    /** @type {(id: string) => void} */
    this.onPlayerLeft    = null;
    /** @type {(ip: string, kills: number) => void} */
    this.onScoreUpdate   = null;
    /** @type {(id:number, dirX:number, dirZ:number, speed:number, launch:number) => void} */
    this.onTreeBreak     = null;
    /** @type {({fromId:string, damage:number}) => void} */
    this.onImpact        = null;
    /** @type {({id:string, x:number, y:number, z:number}) => void} */
    this.onPlayerExploded = null;
    /** @type {(leaderboard: Array<{ip,kills}>) => void} */
    this.onMatchEnd      = null;
    /** @type {() => void} */
    this.onMatchStart    = null;

    this._pendingPos     = null;
    this._sendTimer      = null;
    this.latency         = 0;  // ms, zmierzone ping/pong
    this._pingInterval   = null;
  }

  connect(url = (import.meta.env?.DEV ? 'http://localhost:3000' : window.location.origin)) {
    this.socket = io(url, { transports: ['websocket', 'polling'] });

    this.socket.on('init', (data) => {
      this.myId = data.id;
      this.myIp = data.ip;
      if (this.onInit) this.onInit(data);
    });

    this.socket.on('ws', ({ players, zombies }) => {
      if (this.onPlayersUpdate) this.onPlayersUpdate(players, zombies || {}, this.myId);
    });

    this.socket.on('playerJoined', ({ id, ip }) => {
      if (this.onPlayerJoined) this.onPlayerJoined(id, ip, {});
    });

    this.socket.on('playerLeft', ({ id }) => {
      if (this.onPlayerLeft) this.onPlayerLeft(id);
    });

    this.socket.on('scoreUpdate', ({ ip, kills }) => {
      if (this.onScoreUpdate) this.onScoreUpdate(ip, kills);
    });

    this.socket.on('matchEnd', ({ leaderboard }) => {
      if (this.onMatchEnd) this.onMatchEnd(leaderboard);
    });

    this.socket.on('treeBreak', ({ id, dirX, dirZ, speed, launch }) => {
      if (this.onTreeBreak) this.onTreeBreak(id, dirX, dirZ, speed, launch);
    });

    this.socket.on('impact', (data) => {
      if (this.onImpact) this.onImpact(data);
    });

    this.socket.on('playerExploded', (data) => {
      if (this.onPlayerExploded) this.onPlayerExploded(data);
    });

    this.socket.on('pong_mp', (t) => {
      this.latency = Date.now() - t;
    });

    this.socket.on('matchStart', () => {
      if (this.onMatchStart) this.onMatchStart();
    });

    // Pozycja gracza ~20/s
    this._sendTimer = setInterval(() => {
      if (this._pendingPos && this.socket?.connected) {
        this.socket.emit('pos', this._pendingPos);
        this._pendingPos = null;
      }
    }, 50);

    // Ping co 2s
    this._pingInterval = setInterval(() => {
      if (this.socket?.connected) this.socket.emit('ping_mp', Date.now());
    }, 2000);
  }

  /**
   * @param {number} x,y,z       - pozycja
   * @param {number} qx,qy,qz,qw - kwaternion obrotu
   * @param {number} vx,vy,vz    - wektor prędkości
   * @param {number} hp, maxHp   - punkty życia
   * @param {Object} dmg         - stan uszkodzeń (DamageSystem.state)
   * @param {number} color       - kolor auta (hex)
   * @param {number} mass        - masa [kg]
   * @param {number} momentum    - pęd (|vel| * mass)
   */
  sendPosition(x, y, z, qx, qy, qz, qw, vx = 0, vy = 0, vz = 0,
               hp = 100, maxHp = 100, dmg = {}, color = 0x00dd66,
               mass = 1500, momentum = 0) {
    this._pendingPos = { x, y, z, qx, qy, qz, qw, vx, vy, vz,
                         hp, maxHp, dmg, color, mass, momentum };
  }

  /**
   * Wyślij pozycje wszystkich żywych zombich.
   * @deprecated Zombie są teraz autorytarne po stronie serwera.
   */
  sendZombies(_positions) {}

  sendKill() {
    this.socket?.emit('kill');
  }

  sendZombieKill(id) {
    this.socket?.emit('zombieKill', id);
  }

  sendTreeBreak(id, dirX, dirZ, speed, launch) {
    this.socket?.emit('treeBreak', { id, dirX, dirZ, speed, launch });
  }

  sendHitPlayer(targetId, damage) {
    if (damage > 0) this.socket?.emit('hitPlayer', { targetId, damage });
  }

  sendPlayerExploded(x, y, z) {
    this.socket?.emit('playerExploded', { x, y, z });
  }

  get connected() {
    return this.socket?.connected ?? false;
  }

  disconnect() {
    clearInterval(this._sendTimer);
    clearInterval(this._pingInterval);
    this.socket?.disconnect();
    this.socket = null;
  }
}

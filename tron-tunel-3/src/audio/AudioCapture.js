export class AudioCapture {
  constructor() {
    this.stream = null;
    this.ctx = null;
    this.sourceNode = null;
  }

  async start() {
    if (this.stream) return this.sourceNode;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    // Drop video tracks immediately — we only need audio
    stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('No audio track in capture. Enable "Share tab audio" in the browser prompt.');
    }

    this.stream = stream;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    // Do NOT connect to destination — no feedback loop

    // Handle stream end (user stops sharing)
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stop());

    return this.sourceNode;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.sourceNode = null;
  }

  get isActive() { return !!this.stream; }
  get audioContext() { return this.ctx; }
}

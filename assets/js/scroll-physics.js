/* A damped winding spindle: angle feeds cloth, wound material changes inertia. */
((root) => {
  class ScrollSpool {
    constructor(height) {
      this.angle = 0;
      this.velocity = 0;
      this.target = 0;
      this.sway = 0;
      this.swayVelocity = 0;
      this.configure(height);
    }
    configure(height) {
      const progress = this.length ? this.progress : 0;
      this.length = Math.max(1, height - 12);
      this.thickness = 0.42;
      this.core = Math.sqrt(36 + (12 * this.thickness) / Math.PI);
      this.endAngle = this.angleFor(this.length);
      this.angle = this.angleFor(progress * this.length);
      this.updateFeed();
    }
    angleFor(length) {
      return ((Math.sqrt(this.core ** 2 + (length * this.thickness) / Math.PI) - this.core) * Math.PI * 2) / this.thickness;
    }
    updateFeed() {
      this.wound = this.core * this.angle + (this.thickness * this.angle ** 2) / (4 * Math.PI);
      const fraction = Math.max(0, Math.min(1, this.wound / this.length));
      this.progress = fraction < 1e-10 ? 0 : fraction > 1 - 1e-10 ? 1 : fraction;
      if (this.progress === 0 || this.progress === 1) this.wound = this.progress * this.length;
      this.radius = this.core + (this.thickness * this.angle) / (Math.PI * 2);
      this.feedVelocity = this.velocity * this.radius;
    }
    toggle() {
      this.target = this.target === 1 ? 0 : 1;
    }
    snap() {
      this.angle = this.target * this.endAngle;
      this.velocity = this.feedAcceleration = this.sway = this.swayVelocity = 0;
      this.updateFeed();
    }
    step(dt) {
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = Math.min(dt / steps, 1 / 240);
      const target = this.target * this.endAngle;
      const previousFeed = this.feedVelocity;
      for (let i = 0; i < steps; i++) {
        this.updateFeed();
        const inertia = 1 + this.progress * 0.7;
        const gravity = Math.abs(target - this.angle) > 1 ? -(1 - this.progress) * 3 : 0;
        const torque = (target - this.angle) * 80 - this.velocity * 18;
        const acceleration = Math.max(-100, Math.min(100, torque / inertia + gravity));
        this.velocity = Math.max(-36, Math.min(36, this.velocity + acceleration * h));
        this.angle += this.velocity * h;
        // The end of the material acts as a soft stop, retaining a small rebound.
        if (this.angle < 0) {
          this.angle = 0;
          this.velocity = Math.abs(this.velocity) * 0.12;
        }
        if (this.angle > this.endAngle) {
          this.angle = this.endAngle;
          this.velocity = -Math.abs(this.velocity) * 0.12;
        }
        const pull = acceleration * this.radius * 0.0015;
        this.swayVelocity += (-this.sway * 32 - this.swayVelocity * 9 + pull) * h;
        this.sway += this.swayVelocity * h;
      }
      this.updateFeed();
      this.feedAcceleration = (this.feedVelocity - previousFeed) / Math.max(dt, 1 / 240);
      return Math.abs(target - this.angle) < 0.02 && Math.abs(this.velocity) < 0.1;
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = ScrollSpool;
  else root.ScrollSpool = ScrollSpool;
})(typeof window !== "undefined" ? window : globalThis);

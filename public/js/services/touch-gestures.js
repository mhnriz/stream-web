/**
 * StreamApp v1.3.0 — Touch Gesture Handler for the Video Player
 *
 * Gestures (mobile / touch devices only — see player.js init):
 *   • Horizontal swipe ............ seek (±, proportional, min ±10s feel)
 *   • Vertical swipe, LEFT half ... brightness (CSS filter on <video>)
 *   • Vertical swipe, RIGHT half .. volume
 *   • Double-tap .................. play / pause
 *
 * Design notes (deviations from the naive reference impl, on purpose):
 *   1. Gestures only start on the video surface / UI backdrop — never
 *      on buttons, the seek bar, range inputs, or open panels, so taps
 *      on controls keep working (troubleshooting_guide Issue 11).
 *   2. Direction locks after the first 30px of movement so a sloppy
 *      diagonal swipe doesn't seek AND change volume at once.
 *   3. Seeking previews during the move and commits on touchend —
 *      scrubbing video.currentTime on every touchmove causes constant
 *      re-buffering on remote streams.
 *   4. touch listeners are passive:false only on touchmove (we need
 *      preventDefault to stop page scroll during a gesture).
 */

export class TouchGestureHandler {
  /**
   * @param {HTMLElement} playerElement  the #player-overlay element
   * @param {object}      [hooks]        { onVolumeChange(v), onPlayToggle() }
   */
  constructor(playerElement, hooks = {}) {
    this.player = playerElement;
    this.video = playerElement.querySelector('video');
    this.hooks = hooks;

    // Gesture state
    this.active = false;
    this.lockedAxis = null;        // 'x' | 'y' | null
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;            // video.currentTime at gesture start
    this.startVolume = 1;
    this.startBrightness = 1;
    this.pendingSeek = null;       // committed on touchend
    this.lastTap = 0;              // double-tap detection
    this.hintTimer = null;

    this._onStart = this.handleTouchStart.bind(this);
    this._onMove = this.handleTouchMove.bind(this);
    this._onEnd = this.handleTouchEnd.bind(this);

    this.attachListeners();
  }

  attachListeners() {
    this.player.addEventListener('touchstart', this._onStart, { passive: true });
    this.player.addEventListener('touchmove', this._onMove, { passive: false });
    this.player.addEventListener('touchend', this._onEnd, { passive: true });
    this.player.addEventListener('touchcancel', this._onEnd, { passive: true });
  }

  destroy() {
    this.player.removeEventListener('touchstart', this._onStart);
    this.player.removeEventListener('touchmove', this._onMove);
    this.player.removeEventListener('touchend', this._onEnd);
    this.player.removeEventListener('touchcancel', this._onEnd);
  }

  /** True if the touch began on an interactive control (skip gesture). */
  isInteractiveTarget(target) {
    return !!target.closest(
      'button, input, select, .player-panel, .player-seek, .player-volume, ' +
      '.player-progress-container, .panel-item, a'
    );
  }

  handleTouchStart(e) {
    if (e.touches.length !== 1) { this.active = false; return; }
    if (this.isInteractiveTarget(e.target)) { this.active = false; return; }

    this.active = true;
    this.lockedAxis = null;
    this.pendingSeek = null;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.startTime = this.video.currentTime || 0;
    this.startVolume = this.video.volume;
    this.startBrightness = this.currentBrightness();
  }

  handleTouchMove(e) {
    if (!this.active || e.touches.length !== 1) return;

    const diffX = e.touches[0].clientX - this.startX;
    const diffY = e.touches[0].clientY - this.startY;

    // Lock to one axis once movement is decisive (>30px)
    if (!this.lockedAxis) {
      if (Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY)) {
        this.lockedAxis = 'x';
      } else if (Math.abs(diffY) > 30 && Math.abs(diffY) > Math.abs(diffX)) {
        this.lockedAxis = 'y';
      } else {
        return; // not yet a gesture — could still become a tap
      }
    }

    e.preventDefault(); // stop page scroll / pull-to-refresh during gesture

    if (this.lockedAxis === 'x') {
      this.handleSeekGesture(diffX);
    } else {
      const isLeftSide = this.startX < this.player.offsetWidth / 2;
      if (isLeftSide) this.handleBrightnessGesture(diffY);
      else this.handleVolumeGesture(diffY);
    }
  }

  handleTouchEnd() {
    // Commit a pending seek (preview happened during the move)
    if (this.pendingSeek !== null && this.video.duration) {
      this.video.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    }

    // Double-tap → play/pause (only when no swipe gesture was performed)
    if (!this.lockedAxis && this.active) {
      const now = Date.now();
      const gap = now - this.lastTap;
      if (gap > 0 && gap < 300) {
        if (this.hooks.onPlayToggle) this.hooks.onPlayToggle();
        else if (this.video.paused) this.video.play().catch(() => {});
        else this.video.pause();
        this.showGestureHint(this.video.paused ? '⏸ Paused' : '▶ Playing');
        this.lastTap = 0; // consume — a triple tap isn't two doubles
      } else {
        this.lastTap = now;
      }
    }

    this.active = false;
    this.lockedAxis = null;
  }

  // ─── Gesture actions ──────────────────────────────────────

  handleSeekGesture(diffX) {
    if (!this.video.duration) return;
    // Full-width swipe ≈ ±90s; small flicks land near the ±10s feel
    const seekAmount = (diffX / this.player.offsetWidth) * 90;
    const newTime = Math.max(0, Math.min(this.startTime + seekAmount, this.video.duration));
    this.pendingSeek = newTime;

    const delta = Math.round(newTime - this.startTime);
    const sign = delta >= 0 ? '+' : '−';
    this.showGestureHint(
      `${sign}${Math.abs(delta)}s  ·  ${formatHint(newTime)}`,
      true
    );
  }

  handleVolumeGesture(diffY) {
    // Swipe up = louder, down = quieter; full height ≈ full range
    const change = -(diffY / this.player.offsetHeight) * 1.2;
    const newVolume = clamp(this.startVolume + change, 0, 1);
    this.video.volume = newVolume;
    this.video.muted = newVolume === 0;
    if (this.hooks.onVolumeChange) this.hooks.onVolumeChange(newVolume);
    this.showGestureHint(`🔊 Volume ${Math.round(newVolume * 100)}%`, true);
  }

  handleBrightnessGesture(diffY) {
    const change = -(diffY / this.player.offsetHeight) * 1.2;
    const newBrightness = clamp(this.startBrightness + change, 0.2, 2);
    this.video.style.filter = `brightness(${newBrightness.toFixed(2)})`;
    this.showGestureHint(`☀ Brightness ${Math.round(newBrightness * 100)}%`, true);
  }

  currentBrightness() {
    const m = /brightness\(([\d.]+)\)/.exec(this.video.style.filter || '');
    return m ? parseFloat(m[1]) : 1;
  }

  /** Reset per-video state (call when a new stream loads). */
  reset() {
    this.video.style.filter = '';
    this.pendingSeek = null;
    this.lockedAxis = null;
    this.active = false;
  }

  // ─── Visual feedback ──────────────────────────────────────

  showGestureHint(text, sticky = false) {
    let hint = this.player.querySelector('.gesture-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'gesture-hint';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      this.player.appendChild(hint);
    }
    hint.textContent = text;

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => hint.remove(), sticky ? 700 : 1000);
  }
}

// ─── helpers ─────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function formatHint(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export default TouchGestureHandler;

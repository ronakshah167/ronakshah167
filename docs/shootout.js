(() => {
  'use strict';

  const maxAttempts = 7;
  const storageKey = 'ronak-siu-shootout-best';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const panel = document.querySelector('.shootout-panel');
  const ui = Object.fromEntries(
    ['goals', 'best', 'attempts', 'pitch', 'ball', 'aim', 'burst', 'keeper', 'match-status', 'kick-off']
      .map(id => [id, document.getElementById(id)])
  );
  const controls = [...panel.querySelectorAll('[data-target]')];
  const keyboardTargets = [{ x: 23, y: 37 }, { x: 50, y: 29 }, { x: 77, y: 37 }];
  const markers = Array.from({ length: maxAttempts }, () => document.createElement('li'));
  ui.attempts.append(...markers);

  let shots = [];
  let best = 0;
  try { best = Number(localStorage.getItem(storageKey)) || 0; } catch (_) {}
  let playing = false;
  let inFlight = false;
  let gesture = null;
  let timer;
  let ballFlight;
  let keeperDive;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const goalsScored = () => shots.filter(result => result === 'goal').length;
  const report = message => { ui['match-status'].textContent = message; };

  function renderScore() {
    ui.goals.textContent = goalsScored();
    ui.best.textContent = best;
    markers.forEach((marker, index) => {
      const result = shots[index] || 'pending';
      marker.dataset.result = result;
      marker.setAttribute('aria-label', 'Penalty ' + (index + 1) + ', ' + result);
      marker.textContent = { goal: '✓', saved: '×', wide: '−', pending: '·' }[result];
    });
  }

  function clearGesture() {
    const pointer = gesture?.id;
    gesture = null;
    if (pointer !== undefined && ui.ball.hasPointerCapture(pointer)) ui.ball.releasePointerCapture(pointer);
    ui.ball.classList.remove('is-aiming');
    ui.aim.hidden = true;
  }

  function nextPenalty() {
    ballFlight?.cancel();
    keeperDive?.cancel();
    ui.ball.style.left = '';
    ui.ball.style.top = '';
    ui.keeper.style.left = '';
    ui.keeper.style.top = '';
    ui.keeper.style.transform = '';
    ui.burst.hidden = true;
    inFlight = false;
    ui.ball.disabled = false;
    controls.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
    });
    report('Penalty ' + (shots.length + 1) + ' of ' + maxAttempts + '.');
  }

  function swipeTarget(dx, dy, width, height) {
    const forward = -dy;
    if (forward < 18 || Math.hypot(dx, dy) < 24) return null;

    const y = clamp(43 - (forward / height) * 60, 16, 43);
    const x = 50 + (dx / forward) * ((83 - y) / 100) * height / width * 100;
    return { x, y };
  }

  function keeperReaction(target) {
    const reach = 8 + shots.length * 0.55;
    const read = target.x + (Math.random() - 0.5) * (41 - shots.length * 2.5);
    const diveX = clamp(read, 17, 83);
    const turn = clamp((diveX - 50) * 2.6, -72, 72);
    const wide = target.x < 14 || target.x > 86;
    const diveY = clamp(target.y + 6, 25, 48);
    const saved = Math.abs(diveX - target.x) <= reach && diveY - target.y < 8;
    return { diveX, diveY, turn, result: wide ? 'wide' : saved ? 'saved' : 'goal' };
  }

  function shoot(target) {
    if (!playing || inFlight) return;
    inFlight = true;
    clearGesture();
    controls.forEach(button => button.setAttribute('aria-disabled', 'true'));
    const { diveX, diveY, turn, result } = keeperReaction(target);
    const endpoint = clamp(target.x, -6, 106) + '%';
    const ballY = target.y + '%';
    const divePose = 'translate(-50%, -50%) rotate(' + turn + 'deg)';
    const flightMs = motion.matches ? 0 : 455;
    ui.ball.style.left = endpoint;
    ui.ball.style.top = ballY;
    ui.keeper.style.left = diveX + '%';
    ui.keeper.style.top = diveY + '%';
    ui.keeper.style.transform = divePose;

    if (flightMs) {
      ballFlight = ui.ball.animate([
        { left: '50%', top: '83%', transform: 'translate(-50%, -50%) scale(1)' },
        { left: endpoint, top: ballY, transform: 'translate(-50%, -50%) scale(.54)' }
      ], { duration: flightMs, easing: 'cubic-bezier(.14,.5,.34,1)', fill: 'forwards' });
      const ready = { left: '50%', top: '48%', transform: 'translate(-50%, -50%) rotate(0deg)' };
      keeperDive = ui.keeper.animate([
        { ...ready, offset: 0 },
        { ...ready, offset: .23 },
        { left: diveX + '%', top: diveY + '%', transform: divePose, offset: 1 }
      ], { duration: flightMs, easing: 'ease-out' });
    }

    timer = setTimeout(() => {
      shots.push(result);
      const goals = goalsScored();
      if (goals > best) {
        best = goals;
        try { localStorage.setItem(storageKey, String(best)); } catch (_) {}
      }
      renderScore();
      const label = { goal: 'Goal!', saved: 'Saved!', wide: 'Wide!' }[result];
      ui.burst.textContent = result === 'goal' ? 'SIU!' : label.toUpperCase();
      ui.burst.hidden = false;
      if (shots.length === maxAttempts) {
        playing = false;
        ui.ball.disabled = true;
        controls.forEach(button => { button.disabled = true; });
        ui['kick-off'].textContent = 'Play again';
        report(label + ' Full time. ' + goals + ' of ' + maxAttempts + ' scored.');
        ui['kick-off'].focus();
        return;
      }

      report(label);
      timer = setTimeout(nextPenalty, motion.matches ? 440 : 680);
    }, flightMs);
  }

  ui['kick-off'].addEventListener('click', () => {
    clearTimeout(timer);
    clearGesture();
    shots = [];
    playing = true;
    ui['kick-off'].textContent = 'Restart';
    renderScore();
    nextPenalty();
    controls[1].focus();
  });

  ui.ball.addEventListener('pointerdown', event => {
    if (!playing || inFlight || gesture || !event.isPrimary || event.button !== 0) return;
    const pitch = ui.pitch.getBoundingClientRect();
    const ball = ui.ball.getBoundingClientRect();
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centreX: ball.left + ball.width / 2 - pitch.left,
      centreY: ball.top + ball.height / 2 - pitch.top,
      width: pitch.width,
      height: pitch.height
    };
    ui.ball.setPointerCapture(gesture.id);
    ui.ball.classList.add('is-aiming');
  });

  ui.ball.addEventListener('pointermove', event => {
    if (event.pointerId !== gesture?.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    ui.aim.hidden = dy > -6;
    ui.aim.style.left = gesture.centreX + 'px';
    ui.aim.style.top = gesture.centreY + 'px';
    ui.aim.style.width = Math.min(Math.hypot(dx, dy), gesture.height * 0.6) + 'px';
    ui.aim.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
  });

  ui.ball.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    const target = swipeTarget(event.clientX - gesture.x, event.clientY - gesture.y, gesture.width, gesture.height);
    clearGesture();
    if (target) shoot(target);
    else report('Swipe the ball up toward the goal for penalty ' + (shots.length + 1) + '.');
  });

  function cancelSwipe(event) {
    if (event.pointerId === gesture?.id) clearGesture();
  }

  ui.ball.addEventListener('pointercancel', cancelSwipe);
  ui.ball.addEventListener('lostpointercapture', cancelSwipe);

  controls.forEach(button => {
    button.addEventListener('click', () => shoot(keyboardTargets[Number(button.dataset.target)]));
  });

  panel.addEventListener('keydown', event => {
    if (!playing || !controls.includes(event.target) || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const index = ['ArrowLeft', 'ArrowUp', 'ArrowRight'].indexOf(event.key);
    if (index < 0) return;
    event.preventDefault();
    if (!event.repeat) shoot(keyboardTargets[index]);
  });

  renderScore();
})();

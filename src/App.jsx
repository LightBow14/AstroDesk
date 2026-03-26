import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Crosshair, Activity, Map, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CircleDot, Calculator, Globe, PlusSquare, Compass, BookOpen, X } from 'lucide-react';

// Astrodynamics Sandbox Constants
const SYSTEM = {
  sun: { id: 'sun', name: 'Sun', mu: 132712440018, radius: 696340, color: '#fbbf24', atmosphereGlow: 'rgba(245, 158, 11, 1)' },
  earth: { id: 'earth', name: 'Earth', mu: 398600, radius: 6371, color: '#1e3a8a', atmosphereGlow: 'rgba(59, 130, 246, 1)', orbit: { parent: 'sun', distance: 149597870, phase: 0 } },
  moon: { id: 'moon', name: 'Moon', mu: 4904, radius: 1737, color: '#cbd5e1', orbit: { parent: 'earth', distance: 384400, phase: 0 } },
  mars: { id: 'mars', name: 'Mars', mu: 42828, radius: 3389, color: '#dc2626', atmosphereGlow: 'rgba(220, 38, 38, 0.4)', orbit: { parent: 'sun', distance: 227900000, phase: 0.785 } },
  jupiter: { id: 'jupiter', name: 'Jupiter', mu: 126686534, radius: 71492, color: '#d97706', atmosphereGlow: 'rgba(217, 119, 6, 0.2)', orbit: { parent: 'sun', distance: 778500000, phase: 2 } },
  saturn: { id: 'saturn', name: 'Saturn', mu: 37931187, radius: 60268, color: '#fde047', atmosphereGlow: 'rgba(253, 224, 71, 0.2)', orbit: { parent: 'sun', distance: 1432000000, phase: 4 } }
};

export default function OrbitalSimulator() {
  const [isPaused, setIsPaused] = useState(false);
  const [timeWarp, setTimeWarp] = useState(1);
  const [scale, setScale] = useState(0.04);
  const [cameraFocus, setCameraFocus] = useState('active'); 
  const [activeThruster, setActiveThruster] = useState(null); 
  const [thrustValue, setThrustValue] = useState(15);
  const [physicsMode, setPhysicsMode] = useState('patched');
  const [isToolkitOpen, setIsToolkitOpen] = useState(false);
  const [activeVesselId, setActiveVesselId] = useState('ship-1');
  const [vesselsList, setVesselsList] = useState([{ id: 'ship-1', name: 'Vessel 1' }]);
  const [setupMode, setSetupMode] = useState('polar'); 
  const [targetBody, setTargetBody] = useState('sun');

  const [keplerInput, setKeplerInput] = useState({ type: 'periapsis', periapsis: '400', sma: '6771', slr: '6771', energy: '-29.4', ecc: '0', trueAnomaly: '0', argPeriapsis: '0' });
  const [polarInput, setPolarInput] = useState({ r: '1433000000', v: '7.5', gamma: '32', theta: '0' });
  const [cartesianInput, setCartesianInput] = useState({ x: '0', y: '8000', vx: '7.05', vy: '0' });

  const timeRef = useRef(0);
  const systemStateRef = useRef({});
  const activeVesselRef = useRef('ship-1');
  const thrustRef = useRef({ active: false, dir: 'prograde' });
  const thrustMagRef = useRef(15);
  const viewRef = useRef({ x: 0, y: 0 });
  const vesselsRef = useRef({ 'ship-1': { id: 'ship-1', name: 'Vessel 1', x: 0, y: 0, vx: 0, vy: 0, crashed: false, color: '#10b981' } });
  const canvasRef = useRef(null);
  const telemetryRefs = { alt: useRef(null), vel: useRef(null), apo: useRef(null), per: useRef(null), ecc: useRef(null), status: useRef(null), domBody: useRef(null), activeWarp: useRef(null), gamma: useRef(null), slr: useRef(null), period: useRef(null), trueAnomaly: useRef(null), energy: useRef(null), angMom: useRef(null), posMag: useRef(null) };
  const lastTimeRef = useRef(performance.now());
  const animationRef = useRef(null);

  useEffect(() => { activeVesselRef.current = activeVesselId; }, [activeVesselId]);

  const updateSystemBodies = (t) => {
    const bodies = { sun: { x: 0, y: 0, vx: 0, vy: 0, ...SYSTEM.sun } };
    const computeOrbit = (bodyId) => {
       const def = SYSTEM[bodyId];
       const parent = bodies[def.orbit.parent];
       const n = Math.sqrt(parent.mu / Math.pow(def.orbit.distance, 3));
       const phase = def.orbit.phase + n * t;
       bodies[bodyId] = { ...def, x: parent.x + Math.sin(phase) * def.orbit.distance, y: parent.y - Math.cos(phase) * def.orbit.distance, vx: parent.vx + Math.cos(phase) * def.orbit.distance * n, vy: parent.vy + Math.sin(phase) * def.orbit.distance * n };
    };
    computeOrbit('earth'); computeOrbit('mars'); computeOrbit('jupiter'); computeOrbit('saturn'); computeOrbit('moon'); 
    return bodies;
  };

  const getDominantBody = (x, y, sysState) => {
    let dom = Object.values(sysState)[0];
    let maxG = 0;
    Object.values(sysState).forEach(b => {
       const r2 = Math.pow(x - b.x, 2) + Math.pow(y - b.y, 2);
       if (r2 === 0) return;
       const g = b.mu / r2;
       if (g > maxG) { maxG = g; dom = b; }
    });
    return dom;
  };

  const calculateOrbitalElements = (vesselState, sysState) => {
    const domBody = getDominantBody(vesselState.x, vesselState.y, sysState);
    const relX = vesselState.x - domBody.x, relY = vesselState.y - domBody.y;
    const relVx = vesselState.vx - domBody.vx, relVy = vesselState.vy - domBody.vy;
    const r = Math.sqrt(relX * relX + relY * relY);
    const v2 = relVx * relVx + relVy * relVy;
    const h = relX * relVy - relY * relVx;
    const energy = v2 / 2 - domBody.mu / r;
    const ex = (relVy * h) / domBody.mu - (relX / r);
    const ey = (-relVx * h) / domBody.mu - (relY / r);
    const ecc = Math.sqrt(ex * ex + ey * ey);
    let a = Math.abs(energy) < 1e-8 ? Infinity : -domBody.mu / (2 * energy);
    const apoapsis = a * (1 + ecc), periapsis = a * (1 - ecc);
    const p = (Math.abs(h) * Math.abs(h)) / domBody.mu; 
    let trueAnomaly = 0;
    if (ecc > 1e-8) { 
        const dotProd = (relX * ex + relY * ey) / (r * ecc);
        trueAnomaly = Math.acos(Math.max(-1, Math.min(1, dotProd)));
        if ((relX * relVx + relY * relVy) < 0) trueAnomaly = 2 * Math.PI - trueAnomaly;
        trueAnomaly *= (180 / Math.PI); 
    }
    const vr = (relX * relVx + relY * relVy) / r, vPerp = Math.abs(h) / r;
    const gamma = Math.atan2(vr, vPerp) * (180 / Math.PI);
    let period = Infinity;
    if (a > 0 && ecc < 1) period = 2 * Math.PI * Math.sqrt((a * a * a) / domBody.mu);
    return { domBody, a, ecc, ex, ey, apoapsis, periapsis, r, v: Math.sqrt(v2), p, energy, trueAnomaly, period, gamma, hMag: Math.abs(h) };
  };

  const applySetup = (asNew) => {
    if (!systemStateRef.current.sun) systemStateRef.current = updateSystemBodies(timeRef.current);
    const target = systemStateRef.current[targetBody] || systemStateRef.current.earth;
    let relX = 0, relY = 0, relVx = 0, relVy = 0;

    if (setupMode === 'elements') {
        const e = parseFloat(keplerInput.ecc) || 0;
        let p = target.radius + 400; 
        if (keplerInput.type === 'periapsis') p = (target.radius + (parseFloat(keplerInput.periapsis) || 0)) * (1 + e);
        else if (keplerInput.type === 'sma') p = (parseFloat(keplerInput.sma) || (target.radius + 400)) * (1 - e * e);
        else if (keplerInput.type === 'slr') p = parseFloat(keplerInput.slr) || (target.radius + 400);
        else if (keplerInput.type === 'energy') p = (-target.mu / (2 * (parseFloat(keplerInput.energy) || -29.4))) * (1 - e * e);
        
        const nu = (parseFloat(keplerInput.trueAnomaly) || 0) * (Math.PI / 180);
        const w = (parseFloat(keplerInput.argPeriapsis) || 0) * (Math.PI / 180);
        const rMag = p / (1 + e * Math.cos(nu));
        const xp = rMag * Math.cos(nu), yp = rMag * Math.sin(nu);
        const vxp = -Math.sqrt(target.mu / p) * Math.sin(nu), vyp = Math.sqrt(target.mu / p) * (e + Math.cos(nu));
        relX = xp * Math.cos(w) - yp * Math.sin(w); relY = xp * Math.sin(w) + yp * Math.cos(w);
        relVx = vxp * Math.cos(w) - vyp * Math.sin(w); relVy = vxp * Math.sin(w) + vyp * Math.cos(w);
    } else if (setupMode === 'polar') {
        const rMag = parseFloat(polarInput.r) || target.radius + 400;
        const vMag = parseFloat(polarInput.v) || 0;
        const gamma = (parseFloat(polarInput.gamma) || 0) * (Math.PI / 180);
        const theta = (parseFloat(polarInput.theta) || 0) * (Math.PI / 180);
        relX = rMag * Math.cos(theta); relY = rMag * Math.sin(theta);
        const vr = vMag * Math.sin(gamma), vp = vMag * Math.cos(gamma);
        relVx = vr * Math.cos(theta) - vp * Math.sin(theta); relVy = vr * Math.sin(theta) + vp * Math.cos(theta);
    } else if (setupMode === 'cartesian') {
        relX = parseFloat(cartesianInput.x) || 0; relY = parseFloat(cartesianInput.y) || 0;
        relVx = parseFloat(cartesianInput.vx) || 0; relVy = parseFloat(cartesianInput.vy) || 0;
    }

    const vId = asNew ? `ship-${Date.now()}` : activeVesselId;
    vesselsRef.current[vId] = { id: vId, name: asNew ? `Sat-${Math.floor(Math.random()*1000)}` : vesselsList.find(v => v.id === activeVesselId)?.name || 'Vessel', color: asNew ? `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)` : vesselsRef.current[activeVesselId]?.color || '#10b981', crashed: false, x: target.x + relX, y: target.y + relY, vx: target.vx + relVx, vy: target.vy + relVy };
    if (asNew) { setVesselsList(prev => [...prev, { id: vId, name: vesselsRef.current[vId].name }]); setActiveVesselId(vId); }
    setIsPaused(true); setCameraFocus('active');
  };

  useEffect(() => { systemStateRef.current = updateSystemBodies(0); applySetup(false); }, []);

  const updateTelemetryUI = (elements, activeWarp) => {
    if (!telemetryRefs.alt.current) return;
    const { domBody, r, v, apoapsis, periapsis, ecc, p, energy, trueAnomaly, period, gamma, hMag } = elements;
    telemetryRefs.domBody.current.innerText = domBody.name; telemetryRefs.activeWarp.current.innerText = activeWarp + 'x';
    telemetryRefs.posMag.current.innerText = r.toFixed(1) + ' km'; telemetryRefs.alt.current.innerText = (r - domBody.radius).toFixed(1) + ' km';
    telemetryRefs.vel.current.innerText = v.toFixed(3) + ' km/s'; telemetryRefs.ecc.current.innerText = ecc.toFixed(4);
    telemetryRefs.slr.current.innerText = p.toFixed(1) + ' km'; telemetryRefs.energy.current.innerText = energy.toFixed(2) + ' km²/s²';
    telemetryRefs.trueAnomaly.current.innerText = trueAnomaly.toFixed(1) + '°'; telemetryRefs.gamma.current.innerText = gamma.toFixed(2) + '°';
    telemetryRefs.angMom.current.innerText = hMag.toFixed(2) + ' km²/s';
    if (period === Infinity || isNaN(period) || ecc >= 1) telemetryRefs.period.current.innerText = 'N/A';
    else telemetryRefs.period.current.innerText = period > 86400 ? (period / 86400).toFixed(2) + ' d' : period > 3600 ? (period / 3600).toFixed(2) + ' h' : (period / 60).toFixed(1) + ' m';
    const activeV = vesselsRef.current[activeVesselRef.current];
    if (activeV && activeV.crashed) { telemetryRefs.status.current.innerText = "CRASHED ON " + domBody.name.toUpperCase(); telemetryRefs.status.current.className = "text-red-500 font-bold"; }
    else if (ecc >= 1) { telemetryRefs.status.current.innerText = "ESCAPE TRAJECTORY"; telemetryRefs.status.current.className = "text-yellow-400 font-bold"; }
    else { telemetryRefs.status.current.innerText = "NOMINAL ORBIT"; telemetryRefs.status.current.className = "text-green-400 font-bold"; }
  };

  const drawSpacecraft = (ctx, vessel, sysState, isActive) => {
    const domBody = getDominantBody(vessel.x, vessel.y, sysState);
    const heading = Math.atan2(vessel.vy - domBody.vy, vessel.vx - domBody.vx);
    const size = isActive ? 12 / scale : 8 / scale;
    ctx.save(); ctx.translate(vessel.x, vessel.y); ctx.rotate(heading);
    if (isActive && thrustRef.current.active) {
      ctx.fillStyle = '#f97316'; ctx.beginPath();
      const dir = thrustRef.current.dir; let rot = 0;
      if (dir === 'retrograde') rot = Math.PI;
      else if (dir === 'radial_in') rot = -Math.PI/2 - heading + Math.atan2(-(vessel.y-domBody.y), -(vessel.x-domBody.x)); 
      else if (dir === 'radial_out') rot = Math.PI/2 - heading + Math.atan2(-(vessel.y-domBody.y), -(vessel.x-domBody.x));
      ctx.rotate(rot); ctx.moveTo(-size * 0.8, -size * 0.4); ctx.lineTo(-size * 2, 0); ctx.lineTo(-size * 0.8, size * 0.4); ctx.fill(); ctx.rotate(-rot);
    }
    ctx.fillStyle = isActive ? '#10b981' : vessel.color; ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size, size * 0.6); ctx.lineTo(-size, -size * 0.6); ctx.closePath(); ctx.fill(); ctx.restore();
  };

  const renderCanvas = (ctx, canvas, activeWarp) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sysState = systemStateRef.current; if (!sysState || Object.keys(sysState).length === 0) return; 
    let targetX = 0, targetY = 0;
    if (cameraFocus === 'active' && vesselsRef.current[activeVesselRef.current]) { targetX = vesselsRef.current[activeVesselRef.current].x; targetY = vesselsRef.current[activeVesselRef.current].y; }
    else if (sysState[cameraFocus]) { targetX = sysState[cameraFocus].x; targetY = sysState[cameraFocus].y; }
    ctx.save(); ctx.translate(canvas.width / 2 - targetX * scale + viewRef.current.x, canvas.height / 2 - targetY * scale + viewRef.current.y); ctx.scale(scale, scale);
    
    Object.values(sysState).forEach(body => {
      if (body.orbit && body.orbit.parent && sysState[body.orbit.parent]) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 1 / scale; ctx.beginPath(); ctx.arc(sysState[body.orbit.parent].x, sysState[body.orbit.parent].y, body.orbit.distance, 0, Math.PI * 2); ctx.stroke(); }
      if (body.atmosphereGlow) { const grad = ctx.createRadialGradient(body.x, body.y, body.radius * 0.8, body.x, body.y, body.radius * 1.5); grad.addColorStop(0, body.atmosphereGlow); grad.addColorStop(0.8, body.atmosphereGlow.replace('1)', '0.3)')); grad.addColorStop(1, body.atmosphereGlow.replace('1)', '0)')); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(body.x, body.y, body.radius * 1.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = body.color; ctx.beginPath(); ctx.arc(body.x, body.y, Math.max(body.radius, 3 / scale), 0, Math.PI * 2); ctx.fill();
    });
    
    Object.values(vesselsRef.current).forEach(vessel => {
      const isActive = vessel.id === activeVesselRef.current;
      const elements = calculateOrbitalElements(vessel, sysState);
      if (isActive) updateTelemetryUI(elements, activeWarp);
      const { domBody } = elements;
      
      if (elements.ecc < 0.99) {
        const { a, ecc, ex, ey } = elements; const b = a * Math.sqrt(Math.abs(1 - ecc * ecc)), rot = Math.atan2(ey, ex);
        ctx.beginPath(); ctx.ellipse(domBody.x - a * ex, domBody.y - a * ey, a, b, rot, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.35)' : vessel.color; ctx.lineWidth = isActive ? 1.5 / scale : 0.8 / scale;
        if (!vessel.crashed) { if (!isActive) ctx.globalAlpha = 0.4; else ctx.setLineDash([10 / scale, 15 / scale]); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1.0;
      } else if (isActive) {
        const p_step = Math.max(10, domBody.radius / 5); let px = vessel.x, py = vessel.y, pvx = vessel.vx, pvy = vessel.vy;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)'; ctx.lineWidth = 1.5 / scale;
        for(let i=0; i<400; i++) {
          let ax = 0, ay = 0; Object.values(sysState).forEach(b => { if (physicsMode === 'patched' && b.id !== domBody.id) return; const dx = px - b.x, dy = py - b.y, pr = Math.sqrt(dx*dx + dy*dy); if (pr > b.radius) { ax += -b.mu * dx / (pr*pr*pr); ay += -b.mu * dy / (pr*pr*pr); } });
          pvx += ax * p_step; pvy += ay * p_step; px += pvx * p_step; py += pvy * p_step; ctx.lineTo(px, py);
        } ctx.stroke();
      }
      if (!vessel.crashed) drawSpacecraft(ctx, vessel, sysState, isActive); else { ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(vessel.x, vessel.y, 10 / scale, 0, Math.PI * 2); ctx.fill(); }
    }); ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    const handleResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', handleResize); handleResize();
    const loop = (time) => {
      const dtReal = (time - lastTimeRef.current) / 1000; lastTimeRef.current = time; let activeWarp = timeWarp;
      if (!isPaused) {
        const sys = updateSystemBodies(timeRef.current); systemStateRef.current = sys;
        const activeV = vesselsRef.current[activeVesselRef.current];
        if (activeV && !activeV.crashed) {
            const domBody = getDominantBody(activeV.x, activeV.y, sys); const alt = Math.sqrt(Math.pow(activeV.x - domBody.x, 2) + Math.pow(activeV.y - domBody.y, 2)) - domBody.radius;
            if (domBody.id !== 'sun') { if (alt < 2000) activeWarp = Math.min(activeWarp, 100); else if (alt < 20000) activeWarp = Math.min(activeWarp, 1000); else if (alt < 100000) activeWarp = Math.min(activeWarp, 10000); }
        }
        let timeAccumulated = Math.min(dtReal, 0.1) * activeWarp;
        let PHYSICS_STEP = activeWarp >= 100000 ? 5.0 : activeWarp >= 10000 ? 0.5 : activeWarp >= 1000 ? 0.1 : 0.05;
        while (timeAccumulated > 0) {
          const dt = Math.min(timeAccumulated, PHYSICS_STEP); timeRef.current += dt;
          Object.values(vesselsRef.current).forEach(vessel => {
            if (vessel.crashed) return; let ax = 0, ay = 0, crashed = false; const domBody = getDominantBody(vessel.x, vessel.y, sys);
            Object.values(sys).forEach(body => { if (physicsMode === 'patched' && body.id !== domBody.id) return; const dx = vessel.x - body.x, dy = vessel.y - body.y, r = Math.sqrt(dx * dx + dy * dy); if (r <= body.radius) crashed = true; ax += -body.mu * dx / (r*r*r); ay += -body.mu * dy / (r*r*r); });
            if (crashed) { vessel.crashed = true; return; }
            if (vessel.id === activeVesselRef.current && thrustRef.current.active) {
              const relVx = vessel.vx - domBody.vx, relVy = vessel.vy - domBody.vy, rMag = Math.sqrt(Math.pow(vessel.x - domBody.x, 2) + Math.pow(vessel.y - domBody.y, 2)), vMag = Math.sqrt(relVx * relVx + relVy * relVy), tMag = (thrustMagRef.current / 1000); 
              if (thrustRef.current.dir === 'prograde') { ax += (relVx / vMag) * tMag; ay += (relVy / vMag) * tMag; } 
              else if (thrustRef.current.dir === 'retrograde') { ax -= (relVx / vMag) * tMag; ay -= (relVy / vMag) * tMag; } 
              else if (thrustRef.current.dir === 'radial_out') { ax += ((vessel.x - domBody.x) / rMag) * tMag; ay += ((vessel.y - domBody.y) / rMag) * tMag; } 
              else if (thrustRef.current.dir === 'radial_in') { ax -= ((vessel.x - domBody.x) / rMag) * tMag; ay -= ((vessel.y - domBody.y) / rMag) * tMag; }
            }
            vessel.vx += ax * dt; vessel.vy += ay * dt; vessel.x += vessel.vx * dt; vessel.y += vessel.vy * dt;
          }); timeAccumulated -= dt;
        }
      } renderCanvas(ctx, canvas, activeWarp); animationRef.current = requestAnimationFrame(loop);
    }; lastTimeRef.current = performance.now(); animationRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(animationRef.current); };
  }, [isPaused, timeWarp, scale, cameraFocus, physicsMode]);

  const handleThrustStart = (dir) => { setIsPaused(false); thrustRef.current = { active: true, dir }; setActiveThruster(dir); };
  const handleThrustStop = () => { thrustRef.current.active = false; setActiveThruster(null); };
  const handleThrustChange = (e) => { const val = e.target.value; setThrustValue(val); thrustMagRef.current = parseFloat(val) || 0; };

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; switch(e.key) { case 'ArrowUp': case 'w': case 'W': handleThrustStart('prograde'); break; case 'ArrowDown': case 's': case 'S': handleThrustStart('retrograde'); break; case 'ArrowLeft': case 'a': case 'A': handleThrustStart('radial_in'); break; case 'ArrowRight': case 'd': case 'D': handleThrustStart('radial_out'); break; } };
    const handleKeyUp = (e) => { switch(e.key) { case 'ArrowUp': case 'w': case 'W': if (thrustRef.current.dir === 'prograde') handleThrustStop(); break; case 'ArrowDown': case 's': case 'S': if (thrustRef.current.dir === 'retrograde') handleThrustStop(); break; case 'ArrowLeft': case 'a': case 'A': if (thrustRef.current.dir === 'radial_in') handleThrustStop(); break; case 'ArrowRight': case 'd': case 'D': if (thrustRef.current.dir === 'radial_out') handleThrustStop(); break; } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

  const handleCameraFocus = (target) => { setCameraFocus(target); viewRef.current = { x: 0, y: 0 }; if (target === 'sun') setScale(0.0000005); else if (target === 'earth') setScale(0.02); else if (target === 'moon') setScale(0.05); else if (target === 'mars') setScale(0.01); else if (target === 'jupiter') setScale(0.001); else if (target === 'saturn') setScale(0.001); else setScale(0.04); };
  const handleWheel = (e) => setScale(prev => Math.min(Math.max(prev * (1 - e.deltaY * 0.001), 0.00000001), 1));
  const handleDrag = (e) => { if (e.buttons === 1) { viewRef.current.x += e.movementX; viewRef.current.y += e.movementY; } };
  const NavBtn = ({ dir, label, Icon, classes, keyHint }) => { const isActive = activeThruster === dir; let cl = isActive ? (dir==='prograde'?'bg-green-600 border-green-400':dir==='retrograde'?'bg-red-600 border-red-400':'bg-blue-600 border-blue-400')+' text-white' : (dir==='prograde'?'text-green-400 border-green-900':dir==='retrograde'?'text-red-400 border-red-900':'text-blue-400 border-blue-900'); return ( <button onMouseDown={() => handleThrustStart(dir)} onMouseUp={handleThrustStop} onMouseLeave={handleThrustStop} onTouchStart={(e) => { e.preventDefault(); handleThrustStart(dir); }} onTouchEnd={(e) => { e.preventDefault(); handleThrustStop(); }} className={`absolute flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 transition-all select-none ${classes} ${cl}`}> <Icon className="w-5 h-5 mb-0.5" /> <span className="text-[8px] font-bold">{label}</span> <span className="text-[7px] opacity-60">{keyHint}</span> </button> ); };

  const btnClasses = "bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-100 font-semibold py-2 px-4 rounded shadow border border-slate-600 flex items-center justify-center select-none transition-colors";

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden text-sm select-none">
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full cursor-grab active:cursor-grabbing" onWheel={handleWheel} onMouseMove={handleDrag} />
      
      {/* TOP LEFT: Telemetry */}
      <div className="absolute top-4 left-4 w-80 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4 text-slate-200 shadow-xl pointer-events-auto overflow-y-auto max-h-[calc(100vh-2rem)]">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-2"><Activity className="w-5 h-5 text-blue-400" /><h2 className="text-lg font-bold tracking-wider uppercase">Telemetry</h2></div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-2">
          <span className="text-slate-400">Target SOI:</span><span ref={telemetryRefs.domBody} className="font-bold text-blue-400 uppercase">-</span>
          <span className="text-slate-400">Status:</span><span ref={telemetryRefs.status} className="font-bold text-green-400">NOMINAL</span>
          <div className="col-span-2 border-b border-slate-700/50 my-1"></div>
          <span className="text-slate-400">Radius |r|:</span><span ref={telemetryRefs.posMag} className="font-mono text-right text-indigo-300">- km</span>
          <span className="text-slate-400">Altitude:</span><span ref={telemetryRefs.alt} className="font-mono text-right">- km</span>
          <span className="text-slate-400">Velocity:</span><span ref={telemetryRefs.vel} className="font-mono text-right">- km/s</span>
          <span className="text-slate-400">Apoapsis:</span><span ref={telemetryRefs.apo} className="font-mono text-right text-blue-300">- km</span>
          <span className="text-slate-400">Periapsis:</span><span ref={telemetryRefs.per} className="font-mono text-right text-blue-300">- km</span>
          <div className="col-span-2 border-b border-slate-700/50 my-1"></div>
          <span className="text-slate-400">Eccentricity:</span><span ref={telemetryRefs.ecc} className="font-mono text-right">-</span>
          <span className="text-slate-400">Flt. Path Angle (γ):</span><span ref={telemetryRefs.gamma} className="font-mono text-right text-orange-300">- °</span>
          <span className="text-slate-400">True Anomaly (ν):</span><span ref={telemetryRefs.trueAnomaly} className="font-mono text-right text-purple-300">- °</span>
          <span className="text-slate-400">Ang. Momentum (h):</span><span ref={telemetryRefs.angMom} className="font-mono text-right text-orange-300">- km²/s</span>
          <span className="text-slate-400">Semi-Latus R.:</span><span ref={telemetryRefs.slr} className="font-mono text-right text-indigo-300">- km</span>
          <span className="text-slate-400">Period:</span><span ref={telemetryRefs.period} className="font-mono text-right text-indigo-300">-</span>
          <span className="text-slate-400">Sp. Energy:</span><span ref={telemetryRefs.energy} className="font-mono text-right text-purple-300">-</span>
        </div>
      </div>

      {/* BOTTOM LEFT: Mission Setup */}
      <div className="absolute bottom-4 left-4 w-80 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4 text-slate-200 shadow-xl pointer-events-auto">
        <div className="flex bg-slate-950/50 rounded-lg p-1 mb-4 border border-slate-700">
            <button onClick={() => setSetupMode('polar')} className={`flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-md font-bold transition-colors ${setupMode === 'polar' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Compass className="w-3 h-3" /> POLAR</button>
            <button onClick={() => setSetupMode('elements')} className={`flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-md font-bold transition-colors ${setupMode === 'elements' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Globe className="w-3 h-3" /> ELEMENTS</button>
            <button onClick={() => setSetupMode('cartesian')} className={`flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-md font-bold transition-colors ${setupMode === 'cartesian' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Calculator className="w-3 h-3" /> CARTESIAN</button>
        </div>
        <label className="flex flex-col text-[10px] font-bold text-slate-400 col-span-2 mb-3">Target Central Body<select value={targetBody} onChange={(e) => setTargetBody(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-white font-bold mt-1 outline-none cursor-pointer"><option value="sun">Sun</option><option value="earth">Earth</option><option value="moon">Moon</option><option value="mars">Mars</option><option value="jupiter">Jupiter</option><option value="saturn">Saturn</option></select></label>
        
        {setupMode === 'polar' && ( <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4"> <label className="flex flex-col text-[10px] text-slate-400">Radius (km)<input type="number" value={polarInput.r} onChange={(e)=>setPolarInput({...polarInput, r: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-orange-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Velocity (km/s)<input type="number" value={polarInput.v} onChange={(e)=>setPolarInput({...polarInput, v: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-orange-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Flt Path Angle (γ) °<input type="number" value={polarInput.gamma} onChange={(e)=>setPolarInput({...polarInput, gamma: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-purple-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Theta (°) °<input type="number" value={polarInput.theta} onChange={(e)=>setPolarInput({...polarInput, theta: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-indigo-300 font-mono mt-0.5 outline-none" /></label> </div> )}
        {setupMode === 'elements' && ( <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4"> <label className="flex flex-col text-[10px] text-slate-400"><select value={keplerInput.type} onChange={(e)=>setKeplerInput({...keplerInput, type: e.target.value})} className="bg-transparent text-slate-400 font-bold outline-none border-b border-slate-700 mb-1"><option value="periapsis">Periapsis Alt.</option><option value="sma">Semi-major Axis</option><option value="slr">Semi-Latus Rectum</option><option value="energy">Specific Energy</option></select><input type="number" value={keplerInput[keplerInput.type]} onChange={(e)=>setKeplerInput({...keplerInput, [keplerInput.type]: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-blue-300 font-mono outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Eccentricity (e)<input type="number" value={keplerInput.ecc} onChange={(e)=>setKeplerInput({...keplerInput, ecc: e.target.value})} step="0.1" className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-blue-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">True Anomaly (°) °<input type="number" value={keplerInput.trueAnomaly} onChange={(e)=>setKeplerInput({...keplerInput, trueAnomaly: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-purple-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Arg. Peri (ω) °<input type="number" value={keplerInput.argPeriapsis} onChange={(e)=>setKeplerInput({...keplerInput, argPeriapsis: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-indigo-300 font-mono mt-0.5 outline-none" /></label> </div> )}
        {setupMode === 'cartesian' && ( <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4"> <label className="flex flex-col text-[10px] text-slate-400">X₀ (km)<input type="number" value={cartesianInput.x} onChange={(e)=>setCartesianInput({...cartesianInput, x: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-indigo-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Y₀ (km)<input type="number" value={cartesianInput.y} onChange={(e)=>setCartesianInput({...cartesianInput, y: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-indigo-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Vx₀ (km/s)<input type="number" value={cartesianInput.vx} onChange={(e)=>setCartesianInput({...cartesianInput, vx: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-orange-300 font-mono mt-0.5 outline-none" /></label> <label className="flex flex-col text-[10px] text-slate-400">Vy₀ (km/s)<input type="number" value={cartesianInput.vy} onChange={(e)=>setCartesianInput({...cartesianInput, vy: e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-orange-300 font-mono mt-0.5 outline-none" /></label> </div> )}
        
        <div className="flex gap-2"><button onClick={() => applySetup(false)} className={`${btnClasses} flex-1 text-xs py-1.5`}>Update Active</button><button onClick={() => applySetup(true)} className={`${btnClasses} flex-1 text-xs py-1.5 bg-green-700 hover:bg-green-600 border-green-500`}><PlusSquare className="w-3 h-3 mr-1"/> Add Vessel</button></div>
      </div>

      {/* BOTTOM RIGHT: Maneuver Controls */}
      <div className="absolute bottom-4 right-4 w-72 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4 text-slate-200 shadow-xl pointer-events-auto">
        <div className="flex items-center justify-between mb-2 border-b border-slate-700 pb-2"><h3 className="font-bold tracking-widest text-slate-300 text-sm flex items-center gap-2"><Crosshair className="w-4 h-4 text-orange-500" /> Nav System</h3><span className={`text-[10px] px-2 py-0.5 rounded font-bold ${activeThruster ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>{activeThruster ? 'BURNING' : 'COASTING'}</span></div>
        <div className="flex justify-between items-center gap-1 mb-2 bg-slate-950/50 p-2 rounded-lg border border-slate-700"><span className="text-[10px] text-slate-400 font-bold px-1">ACCEL (m/s²):</span><input type="number" value={thrustValue} onChange={handleThrustChange} step="0.1" min="0" className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-orange-400 font-mono text-sm text-right focus:outline-none focus:border-orange-500" /></div>
        <div className="relative w-48 h-48 mx-auto my-4 bg-slate-950/50 rounded-full border-4 border-slate-800 shadow-inner flex items-center justify-center"> <div className={`absolute w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors ${activeThruster ? 'border-orange-500 bg-orange-500/20' : 'border-slate-700 bg-slate-800'}`}><CircleDot className={`w-6 h-6 ${activeThruster ? 'text-orange-500' : 'text-slate-600'}`} /></div> <NavBtn dir="prograde" label="PRO" Icon={ArrowUp} keyHint="[W]" classes="top-1 left-1/2 -translate-x-1/2" /> <NavBtn dir="retrograde" label="RET" Icon={ArrowDown} keyHint="[S]" classes="bottom-1 left-1/2 -translate-x-1/2" /> <NavBtn dir="radial_in" label="RAD IN" Icon={ArrowLeft} keyHint="[A]" classes="left-1 top-1/2 -translate-y-1/2" /> <NavBtn dir="radial_out" label="RAD OUT" Icon={ArrowRight} keyHint="[D]" classes="right-1 top-1/2 -translate-y-1/2" /> </div>
      </div>

      {/* TOP RIGHT: Controls */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-3 pointer-events-auto">
        <button onClick={() => setIsToolkitOpen(true)} className="flex items-center gap-2 border border-purple-500 bg-purple-900/80 hover:bg-purple-800 rounded-lg px-4 py-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] text-purple-200 transition-colors"><BookOpen className="w-5 h-5" /><span className="font-bold tracking-wider">HW TOOLKIT</span></button>
        <button onClick={() => setPhysicsMode(prev => prev === 'patched' ? 'n-body' : 'patched')} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 shadow-lg transition-colors ${physicsMode === 'patched' ? 'bg-indigo-900/80 border-indigo-500 text-indigo-200' : 'bg-red-900/80 border-red-500 text-red-200'}`}><Calculator className="w-4 h-4" /><div className="text-right leading-none"><div className="text-[9px] font-bold uppercase opacity-70">Physics Engine</div><div className="text-xs font-bold">{physicsMode === 'patched' ? '2-Body' : 'N-Body'}</div></div></button>
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-blue-800 rounded-lg p-1.5 shadow-[0_0_15px_rgba(30,64,175,0.4)]"> <span className="text-xs text-blue-400 pl-2 pr-1 font-bold">VESSEL:</span> <select value={activeVesselId} onChange={(e) => setActiveVesselId(e.target.value)} className="bg-blue-900/50 border border-blue-700 text-white rounded px-2 py-1 text-xs font-bold uppercase cursor-pointer outline-none hover:bg-blue-800/80 transition-colors"> {vesselsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)} </select> </div>
        <div className="flex bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-1"><button onClick={() => setIsPaused(!isPaused)} className={`p-2 rounded hover:bg-slate-700 ${isPaused ? 'text-yellow-400' : 'text-slate-300'}`}>{isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}</button><div className="border-l border-slate-700 mx-1"></div>{[1, 100, 1000, 10000, 100000].map(w => (<button key={w} onClick={() => setTimeWarp(w)} className={`px-2 font-mono text-xs rounded hover:bg-slate-700 ${timeWarp===w ? 'bg-slate-700 text-white font-bold' : 'text-slate-400'}`}>{w >= 1000 ? (w/1000)+'k' : w}x</button>))}<div className="flex flex-col justify-center px-2 bg-slate-800/50 rounded ml-1 min-w-[60px] text-center border border-slate-700/50"><span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Active</span><span ref={telemetryRefs.activeWarp} className="text-xs font-mono text-yellow-400 font-bold leading-none">-</span></div></div>
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-1">
          <span className="text-xs text-slate-400 pl-2 pr-1 font-bold flex items-center gap-1"><Map className="w-3 h-3"/> FOCUS:</span>
          {['active', ...(systemStateRef.current ? Object.keys(systemStateRef.current) : [])].map(target => (
            <button key={target} onClick={() => handleCameraFocus(target)} className={`px-2 py-1 text-xs font-bold uppercase rounded ${cameraFocus === target ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>
              {target === 'active' ? 'Active Ship' : target}
            </button>
          ))}
        </div>
      </div>

      {isToolkitOpen && <AstrodynamicsToolkit onClose={() => setIsToolkitOpen(false)} />}
    </div>
  );
}

// =========================================================================
// ASTRODYNAMICS HOMEWORK TOOLKIT OVERLAY
// =========================================================================

function AstrodynamicsToolkit({ onClose }) {
  const [activeTab, setActiveTab] = useState('elements');
  const [mu, setMu] = useState(398600);
  const [out, setOut] = useState(null);

  // States for Solvers
  const [seIn, setSeIn] = useState({ x: 4000, y: 4500, z: 5500, vx: -1.2, vy: 3.4, vz: 5.6 });
  const [esIn, setEsIn] = useState({ p: 1467, e: 0.82, i: 90, w: 260, W: 180, nu: 190 });
  const [seMode, setSeMode] = useState('toElements'); // 'toElements' or 'toState'
  
  const [tofIn, setTofIn] = useState({ a: 900000, e: 0.6, nu1: 190, nu2: 300 });
  const [lamIn, setLamIn] = useState({ r1: [1.25, 0, 0], r2: [-1.25, 0.2, 0], dt: 200, short: true });
  const [hohIn, setHohIn] = useState({ r1: 6771, r2: 42164, di: 28.5 });
  const [radIn, setRadIn] = useState({ lat: 30, lon: -97.5, range: 638, az: 30, el: 90, gst: 142.5 });
  const [flyIn, setFlyIn] = useState({ vinf: 7.5, ratm: 3522, paramType: 'delta', paramVal: 32 }); 
  const [gibbsIn, setGibbsIn] = useState({ r1: [5887, -3520, -1204], r2: [5572, -3457, -2376], r3: [5088, -3289, -3480] });
  const [j2In, setJ2In] = useState({ r: 7000, e: 0 }); 

  const mag = (v) => Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mult = (v, s) => [v[0]*s, v[1]*s, v[2]*s];

  const solveStateToElements = () => {
    const { x, y, z, vx, vy, vz } = seIn;
    const r = [Number(x), Number(y), Number(z)];
    const v = [Number(vx), Number(vy), Number(vz)];
    const m = Number(mu);

    const rMag = mag(r); const vMag = mag(v);
    const h = cross(r, v); const hMag = mag(h);
    const n = cross([0,0,1], h); const nMag = mag(n);
    
    const v2_u_r = vMag*vMag - m/rMag;
    const r_dot_v = dot(r, v);
    const eVec = [ (v2_u_r*r[0] - r_dot_v*v[0])/m, (v2_u_r*r[1] - r_dot_v*v[1])/m, (v2_u_r*r[2] - r_dot_v*v[2])/m ];
    const e = mag(eVec);
    
    const energy = vMag*vMag/2 - m/rMag;
    const a = Math.abs(energy) > 1e-8 ? -m / (2 * energy) : Infinity;
    const p = hMag*hMag / m;

    let i = Math.acos(h[2]/hMag) * 180/Math.PI;
    let Omega = nMag !== 0 ? Math.acos(n[0]/nMag) * 180/Math.PI : 0;
    if (n[1] < 0) Omega = 360 - Omega;
    
    let omega = (nMag !== 0 && e > 1e-8) ? Math.acos(Math.max(-1, Math.min(1, dot(n, eVec)/(nMag*e)))) * 180/Math.PI : 0;
    if (eVec[2] < 0) omega = 360 - omega;

    let nu = e > 1e-8 ? Math.acos(Math.max(-1, Math.min(1, dot(eVec, r)/(e*rMag)))) * 180/Math.PI : 0;
    if (r_dot_v < 0) nu = 360 - nu;

    setOut({ type: 'elements', a, e, i, Omega, omega, nu, p, h: hMag, energy });
  };

  const solveElementsToState = () => {
    const m = Number(mu);
    const { p: pN, e: eN, i: iN, W: WN, w: wN, nu: nuN } = esIn;
    const p = Number(pN), e = Number(eN), inc = Number(iN)*Math.PI/180;
    const W = Number(WN)*Math.PI/180, w = Number(wN)*Math.PI/180, nu = Number(nuN)*Math.PI/180;
    
    const r_pqw = [ p*Math.cos(nu)/(1+e*Math.cos(nu)), p*Math.sin(nu)/(1+e*Math.cos(nu)), 0 ];
    const v_pqw = [ -Math.sqrt(m/p)*Math.sin(nu), Math.sqrt(m/p)*(e+Math.cos(nu)), 0 ];
    
    const rot3 = (vec, ang, axis) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        let [x,y,z] = vec;
        if (axis===1) return [x, y*c-z*s, y*s+z*c];
        if (axis===3) return [x*c-y*s, x*s+y*c, z];
        return vec; 
    };
    
    const toIJK = (vec) => rot3(rot3(rot3(vec, -w, 3), -inc, 1), -W, 3);
    const r = toIJK(r_pqw), v = toIJK(v_pqw);
    setOut({ type: 'state', r, v, rm: mag(r), vm: mag(v) });
  };

  const solveTOF = () => {
    let { a, e, nu1, nu2 } = tofIn;
    const aN = Number(a), eN = Number(e), n1 = Number(nu1)*Math.PI/180, n2 = Number(nu2)*Math.PI/180;
    const m = Number(mu);
    let dt = 0;
    if (eN < 1) { 
        const E1 = 2 * Math.atan(Math.sqrt((1-eN)/(1+eN)) * Math.tan(n1/2));
        const E2 = 2 * Math.atan(Math.sqrt((1-eN)/(1+eN)) * Math.tan(n2/2));
        const M1 = E1 - eN * Math.sin(E1), M2 = E2 - eN * Math.sin(E2);
        const n = Math.sqrt(m / Math.pow(aN, 3));
        dt = (M2 - M1) / n;
        if (dt < 0) dt += 2*Math.PI/n;
    } else { 
        const F1 = 2 * Math.atanh(Math.sqrt((eN-1)/(eN+1)) * Math.tan(n1/2));
        const F2 = 2 * Math.atanh(Math.sqrt((eN-1)/(eN+1)) * Math.tan(n2/2));
        const M1 = eN * Math.sinh(F1) - F1, M2 = eN * Math.sinh(F2) - F2;
        const n = Math.sqrt(m / Math.pow(Math.abs(aN), 3));
        dt = (M2 - M1) / n;
    }
    setOut({ dt: Math.abs(dt) });
  };

  const solveGibbs = () => {
    const m = Number(mu);
    const R1 = gibbsIn.r1, R2 = gibbsIn.r2, R3 = gibbsIn.r3;
    const r1m = mag(R1), r2m = mag(R2), r3m = mag(R3);
    
    const Z12 = cross(R1, R2), Z23 = cross(R2, R3), Z31 = cross(R3, R1);
    const N = add(add(mult(Z23, r1m), mult(Z31, r2m)), mult(Z12, r3m));
    const D = add(add(Z12, Z23), Z31);
    const S = add(add(mult(R1, r2m-r3m), mult(R2, r3m-r1m)), mult(R3, r1m-r2m));
    const B = cross(D, R2);
    
    const Lg = Math.sqrt(m / (mag(N)*mag(D)));
    const v2 = mult(add(mult(B, 1/r2m), S), Lg);
    
    setOut({ v2, v2m: mag(v2) });
  };

  const solveLambert = () => {
    const { r1: R1, r2: R2, dt, short } = lamIn;
    const m = Number(mu);
    const scale = (mag(R1) < 10) ? 149597870 : 1;
    const r1 = R1.map(x => x * scale), r2 = R2.map(x => x * scale);
    const r1m = mag(r1), r2m = mag(r2);
    const cosDth = dot(r1, r2) / (r1m * r2m);
    const dth = short ? Math.acos(cosDth) : 2*Math.PI - Math.acos(cosDth);
    const A = Math.sin(dth) * Math.sqrt(r1m * r2m / (1 - cosDth));
    
    let z = 0, y = 0, C = 0, S = 0;
    const getCS = (z) => {
        if (z > 0) return [ (1-Math.cos(Math.sqrt(z)))/z, (Math.sqrt(z)-Math.sin(Math.sqrt(z)))/Math.sqrt(z**3) ];
        if (z < 0) return [ (1-Math.cosh(Math.sqrt(-z)))/z, (Math.sinh(Math.sqrt(-z))-Math.sqrt(-z))/Math.sqrt((-z)**3) ];
        return [ 1/2, 1/6 ];
    };

    for(let i=0; i<15; i++) {
        [C, S] = getCS(z);
        y = r1m + r2m + A * (z * S - 1) / Math.sqrt(C);
        const x = Math.sqrt(y / C);
        const t = (x**3 * S + A * Math.sqrt(y)) / Math.sqrt(m);
        const dtSec = dt * 86400;
        if (Math.abs(t - dtSec) < 1) break;
        z += (dtSec - t) / 100000; 
    }
    const f = 1 - y/r1m, g = A * Math.sqrt(y/m), gDot = 1 - y/r2m;
    const v1 = r1.map((x, i) => (r2[i] - f * x) / g);
    const v2 = r1.map((x, i) => (gDot * r2[i] - x) / g);
    setOut({ v1, v2, v1m: mag(v1), v2m: mag(v2) });
  };

  const solveRadar = () => {
    const { lat, lon, range, az, el, gst } = radIn;
    const R_EARTH = 6378.137, f = 1/298.257;
    const phi = lat * Math.PI/180, lam = lon * Math.PI/180, th = (gst + lon) * Math.PI/180;
    const rho = range, Az = az * Math.PI/180, El = el * Math.PI/180;
    
    const r_sez = [ -rho*Math.cos(El)*Math.cos(Az), rho*Math.cos(El)*Math.sin(Az), rho*Math.sin(El) ];
    const r_ijk = [
        (-Math.sin(th)*r_sez[1] - Math.sin(phi)*Math.cos(th)*r_sez[0] + Math.cos(phi)*Math.cos(th)*r_sez[2]),
        (Math.cos(th)*r_sez[1] - Math.sin(phi)*Math.sin(th)*r_sez[0] + Math.cos(phi)*Math.sin(th)*r_sez[2]),
        (Math.cos(phi)*r_sez[0] + Math.sin(phi)*r_sez[2])
    ];
    const C = R_EARTH / Math.sqrt(1 - (2*f - f*f) * Math.sin(phi)**2);
    const R_site = [ C*Math.cos(phi)*Math.cos(th), C*Math.cos(phi)*Math.sin(th), C*(1-f)**2*Math.sin(phi) ];
    const r = r_ijk.map((x, i) => x + R_site[i]);
    setOut({ r, rm: mag(r) });
  };

  const solveManeuver = () => {
    const { r1, r2, di } = hohIn;
    const m = Number(mu), r1n = Number(r1), r2n = Number(r2);
    const vc1 = Math.sqrt(m/r1n), vc2 = Math.sqrt(m/r2n), at = (r1n+r2n)/2;
    const vt1 = Math.sqrt(m*(2/r1n - 1/at)), vt2 = Math.sqrt(m*(2/r2n - 1/at));
    const dV1 = Math.abs(vt1 - vc1);
    const dV2 = Math.sqrt(vt2**2 + vc2**2 - 2*vt2*vc2*Math.cos(di*Math.PI/180));
    setOut({ dV1, dV2, dVT: dV1 + dV2, tof: Math.PI*Math.sqrt(at**3/m) });
  };

  const solveFlyby = () => {
    const m = Number(mu);
    const vinf = Number(flyIn.vinf), ratm = Number(flyIn.ratm), pVal = Number(flyIn.paramVal);
    let rp = 0, deltaDeg = 0, b = 0, e = 0, h = 0, gammaAtm = 0;
    
    if (flyIn.paramType === 'delta') {
        deltaDeg = pVal;
        e = 1 / Math.sin((deltaDeg*Math.PI/180)/2);
        rp = (m / (vinf*vinf)) * (e - 1);
        b = (m / (vinf*vinf)) * Math.sqrt(e*e - 1);
    } else if (flyIn.paramType === 'rp') {
        rp = pVal;
        e = 1 + (rp * vinf * vinf / m);
        deltaDeg = (2 * Math.asin(1/e)) * 180/Math.PI;
        b = rp * Math.sqrt(1 + (2*m)/(rp*vinf*vinf));
    } else if (flyIn.paramType === 'gamma') {
        gammaAtm = pVal;
        const vatm = Math.sqrt(vinf*vinf + 2*m/ratm);
        h = ratm * vatm * Math.cos(gammaAtm * Math.PI/180);
        b = h / vinf;
        const term = 2*m/(vinf*vinf);
        rp = (-term + Math.sqrt(term*term + 4*b*b)) / 2;
        e = 1 + (rp * vinf * vinf / m);
        deltaDeg = (2 * Math.asin(1/e)) * 180/Math.PI;
    }
    
    const vp = Math.sqrt(vinf*vinf + 2*m/rp);
    const dV = 2 * vinf * Math.sin((deltaDeg*Math.PI/180)/2);
    
    const vAtmActual = Math.sqrt(vinf*vinf + 2*m/ratm);
    const hActual = b * vinf;
    const gammaAtmActual = Math.acos(Math.max(-1, Math.min(1, hActual / (ratm * vAtmActual)))) * 180/Math.PI;

    setOut({ e, rp, vp, delta: deltaDeg, b, dV, vAtm: vAtmActual, gammaAtm: gammaAtmActual });
  };

  const solveJ2 = () => {
    const { r, e } = j2In;
    const rN = Number(r), eN = Number(e);
    const m = 398600, J2 = 1.08263e-3, RE = 6378.137;
    const a = rN / (1-eN), p = a*(1-eN*eN);
    const n = Math.sqrt(m/(a**3));
    const reqCosI = -(1.99106e-7 * p**2) / (1.5 * n * J2 * RE**2);
    const i = Math.acos(reqCosI) * 180/Math.PI;
    const regressionRate = -(1.5 * n * J2 * RE**2 * Math.cos(i*Math.PI/180)) / (p**2);
    setOut({ i, rate: regressionRate * (180/Math.PI) * 86400 }); 
  };

  const tabs = [
    { id: 'elements', n: 'State ↔ Elements' },
    { id: 'tof', n: 'Time of Flight' },
    { id: 'hohmann', n: 'Maneuvers' },
    { id: 'lambert', n: 'Lambert Solver' },
    { id: 'radar', n: 'Radar Site' },
    { id: 'gibbs', n: 'Gibbs (Orbit Det.)' },
    { id: 'flyby', n: 'Flyby / B-Plane' },
    { id: 'j2', n: 'J2 Perturbations' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-950 border-2 border-purple-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-200">
        <div className="flex justify-between items-center bg-slate-900 border-b border-purple-800 px-6 py-4"> <div className="flex items-center gap-3 text-purple-400"> <Calculator className="w-6 h-6" /> <h2 className="text-xl font-black tracking-widest uppercase">Astrodynamics Toolkit</h2> </div> <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 transition-colors"><X className="w-6 h-6" /></button> </div>
        <div className="bg-slate-900/50 px-6 py-2 border-b border-slate-800 flex items-center gap-4"> <span className="text-xs font-bold text-slate-400">MU (μ):</span> <input type="number" value={mu} onChange={e=>setMu(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-purple-300 font-mono w-32 text-xs outline-none" /> <span className="text-[10px] text-slate-500 italic">Earth: 398600 | Sun: 1.327e11</span> </div>
        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-56 bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-y-auto"> {tabs.map(t => ( <button key={t.id} onClick={() => {setActiveTab(t.id); setOut(null);}} className={`px-4 py-3 text-left font-bold text-xs transition-all border-l-4 ${activeTab === t.id ? 'bg-purple-900/30 text-purple-300 border-purple-500' : 'text-slate-500 border-transparent hover:bg-slate-800'}`}>{t.n}</button> ))} </div>
            
            {/* Content Body */}
            <div className="flex-1 p-6 overflow-y-auto">
                
                {/* 1. STATE <-> ELEMENTS */}
                {activeTab === 'elements' && (
                    <div className="space-y-4">
                        <div className="flex gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700 w-fit mb-4">
                            <button onClick={()=>{setSeMode('toElements'); setOut(null);}} className={`px-3 py-1 text-xs font-bold rounded ${seMode==='toElements'?'bg-purple-600 text-white':'text-slate-400'}`}>State {'->'} Elements</button>
                            <button onClick={()=>{setSeMode('toState'); setOut(null);}} className={`px-3 py-1 text-xs font-bold rounded ${seMode==='toState'?'bg-purple-600 text-white':'text-slate-400'}`}>Elements {'->'} State</button>
                        </div>

                        {seMode === 'toElements' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"> 
                                    <label className="text-[10px] font-bold text-slate-500">Position R Vector (km)</label> 
                                    <div className="flex gap-1"> {['x','y','z'].map((v,i)=><input key={v} type="number" value={seIn[v]} onChange={e=>setSeIn({...seIn, [v]:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" />)} </div> 
                                    <label className="text-[10px] font-bold text-slate-500 mt-2 block">Velocity V Vector (km/s)</label> 
                                    <div className="flex gap-1"> {['vx','vy','vz'].map((v,i)=><input key={v} type="number" value={seIn[v]} onChange={e=>setSeIn({...seIn, [v]:e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" />)} </div> 
                                    <button onClick={solveStateToElements} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-4">Calculate Elements</button>
                                </div>
                                {out && out.type === 'elements' && (
                                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-xs space-y-1">
                                        <div className="flex justify-between"><span className="text-slate-400">Semi-major (a):</span><span className="font-mono text-purple-300">{out.a.toFixed(2)} km</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Eccentricity (e):</span><span className="font-mono text-purple-300">{out.e.toFixed(5)}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Inclination (i):</span><span className="font-mono text-purple-300">{out.i.toFixed(3)}°</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">RAAN (Ω):</span><span className="font-mono text-purple-300">{out.Omega.toFixed(3)}°</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Arg. Periapsis (ω):</span><span className="font-mono text-purple-300">{out.omega.toFixed(3)}°</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">True Anomaly (ν):</span><span className="font-mono text-purple-300">{out.nu.toFixed(3)}°</span></div>
                                        <div className="border-t border-purple-500/30 my-2"></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Sp. Energy (ε):</span><span className="font-mono text-purple-300">{out.energy.toFixed(3)} km²/s²</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">Ang. Mom (h):</span><span className="font-mono text-purple-300">{out.h.toFixed(2)} km²/s</span></div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] text-slate-500 font-bold">Semi-latus Rectum, p<input type="number" value={esIn.p} onChange={e=>setEsIn({...esIn, p: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <label className="text-[10px] text-slate-500 font-bold">Eccentricity, e<input type="number" value={esIn.e} onChange={e=>setEsIn({...esIn, e: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <label className="text-[10px] text-slate-500 font-bold">Inclination, i (°)<input type="number" value={esIn.i} onChange={e=>setEsIn({...esIn, i: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <label className="text-[10px] text-slate-500 font-bold">RAAN, Ω (°)<input type="number" value={esIn.W} onChange={e=>setEsIn({...esIn, W: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <label className="text-[10px] text-slate-500 font-bold">Arg Peri, ω (°)<input type="number" value={esIn.w} onChange={e=>setEsIn({...esIn, w: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <label className="text-[10px] text-slate-500 font-bold">True Anomaly, ν (°)<input type="number" value={esIn.nu} onChange={e=>setEsIn({...esIn, nu: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                    <button onClick={solveElementsToState} className="col-span-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-2">Calculate State Vectors</button>
                                </div>
                                {out && out.type === 'state' && (
                                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-xs space-y-3 font-mono">
                                        <div><div className="text-slate-400 font-sans font-bold uppercase mb-1">R Vector (km)</div> [{out.r.map(x=>x.toFixed(3)).join(', ')}] <br/><span className="text-purple-300">|R| = {out.rm.toFixed(2)}</span></div>
                                        <div><div className="text-slate-400 font-sans font-bold uppercase mb-1">V Vector (km/s)</div> [{out.v.map(x=>x.toFixed(4)).join(', ')}] <br/><span className="text-purple-300">|V| = {out.vm.toFixed(3)}</span></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. TIME OF FLIGHT */}
                {activeTab === 'tof' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Solves Kepler's equation to find the Time of Flight (Δt) between any two true anomalies on a conic orbit.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"> 
                                <label className="text-[10px] text-slate-500 font-bold">Semi-major Axis, a (km)<input type="number" value={tofIn.a} onChange={e=>setTofIn({...tofIn, a: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Eccentricity, e<input type="number" value={tofIn.e} onChange={e=>setTofIn({...tofIn, e: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Anomaly 1, ν₁ (°)<input type="number" value={tofIn.nu1} onChange={e=>setTofIn({...tofIn, nu1: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Anomaly 2, ν₂ (°)<input type="number" value={tofIn.nu2} onChange={e=>setTofIn({...tofIn, nu2: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <button onClick={solveTOF} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-2">Calculate TOF</button>
                            </div>
                            {out && (
                                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 flex flex-col justify-center items-center text-center">
                                    <h3 className="text-sm font-bold text-slate-400 mb-2 uppercase">Time of Flight (Δt)</h3>
                                    <div className="text-3xl font-mono text-white mb-2">{out.dt.toFixed(2)} s</div>
                                    <div className="text-purple-300 font-mono">{(out.dt/60).toFixed(2)} min</div>
                                    <div className="text-purple-300 font-mono">{(out.dt/3600).toFixed(2)} hrs</div>
                                    <div className="text-purple-300 font-mono">{(out.dt/86400).toFixed(2)} days</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. MANEUVERS */}
                {activeTab === 'hohmann' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Calculates $\Delta V$ requirements for a Hohmann transfer, including optional inclination plane changes.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 font-bold">R1 (km)<input type="number" value={hohIn.r1} onChange={e=>setHohIn({...hohIn, r1: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">R2 (km)<input type="number" value={hohIn.r2} onChange={e=>setHohIn({...hohIn, r2: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Inclination Change (deg) at Apoapsis<input type="number" value={hohIn.di} onChange={e=>setHohIn({...hohIn, di: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <button onClick={solveManeuver} className="w-full bg-purple-600 font-bold py-2 rounded text-xs mt-2">Calculate Maneuver</button>
                            </div>
                            {out && <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg text-xs font-mono space-y-2"> 
                                <div className="flex justify-between text-slate-300"><span>Departure ΔV₁:</span><span>{out.dV1.toFixed(4)} km/s</span></div> 
                                <div className="flex justify-between text-slate-300"><span>Arrival ΔV₂ (inc Plane Change):</span><span>{out.dV2.toFixed(4)} km/s</span></div> 
                                <div className="border-t border-purple-500/30 my-1"></div>
                                <div className="flex justify-between font-bold text-purple-400 text-sm"><span>Total ΔV:</span><span>{out.dVT.toFixed(4)} km/s</span></div> 
                                <div className="flex justify-between text-slate-400 mt-2"><span>Time of Flight:</span><span>{(out.tof/3600).toFixed(2)} hours</span></div> 
                            </div>}
                        </div>
                    </div>
                )}

                {/* 4. LAMBERT */}
                {activeTab === 'lambert' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Given 2 position vectors and a time interval (TOF), find the required velocities. Uses universal variables for numerical stability.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"> 
                                <label className="text-[10px] font-bold text-slate-500">R1 Vector (km or AU)</label> <div className="flex gap-1"> {['x','y','z'].map((v,i)=><input key={i} type="number" value={lamIn.r1[i]} onChange={e=>{let n=[...lamIn.r1]; n[i]=Number(e.target.value); setLamIn({...lamIn, r1: n})}} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" />)} </div> 
                                <label className="text-[10px] font-bold text-slate-500 block mt-2">R2 Vector (km or AU)</label> <div className="flex gap-1"> {['x','y','z'].map((v,i)=><input key={i} type="number" value={lamIn.r2[i]} onChange={e=>{let n=[...lamIn.r2]; n[i]=Number(e.target.value); setLamIn({...lamIn, r2: n})}} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" />)} </div> 
                                <div className="flex gap-2 items-end mt-2">
                                    <label className="flex-1 flex flex-col text-[10px] font-bold text-slate-500">Time of Flight (Days)<input type="number" value={lamIn.dt} onChange={e=>setLamIn({...lamIn, dt: e.target.value})} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono mt-1" /></label>
                                    <label className="flex-1 flex items-center gap-2 text-xs text-slate-400 font-bold bg-slate-900 border border-slate-700 rounded p-1 cursor-pointer select-none h-[26px]">
                                        <input type="checkbox" checked={lamIn.short} onChange={e=>setLamIn({...lamIn, short: e.target.checked})} className="cursor-pointer" /> Short Way
                                    </label>
                                </div>
                                <button onClick={solveLambert} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-2">Solve Lambert</button>
                            </div>
                            {out && <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg text-xs font-mono space-y-3"> 
                                <div><span className="text-slate-400 font-bold uppercase block mb-1">Departure V1:</span> [{out.v1.map(x=>x.toFixed(4)).join(', ')}] km/s<br/><span className="text-purple-300">Mag: {out.v1m.toFixed(4)} km/s</span></div> 
                                <div><span className="text-slate-400 font-bold uppercase block mb-1">Arrival V2:</span> [{out.v2.map(x=>x.toFixed(4)).join(', ')}] km/s<br/><span className="text-purple-300">Mag: {out.v2m.toFixed(4)} km/s</span></div> 
                            </div>}
                        </div>
                    </div>
                )}

                {/* 5. RADAR */}
                {activeTab === 'radar' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Convert Radar data (Range, Az, El) from a ground site into geocentric equatorial IJK state vectors. Accounts for Earth oblateness.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid grid-cols-3 gap-2">
                                <label className="text-[10px] text-slate-500 font-bold">Lat (deg)<input type="number" onChange={e=>setRadIn({...radIn, lat: Number(e.target.value)})} value={radIn.lat} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Lon (deg)<input type="number" onChange={e=>setRadIn({...radIn, lon: Number(e.target.value)})} value={radIn.lon} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">GST (deg)<input type="number" onChange={e=>setRadIn({...radIn, gst: Number(e.target.value)})} value={radIn.gst} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Range (km)<input type="number" onChange={e=>setRadIn({...radIn, range: Number(e.target.value)})} value={radIn.range} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Az (deg)<input type="number" onChange={e=>setRadIn({...radIn, az: Number(e.target.value)})} value={radIn.az} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">El (deg)<input type="number" onChange={e=>setRadIn({...radIn, el: Number(e.target.value)})} value={radIn.el} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <button onClick={solveRadar} className="col-span-3 bg-purple-600 font-bold py-2 rounded text-xs mt-2">Get State Vector</button>
                            </div>
                            {out && <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg text-xs font-mono flex flex-col justify-center text-center space-y-2"> 
                                <div className="text-slate-400 font-bold uppercase">Geocentric R_IJK Vector</div>
                                <div className="text-lg text-white">[{out.r.map(x=>x.toFixed(2)).join(', ')}] km</div> 
                                <div className="text-purple-300 font-bold">|R| Magnitude: {out.rm.toFixed(2)} km</div> 
                            </div>}
                        </div>
                    </div>
                )}

                {/* 6. GIBBS */}
                {activeTab === 'gibbs' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Given 3 sequential position vectors (r₁, r₂, r₃), the Gibbs method solves for the velocity vector v₂ at the middle point.</p>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <div className="grid grid-cols-3 gap-2 mb-2 text-center text-[10px] font-bold text-slate-400 uppercase border-b border-slate-800 pb-1"> <span>Vector r₁ (km)</span> <span>Vector r₂ (km)</span> <span>Vector r₃ (km)</span> </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {['x','y','z'].map((v, axisIdx) => (
                                        <React.Fragment key={v}>
                                            <div className="flex items-center gap-1"><span className="text-[10px] text-slate-500 font-bold w-2">{v.toUpperCase()}</span><input type="number" value={gibbsIn.r1[axisIdx]} onChange={e=>{let n=[...gibbsIn.r1]; n[axisIdx]=Number(e.target.value); setGibbsIn({...gibbsIn, r1: n})}} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" /></div>
                                            <div className="flex items-center gap-1"><span className="text-[10px] text-slate-500 font-bold w-2">{v.toUpperCase()}</span><input type="number" value={gibbsIn.r2[axisIdx]} onChange={e=>{let n=[...gibbsIn.r2]; n[axisIdx]=Number(e.target.value); setGibbsIn({...gibbsIn, r2: n})}} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" /></div>
                                            <div className="flex items-center gap-1"><span className="text-[10px] text-slate-500 font-bold w-2">{v.toUpperCase()}</span><input type="number" value={gibbsIn.r3[axisIdx]} onChange={e=>{let n=[...gibbsIn.r3]; n[axisIdx]=Number(e.target.value); setGibbsIn({...gibbsIn, r3: n})}} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" /></div>
                                        </React.Fragment>
                                    ))}
                                </div>
                                <button onClick={solveGibbs} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-4">Solve via Gibbs Method</button>
                            </div>
                            {out && (
                                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 text-center">
                                    <h3 className="text-xs font-bold text-purple-400 mb-2 uppercase">Middle Velocity Vector (v₂)</h3>
                                    <div className="text-lg font-mono text-white tracking-widest bg-slate-950/50 py-3 rounded mb-2 border border-slate-800">
                                        [{out.v2[0].toFixed(4)}, &nbsp; {out.v2[1].toFixed(4)}, &nbsp; {out.v2[2].toFixed(4)}] km/s
                                    </div>
                                    <span className="text-slate-400 text-sm">Magnitude |v₂|: </span><span className="font-mono font-bold text-purple-300 text-sm">{out.v2m.toFixed(4)} km/s</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 7. FLYBY */}
                {activeTab === 'flyby' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Solves hyperbolic planetary flybys and B-Plane Atmospheric Intercepts. Input V_∞ and choose your target parameter (Periapsis, Turning Angle, or Atmospheric Entry Angle).</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 font-bold">Approach V_∞ (km/s)<input type="number" value={flyIn.vinf} onChange={e=>setFlyIn({...flyIn, vinf: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Target Planet Atm. Radius (km)<input type="number" value={flyIn.ratm} onChange={e=>setFlyIn({...flyIn, ratm: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" title="Used to calculate entry flight path angle. Mars = 3522km" /></label>
                                
                                <div className="border-t border-slate-800 mt-3 pt-2">
                                    <label className="text-[10px] text-purple-400 font-bold mb-1 block uppercase">Select Target Parameter:</label>
                                    <select value={flyIn.paramType} onChange={e=>setFlyIn({...flyIn, paramType: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white outline-none mb-1">
                                        <option value="delta">Turning Angle, δ (°)</option>
                                        <option value="rp">Periapsis Altitude, rp (km)</option>
                                        <option value="gamma">Atmospheric Entry FPA, γ (°)</option>
                                    </select>
                                    <input type="number" value={flyIn.paramVal} onChange={e=>setFlyIn({...flyIn, paramVal: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono" />
                                </div>
                                <button onClick={solveFlyby} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-2">Calculate Hyperbola</button>
                            </div>
                            {out && (
                                <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg text-xs font-mono space-y-2"> 
                                    <div className="flex justify-between text-slate-300"><span>Eccentricity (e):</span><span>{out.e.toFixed(5)}</span></div>
                                    <div className="flex justify-between text-slate-300"><span>Turning Angle (δ):</span><span>{out.delta.toFixed(2)}°</span></div>
                                    <div className="flex justify-between text-slate-300"><span>Periapsis (rp):</span><span>{out.rp.toFixed(1)} km</span></div>
                                    <div className="flex justify-between text-slate-300"><span>Periapsis Vel (vp):</span><span>{out.vp.toFixed(3)} km/s</span></div>
                                    <div className="flex justify-between font-bold text-indigo-300 mt-2"><span>Impact Param (b):</span><span>{out.b.toFixed(1)} km</span></div>
                                    <div className="flex justify-between font-bold text-orange-300"><span>Req. Flyby ΔV:</span><span>{out.dV.toFixed(4)} km/s</span></div>
                                    
                                    <div className="border-t border-purple-500/30 my-2 pt-1 text-[10px] text-slate-500 font-sans font-bold uppercase">Atmospheric Interface (r = {flyIn.ratm})</div>
                                    <div className="flex justify-between text-slate-300"><span>Entry Velocity:</span><span>{out.vAtm.toFixed(3)} km/s</span></div>
                                    <div className="flex justify-between text-slate-300"><span>Entry Angle (γ):</span><span>{out.gammaAtm.toFixed(2)}°</span></div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 8. J2 PERTURBATIONS */}
                {activeTab === 'j2' && (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 border-l-2 border-purple-500 pl-2">Calculates J2 Perturbations for Earth orbits. Enter orbital parameters to find the required inclination for a Sun-Synchronous orbit (regression rate of 0.9856°/day).</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 font-bold">Periapsis Radius, r (km)<input type="number" value={j2In.r} onChange={e=>setJ2In({...j2In, r: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <label className="text-[10px] text-slate-500 font-bold">Eccentricity, e<input type="number" value={j2In.e} onChange={e=>setJ2In({...j2In, e: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs" /></label>
                                <button onClick={solveJ2} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs mt-4">Solve Sun-Synchronous</button>
                            </div>
                            {out && (
                                <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg text-xs flex flex-col justify-center items-center text-center space-y-2"> 
                                    <div className="text-slate-400 font-bold uppercase mb-2">Required Inclination</div>
                                    <div className="text-3xl font-mono text-white">{out.i.toFixed(3)}°</div>
                                    <div className="text-[10px] text-purple-300 mt-2">Calculated Nodal Regression Rate:<br/>{out.rate.toFixed(4)} °/day</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
}
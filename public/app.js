// ============================================================
// Loading sequence
// ============================================================
(function loadingSequence() {
  const loader = document.getElementById('loader');
  const pct = document.getElementById('loaderPct');
  let p = 0;
  const timer = setInterval(() => {
    p += Math.random() * 18 + 6;
    if (p >= 100) {
      p = 100;
      pct.textContent = '100%';
      clearInterval(timer);
      setTimeout(() => {
        loader.classList.add('done');
        document.body.classList.remove('loading');
      }, 250);
      return;
    }
    pct.textContent = String(Math.floor(p)).padStart(2, '0') + '%';
  }, 140);
})();

// ============================================================
// Custom cursor
// ============================================================
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
const cursorLabel = document.getElementById('cursorLabel');

let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
let ringX = mouseX, ringY = mouseY;

if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursorDot.style.left = mouseX + 'px';
    cursorDot.style.top = mouseY + 'px';
  });

  (function animateRing() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.left = ringX + 'px';
    cursorRing.style.top = ringY + 'px';
    requestAnimationFrame(animateRing);
  })();

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-cursor], a, button, input, textarea, label');
    if (!target) return;
    const label = target.getAttribute('data-cursor');
    if (label) {
      cursorLabel.textContent = label;
      cursorRing.classList.add('hover');
    } else if (target.matches('a,button')) {
      cursorRing.classList.add('hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-cursor], a, button, input, textarea, label');
    if (!target) return;
    cursorLabel.textContent = '';
    cursorRing.classList.remove('hover');
  });
}

// ============================================================
// AI CORE — the fragmented geometric object driving the cinematic
// intro. Scroll (via GSAP ScrollTrigger, scrubbed against #cinema)
// moves the camera toward it, breaks it into particles, and fades
// each hero sentence in turn.
// ============================================================
const coreScene = (function initCore() {
  const canvas = document.getElementById('core-canvas');
  if (!canvas || !window.THREE) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 26);

  // Core: an icosahedron wireframe standing in for "AI core / neural node".
  const coreGeo = new THREE.IcosahedronGeometry(3.1, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x9b86ff, wireframe: true, transparent: true, opacity: 0.85 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  const glowGeo = new THREE.IcosahedronGeometry(3.4, 1);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x5a3fe0, wireframe: true, transparent: true, opacity: 0.18 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  scene.add(glow);

  // Particle shell around the core — these are what the core "breaks
  // apart into" as the camera moves through it during scroll.
  const isMobile = window.innerWidth < 760;
  const pCount = isMobile ? 300 : 900;
  const basePositions = new Float32Array(pCount * 3);
  const shufflePositions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 3.2 + Math.random() * 1.4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    basePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    basePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    basePositions[i * 3 + 2] = r * Math.cos(phi);

    shufflePositions[i * 3] = (Math.random() - 0.5) * 30;
    shufflePositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    shufflePositions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(basePositions.slice(), 3));
  const pMat = new THREE.PointsMaterial({ color: 0xd8cfff, size: 0.045, transparent: true, opacity: 0.85 });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // 0 = far away, idle core. 1 = camera has pushed through, particles
  // scattered into the "app" void, core dissolved.
  let progress = 0;
  function setProgress(v) { progress = Math.max(0, Math.min(1, v)); }

  function tick() {
    core.rotation.y += 0.0016;
    core.rotation.x += 0.0006;
    glow.rotation.y -= 0.001;

    camera.position.z = 26 - progress * 22;
    camera.position.x += (mx * 1.4 - camera.position.x) * 0.03;
    camera.position.y += (-my * 1.0 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);

    core.material.opacity = 0.85 * (1 - Math.min(progress * 1.6, 1));
    glow.material.opacity = 0.18 * (1 - Math.min(progress * 1.6, 1));
    core.scale.setScalar(1 + progress * 1.4);
    glow.scale.setScalar(1 + progress * 1.4);

    const posAttr = particles.geometry.attributes.position;
    for (let i = 0; i < pCount; i++) {
      const ix = i * 3;
      posAttr.array[ix] = THREE.MathUtils.lerp(basePositions[ix], shufflePositions[ix], progress);
      posAttr.array[ix + 1] = THREE.MathUtils.lerp(basePositions[ix + 1], shufflePositions[ix + 1], progress);
      posAttr.array[ix + 2] = THREE.MathUtils.lerp(basePositions[ix + 2], shufflePositions[ix + 2], progress);
    }
    posAttr.needsUpdate = true;
    particles.material.opacity = 0.85 * (1 - progress * 0.7);
    particles.rotation.y += 0.0009;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  return { setProgress };
})();

// ============================================================
// Ambient starfield behind the rest of the page (below/after the
// cinematic section) — subtle, cheap, always-on parallax.
// ============================================================
(function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || !window.THREE) return;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 18;

  const isMobile = window.innerWidth < 760;
  const count = isMobile ? 140 : 360;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x9b86ff, size: 0.055, transparent: true, opacity: 0.45 });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function tick() {
    points.rotation.y += 0.0004;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
})();

// ============================================================
// Cinematic scroll sequence — GSAP ScrollTrigger scrubs the pinned
// #cinema section: camera pushes into the AI core, the core breaks
// into particles, and the hero sentences cross-fade in turn.
// ============================================================
(function initCinemaScroll() {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const frames = gsap.utils.toArray('.cinema-frame');
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#cinema',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => {
        if (coreScene) coreScene.setProgress(self.progress);
      },
    },
  });

  frames.forEach((frame, i) => {
    if (i === 0) return; // intro frame starts visible
    const prev = frames[i - 1];
    tl.to(prev, { opacity: 0, duration: 0.6 }, `frame${i}`);
    tl.fromTo(frame, { opacity: 0 }, { opacity: 1, duration: 0.6 }, `frame${i}+=0.05`);
    tl.to({}, { duration: 0.9 }); // hold
  });
})();

// ============================================================
// AI processing network visualization (shown inside the overlay
// during recruiter lookup / resume tailoring / email generation).
// ============================================================
const networkViz = (function initNetworkViz() {
  const canvas = document.getElementById('network-canvas');
  if (!canvas || !window.THREE) return { start() {}, stop() {} };

  let renderer, scene, camera, nodes, lines, raf;
  const labels = ['PERSON', 'COMPANY', 'ROLE', 'SKILLS', 'EXPERIENCE', 'CONTACT', 'RESUME'];

  function setup() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 14;

    const nodeCount = labels.length + 10;
    const nodePositions = [];
    for (let i = 0; i < nodeCount; i++) {
      nodePositions.push(new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      ));
    }

    const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodePositions);
    const nodeMat = new THREE.PointsMaterial({ color: 0xb7a6ff, size: 0.14, transparent: true, opacity: 0.9 });
    nodes = new THREE.Points(nodeGeo, nodeMat);
    scene.add(nodes);

    const linePositions = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (Math.random() < 0.12) {
          linePositions.push(nodePositions[i].x, nodePositions[i].y, nodePositions[i].z);
          linePositions.push(nodePositions[j].x, nodePositions[j].y, nodePositions[j].z);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.28 });
    lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);
  }

  function tick() {
    nodes.rotation.y += 0.0022;
    lines.rotation.y += 0.0022;
    nodes.rotation.x += 0.0006;
    lines.rotation.x += 0.0006;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (!renderer) setup();
      cancelAnimationFrame(raf);
      tick();
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
})();

// ============================================================
// App workflow
// ============================================================
const $ = (id) => document.getElementById(id);

const state = {
  sessionId: null,
  recruiter: null,
  resumeUploaded: false,
  role: null,
};

function showPanel(n) {
  document.querySelectorAll('.panel').forEach((p) => p.removeAttribute('data-active'));
  $(`panel-${n}`).setAttribute('data-active', 'true');
  document.querySelectorAll('.rail-step').forEach((s) => {
    const step = Number(s.dataset.step);
    s.classList.toggle('active', step === n);
    s.classList.toggle('done', step < n);
  });
  $(`panel-${n}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function overlay(show, status) {
  const el = $('overlay');
  if (show) {
    $('overlayStatus').textContent = status || 'Working…';
    el.hidden = false;
    networkViz.start();
  } else {
    el.hidden = true;
    networkViz.stop();
  }
}

async function stepOverlay(messages, fn) {
  overlay(true, messages[0]);
  let i = 0;
  const interval = setInterval(() => {
    i = (i + 1) % messages.length;
    $('overlayStatus').textContent = messages[i];
  }, 900);
  try {
    return await fn();
  } finally {
    clearInterval(interval);
    overlay(false);
  }
}

function setError(id, msg) {
  $(id).textContent = msg || '';
}

document.getElementById("enterAppBtn").addEventListener("click", (e) => { e.preventDefault(); showPanel(1); });
// ---- Step 1: find recruiter ----
$('btnFindRecruiter').addEventListener('click', async () => {
  setError('err-1', '');
  const url = $('linkedinUrl').value.trim();
  if (!url) return setError('err-1', 'Please enter a LinkedIn profile URL.');

  try {
    const data = await stepOverlay(
      ['Connecting…', 'Reading profile…', 'Identifying company…', 'Finding contact…'],
      () => fetch('/api/find-recruiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_url: url }),
      }).then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    );

    if (!data.ok) {
      setError('err-1', data.body.error || 'Something went wrong.');
      return;
    }

    state.sessionId = data.body.session_id;
    state.recruiter = data.body.recruiter;

    $('rName').textContent = state.recruiter.name || 'Unknown';
    $('rTitle').textContent = state.recruiter.title || '—';
    $('rCompany').textContent = state.recruiter.company || '—';
    $('rEmail').textContent = state.recruiter.email || 'Not found';
    $('rEmailWarn').hidden = !!state.recruiter.email;
    $('recruiterCard').hidden = false;
  } catch (e) {
    setError('err-1', 'Network error. Please try again.');
  }
});

$('btnToResume').addEventListener('click', () => showPanel(2));

// ---- Step 2: resume upload ----
const dropzone = $('dropzone');
const resumeFile = $('resumeFile');

dropzone.addEventListener('click', () => resumeFile.click());
['dragover', 'dragenter'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag'); })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) { resumeFile.files = e.dataTransfer.files; handleResumeFile(file); }
});
resumeFile.addEventListener('change', () => {
  if (resumeFile.files[0]) handleResumeFile(resumeFile.files[0]);
});

async function handleResumeFile(file) {
  setError('err-2', '');
  $('resumeSuccess').hidden = true;
  $('dropzoneLabel').textContent = file.name;

  const formData = new FormData();
  formData.append('resume', file);
  formData.append('session_id', state.sessionId);

  try {
    const res = await fetch('/api/upload-resume', { method: 'POST', body: formData });
    const body = await res.json();
    if (!res.ok) {
      setError('err-2', body.error || 'Failed to process resume.');
      return;
    }
    state.resumeUploaded = true;
    $('resumeSuccess').hidden = false;
    $('btnToRole').disabled = false;
  } catch (e) {
    setError('err-2', 'Network error. Please try again.');
  }
}

$('btnToRole').addEventListener('click', async () => {
  showPanel(3);
  overlay(true, 'Understanding the role…');
  try {
    const res = await fetch('/api/detect-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId }),
    });
    const role = await res.json();
    overlay(false);

    if (role.confident) {
      state.role = role;
      $('roleHeading').textContent = `Applying for ${role.role_title}`;
      $('roleHint').textContent = `at ${state.recruiter.company || 'this company'}. You can adjust the role below if needed.`;
      $('jobTitle').value = role.role_title;
      if (role.role_description) $('jobDescription').value = role.role_description;
    } else {
      $('roleHeading').textContent = 'What role are you applying for?';
      $('roleHint').textContent = "We couldn't confidently determine the role from this profile — please tell us.";
    }
    $('roleFields').hidden = false;
  } catch (e) {
    overlay(false);
    $('roleHeading').textContent = 'What role are you applying for?';
    $('roleFields').hidden = false;
  }
});

// ---- Step 3 -> generate ----
$('btnGenerate').addEventListener('click', async () => {
  setError('err-3', '');
  const jobTitle = $('jobTitle').value.trim();
  const jobDescription = $('jobDescription').value.trim();

  if (!jobTitle) {
    $('roleFields').hidden = false;
    return setError('err-3', 'Please tell us what role you are applying for.');
  }

  try {
    const data = await stepOverlay(
      ['Analyzing your resume…', 'Tailoring for the role…', 'Matching terminology…', 'Writing your outreach email…'],
      () => fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.sessionId, job_title: jobTitle, job_description: jobDescription }),
      }).then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    );

    if (!data.ok) {
      setError('err-3', data.body.error || 'Something went wrong generating your outreach.');
      return;
    }

    renderResults(data.body);
    showPanel(4);
  } catch (e) {
    setError('err-3', 'Network error. Please try again.');
  }
});

function renderResults(result) {
  $('genCompany').textContent = result.recruiter.company || '—';
  $('genRole').textContent = result.role.role_title || '—';

  $('downloadPdf').href = `/api/download/resume.pdf?session_id=${state.sessionId}`;
  $('downloadDocx').href = `/api/download/resume.docx?session_id=${state.sessionId}`;
  $('downloadEml').href = `/api/download/email.eml?session_id=${state.sessionId}`;

  $('emailTo').textContent = result.recruiter.email || 'Not found — add manually';
  $('emailSubject').textContent = result.email.subject || '—';
  $('emailBody').textContent = result.email.body || '—';

  $('openGmail').href = result.gmail_compose_url;
}

$('btnRestart').addEventListener('click', () => {
  state.sessionId = null;
  state.recruiter = null;
  state.resumeUploaded = false;
  state.role = null;

  $('linkedinUrl').value = '';
  $('recruiterCard').hidden = true;
  $('dropzoneLabel').textContent = 'Drop your resume here, or click to browse';
  $('resumeSuccess').hidden = true;
  $('btnToRole').disabled = true;
  $('jobTitle').value = '';
  $('jobDescription').value = '';
  $('roleFields').hidden = true;

  showPanel(1);
});

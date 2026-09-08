(function(){
  "use strict";

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================ */
  /* NAV                                                            */
  /* ============================================================ */
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  function onScrollNav(){
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  navToggle.addEventListener('click', function(){
    var open = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.nav-links a').forEach(function(a){
    a.addEventListener('click', function(){ document.body.classList.remove('nav-open'); });
  });

  /* ============================================================ */
  /* THREE.JS — audio core                                         */
  /* ============================================================ */
  var stage = document.getElementById('webglStage');
  var canvas = document.getElementById('core-canvas');
  var three = null;
  var sceneActive = true;

  function initThree(){
    if (typeof THREE === 'undefined') return null;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 9);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    var group = new THREE.Group();
    scene.add(group);
    group.position.x = 1.6;

    /* --- distorted wireframe core --- */
    var coreGeo = new THREE.IcosahedronGeometry(2.1, 3);
    var basePositions = Float32Array.from(coreGeo.attributes.position.array);
    var coreMat = new THREE.MeshBasicMaterial({ color: 0xE2703A, wireframe: true, transparent: true, opacity: 0.55 });
    var core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    /* --- inner glow --- */
    var glowGeo = new THREE.IcosahedronGeometry(1.25, 1);
    var glowMat = new THREE.MeshBasicMaterial({ color: 0x55D8DE, transparent: true, opacity: 0.16 });
    var glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);

    /* --- metallic rings --- */
    var ringGroup = new THREE.Group();
    group.add(ringGroup);
    var ringDefs = [
      { r: 3.0, tube: 0.02, rx: 1.1, ry: 0.2 },
      { r: 3.5, tube: 0.015, rx: -0.5, ry: 1.3 },
      { r: 4.0, tube: 0.012, rx: 0.3, ry: -0.8 }
    ];
    var rings = ringDefs.map(function(d){
      var geo = new THREE.TorusGeometry(d.r, d.tube, 16, 100);
      var mat = new THREE.MeshStandardMaterial({ color: 0xB85A2E, metalness: 0.9, roughness: 0.28, emissive: 0x2a1006, emissiveIntensity: 0.4 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = d.rx;
      mesh.rotation.y = d.ry;
      ringGroup.add(mesh);
      return mesh;
    });

    /* --- particles --- */
    var particleCount = window.innerWidth < 700 ? 260 : 700;
    var particleGeo = new THREE.BufferGeometry();
    var particlePos = new Float32Array(particleCount * 3);
    for (var i = 0; i < particleCount; i++){
      var radius = 6 + Math.random() * 4;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos((Math.random() * 2) - 1);
      particlePos[i*3]   = radius * Math.sin(phi) * Math.cos(theta);
      particlePos[i*3+1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePos[i*3+2] = radius * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    var particleMat = new THREE.PointsMaterial({ color: 0x9BA3AB, size: 0.028, transparent: true, opacity: 0.55, sizeAttenuation: true });
    var particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* --- lighting --- */
    scene.add(new THREE.AmbientLight(0x404040, 1.1));
    var copperLight = new THREE.PointLight(0xE2703A, 6, 18);
    copperLight.position.set(4, 3, 4);
    scene.add(copperLight);
    var cyanLight = new THREE.PointLight(0x55D8DE, 3.5, 18);
    cyanLight.position.set(-4, -2, 3);
    scene.add(cyanLight);

    /* --- interaction state --- */
    var mouse = { x: 0, y: 0 };
    window.addEventListener('mousemove', function(e){
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    function onResize(){
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    return {
      scene: scene, camera: camera, renderer: renderer, group: group,
      core: core, coreGeo: coreGeo, basePositions: basePositions,
      glow: glow, ringGroup: ringGroup, rings: rings, particles: particles,
      mouse: mouse, scrollProgress: 0
    };
  }

  function distortCore(t){
    var pos = three.coreGeo.attributes.position;
    var base = three.basePositions;
    for (var i = 0; i < pos.count; i++){
      var ix = i * 3;
      var bx = base[ix], by = base[ix+1], bz = base[ix+2];
      var len = Math.sqrt(bx*bx + by*by + bz*bz) || 1;
      var nx = bx/len, ny = by/len, nz = bz/len;
      var noise = Math.sin(bx*1.6 + t*0.6) * Math.cos(by*1.6 + t*0.4) * 0.16
                + Math.sin(bz*2.1 + t*0.9) * 0.1;
      var r = len + noise;
      pos.setXYZ(i, nx*r, ny*r, nz*r);
    }
    pos.needsUpdate = true;
  }

  var targetRotX = 0, targetRotY = 0;

  function tick(time){
    requestAnimationFrame(tick);
    if (!three || !sceneActive) return;
    var t = time * 0.001;

    if (!reduceMotion) distortCore(t);

    three.ringGroup.rotation.x += 0.0016;
    three.ringGroup.rotation.y += 0.0011;
    three.rings[1].rotation.z += 0.0009;
    three.glow.rotation.y -= 0.0007;
    three.particles.rotation.y += 0.00035;

    if (!reduceMotion){
      targetRotX = three.mouse.y * 0.1 + three.scrollProgress * 0.25;
      targetRotY = three.mouse.x * 0.14;
      three.group.rotation.x += (targetRotX - three.group.rotation.x) * 0.035;
      three.group.rotation.y += (targetRotY - three.group.rotation.y) * 0.035;
    }

    three.renderer.render(three.scene, three.camera);
  }

  window.addEventListener('load', function(){
    try {
      three = initThree();
    } catch (err) {
      three = null;
    }
    if (three){
      requestAnimationFrame(tick);
      stage.classList.add('on');
    }
    setTimeout(function(){
      document.getElementById('loader').classList.add('hidden');
      playHeroIntro();
    }, 350);
  });

  /* pause rendering once the (opaque) technology section reaches the top of the viewport */
  var technologyEl = document.getElementById('technology');
  function updateSceneActive(){
    if (!technologyEl) return;
    sceneActive = technologyEl.getBoundingClientRect().top > 0;
  }
  window.addEventListener('scroll', updateSceneActive, { passive: true });
  window.addEventListener('resize', updateSceneActive);

  /* ============================================================ */
  /* HERO INTRO (single orchestrated entrance)                     */
  /* ============================================================ */
  function playHeroIntro(){
    if (typeof gsap === 'undefined') return;
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.to('.hero-title .line span', { y: '0%', duration: 1, stagger: 0.12 })
      .to('.hero-sub', { opacity: 1, y: 0, duration: 0.8 }, '-=0.5')
      .to('.hero-actions', { opacity: 1, y: 0, duration: 0.8 }, '-=0.55')
      .to('.scroll-cue', { opacity: 1, duration: 0.8 }, '-=0.4');
  }

  /* ============================================================ */
  /* GSAP SCROLL-DRIVEN SECTIONS                                   */
  /* ============================================================ */
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined'){
    gsap.registerPlugin(ScrollTrigger);
    var mm = gsap.matchMedia();

    /* ---- Philosophy: pinned narrative ---- */
    mm.add('(min-width: 900px)', function(){
      var panels = gsap.utils.toArray('.phil-panel');
      var dots = gsap.utils.toArray('.phil-progress .dot');

      var st = ScrollTrigger.create({
        trigger: '.philosophy',
        start: 'top top',
        end: '+=' + (panels.length * 90) + '%',
        pin: true,
        scrub: 0.4,
        onUpdate: function(self){
          var idx = Math.min(panels.length - 1, Math.floor(self.progress * panels.length));
          panels.forEach(function(p, i){ p.classList.toggle('active', i === idx); });
          dots.forEach(function(d, i){ d.classList.toggle('active', i === idx); });
          if (three) three.scrollProgress = self.progress;
        }
      });

      return function(){ st.kill(); };
    });

    /* ---- Products: horizontal scroll-jack ---- */
    mm.add('(min-width: 900px)', function(){
      var track = document.getElementById('productsTrack');
      var getDistance = function(){ return track.scrollWidth - window.innerWidth + 1; };

      var tween = gsap.to(track, {
        x: function(){ return -getDistance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: '.products',
          start: 'top top',
          end: function(){ return '+=' + getDistance(); },
          scrub: true,
          pin: true,
          invalidateOnRefresh: true
        }
      });

      return function(){
        if (tween.scrollTrigger) tween.scrollTrigger.kill();
        tween.kill();
        gsap.set(track, { clearProps: 'transform' });
      };
    });

    /* ---- Craftsmanship parallax ---- */
    if (!reduceMotion){
      gsap.to('#craftBg', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.craftsmanship', start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }
  } else {
    /* Fallback: no GSAP — reveal all philosophy panels statically */
    document.querySelectorAll('.phil-panel').forEach(function(p){ p.classList.add('active'); p.style.position = 'relative'; });
  }

  /* ============================================================ */
  /* Product card pointer-tilt                                     */
  /* ============================================================ */
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches){
    document.querySelectorAll('.product-panel').forEach(function(panel){
      panel.addEventListener('mousemove', function(e){
        var rect = panel.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        panel.style.transform = 'perspective(900px) rotateX(' + (py * -6) + 'deg) rotateY(' + (px * 8) + 'deg)';
      });
      panel.addEventListener('mouseleave', function(){
        panel.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      });
    });
  }

})();

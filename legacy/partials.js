// Shared chrome (Nav, CTA, Footer) + global styles for every page.
// ponytail: one file instead of pasting the same nav/footer markup into 9 HTML files.
(function () {
  const ms = "font-family:'Material Symbols Outlined';";

  // global styles + fonts, injected once
  document.head.insertAdjacentHTML('beforeend', `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" rel="stylesheet">
    <style>
      *{box-sizing:border-box;} body{margin:0; background:#05050a; font-family:'Inter',sans-serif; color:#E5E7EB; overflow-x:hidden;}
      @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
      @keyframes pulseGlow { 0%,100%{opacity:.6} 50%{opacity:1} }
      a[data-hover]:hover, div[data-hover]:hover { border-color:rgba(168,85,247,0.4) !important; }
      .lift{transition:transform .2s, border-color .2s;} .lift:hover{transform:translateY(-3px);}
      input:focus, textarea:focus, select:focus { border-color:rgba(168,85,247,0.6) !important; }
    </style>`);

  const navLinks = [
    { label:'Services', href:'Services.html', key:'services' },
    { label:'Industries', href:'Industries.html', key:'industries' },
    { label:'Work', href:'Work.html', key:'work' },
    { label:'Use Cases', href:'UseCases.html', key:'usecases' },
    { label:'Resources', href:'Resources.html', key:'resources' },
    { label:'About', href:'About.html', key:'about' },
  ];

  function renderNav(active) {
    const items = navLinks.map(l =>
      `<a href="${l.href}" style="font-size:13.5px; font-weight:500; text-decoration:none; letter-spacing:-0.005em; color:${l.key===active?'#C4B5FD':'#9CA3AF'};">${l.label}</a>`
    ).join('');
    return `<header style="position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:center; width:100%; padding:14px 0; background:rgba(5,5,9,0.72); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border-bottom:1px solid rgba(168,85,247,0.12);">
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; max-width:1240px; padding:0 32px;">
        <a href="index.html" style="display:flex; align-items:center; gap:11px; text-decoration:none;">
          <span style="display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:9px; background:linear-gradient(140deg,#7C3AED,#A855F7); box-shadow:0 0 18px rgba(168,85,247,0.5);"><span style="${ms} font-size:20px; color:#fff;">hub</span></span>
          <span style="display:flex; flex-direction:column; line-height:1.05;"><span style="font-size:14.5px; font-weight:700; color:#fff; letter-spacing:-0.01em;">Catalyst</span><span style="font-size:10.5px; font-weight:500; color:#9CA3AF; letter-spacing:0.06em;">SOLUTIONS SERVICES</span></span>
        </a>
        <nav style="display:flex; align-items:center; gap:30px;">${items}</nav>
        <a href="Contact.html" style="display:inline-flex; align-items:center; gap:7px; padding:10px 18px; border-radius:9px; background:linear-gradient(135deg,#7C3AED,#A855F7); color:#fff; font-size:13.5px; font-weight:600; text-decoration:none; box-shadow:0 0 22px rgba(124,58,237,0.45); border:1px solid rgba(255,255,255,0.12);">Book a Call <span style="${ms} font-size:17px;">arrow_forward</span></a>
      </div>
    </header>`;
  }

  function renderCTA(o) {
    o = o || {};
    const eyebrow = o.eyebrow || 'Start your growth system';
    const heading = o.heading || 'Ready to Build a Smarter Growth System?';
    const copy = o.copy || "Let's identify what is slowing your growth and build a practical plan to fix it.";
    const button = o.button || 'Book a Growth Consultation';
    return `<section style="position:relative; width:100%; padding:96px 32px; background:#05050a; overflow:hidden;">
      <div style="position:absolute; inset:0; background:radial-gradient(ellipse 60% 80% at 50% 50%, rgba(124,58,237,0.22), transparent 70%); pointer-events:none;"></div>
      <div style="position:absolute; top:0; left:50%; transform:translateX(-50%); width:1px; height:100%; background:linear-gradient(180deg,transparent,rgba(168,85,247,0.3),transparent); pointer-events:none;"></div>
      <div style="position:relative; max-width:760px; margin:0 auto; text-align:center;">
        <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:100px; background:rgba(124,58,237,0.12); border:1px solid rgba(168,85,247,0.25); margin-bottom:24px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#A855F7; box-shadow:0 0 10px #A855F7;"></span>
          <span style="font-size:12.5px; font-weight:500; color:#C4B5FD; letter-spacing:0.02em;">${eyebrow}</span>
        </div>
        <h2 style="font-size:46px; font-weight:800; line-height:1.08; letter-spacing:-0.025em; color:#fff; margin:0 0 18px; text-wrap:balance;">${heading}</h2>
        <p style="font-size:17px; line-height:1.6; color:#9CA3AF; max-width:560px; margin:0 auto 36px;">${copy}</p>
        <div style="display:flex; align-items:center; justify-content:center; gap:18px; flex-wrap:wrap;">
          <a href="Contact.html" style="display:inline-flex; align-items:center; gap:9px; padding:15px 28px; border-radius:11px; background:linear-gradient(135deg,#7C3AED,#A855F7); color:#fff; font-size:15px; font-weight:600; text-decoration:none; box-shadow:0 0 32px rgba(124,58,237,0.55); border:1px solid rgba(255,255,255,0.14);">${button} <span style="${ms} font-size:19px;">arrow_forward</span></a>
          <a href="Services.html" style="font-size:15px; font-weight:500; color:#C4B5FD; text-decoration:none;">Explore Services →</a>
        </div>
      </div>
    </section>`;
  }

  function col(title, items) {
    return `<div><div style="font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#C4B5FD; margin-bottom:16px;">${title}</div><div style="display:flex; flex-direction:column; gap:11px;">${
      items.map(i => `<a href="${i.href}" style="font-size:13.5px; color:#8B8B9A; text-decoration:none;">${i.label}</a>`).join('')
    }</div></div>`;
  }

  function renderFooter() {
    return `<footer style="position:relative; width:100%; background:#070510; border-top:1px solid rgba(168,85,247,0.12); overflow:hidden;">
      <div style="position:absolute; top:-120px; left:50%; transform:translateX(-50%); width:600px; height:300px; background:radial-gradient(ellipse,rgba(124,58,237,0.18),transparent 70%); pointer-events:none;"></div>
      <div style="position:relative; max-width:1240px; margin:0 auto; padding:64px 32px 36px;">
        <div style="display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr; gap:40px;">
          <div>
            <a href="index.html" style="display:flex; align-items:center; gap:11px; text-decoration:none; margin-bottom:18px;">
              <span style="display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:9px; background:linear-gradient(140deg,#7C3AED,#A855F7); box-shadow:0 0 18px rgba(168,85,247,0.5);"><span style="${ms} font-size:20px; color:#fff;">hub</span></span>
              <span style="display:flex; flex-direction:column; line-height:1.05;"><span style="font-size:14.5px; font-weight:700; color:#fff;">Catalyst</span><span style="font-size:10.5px; font-weight:500; color:#9CA3AF; letter-spacing:0.06em;">SOLUTIONS SERVICES</span></span>
            </a>
            <p style="max-width:300px; font-size:13.5px; line-height:1.65; color:#8B8B9A; margin:0 0 18px;">An AI-enabled digital growth partner helping businesses build, market, automate, and scale through strategy and execution.</p>
            <p style="font-size:13px; color:#9CA3AF; margin:0;">info@catalystsolutionservices.com</p>
          </div>
          ${col('Company', [
            {label:'About', href:'About.html'}, {label:'Work', href:'Work.html'}, {label:'Industries', href:'Industries.html'}, {label:'Resources', href:'Resources.html'}, {label:'Contact', href:'Contact.html'},
          ])}
          ${col('Services', [
            {label:'AI Strategy & Consulting', href:'ServiceDetail.html?s=ai-strategy'}, {label:'Website Design & Dev', href:'ServiceDetail.html?s=website'}, {label:'SEO & AI Search', href:'ServiceDetail.html?s=seo'}, {label:'AI Automation', href:'ServiceDetail.html?s=automation'}, {label:'All Services', href:'Services.html'},
          ])}
          ${col('Explore', [
            {label:'Use Cases', href:'UseCases.html'}, {label:'Case Studies', href:'Work.html'}, {label:'Blog', href:'Resources.html'}, {label:'Book a Call', href:'Contact.html'},
          ])}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:48px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:12.5px; color:#6B6B7A;">© 2026 Catalyst Solutions Services. All rights reserved.</span>
          <span style="font-size:12.5px; color:#6B6B7A;">catalystsolutionservices.com</span>
        </div>
      </div>
    </footer>`;
  }

  // auto-mount on placeholders present in the page
  function mount() {
    const nav = document.getElementById('nav');
    if (nav) nav.outerHTML = renderNav(nav.getAttribute('data-active') || '');
    const cta = document.getElementById('cta');
    if (cta) cta.outerHTML = renderCTA({ eyebrow:cta.dataset.eyebrow, heading:cta.dataset.heading, copy:cta.dataset.copy, button:cta.dataset.button });
    const ft = document.getElementById('footer');
    if (ft) ft.outerHTML = renderFooter();
  }
  document.addEventListener('DOMContentLoaded', mount);
})();

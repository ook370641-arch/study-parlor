function setMode(mode){
  document.getElementById('overview-mode').style.display = mode === 'overview' ? 'block' : 'none';
  document.getElementById('reader-mode').style.display = mode === 'reader' ? 'block' : 'none';
  document.getElementById('overview-nav').style.display = mode === 'overview' ? 'block' : 'none';
  document.getElementById('reader-nav').style.display = mode === 'reader' ? 'block' : 'none';
  document.getElementById('mode-overview').classList.toggle('active', mode === 'overview');
  document.getElementById('mode-reader').classList.toggle('active', mode === 'reader');
  document.querySelector('main').classList.toggle('wide', mode === 'reader');
  if(mode === 'overview') updateActiveNav();
  else updateReaderActive();
}

/* ===== OVERVIEW NAV ===== */
const navLinks = document.querySelectorAll('#overview-nav a');
const sections = document.querySelectorAll('section[id]');
function updateActiveNav(){
  let current = '';
  sections.forEach(s => {
    const top = s.getBoundingClientRect().top;
    if(top < window.innerHeight * 0.4) current = s.id;
  });
  navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
}
window.addEventListener('scroll', () => {
  if(document.getElementById('overview-mode').style.display !== 'none') updateActiveNav();
}, {passive:true});

/* ===== STRUCTURE & ACCORDION ===== */
function toggleNode(node){node.classList.toggle('open');}
function toggleChapter(item){
  const accordion = item.parentElement;
  Array.from(accordion.children).forEach(child => {
    if(child !== item && child.classList.contains('open')) child.classList.remove('open');
  });
  item.classList.toggle('open');
}

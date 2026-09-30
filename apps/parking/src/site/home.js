/**
 * home.js — the homepage's fonts, styles and scroll motion.
 *
 * Design source: design/homepage/directions/a-rooftop-dusk.html. GSAP comes
 * from npm (not a CDN) and fonts from @fontsource (self-hosted), so the page
 * makes no third-party requests.
 *
 * Everything readable is visible without JavaScript and with reduced motion;
 * the animations only ever start from a visible state.
 */
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/big-shoulders-display/latin-900';
import '@fontsource/schibsted-grotesk/latin-400';
import '@fontsource/schibsted-grotesk/latin-500';
import '@fontsource/schibsted-grotesk/latin-600';
import '@fontsource/ibm-plex-mono/latin-400';
import '@fontsource/ibm-plex-mono/latin-500';
import './home.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { share, SITE_URL } from '../ui/share.js';

gsap.registerPlugin(ScrollTrigger);

// --- floor ribbon: the page climbs from G (hero) to the roof (who + CTA) ------
const floorItems = document.querySelectorAll('.floors li');
const setFloor = (name) =>
  floorItems.forEach((li) => {
    const on = li.dataset.floor === name;
    li.classList.toggle('on', on);
    if (on) li.setAttribute('aria-current', 'location');
    else li.removeAttribute('aria-current');
  });
document.querySelectorAll('[data-floor]').forEach((section) => {
  if (section.tagName === 'LI') return;
  ScrollTrigger.create({
    trigger: section,
    start: 'top 55%',
    end: 'bottom 55%',
    // Measured after the pinned sections below, so their spacer height counts.
    refreshPriority: -1,
    onToggle: (self) => self.isActive && setFloor(section.dataset.floor),
  });
});

const mm = gsap.matchMedia();
mm.add(
  { motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 768px)' },
  ({ conditions }) => {
    if (!conditions.motion) return undefined;

    // Hero: the photo drifts and the title lifts away as you leave.
    gsap.to('.hero-img', {
      yPercent: 10, scale: 1.08, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero-copy', {
      y: -70, opacity: 0.25, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: '35% top', end: 'bottom top', scrub: true },
    });

    // Story: each sentence brightens in turn while the section holds still.
    const lines = gsap.utils.toArray('.line');
    const story = gsap.timeline({
      scrollTrigger: {
        trigger: '.story', start: 'top top',
        end: conditions.wide ? '+=140%' : 'bottom 60%',
        scrub: 0.6, pin: conditions.wide,
      },
    });
    story.fromTo('.story-bg img', { scale: 1.16 }, { scale: 1, ease: 'none', duration: lines.length }, 0);
    lines.forEach((line, i) => {
      story.fromTo(line, { opacity: 0.34, y: 10 }, { opacity: 1, y: 0, ease: 'power1.out', duration: 0.8 }, i);
    });

    // Section headings rise as they arrive. `once` everywhere below: a
    // heading that re-animates every time you scroll back past it is a
    // distraction, not an effect.
    gsap.utils.toArray('.story h2, .how h2, .made h2, .roof h2, .board h3, .next h3').forEach((el) => {
      gsap.fromTo(el, { y: 26, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // Small caps labels slide in from the left rule they sit against.
    gsap.utils.toArray('.label, .sub').forEach((el) => {
      gsap.fromTo(el, { x: -14, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.55, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
    });

    // Lede paragraphs fade up just behind their heading.
    gsap.utils.toArray('.how-lede, .made-lede, .who-body, .board-copy p:last-child').forEach((el) => {
      gsap.fromTo(el, { y: 18, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power2.out', delay: 0.08,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });

    // Score bars grow to their weight as the section arrives.
    gsap.fromTo('.bars li', { '--grow': 0 }, {
      '--grow': 1, duration: 0.9, ease: 'power2.out', stagger: 0.08,
      scrollTrigger: { trigger: '.bars', start: 'top 80%', once: true },
    });

    // The keymap deals itself out one row at a time.
    gsap.fromTo('.keymap div', { x: -18, opacity: 0 }, {
      x: 0, opacity: 1, duration: 0.45, ease: 'power2.out', stagger: 0.05,
      scrollTrigger: { trigger: '.keymap', start: 'top 82%', once: true },
    });

    // Keycaps press down and spring back, like they have been tapped.
    gsap.fromTo('.keymap kbd', { y: -3, borderBottomWidth: 6 }, {
      y: 0, borderBottomWidth: 3, duration: 0.3, ease: 'back.out(3)', stagger: 0.02,
      scrollTrigger: { trigger: '.keymap', start: 'top 78%', once: true },
    });

    // Assists and engineering facts rise in sequence.
    gsap.utils.toArray(['.assist-list li', '.facts li']).forEach((group) => {
      gsap.fromTo(group, { y: 24, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.6, ease: 'power2.out',
        scrollTrigger: { trigger: group, start: 'top 90%', once: true },
      });
    });

    // Leaderboard rows drop in from the top of the board, fastest first.
    gsap.fromTo('.board-rows li', { y: -12, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', stagger: 0.07,
      scrollTrigger: { trigger: '.board-rows', start: 'top 85%', once: true },
    });

    // The board panel lifts slightly as it crosses the viewport. Scrubbed, so
    // it tracks the scroll rather than playing once.
    gsap.fromTo('.board', { y: 40 }, {
      y: -20, ease: 'none',
      scrollTrigger: { trigger: '.board', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
    });

    // Showcase captions drift at their own pace against the images.
    gsap.utils.toArray('.cap').forEach((cap) => {
      gsap.fromTo(cap, { y: 26 }, {
        y: -26, ease: 'none',
        scrollTrigger: { trigger: cap, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      });
    });

    // Each showcase photo pushes in slowly while it is on screen. The strip
    // is pinned and moves horizontally on wide screens, so the trigger is the
    // pinned section rather than the image, which never crosses the viewport
    // vertically at all.
    gsap.utils.toArray('.strip figure img').forEach((img, i) => {
      gsap.fromTo(img, { scale: 1.14 }, {
        scale: 1, ease: 'none',
        scrollTrigger: conditions.wide
          ? { trigger: '.showcase', start: 'top top', end: () => '+=' + (window.innerWidth * 0.9), scrub: 0.7 }
          : { trigger: img, start: 'top bottom', end: 'bottom top', scrub: 0.7 },
        delay: i * 0.02,
      });
    });

    // Floor tags on each photo flick up as the strip arrives.
    gsap.fromTo('.floor-tag', { y: 10, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.45, ease: 'power2.out', stagger: 0.08,
      scrollTrigger: { trigger: '.showcase', start: 'top 70%', once: true },
    });

    // Contact links and the footer nav stagger in at the very bottom.
    gsap.fromTo('.contact li, .foot nav a', { y: 14, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', stagger: 0.06,
      scrollTrigger: { trigger: '.roof', start: 'top 55%', once: true },
    });

    // Final call to action: the title splits up as the page ends.
    gsap.fromTo('.final-title', { y: 40, opacity: 0, letterSpacing: '0.06em' }, {
      y: 0, opacity: 1, letterSpacing: '0em', duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: '.final', start: 'top 80%', once: true },
    });
    // Scoped to .final: a bare '.cta' also matched the hero button, which then
    // sat at opacity 0 above the fold until the visitor reached the footer.
    gsap.fromTo('.final .cta', { scale: 0.92, opacity: 0 }, {
      scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.8)', delay: 0.15,
      scrollTrigger: { trigger: '.final', start: 'top 80%', once: true },
    });

    // Level 13 teaser: the route climbs floor by floor.
    gsap.fromTo('.climb li', { scaleY: 0.2, transformOrigin: '50% 100%' }, {
      scaleY: 1, duration: 0.6, ease: 'power2.out', stagger: 0.07,
      scrollTrigger: { trigger: '.next', start: 'top 80%', once: true },
    });

    let cleanup;
    // Showcase: a horizontal drive past four lots.
    if (conditions.wide) {
      const strip = document.querySelector('.strip');
      strip.classList.add('is-horizontal');
      const distance = () => strip.scrollWidth - window.innerWidth;
      gsap.to(strip, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: '.showcase', start: 'top top',
          end: () => '+=' + distance(), scrub: 0.5, pin: true, invalidateOnRefresh: true,
        },
      });
      cleanup = () => strip.classList.remove('is-horizontal');
    }
    return cleanup;
  }
);

// "Send me the link": the phone's share sheet, else the clipboard, else the
// address as text to copy by hand.
document.querySelectorAll('[data-share]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const out = await share({ text: 'A free first-person parking game. Play it on a computer:' });
    if (out === 'copied') btn.textContent = 'Link copied';
    else if (out === 'failed') btn.replaceWith(Object.assign(document.createElement('code'), { textContent: SITE_URL }));
  });
});

// Images loading late change section heights; re-measure the pins once settled.
window.addEventListener('load', () => ScrollTrigger.refresh());

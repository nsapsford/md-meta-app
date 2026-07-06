import { m, AnimatePresence, type Variants } from 'framer-motion';
import type { LaunchPhase } from '../../hooks/useAppLaunch';

type TransitionStyle = 'morph' | 'scaleFade' | 'slideUp';

interface SplashScreenProps {
  phase: LaunchPhase;
  /** Which splash -> dashboard resolution to use. Default 'morph'. */
  transitionStyle?: TransitionStyle;
}

// Header's logo badge is ~52x52 at roughly (20.8, 55.5) in a 412-wide viewport
// (see Header.tsx). We scale that ratio to the current viewport width so the
// shared-element morph lands on the real header regardless of screen size.
function headerLogoTarget() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 412;
  const scale = Math.min(vw, 480) / 412;
  return { x: 20.8 * scale - vw / 2 + 26 * scale, y: 55.5 * scale - 300 };
}

/**
 * In-app launch splash: MD Meta logo + wordmark + tagline on the same dark
 * gradient background as the dashboard (bg-md-bg + hero-glow), resolving into
 * the real dashboard via one of three transition styles. Takes over instantly
 * when the native Capacitor splash hides (see utils/splash.ts), so there's no
 * visible seam.
 *
 * Mount conditionally: {!done && <SplashScreen phase={phase} />}
 */
export default function SplashScreen({ phase, transitionStyle = 'morph' }: SplashScreenProps) {
  const inTransition = phase === 'transition';
  const target = transitionStyle === 'morph' ? headerLogoTarget() : { x: 0, y: 0 };

  const containerVariants: Variants = {
    splash: { opacity: 1 },
    transition:
      transitionStyle === 'slideUp'
        ? { opacity: 1 }
        : { opacity: 0, transition: { duration: transitionStyle === 'morph' ? 0.42 : 0.36, ease: 'easeInOut' } },
  };

  const logoVariants: Variants = {
    splash: { x: 0, y: 0, scale: 1, opacity: 1 },
    transition:
      transitionStyle === 'morph'
        ? { x: target.x, y: target.y, scale: 52 / 116, opacity: 1, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }
        : transitionStyle === 'scaleFade'
        ? { scale: 1.9, opacity: 0, transition: { duration: 0.36, ease: 'easeIn' } }
        : { opacity: 1 },
  };

  const wordVariants: Variants = {
    splash: { opacity: 1, y: 0 },
    transition: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
  };

  return (
    <AnimatePresence>
      <m.div
        key="splash-root"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-md-bg bg-hero-glow overflow-hidden"
        variants={containerVariants}
        initial="splash"
        animate={inTransition ? 'transition' : 'splash'}
        style={transitionStyle === 'slideUp' ? undefined : { pointerEvents: 'none' }}
      >
        <m.div
          className="absolute inset-0"
          animate={
            transitionStyle === 'slideUp' && inTransition
              ? { y: '-100%', transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }
              : { y: 0 }
          }
        >
          {/* ambient gold glow, matches shadow-glow-gold token */}
          <div className="absolute left-1/2 top-[28%] -translate-x-1/2 w-80 h-80 rounded-full bg-md-gold/20 blur-3xl" />

          <div className="relative h-full flex flex-col items-center justify-center gap-5">
            <m.img
              src="/icon.svg"
              alt="MD Meta"
              className="w-[116px] h-[116px] rounded-[27px] shadow-card-featured"
              variants={logoVariants}
              initial="splash"
              animate={inTransition ? 'transition' : 'splash'}
            />
            <m.div variants={wordVariants} initial="splash" animate={inTransition ? 'transition' : 'splash'} className="text-center">
              <div className="text-[34px] font-extrabold tracking-tight bg-gradient-to-r from-md-text to-md-textSecondary bg-clip-text text-transparent">
                MD Meta
              </div>
              <div className="mt-2 text-[14.5px] font-semibold tracking-[0.22em] uppercase text-md-textMuted">
                Master Duel Analysis
              </div>
            </m.div>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}

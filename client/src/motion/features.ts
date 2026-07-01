// Loaded async by MotionProvider so the animation feature set (~15 kB gzip)
// stays out of the entry chunk — only LazyMotion's small core ships at startup.
export { domAnimation as default } from 'framer-motion';

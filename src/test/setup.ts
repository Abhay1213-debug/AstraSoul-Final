import '@testing-library/jest-dom/vitest'

// jsdom does not implement these.
window.scrollTo = (() => {}) as typeof window.scrollTo
Element.prototype.scrollIntoView = () => {}

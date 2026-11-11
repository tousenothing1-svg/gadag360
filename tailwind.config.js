// Tailwind classes style the older screens (the profile pages and the area picker). The newer screens use inline
// styles and the g-* classes in src/index.css. Tailwind's global reset (preflight) stays off so the newer screens keep
// their look; the older screens sit in a "tw" box that gets the small reset they need (see src/index.css).
// The build tool (react-scripts 5) picks this file up by itself and needs Tailwind 3.
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};

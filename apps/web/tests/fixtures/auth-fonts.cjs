// Offline browser fixtures: use system fonts, never contact Google Fonts.
module.exports = new Proxy(
  {},
  {
    get: () =>
      "@font-face { font-family: 'Space Grotesk'; src: local('Arial'); font-style: normal; font-weight: 300 700; }",
  },
);

@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a0f;
  color: #fff;
  font-family: 'Space Mono', monospace;
  -webkit-font-smoothing: antialiased;
  touch-action: none;
}

#root {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

button {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

button:active {
  transform: scale(0.97);
}

/* Scrollbar hide */
::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; }

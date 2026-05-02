# Physics First Tunnel Racer — modular preview

Uruchomienie lokalne:

```bash
cd tunnel-racer-modular
python -m http.server 5173
```

Potem otwórz:

```text
http://localhost:5173
```

Struktura:

```text
index.html
styles.css
js/
  main.js
  config.js
  state.js
  input.js
  math.js
  physics.js
  camera.js
  scene.js
  ui.js
```

Uwaga: projekt używa ES modules i importuje Three.js z CDN, więc trzeba uruchomić go przez lokalny serwer HTTP. Otwarcie index.html bezpośrednio z dysku może zablokować importy modułów.

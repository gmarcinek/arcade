---
mode: agent
name: skill-sandbox
description: "Skill: Praca w sandboxie — izolowane środowisko do wykonywania kodu przez agentów"
---

# Skill: Sandbox

Sandbox to izolowane środowisko (Docker lub lokalne Node.js) dostępne przez MCP server `agent-sandbox`.
Używaj sandboxa do **każdego** eksperymentowania z kodem, instalacji pakietów i uruchamiania programów.

## Uruchamianie sandboxa

### Wariant A — lokalny (bez Dockera, szybki start)

```powershell
cd e:/PROJECTS/arcade/agents/sandbox
npm install
node server.js
```

MCP server: `agent-sandbox-local` (stdio, skonfigurowany w `.vscode/mcp.json`)

### Wariant B — Docker sidecar (izolowany, rekomendowany)

```powershell
cd e:/PROJECTS/arcade/agents/sandbox
docker compose up -d
```

MCP server: `agent-sandbox-docker` (SSE na `http://localhost:3100`)

Sprawdzenie statusu: `curl http://localhost:3100/health`

---

## Narzędzia MCP

### `sandbox_exec` — wykonaj komendę

```
sandbox_exec(command: "node -e \"console.log('hello')\"")
sandbox_exec(command: "npm install pixi.js", timeout: 60000)
sandbox_exec(command: "npm test")
```

- Wszystkie komendy wykonują się w katalogu workspace sandboxa
- Domyślny timeout: 30s | Maks: 120s
- Zwraca STDOUT + STDERR

### `sandbox_write` — zapisz plik

```
sandbox_write(filePath: "src/game.js", content: "const x = 1;")
sandbox_write(filePath: "package.json", content: "{\"name\":\"test\"}")
```

- Tworzy katalogi pośrednie automatycznie
- Nadpisuje istniejące pliki

### `sandbox_read` — odczytaj plik

```
sandbox_read(filePath: "src/game.js")
sandbox_read(filePath: "package.json")
```

### `sandbox_ls` — listuj pliki

```
sandbox_ls()               ← korzeń sandboxa
sandbox_ls(dirPath: "src") ← podkatalog
```

### `sandbox_delete` — usuń plik/katalog

```
sandbox_delete(targetPath: "node_modules")
sandbox_delete(targetPath: "src/old-file.js")
```

### `sandbox_reset` — wyczyść cały workspace

```
sandbox_reset()
```

⚠️ Usuwa **wszystko** z workspace sandboxa. Używaj z rozwagą.

---

## Typowy workflow agenta

```
1. sandbox_ls()                          ← sprawdź stan
2. sandbox_write("package.json", ...)    ← utwórz projekt
3. sandbox_exec("npm init -y")           ← lub użyj npm init
4. sandbox_exec("npm install [pakiet]", timeout: 60000)
5. sandbox_write("src/main.js", kod)     ← napisz kod
6. sandbox_exec("node src/main.js")      ← uruchom
7. [iteruj na podstawie outputu]
8. sandbox_read("src/main.js")           ← odczytaj finalny kod
9. create_file("e:/PROJECTS/arcade/...", kod)  ← przenieś do workspace
```

---

## Reguły bezpieczeństwa

- **Nie wstawiaj** do komend danych z zewnętrznych źródeł bez walidacji (injection)
- **Nie zapisuj** sekretów, kluczy API, haseł do plików sandboxa
- Timeout instalacji: ustaw **60000** ms dla `npm install`
- Timeout skryptów: **30000** ms domyślnie, do **120000** max
- Po zakończeniu pracy przenieś potrzebne pliki do workspace przez `sandbox_read` + `create_file`

## Limity zasobów (Docker)

| Zasób | Limit                          |
| ----- | ------------------------------ |
| RAM   | 512 MB                         |
| CPU   | 1 core                         |
| Dysk  | 1 GB (volume)                  |
| Sieć  | Internet tak, sieć lokalna nie |

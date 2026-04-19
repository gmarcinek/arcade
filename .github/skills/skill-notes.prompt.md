---
mode: agent
name: skill-notes
description: "Skill: Strukturyzowane notatki agentów — konwencje zapisu, odczytu i aktualizacji notatek projektowych"
---

# Skill: Strukturyzowane Notatki

Używasz tego skila do prowadzenia notatek w trakcie pracy. Wszystkie notatki są plikami Markdown z YAML frontmatter.

## Ścieżki

| Typ                  | Lokalizacja                        |
| -------------------- | ---------------------------------- |
| Notatki projektowe   | `e:/PROJECTS/arcade/agents/notes/` |
| Pamięć sesji Copilot | `/memories/session/`               |
| Pamięć repozytorium  | `/memories/repo/`                  |

## Konwencja nazewnictwa

```
[agent]-[typ]-[temat].md

Przykłady:
  orchestrator-status.md
  researcher-findings-pixijs-physics.md
  planner-plan-v2.md
  tester-report-003.md
  coder-log-sprint1.md
```

## YAML Frontmatter (obowiązkowy w każdej notatce)

```yaml
---
agent: orchestrator | researcher | planner | coder | tester
type: goal | research | plan | code-log | test-report | status | decision
date: "YYYY-MM-DD HH:MM"
status: draft | active | completed | blocked | archived
version: 1
tags: [tag1, tag2]
refs: [plik1.md, plik2.md]
---
```

---

## Szablony

### `orchestrator-status.md` — status projektu

```markdown
---
agent: orchestrator
type: status
date: "..."
status: active
---

# Status projektu: [nazwa]

## Cel

[opis celu]

## Aktywny agent

[nazwa] — [zadanie]

## Ukończone

- [x] zadanie A
- [x] zadanie B

## Do zrobienia

- [ ] zadanie C → researcher
- [ ] zadanie D → planner

## Blokery

- [opis] → wymagana decyzja użytkownika
```

---

### `researcher-findings-[temat].md` — wyniki badań

```markdown
---
agent: researcher
type: research
topic: "[temat]"
date: "..."
status: active
---

# Badania: [temat]

## Pytanie badawcze

[co chcemy wiedzieć]

## Wnioski

[wyniki]

## Rekomendacja

[co robić na podstawie badań]

## Ograniczenia / ryzyka

[na co uważać]

## Źródła

- [opis źródła / fragment kodu / URL dokumentacji]
```

---

### `planner-plan-vN.md` — plan działania

```markdown
---
agent: planner
type: plan
version: N
date: "..."
status: active
refs: [researcher-findings-*.md]
---

# Plan: [nazwa projektu]

## Faza 1: [nazwa]

Cel: [opis]
Status: not-started | in-progress | done

| #   | Zadanie | Agent | Est. | Prio | Status |
| --- | ------- | ----- | ---- | ---- | ------ |
| 1   | [opis]  | coder | 2h   | high | [ ]    |
| 2   | [opis]  | coder | 1h   | med  | [ ]    |

## Faza 2: [nazwa]

...

## Ryzyka

| Ryzyko | Prawdop. | Wpływ | Mitygacja |
| ------ | -------- | ----- | --------- |

## Historia zmian

- v1 → v2: [powód zmiany, data]
```

---

### `tester-report-NNN.md` — raport z testów

```markdown
---
agent: tester
type: test-report
iteration: NNN
date: "..."
status: pass | fail | partial
refs: [planner-plan-vN.md]
---

# Raport z testów #NNN

## Podsumowanie

Wynik: PASS/FAIL — [X]/[Y] sprawdzeń OK

## Wyniki

| #   | Test | Status | Priorytet | Uwagi |
| --- | ---- | ------ | --------- | ----- |

## Feedback dla Plannera

### Blokujące (naprawić przed merge)

- [issue]

### Drobne (następna iteracja)

- [issue]

## Feedback dla Orkiestratora

[decyzje wymagane / rekomendacje]
```

---

## Operacje na notatkach

**Tworzenie nowej notatki:**

```
create_file(filePath: "e:/PROJECTS/arcade/agents/notes/[nazwa].md", content: "...")
```

**Aktualizacja (precise edit):**

```
replace_string_in_file — zawsze z ≥3 liniami kontekstu przed i po zmienianym fragmencie
```

**Odczyt:**

```
read_file(filePath: "e:/PROJECTS/arcade/agents/notes/[nazwa].md", startLine: 1, endLine: 9999)
```

**Wyszukiwanie we wszystkich notatkach:**

```
grep_search(query: "[fraza]", includePattern: "agents/notes/**", isRegexp: false)
```

**Lista notatek:**

```
list_dir(path: "e:/PROJECTS/arcade/agents/notes")
```

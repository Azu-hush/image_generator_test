# card-art-generator

Инструмент превращает **тему сета и пожелания продюсера** в **3–5 вариантов набора из 10 коллекционных карточек** для мобильной казуальной игры.
Claude Code выступает арт-директором, пишет промпты и делает визуальный контроль качества, картинки рисует image API.
Два взаимозаменяемых бэкенда: **Gemini** (`gemini-3.1-flash-image`) и **OpenAI** (`gpt-image-2.5-flare`), оба с референс-картинками.
Без API-ключа весь пайплайн работает в режиме репетиции и вместо картинок выдаёт пакет промптов для ручной генерации.

```
тема + пожелания ──► планировщик (Claude, /card-set) ──► plan.json
plan.json        ──► сборщик промптов (шаблоны категорий 1–5 + референсы)
                 ──► бэкенд: gemini.mjs (API)  |  manual.mjs (пакет промптов)
кандидаты        ──► визуальное QA (Claude, qa/checklist.md) ──► qa.json
qa.json          ──► assemble.mjs ──► variants/variant_1..N + контакт-листы
```

## Быстрый старт

```bash
git clone https://github.com/Azu-hush/image_generator_test.git card-art-generator && cd card-art-generator
npm run demo
```

Команда проверит пример плана, прогонит бэкенд без ключа и напишет пакет промптов в `out/summer/fishing/prompt-pack.html`.

Чтобы получить настоящие картинки, выбрать бэкенд:

| Бэкенд | Ключ | Гайд | Команда |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY`, нужен биллинг, бесплатного тира нет, ≈ $0.045 за картинку | [docs/gemini-api-key.ru.md](docs/gemini-api-key.ru.md) | `node backends/gemini.mjs --plan <plan>` |
| OpenAI | `OPENAI_API_KEY`, предоплаченный баланс, ≈ $0.03–0.06 за картинку | [docs/openai-api-key.ru.md](docs/openai-api-key.ru.md) | `node backends/openai.mjs --plan <plan>` |

1. Сохранить ключ: `setx OPENAI_API_KEY "..."` (или `GEMINI_API_KEY`) и перезапустить терминал.
2. `node backends/openai.mjs --plan examples/summer_fishing.plan.json` → 40 кандидатов в `out/summer/fishing/candidates/` (для дешёвого первого прогона добавить `--candidates 2`).
3. `node scripts/qa-template.mjs --set out/summer/fishing` → оценить кандидатов в `qa.json` (в скилле это делает Claude).
4. `node scripts/assemble.mjs --set out/summer/fishing --variants 3` → `out/summer/fishing/variants/index.html`.

По желанию `npm i sharp`, тогда варианты обрезаются до игрового размера 430 × 480.

## Как скилл Claude Code

Открыть репозиторий в Claude Code и написать:

```
/card-set Summer "Fishing" "тёплое ностальгическое настроение, много бирюзы, две золотые карты, без мёртвой рыбы"
```

Скилл `.claude/skills/card-set/SKILL.md` планирует сет, валидирует его, запускает бэкенд, оценивает каждого кандидата глазами, собирает варианты и пишет отчёт. Чтобы использовать в другом проекте, скопируйте туда папку `.claude/skills/card-set` вместе с `styleguide/`, `prompts/`, `data/`.

## Структура

| Путь | Что |
|---|---|
| `styleguide/` | стиль, правила категорий, лист персонажей |
| `prompts/` | шаблоны: базовый стиль, категории 1–5, запреты, заметка о референсах, системный промпт планировщика |
| `schema/set-plan.schema.json` | формат плана сета |
| `examples/` | `summer_coolness_remake` (бенчмарк против существующих карт) и `summer_fishing` (новый сет с двумя золотыми) |
| `lib/` | валидация плана, сборка промпта, подбор референсов, общий раннер бэкендов |
| `backends/gemini.mjs` | бэкенд Gemini с референс-картинками, повторами при 429 и режимом репетиции |
| `backends/openai.mjs` | бэкенд OpenAI `/v1/images/edits` (`gpt-image-2.5-flare`, референсы как `image[]`, `input_fidelity: high` на золотых картах) |
| `backends/manual.mjs` | пакет промптов (MD + HTML с кнопками «копировать») |
| `scripts/` | `validate`, `qa-template`, `assemble` |
| `qa/checklist.md` | критерии оценки кандидатов |
| `data/` | референсные карточки, каталог `cards.csv`, список сетов `sets.csv`, полоски примеров по категориям |
| `docs/` | гайд по ключу, план работ, заметки для Miro |

## Категории

1 объект висит в воздухе на плоском фоне с узором · 2 объект на простом полу · 3 объект на реалистичной поверхности с простым задником · 4 объект в упрощённом окружении · 5 золотая сюжетная карта с 1–2 персонажами.

## Стоимость

`gemini-3.1-flash-image` в 1K ≈ $0.045 за картинку, `gpt-image-2.5-flare` в среднем качестве ≈ $0.03–0.06. Сет с 4 кандидатами на карту ≈ $1.5–2.5, коллекция из 16 сетов по 3 варианта ≈ $25–40. Оба API на платном использовании не обучаются на ваших промптах и картинках.

## Лицензия

MIT на код и промпты. Референсные карточки в `data/` принадлежат студии и включены только как образец стиля.

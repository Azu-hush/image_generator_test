# Как подключить ключ OpenAI для генерации картинок

Проверено по документации OpenAI 11.09.2026.

## Подписка ChatGPT и API это разные вещи

Подписка ChatGPT Plus/Pro не даёт ключа API. Нужен ключ с <https://platform.openai.com/api-keys> и предоплаченный баланс на том же аккаунте (Settings → Billing → Add to credit balance, минимум $5). Если ключ уже есть и баланс положительный, дальше всё занимает пять минут.

## Модели и цены

Актуальные image-модели: `gpt-image-2.5-flare` (быстрая, по умолчанию в инструменте), `gpt-image-2.5-sunburst` (точнее держит референсы при редактировании), `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`.

Цена считается в токенах: $30 за 1M выходных image-токенов и $8 за 1M входных image-токенов (референсы). На практике одна картинка около 1 мегапикселя среднего качества стоит ориентировочно $0.03–0.06, точную оценку даёт калькулятор в гайде OpenAI по генерации картинок. Сет из 10 карт × 4 кандидата ≈ $1.5–2.5.

Данные, отправленные через API, OpenAI по умолчанию не использует для обучения моделей.

## Шаги

1. Открыть <https://platform.openai.com/api-keys> → **Create new secret key**. Для порядка назвать `card-art-generator`. Ключ показывается один раз.
2. Проверить баланс: <https://platform.openai.com/settings/organization/billing>. При нуле пополнить.
3. Сохранить ключ в переменную окружения и перезапустить терминал и Claude Code:

```bash
setx OPENAI_API_KEY "ВСТАВИТЬ_КЛЮЧ"
```

4. Проверить, что ключ работает:

```bash
curl -s -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models | grep -o '"id": *"gpt-image[^"]*"' | sort -u
```

Ожидается список `gpt-image-*` моделей. Ошибка `401` означает неверный ключ, `429 insufficient_quota` означает нулевой баланс.

5. Запустить тест:

```bash
node backends/openai.mjs --plan examples/summer_coolness_remake.plan.json --candidates 2
```

Это 20 картинок, примерно $1. Дальше `node scripts/qa-template.mjs --set out/summer/coolness` и `node scripts/assemble.mjs --set out/summer/coolness`.

## Настройки в плане

В блоке `generation` можно задать `openai_size` (по умолчанию `864x960`, стороны кратны 16, соотношение как у карточки 430×480) и `openai_quality` (`low`, `medium`, `high`, `xhigh`, `max`). Для золотых карт инструмент включает `input_fidelity: high`, чтобы персонажи с референсов повторялись точно.

## Безопасность

- Ключ живёт только в переменной окружения, в репозиторий не попадает.
- Личный ключ тратит личный баланс. Для командной работы лучше завести ключ на организацию с лимитом расходов (Settings → Limits).
- Утёкший ключ сразу отзывать на странице ключей.

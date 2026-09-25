# Lllight Conductor

Desktop-приложение для проектирования и визуального воспроизведения световых шоу для костюмов. Репозиторий начинает систему из трёх уровней: desktop → ESP32 Master → Raspberry Pi Pico Slaves. На этом этапе реализован только безопасный, локальный UI-каркас без работы с оборудованием.

## Технологический стек

- **Tauri 2 + Rust** — лёгкая Windows-оболочка, нативный backend и подходящая точка расширения для будущего USB/Serial. Rust позволяет изолировать потенциально опасный I/O от UI и строго типизировать границы IPC.
- **React 19 + TypeScript (strict) + Vite** — поддерживаемый UI-стек для будущего интерактивного timeline. Canvas/WebGL и Web Audio API можно внедрить без смены архитектуры; специализированную waveform-библиотеку выберем тогда, когда появятся требования редактора.
- **ESLint + Vitest + Testing Library** — быстрые статические и модульные проверки.

Tauri выбран вместо Electron ради меньшего дистрибутива и потребления памяти. Компромисс — для сборки нужны Rust и системные зависимости Tauri/WebView2. UI можно разрабатывать отдельно в браузере.

## Структура

```text
apps/desktop/              React UI и Tauri host
  src/
    application/          сценарии приложения
    communication/        транспортные контракты (без UART-протокола)
    domain/               Project/Costume/device models
    hardware/             абстракции обнаружения и подключения устройств
    persistence/          интерфейс репозитория проектов и временная in-memory реализация
    score/                минимальная модель партитуры/timeline
    ui/                    shell, навигация и экраны
  src-tauri/               минимальный нативный Tauri host
firmware/esp32-master/     место для будущей прошивки (не реализована)
firmware/pico-slave/       место для будущей прошивки (не реализована)
docs/architecture/         архитектурные решения
docs/protocols/            место для будущих спецификаций протоколов
docs/formats/              место для будущих форматов
```

Зависимости направлены внутрь: UI вызывает application services, а сервисы работают с доменными моделями и портами persistence/hardware/communication. Конкретный serial transport, UART-протокол и формат скомпилированной партитуры намеренно отсутствуют.

## Установка и запуск

Требования: Node.js 20+, npm 10+, Rust stable и [системные зависимости Tauri 2](https://v2.tauri.app/start/prerequisites/). На Windows также требуется WebView2 (в современных версиях Windows обычно уже установлен).

```bash
npm install
npm run dev          # UI в браузере: http://localhost:1420
npm run desktop:dev  # нативное desktop-окно Tauri
```

## Проверки

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Нативный установщик создаётся командой `npm run desktop:build` на целевой ОС с установленными prerequisites.

## Текущий объём

Есть оболочка с разделами Projects, Editor, Devices и Settings, стартовый экран проектов, типизированная модель нового проекта и in-memory repository. Нет загрузки аудио, waveform/timeline editor, постоянного сохранения, hardware I/O, протоколов, компилятора партитуры и прошивок.


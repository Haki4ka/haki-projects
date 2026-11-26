# Мови: практика на реальних задачах

Не «hello world», а інструменти, які перевіряють наші фільтри Haki Shield.
Кожен інструмент зроблений на своїй мові навмисно: Python — швидко писати
парсер, C++ — точний stream-сканер і перехресна перевірка, TypeScript — ловити
помилки в структурі правил до запуску в Brave.

## Python — `python/analyze_easylist.py`

Стандартна бібліотека, без залежностей. Рахує категорії рядків EasyList,
витягує безпечні `||domain^` і порівнює їх із `universal.json`.

```powershell
$py = "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe"
& $py analyze_easylist.py --file easylist.txt --rules "..\..\..\Haki Shield\universal.json"
# або напряму з URL:
& $py analyze_easylist.py --url https://easylist.to/easylist/easylist.txt
```

Використання: коли (після окремого дозволу) оновлюватимемо EasyList, цей
скрипт покаже, скільки безпечних доменів дасть нова версія, **до** перегенерації.

## C++ — `cpp/scan_rules.cpp`

Швидкий stream-сканер. Зібрано з WinLibs/MinGW-w64 GCC 16.2.0:

```powershell
$mingw = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
$env:PATH = "$mingw;$env:PATH"
g++ -O2 -std=c++17 -Wall -Wextra -pedantic scan_rules.cpp -o scan_rules.exe
.\scan_rules.exe easylist.txt
```

## TypeScript — `ts/`

Суворий `tsconfig` (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`). Перевіряє обидва rulesets: унікальність ID,
наявність `resourceTypes`, заборону `main_frame`, ліміт 30 000 правил і
наявність виключень для захищених сайтів.

```powershell
cd ts
npm install
npm run verify
```

Node 20 не вміє `--experimental-strip-types`, тому `verify` спершу робить
`tsc --noEmit`, потім збирає в `dist/` і запускає вже JS. `dist/` і
`node_modules/` у git не потрапляють.

## Результат перевірки 26.11.2026 (EasyList, 78 801 рядок)

| Показник | Python | C++ |
|---|---:|---:|
| Коментарі | 277 | 277 |
| Косметика `##` | 24 559 | 24 559 |
| Винятки `@@` | 751 | 751 |
| Host-правила `||…^` | 49 545 | 49 545 |
| Безпечні домени | 47 381 | 47 381 |
| Інше | 3 669 | 3 669 |

Обидві реалізації збіглися **повністю**. Шляхом до цього були дві виправлені
помилки в C++: модифікатори `$third-party` спершу не розпізнавалися, а список
спільних CDN і публічних суфіксів не перевірявся.

TypeScript-перевірка: `rules.json` — 47 правил / 1 regex / 0 помилок;
`universal.json` — 25 000 правил / 0 regex / 0 помилок. `ALL_OK`.

## Уроки

- Один і той самий «простий» аналіз у двох мовах виявив розбіжність, яку
  важко помітити в одній реалізації. Перехресна перевірка працює.
- TypeScript справді ловить структуру до запуску: помилка в шляху до
  rulesets виявилася ще на етапі запуску, а не в Brave.
- C++-компілятор і Python тепер доступні локально, з офіційних пакетів,
  хеші перевірені winget.

# Technické zadání: `devgate` — lokální dev HTTPS reverse proxy tool v Node.js

## Cíl

Navrhni a implementuj nástroj **`devgate`** v **Node.js** pro lokální vývoj webových aplikací. Nástroj má fungovat primárně na **Windows**, sekundárně pokud možno i na Linux/macOS, ale návrh a implementace mají být optimalizované pro Windows vývoj na jednom stroji.

Cílem je vytvořit lokální „dev gateway“, která:

- běží jako jeden centrální proces,
- poslouchá na lokálním HTTPS endpointu,
- funguje jako reverzní proxy pro více lokálních aplikací běžících na různých portech,
- směruje požadavky podle hostname,
- používá hostname odvozené z lokální IP přes `sslip.io`,
- automaticky řeší TLS certifikáty pro tyto hostname,
- eliminuje potřebu používat porty v URL při běžném vývoji,
- nevyžaduje Caddy, nginx ani Traefik.

Toto není brainstorming. Chci konkrétní implementaci podle zadání níže.

---

## 1. Hlavní use case

Vývojář má na počítači spuštěné aplikace například:

- UI na `localhost:3001`
- API na `localhost:3002`
- admin na `localhost:3003`

V konfiguraci nástroje zadá mapování:

- `ui -> 3001`
- `api -> 3002`
- `admin -> 3003`

Nástroj zjistí lokální IPv4 adresu stroje, např. `192.168.1.11`, a vytvoří veřejně resolvovatelné dev hostname přes `sslip.io`, např.:

- `ui.192-168-1-11.sslip.io`
- `api.192-168-1-11.sslip.io`
- `admin.192-168-1-11.sslip.io`

Poté spustí lokální HTTPS reverse proxy tak, aby:

- `https://ui.192-168-1-11.sslip.io/` proxyovalo na `http://127.0.0.1:3001/`
- `https://api.192-168-1-11.sslip.io/` proxyovalo na `http://127.0.0.1:3002/`
- `https://admin.192-168-1-11.sslip.io/` proxyovalo na `http://127.0.0.1:3003/`

Nástroj musí řešit:

- TLS certifikát
- host-based routing
- websocket proxy
- jednoduchou správu konfigurace
- fallback / status stránku

---

## 2. Distribuce a způsob použití

Nástroj musí fungovat dvěma rovnocennými způsoby:

### 2.1 Globální CLI nástroj

Po instalaci přes:

```bash
npm i -g devgate
````

musí být k dispozici spustitelný příkaz:

```bash
devgate --configure ./config.json
```

a dále i podoba se subcommandy, např.:

```bash
devgate start --config ./config.json
devgate validate --config ./config.json
devgate print-hosts --config ./config.json
devgate doctor --config ./config.json
```

CLI wrapper musí být ergonomický, ale interně nesmí být přilepený napevno ke globální binárce. Má být postavený nad stejným programovým API, které bude použitelné i při importu jako modul.

### 2.2 Import jako ESM modul

Balíček musí být použitelný i jako knihovna:

```js
import { createDevgate, loadConfig, startDevgate } from 'devgate';
```

Musí existovat čisté API, které umožní:

* načíst konfiguraci,
* validovat ji,
* vytvořit instanci služby,
* spustit ji,
* zastavit ji,
* reloadnout routy nebo konfiguraci,
* získat runtime metadata a vygenerované hostname.

Cílem je, aby nástroj nebyl jen CLI utilita, ale i vložitelná komponenta do jiných Node ESM aplikací.

---

## 3. Rozsah

Implementace má zahrnovat tyto části:

1. CLI aplikace
2. ESM API
3. parsování konfigurace
4. detekce lokální IPv4 adresy
5. generování hostname pro `sslip.io`
6. správa TLS certifikátů
7. HTTPS reverse proxy server
8. websocket proxy
9. health/status endpoint
10. dev dashboard / fallback page
11. hot reload konfigurace bez nutnosti ručního restartu procesu, pokud je to rozumně možné
12. testovací suite s testovacími appkami

Nástroj nemá:

* řešit produkční nasazení
* být obecný ingress controller
* řešit ACME / Let’s Encrypt
* instalovat systémovou službu OS
* měnit systémový DNS
* editovat `hosts`
* fungovat jako tunel do internetu
* používat Docker jako povinnou součást

---

## 4. Architektonické zásady

Implementace musí být:

* jednoduchá,
* čitelná,
* explicitní,
* bez zbytečné magie,
* bez překomplikovaného plugin systému.

Preferovaný styl:

* čistý Node.js
* ESM
* minimum závislostí
* TypeScript je vhodný, ale není povinný; pokud bude použit, výstup musí být buildnutelný do běžného Node CLI
* žádný frontend framework pro dashboard, maximálně server-side generovaný HTML nebo prostý statický HTML template

---

## 5. Platformní cíle

Primární cílová platforma:

* Windows 10/11
* Node.js LTS

Sekundární podpora:

* Linux
* macOS

Kód musí být navržen tak, aby systémově citlivé části byly oddělené do samostatných modulů:

* práce s certifikáty
* detekce IP
* spawn externích nástrojů
* rezervace portu / kontrola práv
* případné OS-specifické instrukce

---

## 6. Základní funkční požadavky

### 6.1 Konfigurace

Nástroj musí podporovat konfigurační soubor, např. `devgate.config.json` nebo `devgate.config.yaml`.

Konfigurace musí umět definovat:

* seznam aplikací/služeb
* alias hostname
* cílový protokol (`http` / `https`)
* cílový host
* cílový port
* volitelné přepsání path prefixu
* volitelné custom headers
* volitelné vypnutí TLS verifikace na upstreamu
* volitelný healthcheck endpoint
* volitelný flag, zda služba má být veřejně uvedena na dashboardu

Příklad logické struktury konfigurace:

* globální sekce:

  * proxy port pro HTTPS, default `443`
  * volitelný HTTP port pro redirect, default `80` nebo vypnuto
  * hostname strategy: `sslip`
  * preferred network interface nebo preferred IP
  * cert storage directory
  * dashboard enabled
  * auto open browser
* seznam routes:

  * alias
  * upstream protocol
  * upstream host
  * upstream port
  * stripPrefix / preserveHost / changeOrigin / headers

Alias musí být omezen na bezpečný DNS label:

* malá písmena
* číslice
* pomlčky
* bez mezer a underscore

### 6.2 Generování hostname

Nástroj musí pro každou route vytvořit hostname ve tvaru:

```text
<alias>.<ip-with-dashes>.sslip.io
```

Např.:

* alias `ui`
* IP `192.168.1.11`
* výsledek `ui.192-168-1-11.sslip.io`

Dále musí umět vygenerovat i základní apex host pro dashboard, např.:

* `dev.192-168-1-11.sslip.io`
* nebo `gateway.192-168-1-11.sslip.io`

Tento hostname bude použit pro stavovou stránku a seznam služeb.

### 6.3 Detekce IP adresy

Nástroj musí automaticky detekovat vhodnou lokální IPv4 adresu.

Požadavky:

* ignorovat loopback
* preferovat privátní IPv4 rozsahy
* preferovat aktivní síťové rozhraní
* umožnit přepsání přes CLI argument nebo konfiguraci
* při více kandidátech vybrat deterministicky nebo zobrazit jasné rozhodnutí v logu

Nástroj musí umět vypsat:

* zvolenou IP
* zvolené rozhraní
* důvod výběru

Podpora IPv6 není priorita. Implementace má být primárně pro IPv4.

---

## 7. Certifikáty a TLS

### 7.1 Požadovaný model

Nástroj musí poskytovat **důvěryhodné HTTPS** pro lokální vývoj, pokud je to technicky možné.

Preferovaný model:

* využít **lokální development CA**
* z ní generovat leaf certifikáty pro potřebné hostname
* certifikáty ukládat lokálně do cache adresáře

### 7.2 Doporučený přístup

Primární řešení:

* použít `mkcert`, pokud je dostupný v systému

Chování:

* při startu zjistit, zda je `mkcert` dostupný
* pokud ano, použít ho pro:

  * kontrolu lokální CA
  * případné vytvoření CA
  * generování certifikátu pro všechny potřebné hostname v SAN
* pokud `mkcert` není dostupný:

  * vypsat jasnou chybu
  * nebo přejít do `self-signed fallback mode` pouze pokud to bude explicitně povoleno v konfiguraci nebo CLI flagem

### 7.3 SAN certifikát

Certifikát má pokud možno pokrýt:

* všechny aktivní alias hostname
* dashboard hostname
* případně i `localhost`, pokud to pomůže interním testům

Certifikát může být:

* jeden sdílený multi-SAN cert pro aktuální konfiguraci,
* nebo více samostatných certifikátů

Preferovaný je jeden sdílený cert, pokud to zjednoduší správu.

### 7.4 Obnova certifikátu

Při změně konfigurace hostname musí nástroj:

* detekovat, že stávající cert neobsahuje všechny potřebné SAN
* vygenerovat nový cert
* bezpečně reloadnout HTTPS server

### 7.5 Co nástroj dělat nemá

Nástroj nemá:

* pokoušet se programově instalovat CA do trust storu složitými neudržitelnými hacky
* dělat tiché systémové zásahy bez jasné signalizace
* tvářit se, že zaručí důvěryhodnost bez `mkcert` nebo odpovídajícího CA

---

## 8. Reverzní proxy

### 8.1 Routing

Routing musí být podle `Host` hlavičky.

Např.:

* `ui.192-168-1-11.sslip.io` → route `ui`
* `api.192-168-1-11.sslip.io` → route `api`

Proxy musí podporovat:

* běžné HTTP metody
* request body streaming
* response streaming
* chunked responses
* large uploads/downloads bez zbytečného bufferingu

### 8.2 Upstream forwarding

Proxy musí být schopná přeposlat na upstream:

* `http://127.0.0.1:<port>`
* `https://127.0.0.1:<port>`

Konfigurovatelné chování:

* `changeOrigin`
* `preserveHost`
* custom request headers
* custom response headers
* optional path rewrite
* timeout
* insecure TLS pro self-signed upstreamy

### 8.3 WebSocket

Musí fungovat websocket upgrade:

* Vite/HMR
* Bun dev server
* vlastní ws endpointy

Požadováno:

* správné forwardování `upgrade`
* logování websocket route
* korektní chování při odpojení upstreamu

### 8.4 Redirect HTTP → HTTPS

Volitelně může běžet i plain HTTP listener, který:

* přesměruje odpovídající hostname na HTTPS
* nebo poskytne jednoduchou diagnostickou odpověď

Tato funkce má být konfigurovatelná.

---

## 9. Dashboard / fallback page

Pokud přijde request na:

* neznámý hostname
* nebo speciální dashboard hostname

nástroj má vrátit jednoduchou HTML stránku se seznamem registrovaných rout.

Stránka má obsahovat:

* alias
* full URL
* cílový upstream
* health status, pokud je dostupný
* poslední známý stav upstreamu
* případné chyby konfigurace

Stránka má být jednoduchá, server-side generovaná, bez SPA.

---

## 10. Health checks

Volitelně může mít každá route healthcheck, např.:

* `/health`
* `/api/health`

Nástroj má v periodě kontrolovat dostupnost upstreamu a ukládat:

* poslední HTTP status
* čas posledního úspěchu
* čas poslední chyby
* chybovou zprávu

Healthcheck nesmí blokovat hlavní proxy provoz.

---

## 11. CLI rozhraní

CLI musí být jednoduché.

Navrhni minimálně tyto příkazy nebo ekvivalenty:

* `start`
* `validate`
* `print-config`
* `print-hosts`
* `doctor`

Kromě toho musí fungovat i ergonomický shorthand:

```bash
devgate --configure ./config.json
```

Tento zápis se má chovat stejně jako:

```bash
devgate start --config ./config.json
```

### 11.1 `start`

Spustí server.

Volby:

* `--config <path>`
* `--configure <path>` jako alias
* `--ip <ipv4>`
* `--https-port <port>`
* `--http-port <port>`
* `--cert-dir <path>`
* `--verbose`
* `--no-dashboard`
* `--self-signed-fallback`

### 11.2 `validate`

Zkontroluje konfiguraci:

* duplicity aliasů
* neplatné aliasy
* konfliktní hostname
* neplatné porty
* kolize s dashboard aliasem
* dostupnost `mkcert`

### 11.3 `print-config`

Vypíše efektivní konfiguraci po mergi defaultů a souboru.

### 11.4 `print-hosts`

Vypíše všechny výsledné URL:

* hostname
* HTTPS URL
* upstream

### 11.5 `doctor`

Diagnostika prostředí:

* Node verze
* OS
* dostupnost `mkcert`
* zvolená IP
* test bindu na požadovaný port
* informace o cert cache
* upozornění na běh bez administrátorských práv, pokud je to relevantní

---

## 12. ESM API

Balíček musí exportovat jasné ESM API.

Minimální očekávané exporty:

* `loadConfig(pathOrObject)`
* `validateConfig(config)`
* `resolveRuntimeConfig(config, options?)`
* `createDevgate(configOrRuntimeConfig)`
* `startDevgate(configOrRuntimeConfig)`
* `buildHostnames(config, runtimeInfo)`
* `detectLocalIp(options?)`

Instanci služby musí být možné ovládat z kódu, např. metodami:

* `start()`
* `stop()`
* `reload(nextConfig?)`
* `getStatus()`
* `getRoutes()`
* `getHostnames()`
* `getCertificateInfo()`

Cílem je, aby bylo možné `devgate` integrovat například do vlastních dev launcherů, monorepo toolingu nebo editor pluginů bez spouštění separátního shell procesu.

---

## 13. Logování

Logování musí být čitelné a věcné.

Při startu se má vypsat:

* verze nástroje
* zvolená IP a interface
* HTTPS bind adresa a port
* dashboard URL
* seznam rout
* stav certifikátu
* způsob cert generation (`mkcert` / fallback)

Za běhu logovat:

* start/stop/reload
* incoming request summary ve verbose režimu
* proxy chyby
* websocket upgrade chyby
* healthcheck změny stavu

Preferovaný formát:

* jednoduché textové logy
* bez přemrštěného JSON loggingu
* případně volitelný structured mode pro debugging

---

## 14. Chybové stavy

Nástroj musí mít velmi dobré chybové hlášky.

Musí jasně rozlišit:

* port already in use
* `mkcert` not found
* cert generation failed
* invalid config
* upstream unavailable
* TLS startup failed
* hostname conflict
* no suitable IPv4 found
* insufficient permissions

Chybové zprávy mají být použitelné a ne obecné.

Např. ne `proxy failed`, ale:

* `Cannot bind HTTPS listener to 443: address already in use`
* `mkcert executable not found in PATH; install mkcert or enable self-signed fallback`
* `Generated certificate does not cover hostname ui.192-168-1-11.sslip.io`

---

## 15. Konfigurační reload

Pokud se změní konfigurační soubor:

* načti změny
* validuj
* pokud jde jen o routy, aktualizuj routing tabulku bez plného restartu
* pokud se změnily hostname/SAN a je potřeba nový cert, vygeneruj ho a reloadni HTTPS vrstvu bezpečně

Reload nesmí shodit proces bez smysluplné chybové zprávy.

---

## 16. Bezpečnostní požadavky

Je to dev tool, ne produkční reverse proxy, ale i tak:

* validuj aliasy a hostname
* neumožni directory traversal v cestách k certům/configu
* neproxyuj na libovolné URL bez explicitní konfigurace
* nespouštěj shell commandy s nenaescapovaným vstupem
* odděl uživatelskou konfiguraci od shell invokace `mkcert`
* při proxying neodstraňuj bezpečnostní hlavičky bezdůvodně
* loguj jen rozumné minimum citlivých dat

---

## 17. Doporučené vnitřní moduly

Rozděl implementaci minimálně takto:

* `cli`
* `api`
* `config`
* `ip-detection`
* `hostname-builder`
* `cert-manager`
* `proxy-server`
* `dashboard`
* `healthchecks`
* `logger`
* `doctor`
* `fixtures`
* `tests`

Každý modul má mít jasné API.

---

## 18. Doporučené knihovny

Použij jen to, co dává smysl. Nepřehánět.

Možné kandidáty:

* parsování configu: `yaml` nebo čistý JSON
* proxy: `http-proxy` nebo jiná malá a ověřená knihovna
* file watch: `chokidar`
* schema validace: `zod` nebo podobně malý nástroj
* websocket test klient/server: minimální ověřená knihovna

Nepoužívat těžké frameworky.

---

## 19. Chování při běhu na portu 443

Na Windows může bind na 443 vyžadovat zvláštní podmínky nebo kolidovat s jinými nástroji. Implementace musí:

* detekovat kolizi portu
* umět fallbacknout na jiný port, pokud je to v konfiguraci povoleno
* umět jasně vypsat aktivní URL i s portem, pokud se nejede na 443

Např.:

```text
https://ui.192-168-1-11.sslip.io:8443/
```

Výchozí chování:

* preferovat 443
* při selhání neskončit neurčitě, ale dát jasnou diagnostiku

---

## 20. Výstup pro uživatele po startu

Po úspěšném startu se má vypsat souhrn typu:

* selected interface
* selected IP
* certificate mode
* dashboard URL
* per-route URL a upstream

Např. logicky:

* `ui -> https://ui.192-168-1-11.sslip.io/ -> http://127.0.0.1:3001`
* `api -> https://api.192-168-1-11.sslip.io/ -> http://127.0.0.1:3002`

---

## 21. Testy

Implementace musí obsahovat nejen unit testy, ale i **integrační a end-to-end test suite** s reálnými testovacími službami.

### 21.1 Unit testy

Minimálně testovat:

* validaci aliasů
* generování hostname
* výběr IP
* konfiguraci rout
* SAN coverage kontrolu certifikátu
* mapování CLI argumentů na runtime config
* ESM API surface

### 21.2 Integrační testy

Minimálně testovat:

* host-based routing
* websocket upgrade
* reload konfigurace
* healthchecky
* dashboard fallback
* chování při neznámém hostu
* chování při chybějícím upstreamu
* chování při změně certifikátového setu hostname

### 21.3 Povinná testovací fixture / demo suite

V projektu musí být testovací aplikace nebo fixture suite, kterou lze spustit automaticky během integračních/E2E testů.

Suite musí obsahovat minimálně tři služby:

* `app` na portu `10001`
* `api` na portu `10002`
* `admin` na portu `10003`

Tyto služby mají být namapované přes `devgate` na příslušné hostname/subdomény ve stylu:

* `app.<ip-with-dashes>.sslip.io`
* `api.<ip-with-dashes>.sslip.io`
* `admin.<ip-with-dashes>.sslip.io`

Požadavky na fixture služby:

#### `app` služba

* jednoduchá HTTP aplikace
* vrací HTML `Hello from app`
* poskytuje websocket endpoint, který po připojení pošle testovací zprávu, např. `hello-from-app-ws`

#### `api` služba

* jednoduchá HTTP aplikace
* vrací JSON odpověď, např. `{ "service": "api", "ok": true }`
* poskytuje websocket endpoint, který po připojení pošle testovací zprávu, např. `hello-from-api-ws`

#### `admin` služba

* jednoduchá HTTP aplikace
* vrací HTML `Hello from admin`
* poskytuje websocket endpoint, který po připojení pošle testovací zprávu, např. `hello-from-admin-ws`

### 21.4 E2E scénář, který musí projít

Automatizovaný test musí:

1. spustit fixture služby na portech `10001`, `10002`, `10003`
2. spustit `devgate` nad testovací konfigurací
3. zjistit vybranou lokální IP nebo použít test override
4. ověřit, že vznikly hostname pro `app`, `api`, `admin`
5. poslat HTTPS requesty na všechny tři hostname
6. ověřit, že:

   * `app` vrací očekávaný HTML obsah,
   * `api` vrací očekávaný JSON,
   * `admin` vrací očekávaný HTML obsah
7. navázat websocket spojení na každou službu přes hostname `devgate`
8. ověřit doručení testovací websocket zprávy
9. ověřit dashboard/fallback page
10. korektně ukončit všechny procesy

Test suite nemá být jen formální. Musí skutečně prokázat, že host-based HTTPS proxy a websocket forwarding fungují.

---

## 22. README a DX

README musí obsahovat:

* instalaci přes `npm i -g devgate`
* příklad konfigurace
* příklad spuštění přes CLI:

  * `devgate --configure ./config.json`
  * `devgate start --config ./config.json`
* příklad použití jako ESM modul
* vysvětlení závislosti na `mkcert`
* příklad výstupu URL
* troubleshooting pro Windows
* informaci, že `sslip.io` řeší DNS pouze přes hostname obsahující IP a že nástroj neprovozuje vlastní DNS

---

## 23. Doporučený formát konfigurace

Implementace má navrhnout explicitní, čitelný formát konfigurace. Např. logicky:

```json
{
  "httpsPort": 443,
  "httpRedirectPort": 80,
  "dashboardAlias": "dev",
  "hostnameStrategy": "sslip",
  "preferredIp": "192.168.1.11",
  "routes": [
    {
      "alias": "app",
      "target": {
        "protocol": "http",
        "host": "127.0.0.1",
        "port": 10001
      },
      "healthcheck": "/health",
      "showInDashboard": true
    },
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "127.0.0.1",
        "port": 10002
      },
      "healthcheck": "/health",
      "showInDashboard": true
    },
    {
      "alias": "admin",
      "target": {
        "protocol": "http",
        "host": "127.0.0.1",
        "port": 10003
      },
      "healthcheck": "/health",
      "showInDashboard": true
    }
  ]
}
```

Toto je příklad struktury, ne povinný přesný formát, ale výsledná konfigurace musí být podobně čitelná a explicitní.

---

## 24. Explicitní rozhodnutí, která má implementace udělat

Pokud narazíš na nejasnost, rozhodni takto:

* používej `sslip.io`, ne `nip.io`
* hostname generuj s IP oddělenou pomlčkami, ne tečkami
* upstream host defaultně `127.0.0.1`
* preferuj `mkcert`
* bez `mkcert` neprováděj tiché hacky do trust storu
* dashboard drž jednoduchý
* proxy chování má být co nejvíc transparentní
* žádná „smart reactivity“, žádný složitý interní event framework
* konfigurace má být explicitní a snadno čitelná
* CLI a ESM API musí sdílet stejný core runtime

---

## 25. Co chci jako výstup od Codexu

Chci, aby Codex:

1. navrhl adresářovou strukturu projektu,
2. vybral konkrétní knihovny a zdůvodnil je,
3. popsal architekturu modulů,
4. definoval formát konfigurace,
5. implementoval CLI,
6. implementoval ESM API,
7. implementoval cert manager nad `mkcert`,
8. implementoval HTTPS reverse proxy s host-based routingem,
9. implementoval websocket proxy,
10. implementoval dashboard a healthchecky,
11. přidal validaci konfigurace,
12. přidal `doctor` diagnostiku,
13. přidal testovací fixture suite na portech `10001`, `10002`, `10003`,
14. přidal integrační a E2E testy pro HTTP i websocket forwarding,
15. přidal README s praktickými příklady použití.

Nechci obecný brainstorming. Chci konkrétní implementaci podle tohoto zadání.

---

## 26. Akceptační kritéria

Implementace je hotová, pokud:

* lze definovat alespoň 3 aliasy v konfiguraci,
* nástroj vygeneruje správné `sslip.io` hostname,
* nástroj zajistí použitelný TLS cert přes `mkcert`,
* `https://<alias>.<ip-with-dashes>.sslip.io/` routuje na správný localhost port,
* fungují websockety,
* existuje dashboard/fallback page,
* změna konfigurace se projeví bez tvrdého restartu, pokud je to technicky možné,
* `doctor` odhalí chybějící `mkcert`, kolizi portu a absenci vhodné IPv4,
* globální CLI funguje po `npm i -g`,
* příkaz `devgate --configure ./config.json` spustí službu,
* balíček lze importovat jako ESM modul,
* testovací suite na portech `10001`, `10002`, `10003` projde pro HTTP i websocket scénáře,
* README obsahuje návod pro Windows.

---

## 27. Důležitá omezení

* Neimplementuj produkční funkce navíc.
* Nezaváděj Docker jako povinnou část.
* Neřeš ACME.
* Neřeš automatickou editaci `hosts`.
* Neřeš vlastní DNS server.
* Nepoužívej Caddy, nginx ani Traefik.
* Neschovávej složitost za příliš abstraktní vrstvu.

---


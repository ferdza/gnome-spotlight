# Arquitetura

## Fluxo de uma busca

1. `LauncherOverlay` (St) recebe o texto da caixa e chama `LauncherPresenter.onQueryChanged`.
2. O presenter pede um token ao `LatestRequestGate` e chama `SearchService.search`.
3. O serviço lê a lista de provedores (a factory devolve uma função: os da extensão mais um
   `OverviewSearchProvider` por provedor que o panorama tem naquele momento), lê o modo com
   `parseQuery` (prefixo), filtra os que atendem o modo e consulta todos em paralelo.
4. Junta os resultados, mantém o de maior nota quando dois têm o mesmo `id`, ordena por nota
   e depois por título, corta no limite das preferências (`?` mostra pelo menos 11).
5. Provedor com `isRemote` (internet, D-Bus, panorama) não segura a lista: quando os locais
   terminam, o serviço entrega uma prévia pelo `onUpdate`, e entrega de novo a cada remoto que
   responde, só se a lista mudou. A promessa final traz a lista completa.
6. Se o token ainda é o mais novo, o presenter manda a view desenhar (prévia e final). Resposta
   atrasada é descartada. Se o usuário já moveu a seleção, a lista nova mantém o item
   selecionado.
7. Enter ou clique: o presenter FECHA a janela e só depois chama `result.activate()`. Fechar
   antes devolve o foco às janelas, senão o app recém-aberto nasce atrás.

## Camadas

| Pasta | Papel | Pode importar valor de `gi://`? |
| --- | --- | --- |
| `src/domain` | Regras puras: casamento de texto, calculadora, caminhos, terminal, atalho | Não |
| `src/service` | `SearchService` | Não |
| `src/provider` | Uma strategy por fonte de resultado + a factory | Não |
| `src/ui/launcherPresenter.ts` | Interação (setas, Enter, Tab, Esc) | Não |
| `src/ui` (resto) | View St | Sim |
| `src/infra/gnome` | Adaptadores das portas (`AppCatalog`, `WindowCatalog`...) | Sim |
| `src/app` | `LauncherSession`, a raiz de composição | Sim |
| `src/prefs` | Linha de captura de atalho e lista de atalhos de busca (GTK 4) | Sim |

As portas ficam em `src/domain/*/…Ports.ts`. Cada adaptador do Shell implementa uma.
Os testes usam portas falsas em `test/support/fakes.ts`.

## Ciclo de vida

`enable()` cria a `LauncherSession` e chama `start()`, que registra o atalho com
`Main.wm.addKeybinding`. O mutter relê a chave sozinho quando o atalho muda nas preferências.
`disable()` chama `stop()`, que remove o atalho, destrói a view e solta o sinal do `AppSystem`.

A extensão não mexe em atalho do sistema. O padrão é Super+Alt+Espaço, que o GNOME não usa;
Super+Espaço continua sendo "trocar fonte de entrada".

## Decisões

- Presenter separado da view para poder testar interação sem St. A view só traduz evento em
  chamada (mapa de teclas em `KEY_ACTIONS`).
- Provedores do panorama: o Shell não tem API pública para listar, só `addProvider` e
  `removeProvider`. A lista vem de `Main.overview.searchController._searchResults._providers`
  (campo privado, conferido no Shell 51). Apps e Calculadora ficam de fora porque a extensão
  já cobre os dois (`isCoveredByLauncher`).
- Ações do sistema usam o `misc/systemActions.js` do Shell. Ele já sabe o que está
  disponível agora e casa as palavras-chave traduzidas, então a extensão não mantém lista
  própria.

## Bolhas, modo Apps e modo Arquivos

- Um atalho só. Ao lado do painel ficam duas bolhas redondas (Apps e Arquivos) que saem de
  trás da barra, escalonadas, depois de 650 ms ou no primeiro movimento do mouse
  (`revealBubbles`). Ctrl+1 e Ctrl+2 fazem o mesmo pelo teclado.
- Ao entrar num modo as bolhas voltam para dentro da barra (`collapseBubbles`) e a barra
  desliza para o centro: sem bolhas não há assimetria. Backspace com a caixa vazia (ou Esc, ou
  Ctrl+1/2 de novo) volta à busca normal e as bolhas saem de novo.
- Modo Apps: `domain/apps/appGrid.ts` é o modelo puro (filtro com o mesmo `textMatcher`, ordem
  alfabética, movimento nas setas). A view desenha uma grade de 5 colunas com TODOS os apps,
  sem categorias, dentro do próprio painel; digitar filtra.
- Modo Arquivos: não tem provedor novo. A caixa vazia vira `~/` e o texto digitado vira
  `~/texto` (`toFilesQuery`); quem começa com `/` ou `~` é usado como está, então Tab completa
  pastas. Enter numa pasta abre a pasta; num arquivo mostra o arquivo no gerenciador de
  arquivos (`org.freedesktop.FileManager1.ShowItems`, com a pasta como plano B).
- Blur: só o painel leva `clipboard-dialog`. As bolhas têm preenchimento próprio, porque o
  Blur my Shell arredondaria com o raio dele e não com o círculo.
- Enter também escuta o sinal `activate` da caixa, caso o método de entrada consuma a tecla
  antes do `key-press-event`.

## Animações

- `domain/animation/spring.ts` é a mola amortecida que a Apple usa no SwiftUI: `response` é o
  período (ω0 = 2π/response) e `damping` é a razão de amortecimento ζ (1 sem passar do alvo,
  menor que 1 passa e volta). A posição é `1 - e^(-ζω0t)(cos ωd·t + ζω0/ωd · sen ωd·t)`, com
  ωd = ω0·√(1-ζ²). O tempo de assentamento sai do envelope `e^(-ζω0t)` até 0,2%.
- `ui/motion.ts` (`springTo`) roda a mola num `Clutter.Timeline` e escreve opacidade, escala,
  translação e altura. Cada propriedade tem um dono: uma animação nova da mesma propriedade
  assume do valor atual, sem salto.
- Presets: SMOOTH (sem passar), SNAPPY (leve), DEFAULT (0,55 s, 0,825, o padrão do SwiftUI) e
  BOUNCY. A abertura e as bolhas usam BOUNCY, a altura das listas usa DEFAULT.
- A altura das listas anima do tamanho atual ao novo (`animateHeight`), a lista de apps entra
  com os ícones em escada e o toque numa bolha ou ícone encolhe e solta com mola.
- `ui/overscrollBounce.ts`: St.ScrollView não tem elástico. Passando do começo ou do fim, o
  conteúdo é puxado com resistência (`1 - |d|/64`) e volta com mola 90 ms depois do último
  evento de rolagem.
- O brilho de vidro é CSS: sombra externa, borda clara e reflexo interno nas bolhas. Refração de
  verdade não existe no Shell, então não é simulada.

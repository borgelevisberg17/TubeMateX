# Auditoria visual — player fullscreen

Na captura desktop de 1366×768, o player ocupa praticamente toda a janela, com drawer de 1280 px, palco 16:9 largo, cabeçalho, loading, barra de progresso, mute, volume, fullscreen e abertura da fonte original. O player deixou de ser um painel estreito no centro.

Na captura mobile de 390×844, o drawer ocupa toda a viewport; o volume é ocultado, os controles de progresso continuam utilizáveis, fullscreen fica numa linha própria e a fonte original passa para baixo sem sobreposição. O layout mantém a leitura do título e não cria overflow horizontal.

O fullscreen programático deve ser solicitado ao drawer completo, e não ao palco, para que o navegador cubra o viewport inteiro. A pseudo-classe `:fullscreen` expande o card, remove margens e faz o palco crescer verticalmente.

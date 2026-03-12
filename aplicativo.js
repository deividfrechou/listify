/*
=======================================================
  APLICATIVO.JS — Listify
=======================================================
  Organização:
  1.  Aguardar carregamento da página
  2.  Referências aos elementos HTML
  3.  Estado global
  4.  Inicialização
  5.  Visual Viewport API (teclado do sistema)
  6.  Entrada por texto
  7.  Entrada por voz
  8.  Gerenciamento de itens (adicionar, renderizar, marcar, excluir)
  9.  Modal unificado (editar nome + preço juntos)
  10. Botão de impressão
  11. Total e localStorage
=======================================================
*/


/* ═══════════════════════════════════════
   1. AGUARDAR CARREGAMENTO DA PÁGINA
   Garante que todos os elementos HTML
   existam antes de o JS tentar acessá-los.
═══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {


    /* ═══════════════════════════════════════
       2. REFERÊNCIAS AOS ELEMENTOS HTML
    ═══════════════════════════════════════ */

    var campoTexto      = document.getElementById('campoTexto');       /* Campo de digitação         */
    var btnAdicionar    = document.getElementById('btnAdicionar');     /* Botão "Adicionar"          */
    var btnMicrofone    = document.getElementById('btnMicrofone');     /* Botão do microfone         */
    var labelStatus     = document.getElementById('status');           /* Texto de status do mic     */
    var listaItens      = document.getElementById('lista');            /* <ul> da lista              */
    var labelTotal      = document.getElementById('total');            /* Texto do total             */
    var btnImprimir     = document.getElementById('btnImprimir');      /* Botão imprimir             */
    var cabecalho       = document.querySelector('.cabecalho');        /* Cabeçalho (logo Listify)   */

    /* Modal unificado de edição */
    var modalEditar     = document.getElementById('modalEditar');      /* Container do modal         */
    var campoEditarNome = document.getElementById('campoEditarNome');  /* Campo nome do produto      */
    var campoEditarPreco= document.getElementById('campoEditarPreco'); /* Campo valor em R$          */


    /* ═══════════════════════════════════════
       3. ESTADO GLOBAL
    ═══════════════════════════════════════ */

    var itens           = [];       /* Array de itens: [ { nome, preco, marcado }, ... ] */
    var indiceAtual     = -1;       /* Índice do item aberto no modal (-1 = nenhum)      */
    var reconhecimento  = null;     /* Objeto SpeechRecognition                          */
    var gravando        = false;    /* true quando o microfone está ativo                */
    var permissaoConcedida = false; /* true após o usuário conceder acesso ao microfone  */
    var alturaOriginal  = window.innerHeight; /* Altura da janela sem teclado (fallback) */


    /* ═══════════════════════════════════════
       4. INICIALIZAÇÃO
    ═══════════════════════════════════════ */

    carregarItens();            /* Restaura itens salvos no localStorage */
    iniciarVoz();               /* Configura reconhecimento de voz       */
    iniciarControleDoTeclado(); /* Liga a Visual Viewport API            */
    definirDataImpressao();     /* Insere data atual no cabeçalho print  */


    /* ═══════════════════════════════════════
       5. VISUAL VIEWPORT API

       Detecta em tempo real o espaço visível
       da tela quando o teclado do sistema abre.
       Atualiza a variável CSS --altura-visivel
       para que o modal se reposicione acima
       do teclado automaticamente.
    ═══════════════════════════════════════ */

    function iniciarControleDoTeclado() {
        if (window.visualViewport) {
            /* Método moderno — suportado no Chrome 61+, Safari 13+, Firefox 91+ */
            window.visualViewport.addEventListener('resize', aoMudarViewport);
            window.visualViewport.addEventListener('scroll', aoMudarViewport);
        } else {
            /* Fallback para navegadores mais antigos */
            window.addEventListener('resize', aoMudarViewportFallback);
        }
    }

    /* Chamada sempre que a viewport muda (teclado abre/fecha, rotação) */
    function aoMudarViewport() {
        var h = window.visualViewport.height;
        document.documentElement.style.setProperty('--altura-visivel', h + 'px');

        /* Se um modal estiver aberto, rola o campo focado para ficar visível */
        var focado = document.querySelector('.modal[style*="flex"] input:focus');
        if (focado) {
            focado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        /* Se o campo de texto principal estiver ativo, sobe até ele */
        if (document.activeElement === campoTexto) {
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /* Versão fallback: detecta abertura do teclado pela queda de altura */
    function aoMudarViewportFallback() {
        var h = window.innerHeight;
        if (alturaOriginal - h > 150) {
            /* Teclado provavelmente aberto */
            document.documentElement.style.setProperty('--altura-visivel', h + 'px');
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                setTimeout(function () {
                    document.activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        } else {
            /* Teclado provavelmente fechado */
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    }

    /* Remove a variável quando não há modal ou campo aberto */
    function limparAlturaVisivel() {
        if (!document.querySelector('.modal[style*="flex"]')) {
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    }


    /* ═══════════════════════════════════════
       6. ENTRADA POR TEXTO
    ═══════════════════════════════════════ */

    /* Clique no botão "Adicionar" */
    btnAdicionar.addEventListener('click', function () {
        var nome = campoTexto.value.trim(); /* Remove espaços nas pontas */
        if (nome) {
            adicionarItem(nome);
            campoTexto.value = ''; /* Limpa o campo após adicionar */
            campoTexto.focus();    /* Mantém o foco para digitar o próximo */
        }
    });

    /* Tecla Enter também adiciona o item */
    campoTexto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btnAdicionar.click();
    });

    /* Rola a página para o campo ficar visível após o teclado subir */
    campoTexto.addEventListener('focus', function () {
        setTimeout(function () {
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
    });

    /* Ao sair do campo, limpa a variável de altura se não há modal aberto */
    campoTexto.addEventListener('blur', limparAlturaVisivel);


    /* ═══════════════════════════════════════
       7. ENTRADA POR VOZ

       • Segurar o botão para gravar, soltar para adicionar
       • continuous: false — compatível com iOS Safari
       • getUserMedia() pede permissão explicitamente (necessário no iOS)
       • stop() (não abort()) ao soltar → processa o áudio e dispara onresult
    ═══════════════════════════════════════ */

    function iniciarVoz() {
        var temAPI = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);

        if (!temAPI) {
            /* Navegador sem suporte a reconhecimento de voz */
            labelStatus.textContent    = 'Voz não suportada neste navegador.';
            btnMicrofone.disabled      = true;
            btnMicrofone.style.opacity = '0.4';
            return;
        }

        /* Cria o objeto usando a versão disponível no navegador */
        var APIDeVoz   = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new APIDeVoz();

        reconhecimento.lang            = 'pt-BR'; /* Português do Brasil          */
        reconhecimento.continuous      = false;   /* false = compatível com iOS   */
        reconhecimento.interimResults  = false;   /* Retorna apenas o resultado final */
        reconhecimento.maxAlternatives = 1;       /* Melhor interpretação apenas  */

        /* Disparado quando a fala é reconhecida */
        reconhecimento.onresult = function (evento) {
            /* Junta todos os trechos reconhecidos numa frase única */
            var partes = [];
            for (var i = 0; i < evento.results.length; i++) {
                partes.push(evento.results[i][0].transcript.trim());
            }
            var texto = partes.join(' ').trim();

            if (texto) {
                adicionarItem(texto);
                labelStatus.textContent = 'Adicionado: "' + texto + '"';
            }
        };

        /* Disparado ao ocorrer erros no reconhecimento */
        reconhecimento.onerror = function (evento) {
            switch (evento.error) {
                case 'not-allowed':
                    labelStatus.textContent = 'Permissão negada. Verifique as configurações.';
                    pararGravacao(); break;
                case 'no-speech':
                    labelStatus.textContent = 'Nada ouvido. Fale mais perto do microfone.';
                    if (gravando) setTimeout(function () {
                        try { reconhecimento.start(); } catch (e) {}
                    }, 300);
                    break;
                case 'audio-capture':
                    labelStatus.textContent = 'Microfone indisponível ou ocupado.';
                    pararGravacao(); break;
                case 'network':
                    labelStatus.textContent = 'Sem internet. Voz requer conexão.';
                    pararGravacao(); break;
                case 'aborted':
                    /* Cancelamento normal ao soltar o botão */
                    labelStatus.textContent = 'Segure o microfone e fale'; break;
                default:
                    labelStatus.textContent = 'Erro. Tente novamente.';
                    pararGravacao();
            }
        };

        /* Quando o reconhecimento termina, atualiza o visual */
        reconhecimento.onend = function () {
            if (gravando) pararGravacaoVisual();
        };

        labelStatus.textContent = 'Segure o microfone e fale';
    }

    /* Pointer events: funcionam igual para mouse E toque,
       sem precisar de preventDefault() agressivo.
       setPointerCapture mantém o evento no botão mesmo
       se o dedo deslizar levemente. */
    btnMicrofone.addEventListener('pointerdown', function (e) {
        e.preventDefault(); /* Evita seleção de texto e scroll acidental */
        btnMicrofone.setPointerCapture(e.pointerId);
        comecarGravacao();
    });
    btnMicrofone.addEventListener('pointerup',     function () { if (gravando) pararGravacao(); });
    btnMicrofone.addEventListener('pointercancel', function () { if (gravando) pararGravacao(); });

    function comecarGravacao() {
        if (!reconhecimento) return;

        if (permissaoConcedida) {
            /* Permissão já concedida — inicia direto */
            iniciarReconhecimento();
            return;
        }

        /* Primeira vez: pede permissão explícita do microfone.
           O iOS Safari exige que isso aconteça dentro de um gesto do usuário. */
        labelStatus.textContent = 'Aguardando permissão...';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (fluxo) {
                    /* Fecha o fluxo de teste; o reconhecimento abre o próprio */
                    fluxo.getTracks().forEach(function (f) { f.stop(); });
                    permissaoConcedida = true;
                    iniciarReconhecimento();
                })
                .catch(function () {
                    labelStatus.textContent = 'Permissão negada. Verifique as configurações.';
                });
        } else {
            permissaoConcedida = true;
            iniciarReconhecimento();
        }
    }

    function iniciarReconhecimento() {
        try {
            reconhecimento.start();
            gravando = true;
            btnMicrofone.classList.add('gravando');    /* Ativa animação de pulso */
            labelStatus.textContent = 'Ouvindo… solte para concluir';
        } catch (e) {
            labelStatus.textContent = 'Tente novamente.';
            gravando = false;
        }
    }

    /* Para a gravação com stop() para que o onresult processe o áudio */
    function pararGravacao() {
        gravando = false;
        if (reconhecimento) {
            try { reconhecimento.stop(); } catch (e) {}
        }
        pararGravacaoVisual();
    }

    /* Atualiza apenas o visual sem interferir no reconhecimento */
    function pararGravacaoVisual() {
        gravando = false;
        btnMicrofone.classList.remove('gravando');
        labelStatus.textContent = 'Segure o microfone e fale';
    }


    /* ═══════════════════════════════════════
       8. GERENCIAMENTO DE ITENS
    ═══════════════════════════════════════ */

    /* Adiciona um novo item ao array e redesenha a lista */
    function adicionarItem(nome) {
        itens.push({ nome: nome, preco: 0, marcado: false });
        renderizar();
        salvarItens();
    }

    /*
     * Função: renderizar
     * Reconstrói toda a lista <ul> a partir do array "itens".
     * Cada linha tem:
     *   - nome (clicável para marcar/desmarcar)
     *   - preço em verde (clicável para abrir o modal de edição)
     *   - botão excluir (ícone da lixeira verde)
     */
    function renderizar() {
        listaItens.innerHTML = ''; /* Limpa a lista atual */

        itens.forEach(function (item, i) {

            /* Elemento <li> da linha */
            var li       = document.createElement('li');
            li.className = 'item' + (item.marcado ? ' marcado' : '');

            /* Nome do produto — toque para marcar/desmarcar */
            var nome           = document.createElement('div');
            nome.className     = 'item-nome';
            nome.textContent   = item.nome;
            nome.addEventListener('click', function () { marcar(i); });

            /* Preço — toque para abrir o modal unificado de edição.
               Usamos uma arrow function para capturar o valor correto
               de "i" em cada iteração do forEach. */
            var preco         = document.createElement('div');
            preco.className   = 'item-preco';
            preco.textContent = formatarPreco(item.preco);
            /* Acessibilidade: informa ao leitor de tela que o preço é editável */
            preco.setAttribute('role', 'button');
            preco.setAttribute('aria-label', 'Editar ' + item.nome + ': ' + formatarPreco(item.preco));
            preco.addEventListener('click', function () { abrirModal(i); });

            /* Área de ações — agora apenas o botão excluir */
            var acoes       = document.createElement('div');
            acoes.className = 'acoes';
            acoes.appendChild(criarBotaoExcluir(i)); /* Botão com lixeira verde */

            /* Monta a linha */
            li.appendChild(nome);
            li.appendChild(preco);
            li.appendChild(acoes);
            listaItens.appendChild(li);
        });

        atualizarTotal();
    }

    /* Cria o botão de excluir com o ícone excluir.png (lixeira verde) */
    function criarBotaoExcluir(indice) {
        var btn = document.createElement('button');
        btn.className = 'btn-excluir';
        btn.setAttribute('aria-label', 'Excluir item');

        var img       = document.createElement('img');
        img.src       = 'excluir.png'; /* Lixeira verde enviada pelo usuário */
        img.alt       = 'Excluir';
        img.className = 'icone-acao';

        btn.appendChild(img);
        /* Captura o índice correto com closure */
        btn.addEventListener('click', function () { excluir(indice); });
        return btn;
    }

    /* Alterna o estado comprado/não comprado do item */
    function marcar(i) {
        itens[i].marcado = !itens[i].marcado;
        renderizar();
        salvarItens();
    }

    /* Remove o item do array pela sua posição */
    function excluir(i) {
        itens.splice(i, 1); /* Remove 1 elemento a partir do índice i */
        renderizar();
        salvarItens();
    }


    /* ═══════════════════════════════════════
       9. MODAL UNIFICADO — Editar nome + preço

       Abre ao tocar no preço de qualquer item.
       O cursor começa no campo "Valor (R$)" —
       pois é a edição mais comum no supermercado —
       mas o nome também pode ser alterado.

       Fluxo:
       1. abrirModal(i) → preenche campos → exibe modal
       2. Foco automático no campo de preço (com delay p/ iOS)
       3. Usuário edita nome e/ou preço
       4. Confirmar → salva ambos; Cancelar → descarta
    ═══════════════════════════════════════ */

    function abrirModal(indice) {
        indiceAtual = indice;

        /* Preenche os campos com os valores atuais do item */
        campoEditarNome.value  = itens[indice].nome;
        campoEditarPreco.value = itens[indice].preco > 0
            ? itens[indice].preco.toFixed(2)  /* Exibe como "3.50" */
            : '';                              /* Campo vazio se preço for zero */

        /* Exibe o modal */
        modalEditar.style.display = 'flex';

        /* Delay de 80ms: aguarda o modal ficar visível antes de focar.
           O foco dispara a abertura do teclado virtual no celular.
           Depois de mais 350ms (teclado aberto), rola para o campo. */
        setTimeout(function () {
            /* Foco NO CAMPO DE PREÇO — é a edição mais comum */
            campoEditarPreco.focus();
            campoEditarPreco.select(); /* Seleciona o valor para facilitar substituição */

            setTimeout(function () {
                campoEditarPreco.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }, 80);
    }

    /* Fecha o modal e limpa a variável de altura */
    function fecharModal() {
        modalEditar.style.display = 'none';
        document.documentElement.style.removeProperty('--altura-visivel');
    }

    /* Botão Cancelar — descarta as alterações */
    document.getElementById('cancelarEditar').addEventListener('click', fecharModal);

    /* Botão Confirmar — salva nome e preço */
    document.getElementById('confirmarEditar').addEventListener('click', function () {
        var novoNome  = campoEditarNome.value.trim();
        var novoPreco = parseFloat(campoEditarPreco.value) || 0;
        /* parseFloat converte texto em número; || 0 garante zero se inválido */

        if (indiceAtual !== -1 && novoNome) {
            itens[indiceAtual].nome  = novoNome;
            itens[indiceAtual].preco = novoPreco;
            renderizar();
            salvarItens();
            fecharModal();
        }
    });

    /* Enter no campo de nome avança para o campo de preço */
    campoEditarNome.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            campoEditarPreco.focus();
        }
    });

    /* Enter no campo de preço confirma a edição */
    campoEditarPreco.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('confirmarEditar').click();
        }
    });

    /* Toque no fundo escuro fecha o modal */
    modalEditar.addEventListener('click', function (e) {
        if (e.target === modalEditar) fecharModal();
    });


    /* ═══════════════════════════════════════
       10. BOTÃO DE IMPRESSÃO
    ═══════════════════════════════════════ */

    btnImprimir.addEventListener('click', function () {
        window.print();
    });


    /* ═══════════════════════════════════════
       11. TOTAL E LOCALSTORAGE
    ═══════════════════════════════════════ */

    /* Soma os preços de todos os itens e atualiza o texto */
    function atualizarTotal() {
        var soma = itens.reduce(function (acumulador, item) {
            return acumulador + item.preco;
        }, 0);
        labelTotal.textContent = 'Total: ' + formatarPreco(soma);
    }

    /*
     * Função: formatarPreco
     * Converte número para moeda brasileira.
     * Exemplo: 5.9 → "R$ 5,90"
     */
    function formatarPreco(valor) {
        /* toFixed(2): duas casas decimais | replace: troca ponto por vírgula */
        return 'R$ ' + valor.toFixed(2).replace('.', ',');
    }

    /* Salva o array de itens no armazenamento local do navegador */
    function salvarItens() {
        localStorage.setItem('listaCompras', JSON.stringify(itens));
    }

    /* Recupera e exibe os itens salvos ao abrir a página */
    function carregarItens() {
        var dadosSalvos = localStorage.getItem('listaCompras');
        if (dadosSalvos) {
            itens = JSON.parse(dadosSalvos); /* Converte JSON de volta para array */
            renderizar();
        }
    }

    /*
     * Função: definirDataImpressao
     * Insere a data atual no atributo data-data do cabeçalho.
     * O CSS @media print usa esse atributo para exibir
     * a data ao lado do título na versão impressa.
     */
    function definirDataImpressao() {
        if (!cabecalho) return;
        var hoje = new Date();
        var dia  = String(hoje.getDate()).padStart(2, '0');      /* Ex: "07"  */
        var mes  = String(hoje.getMonth() + 1).padStart(2, '0');/* Ex: "03"  */
        var ano  = hoje.getFullYear();                           /* Ex: 2026  */
        cabecalho.setAttribute('data-data', dia + '/' + mes + '/' + ano);
    }


}); /* fim DOMContentLoaded */

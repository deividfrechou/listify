/*
=======================================================
  APLICATIVO.JS — Lógica da Lista de Compras
=======================================================
  Organização:
  1.  Aguardar carregamento da página
  2.  Referências aos elementos HTML
  3.  Variáveis de estado
  4.  Inicialização
  5.  Entrada por texto
  6.  Entrada por voz
  7.  Gerenciamento dos itens (adicionar, renderizar, marcar, excluir)
  8.  Modais (editar nome e editar preço)
  9.  Botão de impressão
  10. Total e armazenamento local
=======================================================
*/


/* ===================================================
   1. AGUARDAR CARREGAMENTO DA PAGINA
   O código só roda quando todos os elementos HTML
   já foram criados pelo navegador.
=================================================== */

document.addEventListener('DOMContentLoaded', function () {


    /* ===================================================
       2. REFERENCIAS AOS ELEMENTOS HTML
    =================================================== */

    var btnMicrofone  = document.getElementById('btnMicrofone');  /* Botão do microfone */
    var btnAdicionar  = document.getElementById('btnAdicionar');  /* Botão "Adicionar" */
    var campoTexto    = document.getElementById('campoTexto');    /* Campo de digitação */
    var labelStatus   = document.getElementById('status');        /* Texto de status do microfone */
    var listaItens    = document.getElementById('lista');         /* <ul> da lista de itens */
    var labelTotal    = document.getElementById('total');         /* Texto com o total */
    var modalEditar   = document.getElementById('modalEditar');   /* Modal de edição de nome */
    var modalPreco    = document.getElementById('modalPreco');    /* Modal de edição de preço */
    var campoEditar   = document.getElementById('campoEditar');   /* Campo do modal de nome */
    var campoPreco    = document.getElementById('campoPreco');    /* Campo do modal de preço */
    var btnImprimir   = document.getElementById('btnImprimir');   /* Botão de impressão */


    /* ===================================================
       3. VARIAVEIS DE ESTADO
    =================================================== */

    var reconhecimento;     /* Objeto de reconhecimento de voz (configurado em iniciarVoz) */
    var gravando = false;   /* true quando o microfone está ativo */

    /* Array principal com todos os itens da lista.
       Cada item é: { nome: string, preco: number, marcado: boolean } */
    var itens = [];

    /* Índice do item sendo editado nos modais. -1 = nenhum */
    var indiceAtual = -1;


    /* ===================================================
       4. INICIALIZACAO
    =================================================== */

    carregarItens(); /* Recupera itens salvos no localStorage */
    iniciarVoz();    /* Configura o reconhecimento de voz */


    /* ===================================================
       5. ENTRADA POR TEXTO
    =================================================== */

    /* Clique no botão "Adicionar" */
    btnAdicionar.addEventListener('click', function () {
        var nome = campoTexto.value.trim(); /* Remove espaços nas pontas */

        if (nome) {
            adicionarItem(nome);
            campoTexto.value = '';     /* Limpa o campo */
            campoTexto.focus();        /* Mantém o foco para digitar o próximo */
        }
    });

    /* Tecla Enter no campo de texto também adiciona o item */
    campoTexto.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            btnAdicionar.click();
        }
    });


    /* ===================================================
       6. ENTRADA POR VOZ
    =================================================== */

    /*
     * Função: iniciarVoz
     * Verifica suporte do navegador e configura o reconhecedor de voz.
     */
    function iniciarVoz() {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {

            /* Usa a versão compatível com o navegador atual */
            var APIDeVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
            reconhecimento = new APIDeVoz();

            reconhecimento.lang = 'pt-BR';          /* Idioma: Português do Brasil */
            reconhecimento.continuous = true;        /* Grava vários trechos sem reiniciar */
            reconhecimento.interimResults = false;   /* Só retorna resultado final da fala */

            /* Disparado quando uma fala é reconhecida */
            reconhecimento.onresult = function (evento) {
                var textoReconhecido = evento.results[evento.results.length - 1][0].transcript.trim();

                if (textoReconhecido) {
                    adicionarItem(textoReconhecido);
                    labelStatus.textContent = 'Adicionado: "' + textoReconhecido + '"';
                }
            };

            /* Disparado quando ocorre um erro no microfone */
            reconhecimento.onerror = function () {
                labelStatus.textContent = 'Erro no microfone. Tente novamente.';
                pararGravacao();
            };

            /* Disparado quando o reconhecimento para automaticamente.
               Reinicia se ainda estiver no modo gravação. */
            reconhecimento.onend = function () {
                if (gravando) {
                    reconhecimento.start();
                }
            };

        } else {
            /* Navegador sem suporte a reconhecimento de voz */
            labelStatus.textContent = 'Seu navegador não suporta voz.';
            btnMicrofone.disabled = true;
            btnMicrofone.style.opacity = '0.4';
        }
    }

    /* Inicia gravação ao pressionar o botão (mouse) */
    btnMicrofone.addEventListener('mousedown', comecarGravacao);

    /* Inicia gravação ao tocar o botão (celular/tablet).
       passive: false permite chamar preventDefault() para evitar zoom duplo no iOS */
    btnMicrofone.addEventListener('touchstart', function (evento) {
        evento.preventDefault();
        comecarGravacao();
    }, { passive: false });

    /* Para a gravação ao soltar o mouse */
    btnMicrofone.addEventListener('mouseup', pararGravacao);

    /* Para a gravação se o cursor sair do botão sem soltar */
    btnMicrofone.addEventListener('mouseleave', pararGravacao);

    /* Para a gravação ao levantar o dedo da tela */
    btnMicrofone.addEventListener('touchend', pararGravacao);

    /* Para a gravação se o toque for cancelado (ex: ligação recebida) */
    btnMicrofone.addEventListener('touchcancel', pararGravacao);

    /*
     * Função: comecarGravacao
     * Ativa o microfone e aplica a animação visual.
     */
    function comecarGravacao() {
        if (reconhecimento) {
            try { reconhecimento.start(); } catch (erro) {}
            /* try/catch evita erro se o reconhecimento já estiver ativo */

            gravando = true;
            btnMicrofone.classList.add('gravando'); /* CSS anima o botão */
            labelStatus.textContent = 'Ouvindo...';
        }
    }

    /*
     * Função: pararGravacao
     * Desativa o microfone e remove a animação.
     */
    function pararGravacao() {
        if (reconhecimento && gravando) {
            reconhecimento.stop();
            gravando = false;
            btnMicrofone.classList.remove('gravando');
            labelStatus.textContent = 'Pressione e segure para falar';
        }
    }


    /* ===================================================
       7. GERENCIAMENTO DOS ITENS
    =================================================== */

    /*
     * Função: adicionarItem
     * Cria um novo item e insere no array.
     *
     * Parâmetro:
     *   nome — texto do item (string)
     */
    function adicionarItem(nome) {
        itens.push({
            nome: nome,
            preco: 0,         /* Preço inicial zero */
            marcado: false    /* Começa não marcado */
        });

        renderizar();
        salvarItens();
    }

    /*
     * Função: renderizar
     * Reconstrói toda a lista na tela com base no array "itens".
     * Chamada sempre que qualquer dado é alterado.
     */
    function renderizar() {
        listaItens.innerHTML = ''; /* Limpa a lista atual */

        itens.forEach(function (item, indice) {

            /* Elemento <li> da linha */
            var elementoLinha = document.createElement('li');
            elementoLinha.className = 'item' + (item.marcado ? ' marcado' : '');

            /* --- Nome clicável --- */
            var elementoNome = document.createElement('div');
            elementoNome.className = 'item-nome';
            elementoNome.textContent = item.nome;
            elementoNome.addEventListener('click', function () { marcar(indice); });

            /* --- Preço formatado --- */
            var elementoPreco = document.createElement('div');
            elementoPreco.className = 'item-preco';
            elementoPreco.textContent = formatarPreco(item.preco);

            /* --- Grupo de botões de ação --- */
            var elementoAcoes = document.createElement('div');
            elementoAcoes.className = 'acoes';

            /* Botão Editar — usa a imagem editar.png */
            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-editar',
                'Editar nome do item',
                'editar.png',
                function () { abrirModalEditar(indice); }
            ));

            /* Botão Preço — usa a imagem dinheiro.png */
            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-preco',
                'Editar preço do item',
                'dinheiro.png',
                function () { abrirModalPreco(indice); }
            ));

            /* Botão Excluir — usa a imagem excluir.png */
            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-excluir',
                'Excluir item',
                'excluir.png',
                function () { excluir(indice); }
            ));

            /* Monta a linha completa */
            elementoLinha.appendChild(elementoNome);
            elementoLinha.appendChild(elementoPreco);
            elementoLinha.appendChild(elementoAcoes);

            listaItens.appendChild(elementoLinha);
        });

        atualizarTotal();
    }

    /*
     * Função: criarBotaoComImagem
     * Cria e retorna um <button> com uma imagem <img> como ícone.
     *
     * Parâmetros:
     *   classe       — classe CSS do botão
     *   rotulo       — descrição acessível (aria-label e alt da imagem)
     *   arquivoIcone — nome do arquivo de imagem (ex: "editar.png")
     *   aoClicar     — função executada ao clicar
     */
    function criarBotaoComImagem(classe, rotulo, arquivoIcone, aoClicar) {
        var botao = document.createElement('button');
        botao.className = classe;
        botao.setAttribute('aria-label', rotulo); /* Acessibilidade para leitores de tela */

        /* Cria a imagem do ícone */
        var imagem = document.createElement('img');
        imagem.src = arquivoIcone;
        imagem.alt = rotulo;               /* Texto alternativo da imagem */
        imagem.className = 'icone-acao';   /* Classe CSS que define o tamanho */

        botao.appendChild(imagem);
        botao.addEventListener('click', aoClicar);

        return botao;
    }

    /*
     * Função: marcar
     * Alterna o estado comprado/não comprado de um item.
     */
    function marcar(indice) {
        itens[indice].marcado = !itens[indice].marcado; /* Inverte o valor booleano */
        renderizar();
        salvarItens();
    }

    /*
     * Função: excluir
     * Remove um item do array pela sua posição.
     */
    function excluir(indice) {
        itens.splice(indice, 1); /* Remove 1 elemento a partir da posição */
        renderizar();
        salvarItens();
    }


    /* ===================================================
       8. MODAIS
    =================================================== */

    /*
     * Função: abrirModalEditar
     * Abre o modal de nome e preenche com o nome atual do item.
     */
    function abrirModalEditar(indice) {
        indiceAtual = indice;
        campoEditar.value = itens[indice].nome;
        modalEditar.style.display = 'flex';

        /* setTimeout garante que o campo esteja visível antes de receber foco.
           Necessário para o teclado abrir corretamente em alguns celulares. */
        setTimeout(function () {
            campoEditar.focus();
            campoEditar.select(); /* Seleciona o texto para facilitar a substituição */
        }, 100);
    }

    /* Cancela a edição de nome */
    document.getElementById('cancelarEditar').addEventListener('click', function () {
        modalEditar.style.display = 'none';
    });

    /* Confirma a edição de nome */
    document.getElementById('confirmarEditar').addEventListener('click', function () {
        var novoNome = campoEditar.value.trim();
        if (indiceAtual !== -1 && novoNome) {
            itens[indiceAtual].nome = novoNome;
            renderizar();
            salvarItens();
            modalEditar.style.display = 'none';
        }
    });

    /* Enter também confirma a edição de nome */
    campoEditar.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            document.getElementById('confirmarEditar').click();
        }
    });

    /*
     * Função: abrirModalPreco
     * Abre o modal de preço e preenche com o preço atual do item.
     */
    function abrirModalPreco(indice) {
        indiceAtual = indice;
        campoPreco.value = itens[indice].preco;
        modalPreco.style.display = 'flex';

        setTimeout(function () {
            campoPreco.focus();
            campoPreco.select();
        }, 100);
    }

    /* Cancela a edição de preço */
    document.getElementById('cancelarPreco').addEventListener('click', function () {
        modalPreco.style.display = 'none';
    });

    /* Confirma a edição de preço */
    document.getElementById('confirmarPreco').addEventListener('click', function () {
        if (indiceAtual !== -1) {
            /* parseFloat converte texto em número. || 0 garante zero se inválido */
            itens[indiceAtual].preco = parseFloat(campoPreco.value) || 0;
            renderizar();
            salvarItens();
            modalPreco.style.display = 'none';
        }
    });

    /* Enter também confirma a edição de preço */
    campoPreco.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            document.getElementById('confirmarPreco').click();
        }
    });

    /* Clique no fundo escuro fecha qualquer modal aberto */
    [modalEditar, modalPreco].forEach(function (modal) {
        modal.addEventListener('click', function (evento) {
            /* evento.target é o elemento clicado diretamente.
               Se for o fundo do modal (e não algo dentro dele), fecha. */
            if (evento.target === modal) {
                modal.style.display = 'none';
            }
        });
    });


    /* ===================================================
       9. BOTAO DE IMPRESSAO
    =================================================== */

    /* Clique no botão "Imprimir Lista" abre o diálogo de impressão do navegador.
       O CSS no estilos.css (@media print) controla o que aparece no papel:
       oculta botões, campos e microfone; mostra apenas a lista e o total. */
    btnImprimir.addEventListener('click', function () {
        window.print();
    });


    /* ===================================================
       10. TOTAL E ARMAZENAMENTO LOCAL
    =================================================== */

    /*
     * Função: atualizarTotal
     * Soma os preços de todos os itens e exibe o resultado.
     */
    function atualizarTotal() {
        /* reduce percorre o array somando os preços.
           O segundo argumento (0) é o valor inicial do acumulador. */
        var soma = itens.reduce(function (acumulador, item) {
            return acumulador + item.preco;
        }, 0);

        labelTotal.textContent = 'Total: ' + formatarPreco(soma);
    }

    /*
     * Função: formatarPreco
     * Converte um número para o formato de moeda brasileira.
     * Exemplo: 5.9 → "R$ 5,90"
     */
    function formatarPreco(valor) {
        return 'R$ ' + valor.toFixed(2).replace('.', ',');
        /* toFixed(2): garante duas casas decimais (5.9 → "5.90")
           replace('.', ','): troca ponto por vírgula (padrão brasileiro) */
    }

    /*
     * Função: salvarItens
     * Converte o array para texto JSON e salva no localStorage do navegador.
     * Os dados persistem mesmo após fechar e reabrir a aba.
     */
    function salvarItens() {
        localStorage.setItem('listaCompras', JSON.stringify(itens));
    }

    /*
     * Função: carregarItens
     * Lê os itens salvos no localStorage e os exibe.
     * Chamada uma vez ao abrir a página.
     */
    function carregarItens() {
        var dadosSalvos = localStorage.getItem('listaCompras');

        if (dadosSalvos) {
            itens = JSON.parse(dadosSalvos); /* Converte de texto JSON para array */
            renderizar();
        }
    }


}); /* Fim do DOMContentLoaded */

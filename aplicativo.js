/*
=======================================================
  APLICATIVO.JS — Lógica da Lista de Compras
=======================================================
  Organização:
  1.  Aguardar carregamento da página
  2.  Referências aos elementos HTML
  3.  Variáveis de estado
  4.  Inicialização
  5.  Teclado virtual — Visual Viewport API
  6.  Entrada por texto
  7.  Entrada por voz  ← corrigido para iOS e Android
  8.  Gerenciamento dos itens
  9.  Modais
  10. Botão de impressão
  11. Total e armazenamento local
=======================================================
*/


/* ===================================================
   1. AGUARDAR CARREGAMENTO DA PAGINA
   Garante que todos os elementos HTML existam antes
   de o JavaScript tentar acessá-los.
=================================================== */

document.addEventListener('DOMContentLoaded', function () {


    /* ===================================================
       2. REFERENCIAS AOS ELEMENTOS HTML
    =================================================== */

    var btnMicrofone = document.getElementById('btnMicrofone');  /* Botão do microfone       */
    var btnAdicionar = document.getElementById('btnAdicionar');  /* Botão "Adicionar"        */
    var campoTexto   = document.getElementById('campoTexto');    /* Campo de digitação       */
    var labelStatus  = document.getElementById('status');        /* Texto de status do mic   */
    var listaItens   = document.getElementById('lista');         /* <ul> da lista de itens   */
    var labelTotal   = document.getElementById('total');         /* Texto com o total        */
    var modalEditar  = document.getElementById('modalEditar');   /* Modal de edição de nome  */
    var modalPreco   = document.getElementById('modalPreco');    /* Modal de edição de preço */
    var campoEditar  = document.getElementById('campoEditar');   /* Campo do modal de nome   */
    var campoPreco   = document.getElementById('campoPreco');    /* Campo do modal de preço  */
    var btnImprimir  = document.getElementById('btnImprimir');   /* Botão de impressão       */


    /* ===================================================
       3. VARIAVEIS DE ESTADO
    =================================================== */

    /* Objeto de reconhecimento de voz — configurado em iniciarVoz() */
    var reconhecimento = null;

    /* true quando o microfone está escutando ativamente */
    var gravando = false;

    /* Array com todos os itens: [ { nome, preco, marcado }, ... ] */
    var itens = [];

    /* Índice do item sendo editado nos modais (-1 = nenhum) */
    var indiceAtual = -1;

    /* Altura da janela sem teclado — usada no fallback de viewport */
    var alturaOriginalViewport = window.innerHeight;


    /* ===================================================
       4. INICIALIZACAO
    =================================================== */

    carregarItens();
    iniciarVoz();
    iniciarControleDoTeclado();


    /* ===================================================
       5. TECLADO VIRTUAL — VISUAL VIEWPORT API

       Quando o teclado virtual abre no celular, ele "sobrepõe"
       a página por padrão. A solução é detectar em tempo real
       a altura da área visível (acima do teclado) e usar esse
       valor para reposicionar o modal através de uma variável CSS.
    =================================================== */

    function iniciarControleDoTeclado() {

        if (window.visualViewport) {
            /* Método moderno: Visual Viewport API.
               Dispara sempre que a viewport muda (teclado, zoom, rotação). */
            window.visualViewport.addEventListener('resize', aoMudarViewport);
            window.visualViewport.addEventListener('scroll', aoMudarViewport);
        } else {
            /* Fallback para navegadores sem a API moderna */
            window.addEventListener('resize', aoMudarViewportFallback);
        }
    }

    /* Atualiza a variável CSS --altura-visivel com a altura real disponível */
    function aoMudarViewport() {
        var alturaVisivel = window.visualViewport.height;

        document.documentElement.style.setProperty(
            '--altura-visivel',
            alturaVisivel + 'px'
        );

        /* Se um modal estiver aberto, rola o campo para ficar visível */
        var campoFocado = document.querySelector('.modal[style*="flex"] input:focus');
        if (campoFocado) {
            campoFocado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        /* Se o campo principal estiver ativo, sobe para ele */
        if (document.activeElement === campoTexto) {
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /* Versão fallback — detecta abertura do teclado pela queda de altura */
    function aoMudarViewportFallback() {
        var alturaAtual = window.innerHeight;

        if (alturaOriginalViewport - alturaAtual > 150) {
            /* Teclado provavelmente aberto */
            document.documentElement.style.setProperty(
                '--altura-visivel', alturaAtual + 'px'
            );
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


    /* ===================================================
       6. ENTRADA POR TEXTO
    =================================================== */

    /* Clique no botão "Adicionar" */
    btnAdicionar.addEventListener('click', function () {
        var nome = campoTexto.value.trim();
        if (nome) {
            adicionarItem(nome);
            campoTexto.value = '';
            campoTexto.focus();
        }
    });

    /* Enter no campo também adiciona */
    campoTexto.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') btnAdicionar.click();
    });

    /* Rola para o campo após o teclado subir */
    campoTexto.addEventListener('focus', function () {
        setTimeout(function () {
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
    });

    /* Ao sair do campo, restaura a altura se nenhum modal estiver aberto */
    campoTexto.addEventListener('blur', function () {
        if (!document.querySelector('.modal[style*="flex"]')) {
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    });


    /* ===================================================
       7. ENTRADA POR VOZ

       Por que o microfone falha no celular?
       ─────────────────────────────────────
       • iOS Safari/Chrome: NÃO suporta continuous:true.
         A sessão para automaticamente após cada silêncio.

       • Android Chrome: suporta melhor, mas exige HTTPS
         e permissão concedida dentro de um gesto do usuário.

       • "Pressione e segure": causava conflitos com gestos
         do sistema (scroll, seleção de texto, etc.).

       Solução adotada
       ───────────────
       • Botão de toque simples: um toque LIGA, outro DESLIGA.
       • continuous: false — compatível com iOS e Android.
       • Ao terminar cada fala, reiniciamos manualmente se o
         usuário ainda não desligou.
       • getUserMedia() pede permissão explicitamente antes de
         iniciar, necessário no iOS Safari.
       • Tratamento detalhado de cada tipo de erro.
    =================================================== */

    /*
     * Função: iniciarVoz
     * Verifica suporte da API e configura o reconhecedor.
     * Chamada uma vez ao carregar a página.
     */
    function iniciarVoz() {

        /* Verifica compatibilidade — Chrome usa prefixo "webkit" */
        var temAPI = ('SpeechRecognition' in window) ||
                     ('webkitSpeechRecognition' in window);

        if (!temAPI) {
            labelStatus.textContent = 'Voz não suportada neste navegador.';
            btnMicrofone.disabled = true;
            btnMicrofone.style.opacity = '0.4';
            return;
        }

        /* Cria o objeto usando a versão disponível no navegador */
        var APIDeVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new APIDeVoz();

        reconhecimento.lang           = 'pt-BR'; /* Português do Brasil          */
        reconhecimento.continuous     = false;   /* false = compatível com iOS   */
        reconhecimento.interimResults = false;   /* Só retorna o resultado final */
        reconhecimento.maxAlternatives = 1;      /* Apenas a melhor interpretação */

        /* Disparado quando o navegador reconhece o que foi dito */
        reconhecimento.onresult = function (evento) {
            var textoReconhecido = evento.results[0][0].transcript.trim();

            if (textoReconhecido) {
                adicionarItem(textoReconhecido);
                labelStatus.textContent = 'Adicionado: "' + textoReconhecido + '"';
            }

            /* Como continuous:false para após cada fala, reiniciamos
               manualmente enquanto o usuário não desligar o microfone */
            if (gravando) {
                setTimeout(function () {
                    try { reconhecimento.start(); } catch (e) {}
                }, 150);
            }
        };

        /* Disparado ao ocorrer qualquer erro — cada tipo tem causa diferente */
        reconhecimento.onerror = function (evento) {

            switch (evento.error) {

                case 'not-allowed':
                    /* Usuário negou permissão, ou página sem HTTPS */
                    labelStatus.textContent = 'Permissão negada. Verifique as configurações.';
                    pararGravacao();
                    break;

                case 'no-speech':
                    /* Silêncio por tempo demais — não é erro grave, reinicia */
                    labelStatus.textContent = 'Nada ouvido. Fale mais perto do microfone.';
                    if (gravando) {
                        setTimeout(function () {
                            try { reconhecimento.start(); } catch (e) {}
                        }, 300);
                    }
                    break;

                case 'audio-capture':
                    /* Microfone não encontrado ou ocupado por outro app */
                    labelStatus.textContent = 'Microfone indisponível ou ocupado.';
                    pararGravacao();
                    break;

                case 'network':
                    /* Reconhecimento de voz precisa de internet (serviço na nuvem) */
                    labelStatus.textContent = 'Sem internet. Reconhecimento de voz requer conexão.';
                    pararGravacao();
                    break;

                case 'aborted':
                    /* Gravação cancelada manualmente — mensagem neutra */
                    labelStatus.textContent = 'Toque no microfone para falar';
                    break;

                default:
                    labelStatus.textContent = 'Erro no microfone. Tente novamente.';
                    pararGravacao();
            }
        };

        /* Disparado quando o reconhecimento termina naturalmente.
           Com continuous:false isso ocorre após cada fala.
           Reinicia se o usuário ainda não desligou. */
        reconhecimento.onend = function () {
            if (gravando) {
                setTimeout(function () {
                    try {
                        reconhecimento.start();
                    } catch (erroReinicio) {
                        /* Se não conseguir reiniciar, para graciosamente */
                        pararGravacao();
                    }
                }, 150);
            }
        };

        /* Avisa que o microfone está pronto */
        labelStatus.textContent = 'Toque no microfone para falar';
    }


    /* --- Evento do botão do microfone ---

       Usamos 'click' (não mousedown/touchstart) porque:
       • click já unifica cliques de mouse E toques na tela
       • Evita disparos duplos em celular
       • Funciona dentro de um "gesto do usuário" exigido
         pelo iOS Safari para pedir permissão do microfone  */
    btnMicrofone.addEventListener('click', alternarGravacao);

    /*
     * Função: alternarGravacao
     * Liga se estiver desligado, desliga se estiver ligado.
     */
    function alternarGravacao() {
        if (gravando) {
            pararGravacao();
        } else {
            comecarGravacao();
        }
    }

    /*
     * Função: comecarGravacao
     * Pede permissão do microfone explicitamente via getUserMedia,
     * depois inicia o reconhecimento de voz.
     *
     * Por que getUserMedia antes de iniciar?
     * No iOS Safari, a permissão do microfone SÓ pode ser pedida
     * dentro de um evento disparado pelo usuário (clique, toque).
     * Pedir permissão via getUserMedia garante que o navegador
     * mostre o diálogo de permissão corretamente.
     */
    function comecarGravacao() {
        if (!reconhecimento) return;

        labelStatus.textContent = 'Solicitando permissão...';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {

            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (fluxo) {
                    /* Permissão concedida.
                       Paramos o fluxo de teste — o reconhecimento
                       abrirá o microfone por conta própria. */
                    fluxo.getTracks().forEach(function (faixa) {
                        faixa.stop();
                    });
                    iniciarReconhecimento();
                })
                .catch(function (erro) {
                    /* Permissão negada pelo usuário */
                    labelStatus.textContent = 'Permissão negada. Verifique as configurações.';
                });

        } else {
            /* Navegador sem getUserMedia — tenta iniciar diretamente */
            iniciarReconhecimento();
        }
    }

    /*
     * Função: iniciarReconhecimento
     * Inicia o reconhecimento após a permissão ser concedida.
     */
    function iniciarReconhecimento() {
        try {
            reconhecimento.start();
            gravando = true;
            btnMicrofone.classList.add('gravando');    /* Animação de pulso vermelho */
            labelStatus.textContent = 'Ouvindo… toque para parar';
        } catch (erro) {
            labelStatus.textContent = 'Tente novamente.';
        }
    }

    /*
     * Função: pararGravacao
     * Para o microfone e restaura a interface ao estado inicial.
     */
    function pararGravacao() {
        gravando = false;
        btnMicrofone.classList.remove('gravando');
        labelStatus.textContent = 'Toque no microfone para falar';

        if (reconhecimento) {
            try {
                /* abort() para imediatamente sem tentar processar o áudio */
                reconhecimento.abort();
            } catch (erro) { /* Ignora se já estava parado */ }
        }
    }


    /* ===================================================
       8. GERENCIAMENTO DOS ITENS
    =================================================== */

    /*
     * Função: adicionarItem
     * Cria novo item com preço zero e não marcado.
     */
    function adicionarItem(nome) {
        itens.push({ nome: nome, preco: 0, marcado: false });
        renderizar();
        salvarItens();
    }

    /*
     * Função: renderizar
     * Reconstrói toda a lista na tela a partir do array "itens".
     */
    function renderizar() {
        listaItens.innerHTML = '';

        itens.forEach(function (item, indice) {

            var elementoLinha = document.createElement('li');
            elementoLinha.className = 'item' + (item.marcado ? ' marcado' : '');

            /* Nome — clicável para marcar/desmarcar */
            var elementoNome = document.createElement('div');
            elementoNome.className   = 'item-nome';
            elementoNome.textContent = item.nome;
            elementoNome.addEventListener('click', function () { marcar(indice); });

            /* Preço formatado */
            var elementoPreco = document.createElement('div');
            elementoPreco.className   = 'item-preco';
            elementoPreco.textContent = formatarPreco(item.preco);

            /* Botões de ação */
            var elementoAcoes = document.createElement('div');
            elementoAcoes.className = 'acoes';

            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-editar', 'Editar nome', 'editar.png',
                function () { abrirModalEditar(indice); }
            ));
            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-preco', 'Editar preço', 'dinheiro.png',
                function () { abrirModalPreco(indice); }
            ));
            elementoAcoes.appendChild(criarBotaoComImagem(
                'btn-excluir', 'Excluir item', 'excluir.png',
                function () { excluir(indice); }
            ));

            elementoLinha.appendChild(elementoNome);
            elementoLinha.appendChild(elementoPreco);
            elementoLinha.appendChild(elementoAcoes);
            listaItens.appendChild(elementoLinha);
        });

        atualizarTotal();
    }

    /*
     * Função: criarBotaoComImagem
     * Cria um <button> com ícone <img> e clique configurado.
     */
    function criarBotaoComImagem(classe, rotulo, arquivoIcone, aoClicar) {
        var botao = document.createElement('button');
        botao.className = classe;
        botao.setAttribute('aria-label', rotulo); /* Leitores de tela */

        var imagem       = document.createElement('img');
        imagem.src       = arquivoIcone;
        imagem.alt       = rotulo;
        imagem.className = 'icone-acao';

        botao.appendChild(imagem);
        botao.addEventListener('click', aoClicar);
        return botao;
    }

    /* Inverte o estado marcado/desmarcado de um item */
    function marcar(indice) {
        itens[indice].marcado = !itens[indice].marcado;
        renderizar();
        salvarItens();
    }

    /* Remove um item do array pelo índice */
    function excluir(indice) {
        itens.splice(indice, 1);
        renderizar();
        salvarItens();
    }


    /* ===================================================
       9. MODAIS
    =================================================== */

    /* Abre o modal de edição de nome e preenche o campo */
    function abrirModalEditar(indice) {
        indiceAtual          = indice;
        campoEditar.value    = itens[indice].nome;
        modalEditar.style.display = 'flex';

        setTimeout(function () {
            campoEditar.focus();
            campoEditar.select();
            setTimeout(function () {
                campoEditar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }, 80);
    }

    document.getElementById('cancelarEditar').addEventListener('click', function () {
        modalEditar.style.display = 'none';
        document.documentElement.style.removeProperty('--altura-visivel');
    });

    document.getElementById('confirmarEditar').addEventListener('click', function () {
        var novoNome = campoEditar.value.trim();
        if (indiceAtual !== -1 && novoNome) {
            itens[indiceAtual].nome = novoNome;
            renderizar();
            salvarItens();
            modalEditar.style.display = 'none';
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    });

    campoEditar.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') document.getElementById('confirmarEditar').click();
    });

    /* Abre o modal de edição de preço e preenche o campo */
    function abrirModalPreco(indice) {
        indiceAtual         = indice;
        campoPreco.value    = itens[indice].preco;
        modalPreco.style.display = 'flex';

        setTimeout(function () {
            campoPreco.focus();
            campoPreco.select();
            setTimeout(function () {
                campoPreco.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }, 80);
    }

    document.getElementById('cancelarPreco').addEventListener('click', function () {
        modalPreco.style.display = 'none';
        document.documentElement.style.removeProperty('--altura-visivel');
    });

    document.getElementById('confirmarPreco').addEventListener('click', function () {
        if (indiceAtual !== -1) {
            itens[indiceAtual].preco = parseFloat(campoPreco.value) || 0;
            renderizar();
            salvarItens();
            modalPreco.style.display = 'none';
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    });

    campoPreco.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') document.getElementById('confirmarPreco').click();
    });

    /* Toque no fundo escuro fecha o modal */
    [modalEditar, modalPreco].forEach(function (modal) {
        modal.addEventListener('click', function (evento) {
            if (evento.target === modal) {
                modal.style.display = 'none';
                document.documentElement.style.removeProperty('--altura-visivel');
            }
        });
    });


    /* ===================================================
       10. BOTAO DE IMPRESSAO
    =================================================== */

    btnImprimir.addEventListener('click', function () {
        window.print();
    });


    /* ===================================================
       11. TOTAL E ARMAZENAMENTO LOCAL
    =================================================== */

    /* Soma os preços e atualiza o texto do total */
    function atualizarTotal() {
        var soma = itens.reduce(function (acumulador, item) {
            return acumulador + item.preco;
        }, 0);
        labelTotal.textContent = 'Total: ' + formatarPreco(soma);
    }

    /*
     * Função: formatarPreco
     * Converte número para moeda brasileira: 5.9 → "R$ 5,90"
     */
    function formatarPreco(valor) {
        /* toFixed(2): duas casas decimais | replace: troca ponto por vírgula */
        return 'R$ ' + valor.toFixed(2).replace('.', ',');
    }

    /* Salva o array como texto JSON no armazenamento local do navegador */
    function salvarItens() {
        localStorage.setItem('listaCompras', JSON.stringify(itens));
    }

    /* Recupera e exibe os itens salvos ao abrir a página */
    function carregarItens() {
        var dadosSalvos = localStorage.getItem('listaCompras');
        if (dadosSalvos) {
            itens = JSON.parse(dadosSalvos);
            renderizar();
        }
    }


}); /* Fim do DOMContentLoaded */

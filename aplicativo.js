/*
=======================================================
  APLICATIVO.JS — Lista de Compras
=======================================================
  1.  Inicialização
  2.  Referências HTML
  3.  Estado global
  4.  TECLADO PRÓPRIO DO SITE
      4a. Abrir / fechar
      4b. Digitar caracteres
      4c. Ações especiais (apagar, maiúscula, confirmar)
      4d. Alternar faces (letras ↔ números)
      4e. Sincronizar com o campo real
  5.  Entrada por texto (campo + botão Adicionar)
  6.  Entrada por voz (microfone)
  7.  Gerenciamento de itens
  8.  Modais (editar nome e preço)
  9.  Botão de impressão
  10. Total e localStorage
=======================================================
*/

document.addEventListener('DOMContentLoaded', function () {


    /* ═══════════════════════════════════════════
       2. REFERÊNCIAS HTML
    ═══════════════════════════════════════════ */

    /* Página */
    var campoTexto   = document.getElementById('campoTexto');
    var btnAdicionar = document.getElementById('btnAdicionar');
    var btnMicrofone = document.getElementById('btnMicrofone');
    var labelStatus  = document.getElementById('status');
    var listaItens   = document.getElementById('lista');
    var labelTotal   = document.getElementById('total');
    var btnImprimir  = document.getElementById('btnImprimir');

    /* Teclado do site */
    var teclado          = document.getElementById('teclado');
    var tecladoVisor     = document.getElementById('tecladoVisorTexto');
    var tecladoFechar    = document.getElementById('tecladoFechar');
    var tecladoLetras    = document.getElementById('tecladoLetras');
    var tecladoNumeros   = document.getElementById('tecladoNumeros');
    var btnMaiuscula     = document.getElementById('btnMaiuscula');

    /* Modais */
    var modalEditar  = document.getElementById('modalEditar');
    var modalPreco   = document.getElementById('modalPreco');
    var campoEditar  = document.getElementById('campoEditar');
    var campoPreco   = document.getElementById('campoPreco');


    /* ═══════════════════════════════════════════
       3. ESTADO GLOBAL
    ═══════════════════════════════════════════ */

    var itens        = [];          /* Array de itens: { nome, preco, marcado } */
    var indiceAtual  = -1;          /* Índice do item sendo editado nos modais  */
    var reconhecimento = null;      /* Objeto de reconhecimento de voz          */
    var gravando     = false;       /* true quando o microfone está ativo       */

    /* Estado do teclado próprio */
    var tecladoTexto    = '';       /* Texto sendo composto no teclado          */
    var maiusculaAtiva  = false;    /* true = próxima letra será maiúscula      */
    var faceLock        = false;    /* Evita cliques duplos nas teclas          */


    /* ═══════════════════════════════════════════
       4. TECLADO PRÓPRIO DO SITE

       Como funciona:
       • O campo <input> tem "readonly" — o teclado do sistema NUNCA abre.
       • Ao tocar no campo, o teclado do SITE sobe da base da tela.
       • O teclado gerencia uma variável "tecladoTexto" e a espelha
         no campo visível e no visor interno do teclado.
       • Ao pressionar OK, o texto é adicionado como item.
    ═══════════════════════════════════════════ */

    /* ── 4a. Abrir e fechar ── */

    /* Abre o teclado ao tocar no campo de texto */
    campoTexto.addEventListener('click', abrirTeclado);
    campoTexto.addEventListener('touchend', function (e) {
        e.preventDefault();   /* Evita que o iOS tente abrir o teclado nativo */
        abrirTeclado();
    }, { passive: false });

    function abrirTeclado() {
        tecladoTexto = campoTexto.value; /* Preserva texto já digitado */
        atualizarVisor();
        teclado.classList.add('teclado-visivel');
        campoTexto.classList.add('campo-ativo');

        /* Informa ao CSS a altura do teclado para que a página role
           e o campo fique visível acima do teclado */
        setTimeout(function () {
            var altTeclado = teclado.offsetHeight;
            document.documentElement.style.setProperty('--altura-teclado', altTeclado + 'px');
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 270); /* Aguarda a animação de abertura terminar (transition: 0.25s) */
    }

    function fecharTeclado() {
        teclado.classList.remove('teclado-visivel');
        campoTexto.classList.remove('campo-ativo');
        document.documentElement.style.setProperty('--altura-teclado', '0px');
    }

    tecladoFechar.addEventListener('click', fecharTeclado);


    /* ── 4b. Digitar caracteres ── */

    /* Delegação de eventos: um único listener no teclado inteiro
       captura cliques em QUALQUER tecla filha */
    teclado.addEventListener('click', function (evento) {
        var tecla = evento.target.closest('[data-char],[data-acao]');
        if (!tecla) return;

        var char  = tecla.getAttribute('data-char');
        var acao  = tecla.getAttribute('data-acao');

        if (char !== null) {
            /* É uma tecla de caractere — adiciona ao texto */
            var letra = maiusculaAtiva ? char.toUpperCase() : char;
            tecladoTexto += letra;

            /* Maiúscula automática: desativa após a primeira letra */
            if (maiusculaAtiva) {
                maiusculaAtiva = false;
                btnMaiuscula.classList.remove('ativo');
                atualizarLetrasTeclado();
            }

            atualizarVisor();

        } else if (acao) {
            /* É uma tecla de ação especial */
            processarAcao(acao);
        }
    });

    /* Toque longo no botão apagar: apaga continuamente enquanto segura */
    var intervaloApagar = null;

    teclado.addEventListener('pointerdown', function (e) {
        var tecla = e.target.closest('[data-acao="apagar"]');
        if (!tecla) return;

        /* Inicia apagamento contínuo após 400ms segurando */
        intervaloApagar = setTimeout(function () {
            intervaloApagar = setInterval(function () {
                if (tecladoTexto.length > 0) {
                    tecladoTexto = tecladoTexto.slice(0, -1);
                    atualizarVisor();
                }
            }, 80);
        }, 400);
    });

    /* Para o apagamento contínuo ao soltar */
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        teclado.addEventListener(ev, function () {
            if (intervaloApagar) {
                clearTimeout(intervaloApagar);
                clearInterval(intervaloApagar);
                intervaloApagar = null;
            }
        });
    });


    /* ── 4c. Ações especiais ── */

    function processarAcao(acao) {
        switch (acao) {

            case 'apagar':
                /* Remove o último caractere */
                if (tecladoTexto.length > 0) {
                    tecladoTexto = tecladoTexto.slice(0, -1);
                    atualizarVisor();
                }
                break;

            case 'maiuscula':
                /* Alterna maiúscula / minúscula para a próxima tecla */
                maiusculaAtiva = !maiusculaAtiva;
                btnMaiuscula.classList.toggle('ativo', maiusculaAtiva);
                atualizarLetrasTeclado();
                break;

            case 'numeros':
                /* Mostra a face de números e símbolos */
                tecladoLetras.classList.add('teclado-face-oculta');
                tecladoNumeros.classList.remove('teclado-face-oculta');
                break;

            case 'letras':
                /* Volta para a face de letras */
                tecladoNumeros.classList.add('teclado-face-oculta');
                tecladoLetras.classList.remove('teclado-face-oculta');
                break;

            case 'confirmar':
                /* Adiciona o item e fecha o teclado */
                var nome = tecladoTexto.trim();
                if (nome) {
                    adicionarItem(nome);
                    tecladoTexto = '';
                    campoTexto.value = '';
                    atualizarVisor();
                }
                fecharTeclado();
                break;
        }
    }


    /* ── 4d. Atualizar visor e campo ── */

    function atualizarVisor() {
        /* Mostra o texto no visor interno do teclado */
        tecladoVisor.textContent = tecladoTexto;

        /* Espelha no campo de texto visível da página */
        campoTexto.value = tecladoTexto;

        /* Placeholder personalizado quando vazio */
        if (tecladoTexto === '') {
            campoTexto.setAttribute('placeholder', 'Toque aqui para digitar...');
        } else {
            campoTexto.setAttribute('placeholder', '');
        }
    }

    /* Atualiza as letras do teclado para maiúsculo/minúsculo */
    function atualizarLetrasTeclado() {
        var teclas = tecladoLetras.querySelectorAll('[data-char]');
        teclas.forEach(function (t) {
            var char = t.getAttribute('data-char');
            /* Só atualiza letras simples (não acentuadas de comprimento 1) */
            if (char.length === 1) {
                t.textContent = maiusculaAtiva ? char.toUpperCase() : char.toLowerCase();
            }
        });
    }


    /* ═══════════════════════════════════════════
       5. ENTRADA POR TEXTO
       O botão "Adicionar" usa o texto do teclado.
    ═══════════════════════════════════════════ */

    btnAdicionar.addEventListener('click', function () {
        /* Tenta usar o texto do teclado; fallback para o campo direto */
        var nome = (tecladoTexto || campoTexto.value).trim();
        if (nome) {
            adicionarItem(nome);
            tecladoTexto    = '';
            campoTexto.value = '';
            atualizarVisor();
            fecharTeclado();
        }
    });


    /* ═══════════════════════════════════════════
       6. ENTRADA POR VOZ
    ═══════════════════════════════════════════ */

    function iniciarVoz() {
        var temAPI = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);

        if (!temAPI) {
            labelStatus.textContent = 'Voz não suportada neste navegador.';
            btnMicrofone.disabled   = true;
            btnMicrofone.style.opacity = '0.4';
            return;
        }

        var APIDeVoz   = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new APIDeVoz();

        reconhecimento.lang            = 'pt-BR';
        reconhecimento.continuous      = false;   /* false = compatível com iOS */
        reconhecimento.interimResults  = false;
        reconhecimento.maxAlternatives = 1;

        reconhecimento.onresult = function (evento) {
            var texto = evento.results[0][0].transcript.trim();
            if (texto) {
                adicionarItem(texto);
                labelStatus.textContent = 'Adicionado: "' + texto + '"';
            }
            /* Reinicia enquanto o usuário não desligar */
            if (gravando) {
                setTimeout(function () {
                    try { reconhecimento.start(); } catch (e) {}
                }, 150);
            }
        };

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
                    labelStatus.textContent = 'Toque no microfone para falar'; break;
                default:
                    labelStatus.textContent = 'Erro. Tente novamente.';
                    pararGravacao();
            }
        };

        reconhecimento.onend = function () {
            if (gravando) {
                setTimeout(function () {
                    try { reconhecimento.start(); } catch (e) { pararGravacao(); }
                }, 150);
            }
        };

        labelStatus.textContent = 'Toque no microfone para falar';
    }

    btnMicrofone.addEventListener('click', function () {
        gravando ? pararGravacao() : comecarGravacao();
    });

    function comecarGravacao() {
        if (!reconhecimento) return;
        labelStatus.textContent = 'Solicitando permissão...';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (fluxo) {
                    fluxo.getTracks().forEach(function (f) { f.stop(); });
                    iniciarReconhecimento();
                })
                .catch(function () {
                    labelStatus.textContent = 'Permissão negada. Verifique as configurações.';
                });
        } else {
            iniciarReconhecimento();
        }
    }

    function iniciarReconhecimento() {
        try {
            reconhecimento.start();
            gravando = true;
            btnMicrofone.classList.add('gravando');
            labelStatus.textContent = 'Ouvindo… toque para parar';
        } catch (e) {
            labelStatus.textContent = 'Tente novamente.';
        }
    }

    function pararGravacao() {
        gravando = false;
        btnMicrofone.classList.remove('gravando');
        labelStatus.textContent = 'Toque no microfone para falar';
        if (reconhecimento) {
            try { reconhecimento.abort(); } catch (e) {}
        }
    }


    /* ═══════════════════════════════════════════
       7. GERENCIAMENTO DE ITENS
    ═══════════════════════════════════════════ */

    function adicionarItem(nome) {
        itens.push({ nome: nome, preco: 0, marcado: false });
        renderizar();
        salvarItens();
    }

    function renderizar() {
        listaItens.innerHTML = '';

        itens.forEach(function (item, indice) {
            var li = document.createElement('li');
            li.className = 'item' + (item.marcado ? ' marcado' : '');

            var nome = document.createElement('div');
            nome.className   = 'item-nome';
            nome.textContent = item.nome;
            nome.addEventListener('click', function () { marcar(indice); });

            var preco = document.createElement('div');
            preco.className   = 'item-preco';
            preco.textContent = formatarPreco(item.preco);

            var acoes = document.createElement('div');
            acoes.className = 'acoes';
            acoes.appendChild(criarBotao('btn-editar', 'Editar nome',  'editar.png',   function () { abrirModalEditar(indice); }));
            acoes.appendChild(criarBotao('btn-preco',  'Editar preço', 'dinheiro.png', function () { abrirModalPreco(indice);  }));
            acoes.appendChild(criarBotao('btn-excluir','Excluir',      'excluir.png',  function () { excluir(indice);          }));

            li.appendChild(nome);
            li.appendChild(preco);
            li.appendChild(acoes);
            listaItens.appendChild(li);
        });

        atualizarTotal();
    }

    function criarBotao(classe, rotulo, icone, aoClicar) {
        var btn = document.createElement('button');
        btn.className = classe;
        btn.setAttribute('aria-label', rotulo);
        var img = document.createElement('img');
        img.src = icone; img.alt = rotulo; img.className = 'icone-acao';
        btn.appendChild(img);
        btn.addEventListener('click', aoClicar);
        return btn;
    }

    function marcar(i)  { itens[i].marcado = !itens[i].marcado; renderizar(); salvarItens(); }
    function excluir(i) { itens.splice(i, 1); renderizar(); salvarItens(); }


    /* ═══════════════════════════════════════════
       8. MODAIS (editar nome e preço)
       Esses campos usam o teclado do SISTEMA — aparecem
       flutuando sobre a lista, então não há conflito.
    ═══════════════════════════════════════════ */

    function abrirModalEditar(indice) {
        indiceAtual = indice;
        campoEditar.value = itens[indice].nome;
        modalEditar.style.display = 'flex';
        setTimeout(function () { campoEditar.focus(); campoEditar.select(); }, 80);
    }

    document.getElementById('cancelarEditar').addEventListener('click', function () {
        modalEditar.style.display = 'none';
    });
    document.getElementById('confirmarEditar').addEventListener('click', function () {
        var v = campoEditar.value.trim();
        if (indiceAtual !== -1 && v) {
            itens[indiceAtual].nome = v;
            renderizar(); salvarItens();
            modalEditar.style.display = 'none';
        }
    });
    campoEditar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('confirmarEditar').click();
    });

    function abrirModalPreco(indice) {
        indiceAtual = indice;
        campoPreco.value = itens[indice].preco;
        modalPreco.style.display = 'flex';
        setTimeout(function () { campoPreco.focus(); campoPreco.select(); }, 80);
    }

    document.getElementById('cancelarPreco').addEventListener('click', function () {
        modalPreco.style.display = 'none';
    });
    document.getElementById('confirmarPreco').addEventListener('click', function () {
        if (indiceAtual !== -1) {
            itens[indiceAtual].preco = parseFloat(campoPreco.value) || 0;
            renderizar(); salvarItens();
            modalPreco.style.display = 'none';
        }
    });
    campoPreco.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('confirmarPreco').click();
    });

    [modalEditar, modalPreco].forEach(function (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    });


    /* ═══════════════════════════════════════════
       9. BOTÃO DE IMPRESSÃO
    ═══════════════════════════════════════════ */

    btnImprimir.addEventListener('click', function () { window.print(); });


    /* ═══════════════════════════════════════════
       10. TOTAL E LOCALSTORAGE
    ═══════════════════════════════════════════ */

    function atualizarTotal() {
        var soma = itens.reduce(function (ac, item) { return ac + item.preco; }, 0);
        labelTotal.textContent = 'Total: ' + formatarPreco(soma);
    }

    function formatarPreco(v) {
        return 'R$ ' + v.toFixed(2).replace('.', ',');
    }

    function salvarItens() {
        localStorage.setItem('listaCompras', JSON.stringify(itens));
    }

    function carregarItens() {
        var d = localStorage.getItem('listaCompras');
        if (d) { itens = JSON.parse(d); renderizar(); }
    }

    /* ── Iniciar ── */
    carregarItens();
    iniciarVoz();

}); /* fim DOMContentLoaded */

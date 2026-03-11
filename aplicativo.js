/*
=======================================================
  APLICATIVO.JS — Lista de Compras
=======================================================
  1.  Inicialização
  2.  Referências HTML
  3.  Estado global
  4.  Visual Viewport API (teclado do sistema)
  5.  Entrada por texto
  6.  Entrada por voz
  7.  Gerenciamento de itens
  8.  Modais
  9.  Botão de impressão
  10. Total e localStorage
=======================================================
*/

document.addEventListener('DOMContentLoaded', function () {

    /* ── 2. Referências HTML ── */
    var campoTexto   = document.getElementById('campoTexto');
    var btnAdicionar = document.getElementById('btnAdicionar');
    var btnMicrofone = document.getElementById('btnMicrofone');
    var labelStatus  = document.getElementById('status');
    var listaItens   = document.getElementById('lista');
    var labelTotal   = document.getElementById('total');
    var btnImprimir  = document.getElementById('btnImprimir');
    var modalEditar  = document.getElementById('modalEditar');
    var modalPreco   = document.getElementById('modalPreco');
    var campoEditar  = document.getElementById('campoEditar');
    var campoPreco   = document.getElementById('campoPreco');

    /* ── 3. Estado global ── */
    var itens        = [];
    var indiceAtual  = -1;
    var reconhecimento = null;
    var gravando     = false;
    var alturaOriginal = window.innerHeight;

    /* ── 4. Inicialização ── */
    carregarItens();
    iniciarVoz();
    iniciarControleDoTeclado();


    /* ══════════════════════════════════════════════
       4. VISUAL VIEWPORT API

       Detecta em tempo real a altura disponível
       quando o teclado do sistema abre, e atualiza
       a variável CSS --altura-visivel. O modal usa
       essa variável para se reposicionar acima do
       teclado automaticamente.
    ══════════════════════════════════════════════ */

    function iniciarControleDoTeclado() {
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', aoMudarViewport);
            window.visualViewport.addEventListener('scroll', aoMudarViewport);
        } else {
            window.addEventListener('resize', aoMudarViewportFallback);
        }
    }

    function aoMudarViewport() {
        var h = window.visualViewport.height;
        document.documentElement.style.setProperty('--altura-visivel', h + 'px');

        /* Rola o campo focado para ficar visível */
        var focado = document.querySelector('.modal[style*="flex"] input:focus');
        if (focado) focado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (document.activeElement === campoTexto)
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function aoMudarViewportFallback() {
        var h = window.innerHeight;
        if (alturaOriginal - h > 150) {
            document.documentElement.style.setProperty('--altura-visivel', h + 'px');
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                setTimeout(function () {
                    document.activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        } else {
            document.documentElement.style.removeProperty('--altura-visivel');
        }
    }

    function limparAlturaVisivel() {
        if (!document.querySelector('.modal[style*="flex"]'))
            document.documentElement.style.removeProperty('--altura-visivel');
    }


    /* ══════════════════════════════════════════════
       5. ENTRADA POR TEXTO
    ══════════════════════════════════════════════ */

    btnAdicionar.addEventListener('click', function () {
        var nome = campoTexto.value.trim();
        if (nome) {
            adicionarItem(nome);
            campoTexto.value = '';
            campoTexto.focus();
        }
    });

    campoTexto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btnAdicionar.click();
    });

    /* Rola para o campo após o teclado subir */
    campoTexto.addEventListener('focus', function () {
        setTimeout(function () {
            campoTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
    });

    campoTexto.addEventListener('blur', limparAlturaVisivel);


    /* ══════════════════════════════════════════════
       6. ENTRADA POR VOZ

       • Toque simples para ligar/desligar (não "segure")
       • continuous: false — compatível com iOS Safari
       • getUserMedia() pede permissão explicitamente,
         necessário no iOS dentro de um gesto do usuário
    ══════════════════════════════════════════════ */

    function iniciarVoz() {
        var temAPI = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);

        if (!temAPI) {
            labelStatus.textContent    = 'Voz não suportada neste navegador.';
            btnMicrofone.disabled      = true;
            btnMicrofone.style.opacity = '0.4';
            return;
        }

        var APIDeVoz   = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new APIDeVoz();

        reconhecimento.lang            = 'pt-BR';
        reconhecimento.continuous      = false;
        reconhecimento.interimResults  = false;
        reconhecimento.maxAlternatives = 1;

        reconhecimento.onresult = function (evento) {
            /* Junta todos os resultados da sessão em uma frase única.
               Isso captura frases completas faladas enquanto o botão está pressionado. */
            var partes = [];
            for (var i = 0; i < evento.results.length; i++) {
                partes.push(evento.results[i][0].transcript.trim());
            }
            var texto = partes.join(' ').trim();

            if (texto) {
                adicionarItem(texto);
                labelStatus.textContent = 'Adicionado: "' + texto + '"';
            }
            /* Não reinicia — o usuário controla pressionando o botão */
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

        /* Quando o reconhecimento termina (ao soltar o botão ou por silêncio),
           NÃO reinicia automaticamente — o texto já foi capturado em onresult */
        reconhecimento.onend = function () {
            /* Só para o visual; o texto já foi adicionado pelo onresult */
            if (gravando) pararGravacaoVisual();
        };

        labelStatus.textContent = 'Segure o microfone e fale';
    }

    /* ── Eventos de pressionar e soltar ──
       Usamos pointer events que funcionam igual para mouse E toque,
       sem precisar de preventDefault() agressivo.
       - pointerdown  → começa quando o dedo/mouse pressiona
       - pointerup    → termina quando solta
       - pointerleave → cancela se o dedo sair do botão sem soltar  */

    btnMicrofone.addEventListener('pointerdown', function (e) {
        e.preventDefault(); /* Evita seleção de texto e scroll acidental */
        btnMicrofone.setPointerCapture(e.pointerId); /* Segura o evento no botão */
        comecarGravacao();
    });

    btnMicrofone.addEventListener('pointerup',    soltar);
    btnMicrofone.addEventListener('pointercancel',soltar);

    function soltar() {
        if (gravando) pararGravacao();
    }

    /* Primeira vez: pede permissão do microfone via getUserMedia.
       Depois que a permissão é concedida, as chamadas seguintes
       iniciam diretamente sem pedir permissão de novo. */
    var permissaoConcedida = false;

    function comecarGravacao() {
        if (!reconhecimento) return;

        if (permissaoConcedida) {
            /* Permissão já foi concedida antes — inicia direto */
            iniciarReconhecimento();
            return;
        }

        labelStatus.textContent = 'Aguardando permissão...';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (fluxo) {
                    /* Fecha o fluxo de teste — o reconhecimento abre o próprio */
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
            btnMicrofone.classList.add('gravando');
            labelStatus.textContent = 'Ouvindo… solte para concluir';
        } catch (e) {
            labelStatus.textContent = 'Tente novamente.';
            gravando = false;
        }
    }

    /* Para a gravação e processa o resultado */
    function pararGravacao() {
        gravando = false;
        if (reconhecimento) {
            /* stop() (não abort()) → processa o áudio gravado e dispara onresult */
            try { reconhecimento.stop(); } catch (e) {}
        }
        pararGravacaoVisual();
    }

    /* Atualiza apenas o visual do botão, sem interferir no reconhecimento */
    function pararGravacaoVisual() {
        gravando = false;
        btnMicrofone.classList.remove('gravando');
        labelStatus.textContent = 'Segure o microfone e fale';
    }


    /* ══════════════════════════════════════════════
       7. GERENCIAMENTO DE ITENS
    ══════════════════════════════════════════════ */

    function adicionarItem(nome) {
        itens.push({ nome: nome, preco: 0, marcado: false });
        renderizar(); salvarItens();
    }

    function renderizar() {
        listaItens.innerHTML = '';
        itens.forEach(function (item, i) {
            var li = document.createElement('li');
            li.className = 'item' + (item.marcado ? ' marcado' : '');

            var nome = document.createElement('div');
            nome.className = 'item-nome';
            nome.textContent = item.nome;
            nome.addEventListener('click', function () { marcar(i); });

            var preco = document.createElement('div');
            preco.className = 'item-preco';
            preco.textContent = formatarPreco(item.preco);

            var acoes = document.createElement('div');
            acoes.className = 'acoes';
            acoes.appendChild(criarBotao('btn-editar',  'Editar nome',  'editar.png',   function () { abrirModalEditar(i); }));
            acoes.appendChild(criarBotao('btn-preco',   'Editar preço', 'dinheiro.png', function () { abrirModalPreco(i);  }));
            acoes.appendChild(criarBotao('btn-excluir', 'Excluir',      'excluir.png',  function () { excluir(i);          }));

            li.appendChild(nome); li.appendChild(preco); li.appendChild(acoes);
            listaItens.appendChild(li);
        });
        atualizarTotal();
    }

    function criarBotao(classe, rotulo, icone, fn) {
        var btn = document.createElement('button');
        btn.className = classe;
        btn.setAttribute('aria-label', rotulo);
        var img = document.createElement('img');
        img.src = icone; img.alt = rotulo; img.className = 'icone-acao';
        btn.appendChild(img);
        btn.addEventListener('click', fn);
        return btn;
    }

    function marcar(i)  { itens[i].marcado = !itens[i].marcado; renderizar(); salvarItens(); }
    function excluir(i) { itens.splice(i, 1); renderizar(); salvarItens(); }


    /* ══════════════════════════════════════════════
       8. MODAIS
    ══════════════════════════════════════════════ */

    function abrirModalEditar(indice) {
        indiceAtual = indice;
        campoEditar.value = itens[indice].nome;
        modalEditar.style.display = 'flex';
        setTimeout(function () {
            campoEditar.focus(); campoEditar.select();
            setTimeout(function () {
                campoEditar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }, 80);
    }

    function fecharModal(modal) {
        modal.style.display = 'none';
        document.documentElement.style.removeProperty('--altura-visivel');
    }

    document.getElementById('cancelarEditar').addEventListener('click',  function () { fecharModal(modalEditar); });
    document.getElementById('confirmarEditar').addEventListener('click', function () {
        var v = campoEditar.value.trim();
        if (indiceAtual !== -1 && v) {
            itens[indiceAtual].nome = v; renderizar(); salvarItens(); fecharModal(modalEditar);
        }
    });
    campoEditar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('confirmarEditar').click();
    });

    function abrirModalPreco(indice) {
        indiceAtual = indice;
        campoPreco.value = itens[indice].preco;
        modalPreco.style.display = 'flex';
        setTimeout(function () {
            campoPreco.focus(); campoPreco.select();
            setTimeout(function () {
                campoPreco.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }, 80);
    }

    document.getElementById('cancelarPreco').addEventListener('click',  function () { fecharModal(modalPreco); });
    document.getElementById('confirmarPreco').addEventListener('click', function () {
        if (indiceAtual !== -1) {
            itens[indiceAtual].preco = parseFloat(campoPreco.value) || 0;
            renderizar(); salvarItens(); fecharModal(modalPreco);
        }
    });
    campoPreco.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('confirmarPreco').click();
    });

    [modalEditar, modalPreco].forEach(function (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) fecharModal(modal);
        });
    });


    /* ── 9. Impressão ── */
    btnImprimir.addEventListener('click', function () { window.print(); });


    /* ── 10. Total e localStorage ── */
    function atualizarTotal() {
        var soma = itens.reduce(function (ac, item) { return ac + item.preco; }, 0);
        labelTotal.textContent = 'Total: ' + formatarPreco(soma);
    }

    function formatarPreco(v) {
        return 'R$ ' + v.toFixed(2).replace('.', ',');
    }

    function salvarItens()   { localStorage.setItem('listaCompras', JSON.stringify(itens)); }
    function carregarItens() {
        var d = localStorage.getItem('listaCompras');
        if (d) { itens = JSON.parse(d); renderizar(); }
    }

}); /* fim DOMContentLoaded */

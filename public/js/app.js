// eDrive OS App - Frontend Logic

let itemCount = 0;
let produtos = [];
let osNumeroAtual = null;

// Carregar ao iniciar
document.addEventListener('DOMContentLoaded', async () => {
    // Definir data de hoje
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dataAbertura').value = today;
    document.getElementById('dataPrevista').value = today;

    // Carregar catálogo de produtos
    try {
        const resp = await fetch('/api/produtos');
        if (resp.ok) {
            produtos = await resp.json();
        }
    } catch (e) {
        console.error('Erro ao carregar produtos:', e);
    }

    // Masks
    document.getElementById('cnpj').addEventListener('input', aplicarMascaraCpfCnpj);
    document.getElementById('telefone').addEventListener('input', aplicarMascaraTelefone);
    document.getElementById('placa').addEventListener('input', aplicarMascaraPlaca);

    // Adicionar primeiro item vazio
    adicionarItem();
});

// ═══════════════════════════════════════════════════════════════
// MÁSCARAS
// ═══════════════════════════════════════════════════════════════

function aplicarMascaraCpfCnpj(e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length <= 11) {
        // CPF: 000.000.000-00
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        // CNPJ: 00.000.000/0000-00
        v = v.substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, '$1.$2');
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    }
    e.target.value = v;
}

function aplicarMascaraTelefone(e) {
    let v = e.target.value.replace(/\D/g, '').substring(0, 11);
    if (v.length > 6) {
        v = v.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    } else if (v.length > 0) {
        v = v.replace(/^(\d{0,2})/, '($1');
    }
    e.target.value = v;
}

function aplicarMascaraPlaca(e) {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 7) v = v.substring(0, 7);
    if (v.length > 3) {
        v = v.substring(0, 3) + '-' + v.substring(3);
    }
    e.target.value = v;
}

// ═══════════════════════════════════════════════════════════════
// SEARCHABLE SELECT (produto)
// ═══════════════════════════════════════════════════════════════

function criarSearchableSelect(container, onSelect) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'searchable-select-input';
    input.placeholder = 'Digite para buscar produto...';
    input.setAttribute('autocomplete', 'off');

    const dropdown = document.createElement('div');
    dropdown.className = 'searchable-select-dropdown';

    // Hidden field for selected value
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.className = 'produto-value';

    container.appendChild(input);
    container.appendChild(dropdown);
    container.appendChild(hidden);

    let isOpen = false;

    function renderOptions(filter) {
        dropdown.innerHTML = '';
        const filtro = (filter || '').toLowerCase();
        const filtered = produtos.filter(p => {
            const desc = (p.descricao || '').toLowerCase();
            const cod = (p.codigo || '').toLowerCase();
            return desc.includes(filtro) || cod.includes(filtro);
        });

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'searchable-select-empty';
            empty.textContent = 'Nenhum produto encontrado';
            dropdown.appendChild(empty);
        } else {
            filtered.forEach(p => {
                const opt = document.createElement('div');
                opt.className = 'searchable-select-option';
                opt.innerHTML = `<span class="classif">${p.classificacao}</span> ${p.descricao} <span class="code">(${p.codigo})</span>`;
                opt.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    input.value = p.descricao;
                    hidden.value = p.descricao;
                    dropdown.classList.remove('open');
                    isOpen = false;
                    if (onSelect) onSelect(p);
                });
                dropdown.appendChild(opt);
            });
        }
    }

    input.addEventListener('focus', () => {
        renderOptions(input.value);
        dropdown.classList.add('open');
        isOpen = true;
    });

    input.addEventListener('input', () => {
        hidden.value = input.value;
        renderOptions(input.value);
        if (!isOpen) {
            dropdown.classList.add('open');
            isOpen = true;
        }
    });

    input.addEventListener('blur', () => {
        dropdown.classList.remove('open');
        isOpen = false;
        hidden.value = input.value;
    });

    return { input, hidden };
}

// ═══════════════════════════════════════════════════════════════
// ITENS
// ═══════════════════════════════════════════════════════════════

function adicionarItem() {
    itemCount++;
    const tbody = document.getElementById('itemsBody');
    const id = itemCount;

    const tr = document.createElement('tr');
    tr.id = `item-${id}`;
    tr.innerHTML = `
        <td>
            <div class="produto-wrapper">
                <div class="searchable-select" id="prodSelect-${id}"></div>
                <button type="button" class="btn-solicitar" onclick="abrirModal()" title="Solicitar cadastro de novo item">+ Novo</button>
            </div>
        </td>
        <td>
            <select class="garantia" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                <option value="Não" selected>Não</option>
                <option value="Sim">Sim</option>
            </select>
        </td>
        <td>
            <input type="number" class="qtd" min="1" value="1" step="0.01" required onchange="calcularTotais()" style="text-align:center; font-size:16px; font-weight:bold; padding:8px;">
        </td>
        <td>
            <input type="number" class="valor-unit" min="0" value="0.00" step="0.01" required onchange="calcularTotais()" placeholder="0.00">
        </td>
        <td>
            <input type="number" class="valor-total" readonly style="background: #f5f5f5; font-weight: bold;">
        </td>
        <td>
            <button type="button" class="btn-remove" onclick="removerItem(${id})">Remover</button>
        </td>
    `;

    tbody.appendChild(tr);

    // Init searchable select for this row
    const selectContainer = document.getElementById(`prodSelect-${id}`);
    criarSearchableSelect(selectContainer);

    calcularTotais();
}

function removerItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item && document.querySelectorAll('#itemsBody tr').length > 1) {
        item.remove();
        calcularTotais();
    } else {
        mostrarErro('Você precisa de pelo menos 1 item');
    }
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULOS
// ═══════════════════════════════════════════════════════════════

function calcularTotais() {
    let totalQtd = 0;
    let totalGeral = 0;

    document.querySelectorAll('#itemsBody tr').forEach(tr => {
        const qtd = parseFloat(tr.querySelector('.qtd').value) || 0;
        const valorUnit = parseFloat(tr.querySelector('.valor-unit').value) || 0;
        const valorTotal = qtd * valorUnit;

        tr.querySelector('.valor-total').value = valorTotal.toFixed(2);

        totalQtd += qtd;
        totalGeral += valorTotal;
    });

    document.getElementById('totalQtd').textContent = totalQtd.toFixed(2);
    document.getElementById('subtotal').textContent = formatarMoeda(totalGeral);
    document.getElementById('total').textContent = formatarMoeda(totalGeral);
}

function formatarMoeda(valor) {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ═══════════════════════════════════════════════════════════════
// MODAL - Solicitar cadastro
// ═══════════════════════════════════════════════════════════════

function abrirModal() {
    document.getElementById('modalSolicitarItem').classList.add('active');
}

function fecharModal() {
    document.getElementById('modalSolicitarItem').classList.remove('active');
    document.getElementById('modalDescricao').value = '';
    document.getElementById('modalObservacao').value = '';
    document.getElementById('modalClassificacao').value = 'Produto';
}

async function enviarSolicitacaoItem() {
    const descricao = document.getElementById('modalDescricao').value.trim();
    if (!descricao) {
        mostrarErro('Informe a descrição do produto/serviço');
        return;
    }

    try {
        const resp = await fetch('/api/solicitar-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descricao: descricao,
                classificacao: document.getElementById('modalClassificacao').value,
                observacao: document.getElementById('modalObservacao').value,
                solicitante: document.getElementById('autorizadoPor').value || 'N/A'
            })
        });

        if (!resp.ok) throw new Error('Erro ao enviar');
        mostrarSucesso('Solicitação de cadastro enviada com sucesso!');
        fecharModal();
    } catch (e) {
        mostrarErro('Erro ao enviar solicitação');
    }
}

// ═══════════════════════════════════════════════════════════════
// COLETA / VALIDAÇÃO / GERAÇÃO
// ═══════════════════════════════════════════════════════════════

function coletarDados() {
    const itens = [];

    document.querySelectorAll('#itemsBody tr').forEach(tr => {
        const produtoHidden = tr.querySelector('.produto-value');
        const produtoInput = tr.querySelector('.searchable-select-input');
        const produtoNome = (produtoHidden && produtoHidden.value) || (produtoInput && produtoInput.value) || '';

        itens.push({
            produto: produtoNome,
            garantia: tr.querySelector('.garantia').value,
            qtd: parseFloat(tr.querySelector('.qtd').value) || 0,
            valorUnit: parseFloat(tr.querySelector('.valor-unit').value) || 0,
            valorTotal: parseFloat(tr.querySelector('.valor-total').value) || 0
        });
    });

    return {
        fornecedor: document.getElementById('fornecedor').value,
        cnpj: document.getElementById('cnpj').value,
        placa: document.getElementById('placa').value,
        marcaModeloAno: document.getElementById('marcaModeloAno').value,
        dataAbertura: document.getElementById('dataAbertura').value,
        dataPrevista: document.getElementById('dataPrevista').value,
        dataFinalizacao: document.getElementById('dataFinalizacao').value,
        chavePix: document.getElementById('chavePix').value,
        tipoPix: document.getElementById('tipoPix').value,
        autorizadoPor: document.getElementById('autorizadoPor').value,
        responsavel: document.getElementById('responsavel').value,
        telefone: document.getElementById('telefone').value,
        email: document.getElementById('email').value,
        itens: itens,
        observacoes: document.getElementById('observacoes').value,
        totalQtd: parseFloat(document.getElementById('totalQtd').textContent) || 0,
        totalValor: parseFloat(document.getElementById('total').textContent.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0
    };
}

function validarFormulario() {
    if (!document.getElementById('fornecedor').value.trim()) {
        mostrarErro('Informe o fornecedor / razão social');
        return false;
    }

    if (!document.getElementById('autorizadoPor').value) {
        mostrarErro('Selecione quem autorizou a OS');
        return false;
    }

    if (!document.getElementById('dataAbertura').value) {
        mostrarErro('Informe a data de abertura');
        return false;
    }

    const itens = document.querySelectorAll('#itemsBody tr');
    if (itens.length === 0) {
        mostrarErro('Adicione pelo menos 1 item');
        return false;
    }

    let temItemValido = false;
    itens.forEach(tr => {
        const produtoHidden = tr.querySelector('.produto-value');
        const produtoInput = tr.querySelector('.searchable-select-input');
        const produto = (produtoHidden && produtoHidden.value) || (produtoInput && produtoInput.value) || '';
        const qtd = parseFloat(tr.querySelector('.qtd').value);
        const valor = parseFloat(tr.querySelector('.valor-unit').value);

        if (produto.trim() && qtd > 0 && valor > 0) {
            temItemValido = true;
        }
    });

    if (!temItemValido) {
        mostrarErro('Todos os itens precisam ter produto, quantidade e valor');
        return false;
    }

    return true;
}

async function gerarPDF() {
    if (!validarFormulario()) return;

    mostrarLoading(true);

    try {
        const dados = coletarDados();

        const response = await fetch('/api/gerar-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) throw new Error('Erro ao gerar PDF');

        const resultado = await response.json();

        // Mostrar OS number no badge
        osNumeroAtual = resultado.osNumero;
        const badge = document.getElementById('osBadge');
        badge.textContent = resultado.osLabel;
        badge.classList.add('visible');

        // Download do PDF
        const byteCharacters = atob(resultado.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${resultado.osLabel}_${dados.fornecedor}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);

        mostrarSucesso(`PDF gerado com sucesso! ${resultado.osLabel}`);
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro('Erro ao gerar PDF');
    } finally {
        mostrarLoading(false);
    }
}

// ═══════════════════════════════════════════════════════════════
// LIMPAR
// ═══════════════════════════════════════════════════════════════

function limparForm() {
    if (confirm('Deseja realmente limpar o formulário?')) {
        document.getElementById('osForm').reset();
        document.getElementById('itemsBody').innerHTML = '';
        itemCount = 0;
        osNumeroAtual = null;

        const badge = document.getElementById('osBadge');
        badge.textContent = '';
        badge.classList.remove('visible');

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dataAbertura').value = today;
        document.getElementById('dataPrevista').value = today;

        adicionarItem();
    }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════

function mostrarLoading(show) {
    document.getElementById('loading').classList.toggle('active', show);
}

function mostrarSucesso(msg) {
    alert(msg);
}

function mostrarErro(msg) {
    alert(msg);
}

// eDrive OS App - Frontend Logic (Fase 2)

let itemCount = 0;
let produtos = [];
let osNumeroAtual = null;
let uploadedFiles = []; // Track uploaded files

// Carregar ao iniciar
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth
    try {
        const resp = await fetch('/api/auth/me');
        if (resp.ok) {
            const user = await resp.json();
            const navUser = document.getElementById('navUser');
            if (navUser) navUser.textContent = user.cpf_cnpj === 'ADMIN' ? '👑 Admin' : (user.cpf_cnpj || '');
            // Mostrar link Admin se é admin
            const navAdmin = document.getElementById('navAdmin');
            if (navAdmin && user.cpf_cnpj === 'ADMIN') {
                navAdmin.style.display = 'inline-block';
                navAdmin.style.background = 'rgba(255,255,255,0.2)';
                navAdmin.style.fontWeight = '600';
            }
        }
    } catch(e) {}

    // Definir data de hoje (fuso Brasil UTC-3)
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().split('T')[0];
    document.getElementById('dataAbertura').value = today;
    document.getElementById('dataPrevista').value = today;
    document.getElementById('dataFinalizacao').value = today;

    // Carregar catalogo de produtos
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

// Logout
function logout() {
    // Limpar ambos os tokens (user + admin)
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
        fetch('/api/admin/logout', { method: 'POST' }).then(() => {
            window.location.href = '/login.html';
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// MASCARAS
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
    input.type = 'search';
    input.className = 'searchable-select-input';
    input.placeholder = 'Digite para buscar produto...';
    input.setAttribute('autocomplete', 'nope');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-form-type', 'other');

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

    // Remove acentos para busca fuzzy
    function norm(str) {
        return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function renderOptions(filter) {
        dropdown.innerHTML = '';
        const filtro = norm(filter);
        const filtered = produtos.filter(p => {
            const desc = norm(p.descricao);
            const cod = norm(p.codigo);
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
                <option value="Nao" selected>Nao</option>
                <option value="Sim">Sim</option>
            </select>
        </td>
        <td>
            <input type="text" class="qtd" value="1" required oninput="formatarQtd(this)" onchange="calcularTotais()" onfocus="this.select()" style="text-align:center; font-size:16px; font-weight:bold; padding:10px; width:100%;">
        </td>
        <td>
            <input type="text" class="valor-unit" value="" required oninput="formatarValor(this)" onchange="calcularTotais()" onfocus="this.select()" placeholder="0,00" style="text-align:right; font-size:14px; padding:10px; width:100%;">
        </td>
        <td>
            <input type="text" class="valor-total" readonly style="background: #f5f5f5; font-weight: bold; text-align:right; font-size:14px; padding:10px; color:#0099CC; width:100%;">
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
        mostrarErro('Voce precisa de pelo menos 1 item');
    }
}

// ═══════════════════════════════════════════════════════════════
// CALCULOS
// ═══════════════════════════════════════════════════════════════

// Parse valor brasileiro: "1.500,00" → 1500.00
function parseBR(str) {
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

// Formatar número para brasileiro: 1500 → "1.500,00"
function toBR(num) {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatar campo de valor (aceita só números e vírgula)
function formatarValor(input) {
    let v = input.value.replace(/[^\d,]/g, '');
    // Permitir apenas uma vírgula
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    input.value = v;
}

// Formatar campo de quantidade
function formatarQtd(input) {
    let v = input.value.replace(/[^\d,.]/g, '');
    input.value = v;
}

function calcularTotais() {
    let totalQtd = 0;
    let totalGeral = 0;

    document.querySelectorAll('#itemsBody tr').forEach(tr => {
        const qtdStr = tr.querySelector('.qtd').value;
        const valorUnitStr = tr.querySelector('.valor-unit').value;
        
        const qtd = parseBR(qtdStr);
        const valorUnit = parseBR(valorUnitStr);
        const valorTotal = qtd * valorUnit;

        tr.querySelector('.valor-total').value = toBR(valorTotal);

        totalQtd += qtd;
        totalGeral += valorTotal;
    });

    document.getElementById('totalQtd').textContent = totalQtd % 1 === 0 ? totalQtd.toString() : totalQtd.toFixed(2).replace('.', ',');
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
        mostrarErro('Informe a descricao do produto/servico');
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
        mostrarSucesso('Solicitacao de cadastro enviada com sucesso!');
        fecharModal();
    } catch (e) {
        mostrarErro('Erro ao enviar solicitacao');
    }
}

// ═══════════════════════════════════════════════════════════════
// UPLOADS
// ═══════════════════════════════════════════════════════════════

async function handleUpload(input, tipo) {
    const files = input.files;
    if (!files || files.length === 0) return;

    // Check total limit
    if (uploadedFiles.length + files.length > 8) {
        mostrarErro('Maximo de 8 arquivos por OS');
        input.value = '';
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        if (files[i].size > 5 * 1024 * 1024) {
            mostrarErro(`Arquivo "${files[i].name}" excede o limite de 5MB`);
            input.value = '';
            return;
        }
        formData.append('files', files[i]);
    }
    formData.append('tipo', tipo);

    try {
        const resp = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) {
            const data = await resp.json();
            mostrarErro(data.erro || 'Erro ao enviar arquivo');
            return;
        }

        const data = await resp.json();

        // Add to uploaded files list
        data.files.forEach(f => {
            uploadedFiles.push(f);
        });

        // Show previews
        renderPreviews(tipo);
        updateUploadCount();
        mostrarSucesso(`${data.files.length} arquivo(s) enviado(s)`);
    } catch (e) {
        mostrarErro('Erro ao enviar arquivo');
    }

    input.value = '';
}

function renderPreviews(tipo) {
    const container = document.getElementById('preview' + tipo.charAt(0).toUpperCase() + tipo.slice(1));
    if (!container) return;

    const filesOfType = uploadedFiles.filter(f => f.tipo === tipo);
    container.innerHTML = filesOfType.map((f, idx) => {
        const globalIdx = uploadedFiles.indexOf(f);
        const isImage = f.mimetype && f.mimetype.startsWith('image/');
        if (isImage) {
            return `<div class="upload-thumb">
                <img src="/data/uploads/${f.filename}" alt="${f.original_name}">
                <button class="remove-upload" onclick="removeUpload(${globalIdx}, '${tipo}')">&times;</button>
            </div>`;
        } else {
            return `<div class="upload-thumb">
                <div class="file-icon">PDF</div>
                <button class="remove-upload" onclick="removeUpload(${globalIdx}, '${tipo}')">&times;</button>
            </div>`;
        }
    }).join('');
}

function removeUpload(idx, tipo) {
    uploadedFiles.splice(idx, 1);
    renderPreviews(tipo);
    updateUploadCount();
}

function updateUploadCount() {
    const el = document.getElementById('uploadCount');
    if (el) {
        el.textContent = uploadedFiles.length > 0 ? `${uploadedFiles.length} arquivo(s) anexado(s)` : '';
    }
}

// ═══════════════════════════════════════════════════════════════
// COLETA / VALIDACAO / GERACAO
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
            qtd: parseBR(tr.querySelector('.qtd').value),
            valorUnit: parseBR(tr.querySelector('.valor-unit').value),
            valorTotal: parseBR(tr.querySelector('.valor-total').value),
            quantidade: parseBR(tr.querySelector('.qtd').value),
            valorUnitario: tr.querySelector('.valor-unit').value
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
        totalValor: parseFloat(document.getElementById('total').textContent.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0,
        uploadedFiles: uploadedFiles
    };
}

function validarFormulario() {
    const campos = [
        { id: 'fornecedor', msg: 'Informe o fornecedor / razao social' },
        { id: 'cnpj', msg: 'Informe o CPF/CNPJ' },
        { id: 'placa', msg: 'Informe a placa do veiculo' },
        { id: 'marcaModeloAno', msg: 'Informe marca / modelo / ano' },
        { id: 'dataAbertura', msg: 'Informe a data de abertura' },
        { id: 'dataPrevista', msg: 'Informe a data prevista' },
        { id: 'dataFinalizacao', msg: 'Informe a data de finalizacao' },
        { id: 'chavePix', msg: 'Informe a chave PIX' },
        { id: 'tipoPix', msg: 'Selecione o tipo de PIX' },
        { id: 'autorizadoPor', msg: 'Selecione quem autorizou a OS' },
        { id: 'responsavel', msg: 'Informe o responsavel' },
        { id: 'telefone', msg: 'Informe o telefone' },
    ];
    for (const campo of campos) {
        const el = document.getElementById(campo.id);
        if (!el || !el.value.trim()) {
            mostrarErro(campo.msg);
            if (el) { el.focus(); el.style.borderColor = '#dc3545'; setTimeout(() => el.style.borderColor = '', 3000); }
            return false;
        }
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
        const qtd = parseBR(tr.querySelector('.qtd').value);
        const valor = parseBR(tr.querySelector('.valor-unit').value);

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

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.erro || 'Erro ao gerar PDF');
        }

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

        mostrarSucesso(`${resultado.osLabel} gerada com sucesso!`);
        
        // Zerar formulário após gerar PDF (evita duplicata)
        setTimeout(() => limparForm(), 1500);
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro(error.message || 'Erro ao gerar PDF');
    } finally {
        mostrarLoading(false);
    }
}

// ═══════════════════════════════════════════════════════════════
// LIMPAR
// ═══════════════════════════════════════════════════════════════

function limparForm() {
    if (confirm('Deseja realmente limpar o formulario?')) {
        document.getElementById('osForm').reset();
        document.getElementById('itemsBody').innerHTML = '';
        itemCount = 0;
        osNumeroAtual = null;
        uploadedFiles = [];

        const badge = document.getElementById('osBadge');
        badge.textContent = '';
        badge.classList.remove('visible');

        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().split('T')[0];
        document.getElementById('dataAbertura').value = today;
        document.getElementById('dataPrevista').value = today;
        document.getElementById('dataFinalizacao').value = today;

        // Clear upload previews
        ['previewVeiculo', 'previewServico', 'previewNota'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        updateUploadCount();

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
    mostrarToast(msg, 'success');
}

function mostrarErro(msg) {
    mostrarToast(msg, 'error');
}

function mostrarToast(msg, tipo) {
    const old = document.getElementById('toast-msg');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `position:fixed;top:20px;right:20px;z-index:10000;padding:16px 24px;border-radius:10px;max-width:400px;font-size:15px;font-weight:600;color:white;box-shadow:0 4px 20px rgba(0,0,0,0.3);cursor:pointer;${tipo === 'success' ? 'background:linear-gradient(135deg,#28a745,#1e7e34);' : 'background:linear-gradient(135deg,#dc3545,#b02a37);'}`;
    toast.textContent = msg;
    toast.onclick = () => toast.remove();
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

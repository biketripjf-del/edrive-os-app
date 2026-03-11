# 🌐 eDrive OS Generator - ACESSO PÚBLICO

## ✅ Servidor Ativo

**IP Público:** `187.77.61.230`  
**Porta:** `8080`  
**Status:** ✅ ONLINE

---

## 🔗 Links de Acesso

### **Para você (Brunner):**
```
http://187.77.61.230:8080
```

### **Para compartilhar com fornecedores:**
```
http://187.77.61.230:8080
```

---

## 📋 O que está rodando

- ✅ Node.js + Express
- ✅ 6.011 fornecedores carregados
- ✅ Gerador de PDF
- ✅ Interface responsiva (mobile ok)
- ✅ PM2 auto-restart

---

## 🎯 Como compartilhar com fornecedores

**Copie este link:**
```
http://187.77.61.230:8080
```

**E envie via WhatsApp/Email:**

> "Olá! Clique aqui para preencher a Ordem de Serviço:
> 
> 🔗 http://187.77.61.230:8080
> 
> Selecione seu fornecedor, preencha os dados e baixe o PDF.
> Qualquer dúvida, me chama!"

---

## 📊 Status do Servidor

**Verificar se está online:**
```bash
curl -s http://187.77.61.230:8080 | head -1
```

**Logs em tempo real:**
```bash
pm2 logs edrive-os
```

**Restart manual:**
```bash
pm2 restart edrive-os
```

---

## 🔒 Segurança

> ⚠️ Este é um servidor local na sua VPS.
> 
> Para produção, recomendo:
> - Adicionar autenticação
> - Usar HTTPS (Let's Encrypt)
> - Colocar atrás de Nginx/Apache
> - Limitar rate (DDoS protection)

---

## 💾 Backup Automático

PM2 vai manter o app rodando mesmo se:
- ❌ A sessão terminal fechar
- ❌ O servidor reiniciar
- ❌ O processo travar

---

## 📞 Suporte

**Parar o servidor:**
```bash
pm2 stop edrive-os
```

**Iniciar novamente:**
```bash
pm2 start edrive-os
```

**Deletar:**
```bash
pm2 delete edrive-os
pm2 save
```

---

**Acesso público: ✅ ATIVO**  
**Pronto para fornecedores: ✅ SIM**

🚀 Compartilhe o link!

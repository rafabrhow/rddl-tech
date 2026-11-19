# ConsertaFone — Sistema de gestão para assistência técnica

Projeto inicial de gestão para loja de conserto de celulares, inspirado nas referências visuais do arquivo `OsCelular.zip`.

## O que já está preparado

- Dashboard com indicadores e ordens recentes.
- Cadastro inicial de ordens de serviço.
- Atualização de status das ordens.
- Cadastro de clientes.
- Cadastro básico de peças e acessórios com alerta de estoque mínimo.
- Visão financeira simples baseada nas ordens.
- Relatórios iniciais.
- Layout responsivo para desktop, tablet e celular.
- Estrutura inicial do Firebase (Authentication e Firestore).
- Arquivo `.env.example` para configuração das credenciais.

## Requisitos

- Node.js 20.9 ou superior
- npm
- Conta Firebase, GitHub e Vercel

## Como abrir no VS Code

1. Descompacte o ZIP.
2. Abra a pasta `assistencia-celular` no VS Code.
3. Abra o terminal integrado.
4. Execute:

```bash
npm install
npm run dev
```

5. Acesse `http://localhost:3000`.

## Firebase

1. Crie um projeto no Firebase Console.
2. Adicione um aplicativo Web.
3. Copie as credenciais do Firebase.
4. Duplique `.env.example` e renomeie a cópia para `.env.local`.
5. Preencha as variáveis com os dados do seu projeto Firebase.
6. Ative Authentication (e-mail/senha) e Cloud Firestore no console.

O arquivo `src/lib/firebase.ts` inicializa Firebase quando as variáveis estão preenchidas. A interface desta primeira entrega ainda utiliza dados de demonstração e armazenamento local do navegador; não considere os dados locais como backup nem use esta versão em produção. Na próxima etapa vamos substituir a camada local por operações Firestore, implementar login e regras de segurança.

## Publicação

### GitHub

Crie um repositório vazio no GitHub e, no terminal da pasta do projeto, execute:

```bash
git init
git add .
git commit -m "Estrutura inicial do ConsertaFone"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

### Vercel

1. Entre na Vercel e importe o repositório do GitHub.
2. Mantenha as configurações detectadas para Next.js.
3. Cadastre as mesmas variáveis `NEXT_PUBLIC_FIREBASE_*` em Environment Variables.
4. Publique.

## Organização

```text
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  lib/
    firebase.ts
    types.ts
```

## Próximas etapas sugeridas

1. Ajustar nome, logo, cores e dados reais da assistência.
2. Implementar autenticação e perfis de acesso.
3. Conectar clientes, ordens, estoque e financeiro ao Firestore.
4. Criar impressão/PDF da ordem de serviço e comprovante de entrada.
5. Criar histórico de alterações, regras de segurança e backup.
6. Refinar experiência mobile e notificações ao cliente.

> Importante: esta é uma base de desenvolvimento. Antes de cadastrar dados reais de clientes, precisamos concluir autenticação, Firestore, regras de acesso e política de backup.

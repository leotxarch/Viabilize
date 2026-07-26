# Estudo Analítico de Viabilidade

Aplicativo de estudo de viabilidade arquitetônica e imobiliária para a cidade de São Paulo.

## Rodando localmente

```
npm install
npm run dev
```

## Build de produção

```
npm run build
```

Gera a pasta `dist/`, pronta para qualquer hospedagem estática (Vercel, Netlify, etc).

## Deploy no Vercel

1. Suba este repositório para o GitHub.
2. Em vercel.com, clique em "Add New Project" e importe o repositório.
3. O Vercel detecta o Vite automaticamente (Build Command: `npm run build`, Output Directory: `dist`).
4. Clique em "Deploy".

## Próximos passos (Supabase)

Este projeto ainda não está conectado a nenhum banco de dados — os dados digitados ficam
só na memória do navegador (se recarregar a página, perdem-se). Para persistir os estudos:

1. Crie um projeto em supabase.com (gratuito).
2. Instale o cliente: `npm install @supabase/supabase-js`.
3. Crie um arquivo `src/supabaseClient.js` com a URL e a chave anônima do seu projeto.
4. Troque os `useState` do formulário por leituras/gravações no Supabase (ou salve o estado
   inteiro como um JSON numa tabela `estudos`).

Isso ainda precisa ser programado — avise se quiser ajuda nessa parte depois.

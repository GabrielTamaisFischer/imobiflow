// Pannellum (https://pannellum.org/) e um visualizador de panoramas 360
// leve, gratuito e open source (MIT) sem pacote de tipos publicado no npm.
// Ele e importado dinamicamente (codigo + CSS) apenas quando um imovel tem
// de fato uma foto panoramica propria a exibir (ver PanoramaViewer em
// src/routes/site.$slug.imoveis.$propertySlug.tsx). Esta declaracao apenas
// informa o TypeScript de que os modulos existem (imports por efeito
// colateral); a API real usada e tipada localmente via PannellumGlobal.
declare module "pannellum/build/pannellum.js";
declare module "pannellum/build/pannellum.css";

// Verificação de regra de hooks do React.
// Existe por causa da queda da área do projetista em 25/11/2026 (React #310): dois hooks
// ficaram abaixo de um "return" antecipado e a tela inteira caiu para os projetistas.
// Rode `npm run hooks` junto com o type-check antes de subir.
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    files: ["**/*.tsx", "**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": hooks },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
  // usaCelular e usarPP SÃO hooks de verdade, só que com nome em português; a regra não
  // reconhece o prefixo "usa"/"usar" e acusa falso positivo. Chamados sempre no topo.
  { files: ["src/movel/Raiz.tsx", "src/telas/PrePedido.tsx"], rules: { "react-hooks/rules-of-hooks": "off" } },
];

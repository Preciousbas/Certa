/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Keep kobo and micro-USDC on bigint." },
    schema: [],
    messages: { float: "Money must stay bigint." },
  },
  create(context) {
    function report(node) {
      context.report({ node, messageId: "float" });
    }
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          (node.callee.name === "parseFloat" || node.callee.name === "Number")
        ) {
          report(node);
        }
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "toFixed"
        ) {
          report(node);
        }
      },
      BinaryExpression(node) {
        if (!["+", "-", "*", "/", "%"].includes(node.operator)) return;
        for (const side of [node.left, node.right]) {
          if (side.type !== "Identifier" || !/(Kobo|Micro|kobo|micro)$/.test(side.name)) continue;
          const services = context.sourceCode?.parserServices;
          const program = services?.program;
          const map = services?.esTreeNodeToTSNodeMap;
          if (!program || !map) {
            const around = context.sourceCode.getText();
            if (new RegExp(`\\b${side.name}\\s*:\\s*bigint\\b`).test(around)) continue;
            report(side);
            continue;
          }
          const checker = program.getTypeChecker();
          const type = checker.getTypeAtLocation(map.get(side));
          if (checker.typeToString(type) !== "bigint") report(side);
        }
      },
    };
  },
};

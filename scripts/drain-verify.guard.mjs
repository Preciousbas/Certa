export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@certa/chain" || specifier.includes("/server/chain/") || specifier.includes("/chain/flows")) {
    throw new Error(`drain-verify imported the chain package via ${specifier}`);
  }
  return nextResolve(specifier, context);
}

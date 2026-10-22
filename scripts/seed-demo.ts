if (!process.argv.includes("--workspace-demo")) {
  process.stderr.write(
    "Refusing to seed. Pass --workspace-demo. This writes only is_demo workspaces.\n",
  );
  process.exit(1);
}

process.stdout.write("Demo workspace seed is reserved for prompt 99. No rows were written.\n");

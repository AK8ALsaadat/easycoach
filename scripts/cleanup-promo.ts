import { runPromo } from "./seed-promo.ts";
runPromo([...process.argv.slice(2), "--cleanup"]).catch(error => { console.error(error instanceof Error ? error.message : "Cleanup failed"); process.exitCode = 1; });
